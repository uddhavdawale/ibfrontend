# Backend Handoff: Secure Payment-Proof Storage

## Summary

The payment collection UI reports **“Secure document storage is not configured”** when a biller submits a UPI/card collection request with a screenshot. This response indicates that the backend upload/storage path is unavailable or missing configuration; the browser must not receive storage credentials and cannot fix this by changing frontend environment variables.

The frontend implementation is in [PaymentCollectionPage.jsx](./src/Payments/PaymentCollectionPage.jsx). It submits the payment screenshot with the collection ticket and later requests the proof through the authenticated API. The frontend/backend contract is documented in [BACKEND_CASH_HANDOVER_BALANCE_API.md](./src/Admin/BACKEND_CASH_HANDOVER_BALANCE_API.md).

Backend source is not present in this frontend repository. The backend agent should trace the exact error string and configure the server-side private document-storage service used by the cash-collection ticket API.

## Existing frontend request contract

### Cash request

`POST /api/cash-collection-tickets` remains JSON for `paymentMethod: "CASH"`:

```json
{
  "recipientUserId": 12,
  "declaredAmount": 1250.00,
  "paymentMethod": "CASH",
  "idempotencyKey": "cash-drop-unique-key",
  "notes": "Optional biller note"
}
```

### UPI/card request

The same endpoint receives `multipart/form-data` with these fields:

- `recipientUserId`
- `declaredAmount`
- `paymentMethod`: `UPI` or `CARD`
- `idempotencyKey`
- `notes` (may be empty)
- `paymentProof`: required image file

Allowed image types are PNG, JPEG, and WebP, with a maximum size of 5 MiB. The UI shows a local preview and blocks submission until a file is selected.

### Admin proof review

`GET /api/cash-collection-tickets/{ticketId}/payment-proof` returns the image bytes to the authenticated UI. The UI sends the normal authenticated API request and expects an image response with a valid image content type. It does not consume or expose a public object-storage URL.

The ticket response/list item must include `paymentMethod`. Existing tickets without it are interpreted as `CASH`.

## Required backend implementation

1. **Trace and correct storage configuration**
   - Locate the backend code that emits “Secure document storage is not configured” and identify the missing provider/service configuration.
   - Reuse the backend's established private document-storage service if available. If none exists, confirm the provider with the project owner before selecting one.
   - Load configuration and credentials only in the backend deployment environment or secret manager. Do not put credentials in frontend code, `VITE_*` variables, API responses, logs, or repository files.
   - Ensure the deployed API service has the required bucket/container, region/project, and identity/permission configuration. Do not disable storage security or fall back to a public bucket to suppress the error.
   - Return a safe, structured service-unavailable error if storage is unavailable; do not return credential names, paths, or secret values.

2. **Persist proof privately with ticket creation**
   - Keep cash-ticket JSON requests working without requiring storage configuration.
   - Require `paymentProof` for UPI/card and reject a proof attachment for cash tickets.
   - Validate the file server-side: size, allowed content type, and actual file signature. Do not trust the browser's MIME type, filename, extension, payment method, or declared amount.
   - Generate an opaque storage key server-side. Keep objects private, encrypted at rest where supported, and scoped to the tenant/ticket. Sanitize or avoid storing user-provided filenames as storage paths.
   - Coordinate storage and ticket creation with the existing idempotency behavior. A retry of the same request must not create duplicate tickets or proof objects. Clean up an uploaded object if ticket persistence fails; do not leave a pending ticket with a missing proof.
   - Store only the proof reference and safe metadata in the ticket record; never expose storage credentials or a permanent public URL.

3. **Authorize proof retrieval**
   - Implement `GET /api/cash-collection-tickets/{ticketId}/payment-proof`.
   - Authenticate the request and verify tenant and ticket visibility/role using server-side identity. Permit only authorized ticket participants/admins according to the existing ticket policy.
   - Stream the private image through the API (preferred for compatibility with the current authenticated frontend), or use an equally protected short-lived mechanism only if the frontend contract is updated.
   - Return the correct `Content-Type` (`image/png`, `image/jpeg`, or `image/webp`), `Cache-Control: private, no-store`, and `X-Content-Type-Options: nosniff`. Return a safe not-found/forbidden response without revealing cross-tenant ticket existence.

4. **Preserve settlement semantics**
   - For cash, `countedAmount` remains the physical count.
   - For UPI/card, the designated recipient reviews the retrieved screenshot and submits `countedAmount` as the amount verified. An exact match accepts; a mismatch disputes.
   - Accepted/resolved digital settlements must reduce the sender's outstanding due but must not increase physical cash balances or cash reconciliation totals.
   - Keep customer payments, invoices, and receipts unchanged by the handover.

## Operational configuration and errors

Configuration names depend on the backend's chosen provider and must be documented in the backend deployment guide. At minimum, configure the private storage location, server identity/credentials, and required access permissions in the backend environment. Verify the service identity can write and read the private proof objects in the target deployment.

Differentiate storage failure from invalid input:

- Missing server storage configuration: safe `503`-class error with a stable code such as `DOCUMENT_STORAGE_NOT_CONFIGURED`.
- Invalid/missing/oversized proof: `400`/`413`-class validation error.
- Unauthorized proof read: `403` or policy-consistent `404`.
- Temporary provider failure: safe retryable server error; do not mark the ticket accepted.

If the backend currently reports the message for cash-only requests as well, correct the service wiring so cash ticket creation remains independent of document storage.

## Acceptance checks

- [ ] With storage configured, a valid UPI request and a valid card request each create one pending ticket and one private proof object.
- [ ] The authenticated designated admin can retrieve and view the screenshot before submitting the verified amount.
- [ ] A sender from another tenant, an unrelated user, and an unauthenticated caller cannot retrieve the proof.
- [ ] Missing proof, unsupported content, forged MIME type, empty file, and files over 5 MiB are rejected without creating a ticket or orphaned object.
- [ ] Replaying an idempotent submission does not duplicate its ticket or proof object.
- [ ] A storage outage does not accept a UPI/card ticket or leave a ticket whose proof cannot be reviewed.
- [ ] Cash ticket creation continues to work without a configured document-storage provider.
- [ ] Exact digital verification settles the sender's due without changing physical cash totals; mismatch remains disputed until resolved.
- [ ] Proof responses use the correct image content type and private/no-store headers.

## Frontend integration note

The frontend already surfaces the API's error message in the ticket panel. Once backend storage is configured and the multipart ticket and protected proof endpoints are deployed, retry the same flow in the UI. No document-storage secret or provider credential should be added to the frontend.
