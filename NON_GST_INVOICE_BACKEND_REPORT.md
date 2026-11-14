# Non-GST Invoice Backend Contract

## Endpoint

POST /api/non-gst-invoices

## Purpose

Separate invoice persistence endpoint for bills generated when the billing flow is set to Non-GST. This keeps GST and Non-GST invoice records isolated and allows backend reporting and taxation logic to remain clean and explicit.

## Request body

```json
{
  "customerName": "Walk-in Customer",
  "customerPhone": "0000000000",
  "paymentMethod": "UPI",
  "paymentStatus": "paid",
  "status": "paid",
  "billType": "non-gst",
  "isGstInvoice": false,
  "items": [
    {
      "productId": 12,
      "name": "Notebook",
      "sku": "NB-100",
      "hsn": "4820",
      "price": 150,
      "qty": 2,
      "category": "stationery"
    }
  ]
}
```

## Rules

- `billType` must be set to `non-gst`.
- `isGstInvoice` must be `false`.
- Do not send any GST-specific tax fields for Non-GST invoices.
- Invoice totals should be computed as subtotal only, with no GST line item.

## Response

Typical success response:

```json
{
  "success": true,
  "invoiceNo": "INV-104",
  "id": 104,
  "message": "Non-GST invoice saved successfully"
}
```

## Additional backend requirements

1. Persist `billType` as a string value (`gst` or `non-gst`).
2. Persist `isGstInvoice` as a boolean flag.
3. For Non-GST invoices, do not store GST tax fields in the invoice item records.
4. Expose this invoice in invoice listing/report screens with a `billType` filter.
5. Ensure GST summary and filing reports ignore Non-GST invoices.

## Recommended reporting logic

- GST reports: include only invoices where `billType === "gst"`.
- Non-GST reports: include only invoices where `billType === "non-gst"`.
- Summary totals: for Non-GST invoices, subtotal should remain the grand total with GST values at zero.
