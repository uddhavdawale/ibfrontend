# Backend Implementation Report: Customer Due Sync and Invoice Payment State

## Objective

Ensure that invoice payment status and customer due balances are persisted consistently in the backend so the customer profile reflects the real outstanding amount after invoice generation.

This includes:

- storing invoice payment status correctly (`paid`, `partial`, `pending`)
- calculating the outstanding balance from previous customer due + current invoice due
- updating the customer profile due fields after invoice creation
- keeping the frontend and backend aligned on how due amounts are calculated and displayed

---

## Business Rule Implemented

The correct customer due logic is:

- previous balance = existing outstanding amount from customer profile
- current invoice due = max(grandTotal - receivedAmount, 0)
- new customer due = previous balance + current invoice due

This must be the source of truth for:

- payment summary display on invoice screen
- PDF balance display
- customer profile due balance in customer records

---

## Invoice Payment Rules

### 1. Paid invoice
When payment is fully collected:

- paymentStatus = `paid`
- receivedAmount = grandTotal
- invoiceDueAmount = 0
- customer due = previous balance + 0

### 2. Partial payment
When a partial amount is received:

- paymentStatus = `partial`
- receivedAmount = entered partial amount
- invoiceDueAmount = max(grandTotal - receivedAmount, 0)
- customer due = previous balance + invoiceDueAmount

### 3. Pending invoice
When no payment is collected:

- paymentStatus = `pending`
- receivedAmount = 0
- invoiceDueAmount = grandTotal
- customer due = previous balance + grandTotal

---

## Required Backend Payload Shape

The frontend sends invoice records with the following core structure:

```json
{
  "customerName": "Sandip",
  "customerPhone": "9876543210",
  "paymentMethod": "UPI",
  "paymentStatus": "partial",
  "status": "partial",
  "paidAmount": 10000,
  "amountPaid": 10000,
  "receivedAmount": 10000,
  "previousBalance": 0,
  "balanceAmount": 11599.02,
  "currentBalance": 11599.02,
  "totalAmount": 21599.02,
  "billType": "GST",
  "isGstInvoice": true,
  "items": [
    {
      "productId": 12,
      "name": "Product A",
      "sku": "SKU-001",
      "hsn": "9988",
      "gstRate": 18,
      "price": 1000,
      "qty": 2,
      "taxAmount": 360
    }
  ]
}
```

---

## Customer Profile Due Fields

The customer profile must store due-related fields consistently. The backend should reconcile and update the following fields:

- `dueBalance`
- `balanceDue`
- `outstandingBalance`
- `pendingAmount`
- `pendingBalance`
- `amountDue`
- `totalDue`
- `balance`
- `receivable`
- `outstanding`

All these values should be set to the same final outstanding amount for the customer after invoice processing.

---

## Backend Update Flow

After an invoice is saved successfully, the backend should:

1. resolve the customer using phone or customer name
2. read their current stored due from the customer profile
3. compute the updated outstanding due
4. persist the updated due to the customer profile
5. return the updated customer profile information if requested

The backend should prefer a lookup by phone number and then fallback to customer name search if needed.

---

## API Endpoints Relevant to This Flow

### Invoice creation
- `POST /api/invoices`
- `POST /api/non-gst-invoices`

### Customer profile lookup
- `GET /api/customer_profiles/phone/{phone}`
- `GET /api/customer_profiles/search?query={query}`
- `GET /api/customer_profiles/{id}`

### Customer profile update
- `PUT /api/customer_profiles/{id}`
- `PATCH /api/customer_profiles/{id}`

---

## Validation Requirements

The backend must enforce these rules:

- reject invoice creation when the user is not authenticated
- reject invalid or empty payment status
- reject invalid item payloads
- ensure `totalAmount` is computed from cart data
- ensure due values are never negative
- ensure the customer profile is updated only for the matched customer
- ensure tenant/user ownership is preserved

---

## Recommended Persistence Logic

```java
BigDecimal previousBalance = customerProfile.getDueBalance() != null
    ? customerProfile.getDueBalance()
    : BigDecimal.ZERO;

BigDecimal currentInvoiceDue = grandTotal.subtract(receivedAmount).max(BigDecimal.ZERO);
BigDecimal totalDue = previousBalance.add(currentInvoiceDue).max(BigDecimal.ZERO);

customerProfile.setDueBalance(totalDue);
customerProfile.setBalanceDue(totalDue);
customerProfile.setOutstandingBalance(totalDue);
customerProfile.setPendingAmount(totalDue);
customerProfile.setPendingBalance(totalDue);
customerProfile.setAmountDue(totalDue);
customerProfile.setTotalDue(totalDue);
```

---

## Implementation Notes

This workflow is designed to ensure that:

- invoice generation remains the source of payment activity
- customer dues remain persistent across transactions
- payment summary values are consistent with the profile state
- partial payments do not overwrite the full customer due incorrectly

The key fix is to avoid storing only the current invoice amount as the customer due. Instead, the stored due must represent the customer’s cumulative outstanding balance.

---

## Final Backend Requirement

The backend must now treat the customer profile as a ledger-like record of outstanding amount. Every invoice update creates or updates this customer outstanding state using the actual due math and not just the current invoice total.

This ensures:

- accurate due tracking
- consistent invoice summaries
- correct customer profile display
- proper future partial-payment calculations
