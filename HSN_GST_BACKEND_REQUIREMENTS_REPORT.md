# HSN-Based GST Backend Requirements

## Purpose

This report documents the backend contract needed for the billing frontend to use GST rates resolved from each product's HSN, while keeping tax calculation consistent for inclusive and exclusive prices.

## Frontend integration

- The billing page reads HSN/rate data from the existing tenant-scoped product-list APIs. It makes no GST request when an item is selected or its quantity changes.
- The frontend normalizes HSN from `hsn`, `hsnCode`, `hsnSac`, or `hsn/sac`; the rate from `gstRate`, `gst`, or `taxRate`; and requires `gstRateStatus: RESOLVED`.
- `HSN_MISSING`, `HSN_INVALID`, `RATE_NOT_FOUND`, missing status, or invalid rate prevent GST invoice creation and give the retailer a corrective message. Rates are never inferred from price or category.
- GST billing requires a buyer place-of-supply state and a resolvable issuer state. The frontend resolves structured state fields, a valid issuer GSTIN, or one unambiguous state name in the issuer address; when still missing, it refreshes the shop profile and checks the authenticated retailer's registered GSTIN before blocking invoice creation. The buyer state is sent as a two-digit code and is never inferred from a phone number.
- The GST billing option is shown only when the authenticated store has a valid GSTIN. If the shop profile omits it, the frontend checks the authenticated retailer profile once; if no valid GSTIN is found, the bill defaults to Non-GST and the GST option is hidden. The backend must enforce this rule for every GST invoice using the authenticated tenant's registered GSTIN; a client-side UI restriction alone is not authorization.
- The cart preview uses CGST/SGST for intra-state supplies and IGST for inter-state supplies. The invoice request is submitted once; the server's returned amounts and item breakdown are used for the invoice preview.
- The billing price is read-only and uses the catalogue price. For inclusive mode, `enteredPrice` retains that catalogue price while `price` is the derived taxable unit price.
- Validation errors returned by the backend are shown without clearing the cart.

## Backend requirements

### 1. Return the HSN-resolved rate with each product

Product-list responses used by billing should include:

| Field | Requirement |
| --- | --- |
| `id` / `productId` | Product identifier scoped to the authenticated tenant |
| `hsn` / `hsnSac` | Product's canonical HSN/SAC code |
| `gstRate` | Numeric total GST percentage resolved from the backend's maintained HSN tax master |
| `gstRateStatus` | `RESOLVED`, `HSN_MISSING`, `HSN_INVALID`, or `RATE_NOT_FOUND` |

The backend should resolve the GST rate when the product is created/updated or when the catalogue is returned. It should not require one network call per cart item. Keep the mapping centralized and maintainable so tax-rate changes do not require a frontend deployment.

The responses are paged; the frontend reads their `content` array. If a product's HSN or rate cannot be resolved, return the applicable status explicitly. Do not silently substitute a rate based on product price or broad category. The HSN master is administered and populated on the backend; the frontend does not contain a rate table.

The system-admin frontend uploads the approved CSV master to `POST /api/admin/hsn-tax-rates/upload` as multipart form field `file`. The API accepts a maximum of 5 MB and 5,000 data rows. Include exactly one HSN/SAC code column (`hsnCode`, `hsn`, `hsnSac`, or `sac`) and one rate column (`gstRate`, `gst`, `rate`, or `taxRate`). The endpoint must authenticate and authorize a system administrator and return `success` and `importedCount`.

### 2. Recalculate and validate invoice taxes on submission

Treat all tax fields and totals sent by the browser as untrusted input. On invoice creation, the backend should:

1. Authenticate the retailer and load every product using a tenant-scoped product lookup.
2. Verify that submitted product IDs belong to that tenant and that the HSN matches the product record.
3. Resolve the applicable rate from the backend HSN master.
4. Recalculate taxable value, tax components, subtotal, and grand total using server-side currency rounding.
5. Reject the invoice with a clear validation response if a product has an invalid HSN or no applicable rate.
6. Persist the resolved HSN, rate, tax mode, and tax breakdown with the invoice so later rate changes do not alter historical invoices.

The backend should require a valid GSTIN registered to the authenticated store for GST invoice creation, then determine whether CGST/SGST or IGST applies from the selected issuer's location and `placeOfSupplyState`. The frontend previews this split but uses the server's returned tax components in the final invoice. A store without a valid GSTIN may create Non-GST bills only.

### 3. Honor the selected price mode

The invoice request includes `taxPricingMode` (`exclusive` or `inclusive`) at invoice and item level.

- **Exclusive:** the entered price is the taxable base; add GST to calculate the total.
- **Inclusive:** the entered price is the final amount; extract GST from it using `taxable = gross / (1 + rate / 100)`, then calculate tax as `gross - taxable`.

For example, at 18%:

| Mode | Taxable value | CGST | SGST | Total |
| --- | ---: | ---: | ---: | ---: |
| Inclusive, entered price ₹100 | ₹84.75 | ₹7.63 | ₹7.62 | ₹100.00 |
| Exclusive, entered price ₹100 | ₹100.00 | ₹9.00 | ₹9.00 | ₹118.00 |

For inclusive prices, use the catalogue unit price as the gross entered price. The backend validates `enteredPrice` (or `price` when `enteredPrice` is absent) against the current catalogue price; do not use MRP or custom prices without an updated backend pricing rule.

The paise rounding rule should ensure component amounts sum exactly to the line GST amount and the final total. The frontend sends amounts in the `cgst`, `sgst`, and `igst` component fields, together with the corresponding `*Amount` fields.

## Existing invoice request fields

The frontend currently sends invoice-level fields including:

- `billType`
- `taxPricingMode`
- `subtotal`, `gstAmount`, `grandTotal`, and `totalAmount`
- `items`

Each item includes the product identifier, `hsn`, `gstRate`, quantity, `price`, `enteredPrice`, `taxPricingMode`, `taxableAmount`, `taxAmount`, `cgst`, `sgst`, `igst`, `cgstAmount`, `sgstAmount`, and `igstAmount`.

For GST invoices, the request also includes `placeOfSupplyState` as a supported state name or two-digit GST state code. The backend requires a valid GSTIN for the authenticated store and a resolvable issuer state.

For inclusive pricing, `price` is the derived taxable unit price for compatibility with the existing invoice shape, while `enteredPrice` preserves the catalogue price. The backend should use the tenant's product and HSN tax master as the authority, not client-provided rates, names, SKUs, or amounts.

## Recommended API behavior

- Return a numeric `gstRate` alongside the canonical HSN from product-list APIs.
- Return server-calculated invoice and item totals, canonical HSN, resolved `gstRate`, `taxPricingMode`, `enteredPrice`, taxable value, tax amount, and CGST/SGST/IGST details after invoice creation.
- Use HTTP 400 with a product-specific `message` when HSN/rate data, place of supply, issuer location, tenant ownership, or entered price is invalid. The frontend displays that message and retains the cart.
- Do not add a per-item tax lookup endpoint call to the checkout flow; the catalogue response and server-side invoice validation are sufficient.
- Support an invoice-level idempotency key for safe retries across tabs, reloads, or ambiguous network failures. The frontend prevents concurrent submissions and blocks same-tab retries after an ambiguous response, but backend idempotency is needed to prevent duplicate invoices across clients.

The HSN master may be empty until an approved dataset is loaded. In that case the catalogue should return `RATE_NOT_FOUND`; GST invoices for those products remain blocked until an administrator populates the backend master.
