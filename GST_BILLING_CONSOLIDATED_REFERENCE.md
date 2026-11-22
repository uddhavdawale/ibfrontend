# GST Billing — Consolidated Reference

**Purpose:** A handoff reference for the retailer billing frontend and its backend integration.  
**Status:** Frontend implementation is aligned with the supplied backend contract. The backend deployment and its live responses have not been independently verified in this frontend repository.

## 1. Expected billing behavior

Retailers choose one invoice pricing mode:

- **Exclusive:** The catalogue price is the taxable unit price; GST is added to calculate the amount due.
- **Inclusive:** The catalogue price is the gross unit price; GST is extracted from it. The displayed rate remains the entered catalogue price.

At 18% GST and quantity one:

| Mode | Entered price | Taxable value | CGST | SGST | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Inclusive | ₹100.00 | ₹84.75 | ₹7.63 | ₹7.62 | ₹100.00 |
| Exclusive | ₹100.00 | ₹100.00 | ₹9.00 | ₹9.00 | ₹118.00 |

Inclusive GST uses `taxable = gross / (1 + rate / 100)`, rounded to paise; tax is `gross - taxable`. For intra-state sales, CGST is rounded and SGST receives the remainder so the components equal the line tax. For inter-state sales, GST is shown as IGST.

The buyer's place-of-supply state is selected explicitly. It is not inferred from a phone number. The issuer state is resolved from structured selected-issuer profile fields, a valid GSTIN, or one unambiguous state name in the issuer address. If still missing when the retailer starts invoicing, the frontend refreshes the shop profile and checks the authenticated retailer's registered GSTIN before blocking GST invoice creation.

The GST/Non-GST switch is available only when the authenticated store has a valid GSTIN. If it is absent from the shop profile, the frontend checks the authenticated retailer profile once. Without a valid GSTIN, billing defaults to Non-GST and hides the GST option; backend invoice creation must independently enforce the same tenant-scoped rule.

## 2. Product catalogue and HSN contract

Use the existing tenant-scoped product catalogue. Supported routes in the backend integration report are `GET /api/products` and `GET /api/billing/products`; responses are paged and the frontend reads `content`. The frontend does not request tax rates per cart item or quantity change.

Each product used for a GST invoice needs:

| Field | Expected value |
| --- | --- |
| Product ID | ID belonging to the authenticated tenant |
| HSN/SAC | Canonical product code; frontend accepts `hsn`, `hsnCode`, `hsnSac`, or `hsn/sac` |
| `gstRate` | Numeric total rate resolved from the backend HSN master |
| `gstRateStatus` | `RESOLVED`, `HSN_MISSING`, `HSN_INVALID`, or `RATE_NOT_FOUND` |

Only `RESOLVED` products with a valid HSN and rate can be submitted as GST invoices. The frontend does not guess rates from category or price. Missing or unresolved product data is shown as a retailer-actionable validation message.

The HSN master must be maintained and populated by an authorized backend administrator. The system-admin frontend provides a CSV upload to `POST /api/admin/hsn-tax-rates/upload` using multipart form field `file`. If a valid HSN has no master entry, return `RATE_NOT_FOUND`; do not provide a guessed rate.

The upload accepts files up to 5 MB and 5,000 data rows. Include exactly one HSN/SAC code column (`hsnCode`, `hsn`, `hsnSac`, or `sac`) and one GST rate column (`gstRate`, `gst`, `rate`, or `taxRate`). The backend response must include `success` and `importedCount`.

## 3. Price and invoice request rules

The catalogue selling price is authoritative and is read-only in billing. Do not substitute MRP or custom prices unless backend pricing rules explicitly support them.

The frontend submits one invoice request to its configured invoice endpoint (the supplied contract identifies `POST /api/invoices`). Invoice-level fields include:

- `billType`
- `taxPricingMode`: `inclusive` or `exclusive`
- `placeOfSupplyState`: supported Indian state name or two-digit GST state code
- Preview fields such as `subtotal`, `gstAmount`, `grandTotal`, and `totalAmount`
- `items`

Each GST item includes its tenant product ID, HSN, resolved preview rate, quantity, pricing mode, entered catalogue price, derived/entered `price`, taxable value, tax, and CGST/SGST/IGST values. For inclusive mode, `enteredPrice` retains the gross catalogue price while `price` is the derived taxable unit price.

Client-provided HSN, rate, amounts, and totals are not authoritative. The backend must authenticate the retailer, load each product within that tenant, verify the HSN, resolve the rate from its HSN master, validate the entered price, determine the tax jurisdiction, and recalculate and persist the invoice tax snapshot.

## 4. Backend response and error behavior

