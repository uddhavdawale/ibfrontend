# Organization and Store Invoice Issuer Implementation Report

## Goal

Allow a system administrator to create organizations and optionally assign
stores to them. Keep every store as an independent data tenant. Allow a store
invoice to be issued as either the store or its assigned organization without
changing existing store-issued invoices.

## Existing behavior preserved

- Organization assignment is optional. Stores remain independent when
  unassigned.
- Assignment does not merge or grant access to inventory, customers, users,
  payments, or invoices across stores.
- Billing defaults to `STORE`; older clients that omit `issuerType` must also
  continue to default to `STORE`.
- The invoice/payment, GST calculation, stock, and store-scoped Sales flows were
  not otherwise changed.
- Existing invoices without an issuer snapshot continue using the existing
  store-profile fallback when rendered.

## Frontend changes

- `src/Admin/AdminOrganizationsPage.jsx` provides system-admin organization
  creation, paginated organization/store lists, store search, assignment,
  reassignment, and unassignment.
- `src/Admin/AdminLayout.jsx` adds the Organizations navigation entry.
- `src/AppRouter.jsx` protects `/admin/organizations` with the existing
  system-admin route check. This is a UI guard only; backend authorization is
  mandatory.
- `src/Config/api.js` adds the organization and store API endpoints.
- `src/Billing/BillingPage.jsx` adds an issuer selector. The store is the
  default. Organization invoicing is enabled only after a live `/api/shop/me`
  response confirms the store assignment. Organization-issued GST invoices
  additionally require the organization's GSTIN and address.
- GST and non-GST invoice creation sends only `issuerType`. The backend must
  resolve the issuer from the authenticated store assignment; the frontend
  does not send an organization ID or issuer name as authority.
- `src/modules/shopProfile/shopProfileService.js`,
  `src/utils/invoicePdf.js`, and `src/sell/SellPage.jsx` render issuer details
  from the invoice snapshot when present. New invoice PDFs do not use the
  current store profile to replace a persisted issuer snapshot.
- Organization identity interpolated into the billing invoice preview is
  HTML-escaped. The admin page requests paginated data and does not fetch
  per-store details.

## Backend contract expected by this frontend

The supplied API contract covers the following system-admin operations:

- `POST /api/admin/organizations`
- `GET /api/admin/organizations?page=0&size=20`
- `GET /api/admin/stores?page=0&size=20&search=...`
- `PUT /api/admin/organizations/{organizationId}/stores/{tenantId}`
- `DELETE /api/admin/organizations/{organizationId}/stores/{tenantId}`

Additional confirmed integration requirements:

1. `GET /api/shop/me` must return only the authenticated store's assigned
   organization summary, including its stable ID and name. To enable
   organization-issued GST invoices, it must also return the organization's
   GSTIN and registered address (city/state/pincode as applicable). This read
   must be scoped from the authenticated principal, not client-supplied tenant
   or organization headers.
2. The organization create endpoint must accept and return `gstin`, `phone`,
   and `email` in addition to the documented name/address/city/pincode fields.
   The frontend currently sends these optional fields so legal identity can be
   captured at organization setup.
3. Invoice creation must accept `issuerType` (`STORE` or `ORGANIZATION`),
   resolve the issuer from the authenticated store and its current assignment,
   and reject `ORGANIZATION` for an unassigned store. It must not trust a
   client-supplied issuer name, organization ID, GSTIN, or address.
4. Persist the resolved issuer as an immutable snapshot on both GST and
   non-GST invoices. The recommended response/read fields are:
   `issuerType`, `issuerName`, `issuerGstin`, `issuerAddress`, `issuerPhone`,
   and `issuerEmail`. Invoice detail/list APIs used by Sales must return those
   fields so historical invoice PDFs remain stable after profile changes.
5. Backend validation must reject organization-issued GST invoices when the
   organization lacks its required GST identity/address. The frontend check is
   for a smooth UX, not a security or compliance boundary.
6. Only authenticated `SYSTEM_ADMIN` users may create organizations, list
   organizations/stores, or change assignments. Enforce this on every admin
   endpoint and audit successful assignment changes.
7. Assignment is optional and unique per store. Reassignment must atomically
   replace the previous organization relationship without changing the store's
   tenant ID or moving any store data. Existing stores are not auto-assigned.

The backend source was not present in this workspace, so these backend
requirements are not implemented or verified here. The original supplied
organization request shape did not include GSTIN/contact fields or a
store-scoped organization response; those are additive backend contract
requirements for the confirmed organization-issued GST flow.

## Production and security requirements

- Derive user, store tenant, permissions, and organization assignment from the
  authenticated server-side principal. `X-Tenant-Id`, `X-Organization-Id`,
  `X-Shop-Id`, route guards, and request bodies are not authorization sources.
- Keep all store data queries and invoice reads scoped to the store tenant.
  Organization membership is a parent relationship only.
- Validate organization IDs and store ownership before assignment, reassignment,
  or removal. Use database constraints/transactions to enforce at most one
  organization per store.
- Use server-calculated invoice totals/tax and server-resolved issuer
  snapshots. Do not mutate existing invoice snapshots on later organization or
  store profile changes.
- Keep endpoints paginated (20 rows per frontend page); avoid per-row requests
  or polling. Mutation requests disable automatic 429 retries to avoid
  accidentally repeating organization creation.
- Apply backend validation, rate limiting where appropriate, audit logging,
  and safe error responses. Do not log credentials or customer personal data.

## Validation

- `npm run build -- --outDir .tmp-organization-build`: passed. Vite emitted a
  large-chunk advisory; the build completed successfully.
- Backend API integration and authorization could not be exercised because the
  backend source/environment was not available.
- The repository has no ESLint configuration, so ESLint is unavailable.

## Follow-up before production rollout

- Deploy and verify the backend contract above before enabling organization
  issuer selection for retailers.
- Test system-admin create/list/assign/reassign/unassign with authorized and
  unauthorized users.
- Test an unassigned store, a store-issued GST invoice, an organization-issued
  non-GST invoice, and an organization-issued GST invoice with complete legal
  details.
- Verify persisted invoice issuer snapshots through invoice detail and Sales
  APIs, then edit organization/store profiles and confirm old invoice output
  does not change.
- Run backend tenant-isolation and concurrency tests for simultaneous
  reassignment and invoice creation.
