# Payment Collection & Cash Reconciliation — Implementation Report

## 1. Objective

Preserve the existing multi-tenant payment and reconciliation behavior, and add a seller/biller-to-store-admin cash custody handover. Cashiers submit a ticket to a designated store admin, who counts the cash and accepts an exact match or flags a discrepancy. Accepted or resolved amounts transfer between staff cash balances without rewriting customer payment records.

The core rule is:

- `sale.created_by_user_id` records who created the sale.
- `payment.collected_by_user_id` records who physically received the payment.
- `payment_events` preserve an append-only audit trail.
- `cash_reconciliations` compare system-recorded cash with the physical cash count.

## 2. User roles and permissions

| Role | Existing billing/report access | Submit cash ticket | Review/resolve tickets |
|---|---|---:|---:|
| Store admin | Existing store-wide access | No | Yes |
| Seller | No general billing/report access | Yes; own cash-sales summary only | No |
| Billing manager | Existing billing access | Yes | No |
| Store billing viewer | Existing view-only access | No | No |
| System admin | Existing system-wide access | No | No |

### Permission codes

```text
sale.create
sale.view_own
sale.view_all
payment.collect
payment.view_own
payment.view_all
payment.refund
report.collection.view
report.collection.export
cash.reconciliation.manage
```

Store admin must retain at least:

```text
payment.collect
payment.view_all
report.collection.view
report.collection.export
cash.reconciliation.manage
```

Roles must be tenant-scoped. A tenant admin of Tenant A must not collect payments for, view data from, or generate reports for Tenant B.

## 3. Database design

