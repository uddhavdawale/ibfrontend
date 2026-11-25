# Customer Ledger Pagination Backend Contract

The frontend now requests one tenant-scoped page of 25 customer-ledger rows at a time. The existing separate GST, Non-GST, and payment APIs cannot provide correct global pagination, running balances, report totals, and full-report export from a single page. Implement the unified endpoints below before deploying this frontend change.

## 1. Paginated ledger

`GET /api/customer-ledger?page=0&size=25&search=&customerKey=&from=&to=`

- `page` is zero-based. `size` is limited to 25.
- `search` matches customer name, phone, or invoice number.
- `customerKey` is the account key returned in `customerOptions`.
- `from` and `to` are inclusive `YYYY-MM-DD` dates in the retailer's reporting timezone.
- Derive the tenant exclusively from the authenticated principal. Do not trust a tenant ID supplied by the client.
- Combine GST and Non-GST invoices before filtering and pagination.
- Return stable ordering by invoice timestamp descending, with a unique invoice identifier as a tie-breaker.
- Calculate invoice payments, refunds, opening/closing customer balances, and report totals server-side from the full matching data, not only the requested page.

Example response:

```json
{
  "content": [
    {
      "id": "invoice-id",
      "billType": "GST",
      "invoiceNo": "INV-001",
      "customerName": "Customer",
      "customerPhone": "9000000000",
      "date": "2026-11-23T12:00:00Z",
      "total": 118.0,
      "paid": 100.0,
      "invoiceDue": 18.0,
      "paymentMethod": "UPI",
      "paymentStatus": "PARTIAL",
      "openingBalance": 0.0,
      "closingBalance": 18.0
    }
  ],
  "page": {
    "number": 0,
    "size": 25,
    "totalElements": 61,
    "totalPages": 3
  },
  "summary": {
    "billed": 7100.0,
    "received": 5000.0,
    "customerDue": 2100.0,
    "customerCount": 17
  },
  "customerOptions": [
    {
      "key": "id:customer-id",
      "name": "Customer",
      "phone": "9000000000"
    }
  ]
}
```

`customerOptions` is required on page zero and may be omitted on later pages. It contains lightweight tenant-scoped customer keys, names, and phone numbers so the existing account filter continues to include customers not present on the current invoice page.

The summary is calculated over all matching report rows. With no filters, `received` and `customerDue` must preserve the existing all-time payment-report semantics. With filters, preserve the current ledger semantics: billed/received use matching invoices, while customer due uses the latest account balance for each matching customer.

Return numeric row and summary amounts (zero when appropriate), `page.number` equal to the requested page, `page.size` equal to 25, and accurate totals. Return an empty `content` array and zero totals when no rows match.

## 2. Full filtered CSV export

`GET /api/customer-ledger/export?search=&customerKey=&from=&to=`

- Apply exactly the same tenant scoping, filters, ordering, payment/refund logic, and balance calculations as the paginated endpoint.
- Stream a CSV containing **all matching records**, not only the current page; do not require the frontend to fetch every page to export.
- Return `Content-Type: text/csv; charset=utf-8` and a safe `Content-Disposition` filename.
- Escape CSV cells and mitigate spreadsheet formula injection for values beginning with `=`, `+`, `-`, or `@`.

## 3. Performance and security

- Index tenant ID together with invoice date, customer ID, and invoice identifiers used for filtering, stable ordering, and payment reconciliation.
- Apply tenant authorization in the service/repository query, not from frontend headers or query parameters.
- Bound `size` server-side and use indexed database pagination; avoid loading all invoices and payments into application memory per request.
- Compute summary aggregates in database queries or bounded projections, avoiding join multiplication when invoices have multiple payments/refunds.
- Ensure export uses a streaming response for large ledgers and applies the same authorization checks as the page endpoint.
