# Backend Instruction: Invoice Payment Persistence at Checkout

## Goal
When a user confirms payment during checkout, the invoice must be stored in the database with the correct payment state, totals, and ownership metadata.

---

## API contract
Use the invoice creation endpoint:

- POST /api/invoices

Optionally, support update by id:

- PUT /api/invoices/{id}

### Required request payload
The frontend sends the following invoice payload:

```json
{
  "customerName": "Walk-in Customer",
  "customerPhone": "0000000000",
  "paymentMethod": "UPI",
  "paymentStatus": "paid",
  "status": "paid",
  "items": [
    {
      "productId": 1,
      "name": "Rice",
      "sku": "RICE-001",
      "hsn": "1006",
      "gstRate": 5,
      "price": 250,
      "qty": 2
    }
  ]
}
```

---

## Required backend logic

### 1. Resolve authenticated user and tenant
Before saving the invoice:
- read the current authenticated user from the JWT/session context
- read the tenant from the authenticated user
- reject requests from unauthenticated users with `401`

Do not trust the client to send `tenantId` or `userId`.

### 2. Compute invoice values
Calculate these values from the cart/items:
- subtotal
- gstAmount
- grandTotal
- paidAmount
- outstandingAmount

For payment confirmed:
- `paymentStatus = PAID`
- `status = PAID`
- `paidAmount = grandTotal`
- `outstandingAmount = 0`
- `paidAt = current timestamp`

For pending payment:
- `paymentStatus = PENDING`
- `status = PENDING`
- `paidAmount = 0`
- `outstandingAmount = grandTotal`

### 3. Save invoice ownership
Persist the invoice with:
- `tenantId` = current tenant
- `userId` = current authenticated user
- `createdBy` = current authenticated user (if available)

### 4. Save invoice items
Each invoice item must be stored with:
- invoice id reference
- product name
- product id if available
- sku
- hsn
- quantity
- price
- gstRate
- total line amount
- tenantId
- userId

### 5. Enforce access control
Only allow the owner user/tenant to create or update the invoice.

If a request tries to access another user or tenant's invoice:
- return `403 Forbidden` or `404 Not Found`

---

## Required invoice fields in database
The invoice entity must include:

```java
private Long id;
private String invoiceNo;
private String customerName;
private String customerPhone;
private String paymentMethod;
private String paymentStatus; // PAID / PENDING / PARTIAL / CANCELLED
private String status; // legacy compatibility or mirror of paymentStatus
private BigDecimal subtotal;
private BigDecimal gstAmount;
private BigDecimal grandTotal;
private BigDecimal paidAmount;
private BigDecimal outstandingAmount;
private LocalDateTime createdAt;
private LocalDateTime paidAt;
private Long tenantId;
private Long userId;
```

---

## Validation rules
Reject invoice creation if:
- no authenticated user
- no items in cart
- paymentStatus is not valid
- invoice total cannot be calculated
- tenant/user mismatch detected

---

## Required response payload
The backend should return the saved invoice with at least:

```json
{
  "id": 101,
  "invoiceNo": "INV-2026/0001",
  "customerName": "Walk-in Customer",
  "paymentMethod": "UPI",
  "paymentStatus": "PAID",
  "status": "PAID",
  "subtotal": 500.00,
  "gstAmount": 90.00,
  "grandTotal": 590.00,
  "paidAmount": 590.00,
  "outstandingAmount": 0.00,
  "tenantId": 7,
  "userId": 12
}
```

---

## Important backend rule
The frontend can send the payment confirmation, but the backend must be the final authority for invoice payment state.

In other words:
- frontend decides user intent
- backend decides what is persisted
- backend enforces tenant and user ownership

---

## Final instruction to backend agent
Persist invoice payment status using the authenticated user and tenant context. On checkout, calculate totals, store `paymentStatus`, `status`, `paidAmount`, `outstandingAmount`, and update `paidAt` when payment is confirmed. Never trust client-supplied `tenantId` or `userId`; always derive and enforce them using the authenticated session.
