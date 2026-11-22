# Customer Due Balance Fix Report

## Purpose

Record the customer due-balance investigation and frontend correction so future
changes preserve the billing, customer-profile, invoice, and sales behavior of
this production application.

## Scope and finding

The reported yellow amount is shown by the Customer Directory. Billing reads
and updates customer profiles through `/api/customer_profiles`, but the
directory previously tried `/api/customers` first and stopped at any successful
response. When both APIs returned data, the directory could therefore display
the legacy customer record rather than the profile balance updated by billing.

This is a frontend data-source mismatch. The backend source code was not
available during this change, so this report does not claim that backend
invoice/payment persistence has been verified or corrected.

## Change made

In `src/Customers/CustomerPage.jsx`:

- Customer lists and searches now prefer `/api/customer_profiles`.
- The legacy `/api/customers` endpoint remains a fallback when the profile
  response contains no records or cannot be read.
- Customer detail lookups by ID and phone now prefer the customer-profile
  endpoints, with the legacy endpoints retained as fallbacks.
- Balance normalization recognizes `currentBalance` and renders invalid or
  negative values as zero.

No billing or sales calculation, payment recording, invoice format, GST
handling, or backend API payload was changed.

## Existing billing flow and balance rule

`src/Billing/BillingPage.jsx` currently:

1. Looks up the existing customer profile balance before submitting an invoice.
2. Creates an invoice, then records an actual payment through the invoice
   payment endpoint when money was received.
3. Calculates the customer balance as:

   `previous customer due + max(invoice total - payment recorded for this invoice, 0)`

4. Attempts to synchronize the profile balance and shows a warning if that
   synchronization fails.
5. Presents the recorded payment and resulting balance in the invoice preview.

This means a fully paid *new invoice* leaves an older outstanding balance
unchanged. Confirm with the product owner/backend contract before changing this
rule: if a payment is intended to settle the whole customer account, payment
allocation must include the prior due rather than treating the payment as
applied only to the current invoice.

The existing backend contract note is in
`BACKEND_CUSTOMER_DUE_SYNC_IMPLEMENTATION_REPORT.md`. Treat it as a requirement
document, not proof of the deployed backend implementation.

## Production constraints for follow-up work

- Verify backend behavior from its controller/service/entity/repository code
  and actual sanitized API responses before changing persistence logic.
- The backend should be the authoritative calculator for invoice totals,
  payment state, payment allocation, and customer due. Avoid relying on
  client-supplied totals or profile balances as financial authority.
- Keep payment-ledger creation and invoice paid/outstanding updates atomic and
  idempotent. Do not retry a payment as a new payment or create a second
  payment record when the result is uncertain.
- Enforce authentication and tenant/customer/invoice ownership on every
  backend lookup, update, and payment operation. Do not add tenant IDs or
  authorization decisions based on client input.
- Use decimal currency types and server-side validation; never permit negative
  paid, due, or total values.
- Confirm what `/api/customer_profiles/{id}` PATCH is allowed to update. The
  current frontend sends several compatibility balance aliases. Prefer one
  canonical server-side due field if the backend contract supports it; do not
  remove aliases until deployed clients and backend consumers are verified.
- Keep customer-directory fetching bounded: read the profile list once and
  call the legacy fallback only when the profile response has no usable
  records. Avoid per-customer API requests or new polling.
- Check whether customer and customer-profile IDs share a namespace. The
  current detail lookup prefers profile-by-ID; ambiguous IDs should be resolved
  by an explicit resource type or stable profile identifier, not by guessing.

## Evidence needed to confirm backend persistence

For one redacted customer, provide the following from the backend environment:

1. Customer-profile response immediately before a sale.
2. Invoice-create request and response for GST or non-GST, including returned
   invoice ID and customer-profile ID (if present).
3. Payment request and response, including the idempotency result.
4. Customer-profile response after payment and invoice detail as returned to
   the Sales page.
5. Backend code for invoice creation, payment recording, customer resolution,
   and profile due updates, plus the relevant DTO/entity fields.

Include a reproducible case with prior due `D`, invoice total `T`, and actual
payment `P`, and state whether `P` applies to the current invoice only or to the
entire account. Remove customer PII, credentials, access tokens, and secrets.

## Validation and delivery

- `npm run build -- --outDir .tmp-customer-balance-build`: passed. Vite emitted
  a large-chunk advisory; the build completed successfully.
- ESLint could not be run because the repository has no ESLint configuration.
- `git diff --check`: passed for the code change.
- Frontend code was pushed in commit `df3282d` (`Fix customer due balance
  source`) on `prod/SmartShopUI`.
- At report creation, pre-existing `.env` and `dist` changes remain outside the
  code commit and must not be overwritten or included in unrelated follow-up
  commits.

## Guidance for future changes

Use this report as change context, not as a substitute for inspecting the
current code and backend contract. Before modifying this flow, verify whether
its assumptions still match the deployed API, make only the requested
production-safe change, preserve GST/non-GST and payment-ledger behavior, and
validate with the smallest relevant build or test.