On success, return the saved invoice with server-calculated totals and item-level fields sufficient to render the invoice, including:

- Canonical HSN and resolved numeric `gstRate`
- Invoice and item `taxPricingMode`
- `enteredPrice`, taxable amount, tax amount, and item totals
- CGST/SGST/IGST component amounts
- `placeOfSupplyState` and saved invoice totals

The frontend uses the returned totals and item tax breakdown for the invoice preview and for the subsequent payment amount. It does not treat the client preview as the saved result.

For invalid HSN/rate, tenant ownership, place of supply, issuer location, or entered price, return HTTP 400 with a clear product-specific `message`. The frontend displays that message and retains the cart for correction.

If a request has an ambiguous outcome (for example a network failure, server error, or successful response missing calculated tax details), the frontend guards against another submission in the same tab/session and asks the retailer to check invoice history before clearing the guard. This is not a substitute for backend idempotency: implement an invoice-level idempotency key to prevent duplicates across tabs, reloads, or clients.

## 5. Security and cloud-cost guidance

- Enforce tenant scope on product lookup and invoice creation; never trust a client-supplied product ID or tenant identifier by itself.
- Recalculate all GST and totals on the backend. Treat client tax values and product descriptions as untrusted.
- Keep HSN rates in the backend master, not frontend code or per-item checkout requests.
- Return rates with the existing catalogue response to avoid a network call for every cart interaction.
- Persist the resolved HSN, rate, mode, and tax breakdown with the invoice so master-data changes do not rewrite historical invoices.
- Require a valid GSTIN registered to the authenticated store for GST invoices, plus a resolvable issuer state; do not infer place of supply from phone number. Stores without a valid GSTIN may create Non-GST bills only.
- Restrict the HSN-rate upload endpoint to authenticated system administrators and audit master changes.
- Add backend idempotency for invoice creation to safely handle retry and concurrency cases.

## 6. Frontend implementation map

- [BillingPage.jsx](./src/Billing/BillingPage.jsx) — catalogue normalization, HSN validation, buyer state selection, tax preview, invoice request/response handling, payment flow, and HTML invoice preview.
- [BillingPage.css](./src/Billing/BillingPage.css) — billing, place-of-supply, and recovery-warning styles.
- [AdminHsnTaxRatesPage.jsx](./src/Admin/AdminHsnTaxRatesPage.jsx) and [adminHsnTaxRatesService.js](./src/Admin/adminHsnTaxRatesService.js) — system-admin CSV rate-master validation and upload.
- [AppRouter.jsx](./src/AppRouter.jsx), [AdminLayout.jsx](./src/Admin/AdminLayout.jsx), and [api.js](./src/Config/api.js) — admin-only route, navigation, and upload endpoint.
- [gstConfig.js](./src/modules/tax/gstConfig.js) — state normalization, HSN/rate/status helpers, rounding, and inclusive/exclusive plus intra-/inter-state calculations.
- [shopProfileService.js](./src/modules/shopProfile/shopProfileService.js) — issuer state/GSTIN resolution and shop profile normalization.
- [invoiceData.js](./src/utils/invoiceData.js) — normalizes saved invoice and item tax fields for invoice rows.
- [invoicePdf.js](./src/utils/invoicePdf.js) — PDF tax columns and place-of-supply display.
- [HSN_GST_BACKEND_REQUIREMENTS_REPORT.md](./HSN_GST_BACKEND_REQUIREMENTS_REPORT.md) — backend-focused contract and requirements.

## 7. Verification and deployment checklist

Frontend verification performed:

- Production build completed successfully.
- Focused checks passed for inclusive and exclusive calculations, paise rounding, inter-state IGST, HSN/status/state normalization, and invoice normalization.
- The production build reports an existing large JavaScript chunk warning; it does not fail the build.

Before production rollout, verify with the deployed backend:

- [ ] Catalogue responses include paged `content`, canonical HSN, numeric `gstRate`, and `gstRateStatus`.
- [ ] The HSN master has approved rates for the retailers' products.
- [ ] System-admin CSV upload is authorized, audited, and returns `success` with `importedCount`.
- [ ] Invoice creation validates tenant ownership, HSN, rate, catalogue price, issuer state/GSTIN, and place of supply.
- [ ] Inclusive and exclusive invoices return server-calculated totals and all item tax components.
- [ ] HTTP 400 responses contain a useful `message`, and the frontend retains the cart.
- [ ] Invoice creation supports idempotency across clients and ambiguous retries.
- [ ] Issuer and buyer state combinations return the expected CGST/SGST or IGST.

This repository contains the frontend only; backend behavior and production data must be confirmed against the deployed API.