### 3.1 Tenants and users

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tenant_members (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role VARCHAR(50) NOT NULL, -- admin | seller | biller
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);
```

### 3.2 Customers and sales

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(30),
  email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sales (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  total_amount BIGINT NOT NULL,
  paid_amount BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Sale status values:

```text
pending
partially_paid
paid
cancelled
```

### 3.3 Payments

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  sale_id UUID NOT NULL REFERENCES sales(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  collected_by_user_id UUID NOT NULL REFERENCES users(id),
  amount BIGINT NOT NULL,
  method VARCHAR(30) NOT NULL, -- cash | upi | card | bank | wallet
  status VARCHAR(30) NOT NULL, -- pending | received | failed | reversed | refunded
  reference_no VARCHAR(255),
  receipt_no VARCHAR(50),
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Store all monetary values as integer minor units:

- INR: paise
- USD: cents

Example: ₹1,000.00 must be stored as `100000`.

### 3.4 Payment audit events

```sql
CREATE TABLE payment_events (
  id UUID PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES payments(id),
  tenant_id UUID NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Event actions:

```text
payment_created
payment_received
payment_failed
payment_reversed
payment_refunded
receipt_issued
```

Payment records must be append-only. Do not overwrite a completed payment; create reversal or refund events instead.

### 3.5 Cash reconciliation

```sql
CREATE TABLE cash_reconciliations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  staff_user_id UUID NOT NULL REFERENCES users(id),
  reconciliation_date DATE NOT NULL,
  shift_start_time TIMESTAMPTZ,
  shift_end_time TIMESTAMPTZ,
  opening_float BIGINT NOT NULL DEFAULT 0,
  system_cash_total BIGINT NOT NULL DEFAULT 0,
  cash_refunds BIGINT NOT NULL DEFAULT 0,
  expected_cash BIGINT NOT NULL,
  physical_cash_counted BIGINT NOT NULL,
  difference BIGINT NOT NULL,
  status VARCHAR(30) NOT NULL, -- matched | shortage | overage
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Formula:

```text
expected_cash =
  opening_float
  + system_cash_total
  - cash_refunds
  + accepted_cash_tickets_received
  - accepted_cash_tickets_submitted

difference =
  physical_cash_counted - expected_cash
```

### 3.6 Cash custody handover tickets

A ticket transfers custody of already-collected cash from a non-admin cashier to a designated store admin. It does not create a customer payment or change invoice balances. The existing handover ledger stores the ticket; no new ticket table or background job is required.

Ticket statuses:

```text
PENDING   -- declared amount is reserved from the cashier's unassigned cash
ACCEPTED  -- exact physical count transferred the amount to the recipient admin
DISPUTED  -- count differs; no amount has transferred to the admin
RESOLVED  -- verified amount transferred to the admin; any remainder stays with cashier
```

Ticket submission identifies an active same-tenant store admin recipient. The backend derives the sender, validates available unassigned cash, reserves the declared amount, and uses idempotency keys. Only the designated recipient admin can count a ticket. An exact count transfers the declared amount; a different count disputes the ticket without crediting the admin. A store admin or system admin can resolve a dispute, transferring no more than the declared or counted amount. Customer payments and the payment report remain unchanged throughout the handover.

## 4. Cash collection flow

```text
Customer requests product/service
              |
              v
Seller1 / Biller1 / Tenant Admin creates sale
              |
              v
Sale saved with created_by_user_id
              |
              v
Customer pays cash
              |
              v
Staff counts cash and opens Collect Payment screen
              |
              v
Backend validates permission, tenant, sale, and amount
              |
              v
Payment record created
              |
              v
Sale status updated
              |
              v
Receipt generated
              |
              v
Cash placed in drawer / cash box
              |
              v
End of shift: physical cash counted
              |
              v
System cash total compared with physical cash
              |
      +-------+--------+
      |                |
      v                v
   Matched        Shortage / overage
      |                |
      v                v
 Close shift     Investigation record
```

## 5. Example: tenant admin collects cash

### Scenario

- Seller1 creates a sale of ₹10,000.
- Tenant admin collects ₹10,000 in cash.
- The system must record Seller1 as the sale creator and tenant admin as the cash collector.

### Data written

```text
Sale:
sale_id              = SALE-1024
tenant_id            = TENANT-123
created_by_user_id   = seller1
total_amount         = 1000000
paid_amount          = 1000000
status               = paid

Payment:
payment_id             = PAY-9001
tenant_id              = TENANT-123
sale_id                = SALE-1024
collected_by_user_id   = tenant_admin
amount                 = 1000000
method                 = cash
status                 = received
receipt_no             = RCPT-001
```

### Flow

```text
Seller1 creates SALE-1024 for ₹10,000
                |
                v
Customer pays ₹10,000 cash
                |
                v
Tenant admin counts and accepts cash
                |
                v
Tenant admin records payment in app
                |
                v
System creates PAY-9001
collected_by_user_id = tenant_admin
method = cash
status = received
                |
                v
SALE-1024 becomes paid
                |
                v
Receipt RCPT-001 is printed or shared
                |
                v
₹10,000 is placed in cash drawer
```

## 6. Partial cash payment

If the customer pays ₹4,000 now and ₹6,000 later:

```text
Sale total: ₹10,000

Payment 1:
amount = ₹4,000
method = cash
collected_by = tenant admin
sale status = partially_paid

Payment 2:
amount = ₹6,000
method = cash
collected_by = biller1 or tenant admin
sale status = paid
```

Each payment must have its own payment record and receipt number.

## 7. Backend API design

| Method | Endpoint | Required permission | Description |
|---|---|---|---|
| `POST` | `/api/invoices/{invoiceId}/payments` | `payment.collect` | Record a GST invoice payment |
| `POST` | `/api/non-gst-invoices/{invoiceId}/payments` | `payment.collect` | Record a non-GST invoice payment |
| `POST` | `/api/payments/{paymentId}/refunds` | `payment.refund` | Record a refund |
| `GET` | `/api/payments` | `report.collection.view` | Return the filtered, paginated payment report and summary |
| Client-side | Current `/api/payments` page | `report.collection.export` | Export the currently displayed page; no separate report/export endpoint |
| `POST` / `GET` | `/api/cash-reconciliations` | `cash.reconciliation.manage` | Submit or view cash reconciliation |

## 8. Backend authorization flow

Every payment or report request must follow this sequence:

```text
1. Authenticate user using JWT/session
2. Derive tenantId from the authenticated session/context; do not trust a client-selected tenant ID
3. Verify the user is an active member of that tenant
4. Load user role and permissions
5. Verify required permission
6. Verify requested sale/payment/report belongs to the authenticated tenant
7. Validate business rules
8. Execute database transaction
9. Write audit event
10. Return response
```

### Cash payment validation rules

```text
- User must be authenticated.
- User must belong to the requested tenant.
- User must have payment.collect permission.
- Sale must belong to the same tenant.
- Sale must not be cancelled.
- Payment amount must be greater than zero.
- Payment amount must not exceed the remaining sale balance.
- Cash payments must be marked received immediately.
- A unique receipt number must be generated.
- A payment event must be created.
```

## 9. Example backend controller

```javascript
async function collectCashPayment(req, res) {
  const { tenantId, saleId } = req.params;
  const user = req.user;
  const { amount, referenceNo } = req.body;

  const member = await getTenantMember(user.id, tenantId);

  if (!member) {
    return res.status(403).json({
      error: "User does not belong to this tenant"
    });
  }

  const canCollect = await hasPermission(
    member.role,
    "payment.collect"
  );

  if (!canCollect) {
    return res.status(403).json({
      error: "You do not have permission to collect payments"
    });
  }

  const sale = await db.sales.findOne({
    id: saleId,
    tenantId
  });

  if (!sale) {
    return res.status(404).json({
      error: "Sale not found"
    });
  }

  if (sale.status === "cancelled") {
    return res.status(400).json({
      error: "Cannot collect payment for a cancelled sale"
    });
  }

  const paymentAmount = Number(amount);

  if (!Number.isInteger(paymentAmount) || paymentAmount <= 0) {
    return res.status(400).json({
      error: "Invalid payment amount"
    });
  }

  const remainingBalance = sale.totalAmount - sale.paidAmount;

  if (paymentAmount > remainingBalance) {
    return res.status(400).json({
      error: "Payment amount exceeds sale balance"
    });
  }

  const receiptNo = await generateReceiptNumber(tenantId);

  const payment = await db.payments.create({
    tenantId,
    saleId,
    customerId: sale.customerId,
    collectedByUserId: user.id,
    amount: paymentAmount,
    method: "cash",
    status: "received",
    referenceNo,
    receiptNo
  });

  const newPaidAmount = sale.paidAmount + paymentAmount;

  await db.sales.update(saleId, {
    paidAmount: newPaidAmount,
    status:
      newPaidAmount >= sale.totalAmount
        ? "paid"
        : "partially_paid"
  });

  await db.paymentEvents.create({
    paymentId: payment.id,
    tenantId,
    actorUserId: user.id,
    action: "payment_received",
    newValue: payment
  });

  return res.status(201).json({
    message: "Cash payment recorded successfully",
    payment
  });
}
```

## 10. Implemented behavior in this repository

The frontend reuses the existing invoice, user-role, authenticated API, and tenant-context model. It adds a narrowly scoped Seller role for cash tickets without granting general billing access. Cash-ticket requests follow the existing handover-ledger backend contract; backend source is not included in this repository. The backend must derive sender and tenant identity from the authenticated session and must not trust client-supplied tenant identifiers.

Existing payment endpoints used by the frontend:

| Method | Endpoint | Behavior |
|---|---|---|
| `POST` | `/api/invoices/{invoiceId}/payments` | Collect against a GST invoice |
| `POST` | `/api/non-gst-invoices/{invoiceId}/payments` | Collect against a non-GST invoice |
| `POST` | `/api/payments/{paymentId}/refunds` | Record an append-only refund against a received payment |
| `GET` | `/api/payments` | Tenant-scoped, paginated collection/refund report |
| `POST` / `GET` | `/api/cash-reconciliations` | Record or view cash reconciliation |

Store admins, billing managers, and system admins can collect payments. Store billing viewers can see their own collection records. Refunds are restricted to store admins and system admins. Authorization and tenant ownership are checked by the backend on every operation; frontend role checks only control presentation. Refund entries record accounting and invoice-balance changes; they do not initiate a refund through an external payment provider.

Payment amounts use decimal currency values consistent with the existing schema. Refunds are stored as positive amounts linked to the original payment and are shown as negative values in reports. Collections/refunds update invoice paid balances in the same transaction, use row locks and idempotency keys, and write audit events. Legacy paid balances are backfilled as unattributed ledger entries; the historical collector is intentionally not inferred.

Cash reconciliation calculates `opening float + cash collected - cash refunds - accepted outgoing tickets + accepted/resolved incoming tickets` for the selected staff member and date. Pending cash is reserved from the sender; disputed cash is not credited to the recipient until resolution. The payment report is database-paginated, caps page size at 100 and date range at 366 days, and the frontend exports the currently displayed page only.

Cash handover tickets are separate from customer payment records and invoice balances. The frontend uses the backend contract below. All endpoints must authenticate the caller, derive the sender and tenant from the session, enforce store-level authorization, and scope ticket rows to the caller's tenant. Cashiers see only tickets they submitted; store admins can review tickets in their tenant. The designated recipient alone can count a ticket; a store admin or system admin can resolve a dispute. Do not rely on client-side role checks for authorization.

| Method | Endpoint | Behavior |
|---|---|---|
| `GET` | `/api/cash-collection-tickets?page=0&size=20` | Return paginated tickets visible to the caller. Optional `status` filter; size is capped at 100. |
| `GET` | `/api/cash-collection-tickets/recipients` | Return active store-admin recipients in the authenticated cashier's tenant. |
| `GET` | `/api/cash-collection-tickets/balances?page=0&size=100` | Return the caller's own due summary for cashiers; return a paginated biller balance report plus tenant-wide totals for store admins. |
| `GET` | `/api/cash-collection-tickets/{ticketId}/payment-proof` | Return the private screenshot for an authorized ticket participant/admin; enforce tenant and ticket visibility. |
| `POST` | `/api/cash-collection-tickets` | Cashier submits `recipientUserId`, `declaredAmount`, `paymentMethod`, `idempotencyKey`, and optional `notes`; UPI/card requests also require a `paymentProof` image. Backend validates recipient and reserves the amount. |
| `POST` | `/api/cash-collection-tickets/{ticketId}/count` | Designated store-admin recipient submits `countedAmount`, `idempotencyKey`, and optional `notes`; this is the physical count for cash or the verified amount for UPI/card. Exact amount accepts; mismatch disputes without transferring. |
| `POST` | `/api/cash-collection-tickets/{ticketId}/resolve` | Store admin or system admin submits `resolvedAmount`, `idempotencyKey`, and required `resolutionNote`; transfer no more than declared or counted amount. |

List and submit responses use fields including `senderUserId`, `senderName`, `recipientUserId`, `recipientName`, `declaredAmount`, `paymentMethod` (`CASH`, `UPI`, or `CARD`), `receiverCountedAmount`, `resolvedAmount`, `status`, `notes`, `recipientNotes`, `resolutionNote`, and timestamps. For cash, count/resolve responses may include the recipient's resulting `storeCashAvailable` balance; digital settlements must not change physical cash balances. UPI/card submission uses `multipart/form-data` with a required `paymentProof` image (PNG, JPEG, or WebP; maximum 5 MiB); cash submission retains JSON. The screenshot must be stored privately and served through the authorized proof endpoint, never a public URL. Old tickets without `paymentMethod` are interpreted as cash. The ticket list is paginated and ordered newest first; cashiers see only their submissions, and store admins see tickets in their tenant. See [the cash due balance API specification](./BACKEND_CASH_HANDOVER_BALANCE_API.md) for calculation rules, endpoint payloads, and migration requirements.

Submission request:

```json
{
  "recipientUserId": 12,
  "declaredAmount": 1250.00,
  "paymentMethod": "CASH",
  "idempotencyKey": "cash-drop-2026-11-17-001",
  "notes": "Evening shift cash"
}
```

For UPI/card, the same fields are sent as `multipart/form-data` with an additional `paymentProof` image field. The UI loads active recipient admins from the tenant-scoped recipients endpoint, displays the cashier's due since the last settled handover and carried-forward due, and submits the current available-to-submit amount. A UPI/card ticket cannot be submitted without its screenshot; the admin must view it before submitting the verified amount. Store admins see all billers' cash due, pending requests, and disputed balances. The designated store-admin recipient submits the physical count for cash or verified amount for digital payment; backend response determines whether the ticket is accepted or disputed. Store admins and system admins can resolve disputed tickets with a verified amount. Accepted and resolved cash transfers increase the recipient's available cash balance; accepted/resolved digital settlements do not. The sender retains any unresolved remainder. These transfers do not create or alter customer payment records. Backend authorization and ledger calculations remain authoritative.

## 11. Payment report API

The payment report uses the existing `GET /api/payments` endpoint; no separate report endpoint is needed. The endpoint must authenticate the caller, derive tenant scope from the session, and return a paginated payment list with summary totals.

### Request

| Parameter | Optional | Description |
|---|---|---|
| `from` | Yes | Start date inclusive, ISO `YYYY-MM-DD`; defaults to today in `Asia/Kolkata` |
| `to` | Yes | End date inclusive, ISO `YYYY-MM-DD`; defaults to today in `Asia/Kolkata` |
| `collectorId` | Yes | Collector filter; store admins and billing managers may select one |
| `method` | Yes | `CASH`, `UPI`, `CARD`, `BANK`, `WALLET`, `OTHER`, or `ALL` |
| `invoiceId` | Yes | GST or non-GST invoice ID |
| `page` | Yes | Zero-based page; defaults to `0` |
| `size` | Yes | Page size; defaults to `50`, capped at `100` |

Invalid or reversed dates and ranges longer than 366 days must be rejected. Every payment row and aggregate must be tenant-scoped. Billing viewers are always restricted to their own collections, even when they supply another `collectorId`; the backend must enforce this and must not rely on frontend role checks.

Example:

```http
GET /api/payments?from=2026-11-01&to=2026-11-17&method=ALL&page=0&size=50
```

### Response

The JSON response includes `from`, `to`, `summary`, `payments`, `page`, `size`, `totalPages`, and `totalElements`. Each payment row includes its invoice and receipt details, collector, method, status, source, timestamp, and refundable amount. `summary.totalCollected` is net of refunds; refund rows are negative payment amounts and `summary.totalRefunds` is a positive total. `summary.outstandingAmount` is tenant-wide and independent of report dates and filters.

```json
{
  "from": "2026-11-01",
  "to": "2026-11-17",
  "summary": {
    "totalCollected": 125000,
    "totalRefunds": 2500,
    "totalTransactions": 32,
    "cashCollected": 45000,
    "upiCollected": 60000,
    "cardCollected": 20000,
    "outstandingAmount": 15000
  },
  "payments": [{
    "paymentId": "PAY-9001",
    "invoiceId": "INV-1024",
    "invoiceNo": "INV-1024",
    "customerName": "Ravi Kumar",
    "amount": 1000,
    "method": "CASH",
    "status": "RECEIVED",
    "source": "PAYMENT",
    "collectorId": "user-1",
    "collectorName": "Store Admin",
    "receiptNo": "RCPT-001",
    "collectedAt": "2026-11-16T10:30:00Z",
    "refundableAmount": 1000
  }],
  "page": 0,
  "size": 50,
  "totalPages": 1,
  "totalElements": 1
}
```

The frontend sends the current date range, method, page, and page size; it includes `collectorId` only for store admins and billing managers, and includes `invoiceId` when entered. Both documented `paymentDate`/`collectedBy` fields and current `collectedAt`/`collectorName` aliases are accepted for rendering. The frontend exports only the currently displayed page.

Related endpoints:

- `POST /api/invoices/{invoiceId}/payments` — collect against a GST invoice
- `POST /api/non-gst-invoices/{invoiceId}/payments` — collect against a non-GST invoice
- `POST /api/payments/{paymentId}/refunds` — refund a payment
- `GET /api/cash-reconciliations` — paginated cash reconciliation history

## 12. Frontend implementation

### 12.1 Admin navigation

```text
Dashboard
Sales
Customers
Payments
  ├── Collect Payment
  ├── Payment History
  └── Collection Reports
Cash Management
  ├── Open Cash Drawer
  ├── Close Cash Drawer
  └── Reconciliation History
Reports
  ├── Daily Collection
  ├── Staff-wise Collection
  ├── Payment Method Report
  └── Outstanding Dues
```

### 12.2 Collect cash screen

```text
Collect Cash Payment
────────────────────────────
Sale:             SALE-1024
Customer:         Ravi Kumar
Sale total:       ₹10,000
Already paid:     ₹0
Balance due:      ₹10,000

Cash received:    [ 10000 ]
Collected by:     Tenant Admin
Reference:        [ Optional ]

[ Record Cash Payment ]
```

### 12.3 Success screen

```text
Cash payment recorded successfully

Receipt No:    RCPT-001
Sale:          SALE-1024
Customer:      Ravi Kumar
Amount:        ₹10,000
Method:        Cash
Collected by:  Tenant Admin
Sale status:   Paid

[Print Receipt] [New Payment]
```

### 12.4 Collection report screen

```text
Collection Report
────────────────────────────────────────────
Date range:       [01 Nov 2026] to [16 Nov 2026]
Collected by:     [All staff]
Payment method:   [All methods]
Status:           [Received]

[Generate Report] [Export CSV] [Export PDF]

Total collected:  ₹1,25,000
Transactions:     32
Cash:             ₹45,000
UPI:              ₹60,000
Card:             ₹20,000
Outstanding:      ₹15,000

Staff-wise collection
────────────────────────────────────────────
Name             Role      Transactions   Collected
Tenant Admin     Admin     12             ₹50,000
Seller 1         Seller    10             ₹40,000
Biller 1         Biller    10             ₹35,000
```

## 13. Cash reconciliation screen

```text
Cash Drawer Reconciliation
────────────────────────────────
Date:                    16 Nov 2026
Collected by:            Tenant Admin

Opening float:           ₹2,000
System cash collected:   ₹30,000
Cash refunds:            ₹1,000
Expected cash:           ₹31,000

Physical cash counted:   [ 30800 ]

Difference:              -₹200
Status:                  Shortage

Remarks:                 [ Missing cash under review ]

[ Submit Reconciliation ]
```

## 14. Frontend permission behavior

| Screen | Tenant admin | Seller | Biller |
|---|---|---|---|
| Collect Payment | Visible and enabled | Visible only if permitted | Visible and enabled |
| Payment History | All tenant payments | Own payments only | Own payments only |
| Collection Report | Full tenant report | Own collection only | Own collection only |
| Export report | Enabled | Disabled unless permitted | Disabled unless permitted |
| Cash reconciliation | Enabled | Disabled unless permitted | Enabled if permitted |
| Refund / void | Enabled | Disabled | Limited or disabled |

The frontend should hide or disable unauthorized actions for better user experience, but the backend must independently enforce permissions on every API request.

## 15. Security and audit controls

- Require authentication for all payment and report APIs.
- Validate tenant membership before allowing any tenant-scoped operation.
- Use permission-based authorization, not only role-name checks.
- Store monetary values as integers in minor currency units.
- Use database transactions when creating a payment and updating the sale.
- Prevent duplicate submissions using an idempotency key.
- Generate unique receipt numbers for cash payments.
- Preserve payment history using append-only payment events.
- Record collector ID, timestamp, amount, method, receipt number, and reconciliation result.
- Restrict report export permission to authorized users.
- Log report exports, refunds, reversals, and reconciliation submissions.
- Reconcile physical cash against system cash totals at the end of every shift or day.

## 16. Acceptance criteria

- Tenant admin can collect cash against a sale.
- Seller and biller can collect cash only when granted `payment.collect`.
- The system records the actual cash collector separately from the sale creator.
- Partial payments are supported.
- Sale status changes correctly between `pending`, `partially_paid`, and `paid`.
- A receipt number is generated for every cash payment.
- Tenant admin can view collection reports for all staff.
- Seller and biller can view only their own collection records, unless separately authorized.
- Report filters support date range, collector, payment method, and status.
- Cash reconciliation calculates expected cash, physical cash, and difference.
- Shortage and overage cases are recorded with remarks.
- Unauthorized users cannot call payment or report APIs directly.
```
