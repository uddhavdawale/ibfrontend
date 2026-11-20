# Backend Contract: Cash Handover Balances and Due Report

## Purpose

Provide a trustworthy answer to both sides of a biller-to-counter cash handover:

- A cashier sees the amount of cash collected since their last completed handover, their carried-forward due, outstanding amount due to the counter, open ticket holds, and the amount they can submit now.
- A store admin sees each cashier's same balance and tenant-wide totals, including cash due that has not yet been submitted as a ticket.

The existing cash handover ledger remains the source of truth. This report does not create customer payments, alter invoice balances, or infer cash from non-cash payments.

## Required endpoints

All endpoints require authentication. The backend derives the actor, user role, and tenant from the authenticated session; it must never accept client-supplied tenant or cashier IDs as authority. Scope every response and operation to the authenticated tenant.

### 1. List handover recipients

`GET /api/cash-collection-tickets/recipients`

Allowed for authenticated users who can submit a handover ticket. Return only active store admins in the caller's tenant, with the minimum fields needed for selection.

```json
{
  "content": [
    { "id": 12, "name": "Store Admin" }
  ]
}
```

The backend must still revalidate `recipientUserId` at ticket creation. Never trust a recipient ID just because it came from this list.

### 2. Get cashier balance or admin balance report

`GET /api/cash-collection-tickets/balances?page=0&size=100`

- A seller/biller may read only their own balance. Ignore or reject any requested user ID.
- A store admin may read a paginated list of cash-handling users in their tenant, including users with zero due if they are eligible cash collectors. The response summary totals cover the entire tenant, not just the current page.
- System admins must have an explicit tenant context and must not receive cross-tenant balances by default.
- Validate page and size; cap size at 100. Return stable pagination and deterministic ordering (for example, descending `dueToSubmit`, then user name/ID).

Cashier response:

```json
{
  "balance": {
    "userId": 11,
    "userName": "Example Biller",
    "asOf": "2026-11-17T17:00:00Z",
    "trackingStartedAt": "2026-11-01T00:00:00Z",
    "periodStart": "2026-11-12T12:00:00Z",
    "lastSettledHandoverAt": "2026-11-12T12:00:00Z",
    "cashPaymentCountSinceLastHandover": 8,
    "cashCollectedSinceLastHandover": 5000.00,
    "cashRefundedSinceLastHandover": 200.00,
    "carriedForwardDue": 300.00,
    "dueToSubmit": 5100.00,
    "pendingHandoverAmount": 1000.00,
    "disputedHandoverAmount": 500.00,
    "availableToSubmit": 3600.00,
    "cashCreditBalance": 0.00
  }
}
```

Store-admin response:

```json
{
  "content": [
    {
      "userId": 11,
      "userName": "Example Biller",
      "role": "billing_manager",
      "trackingStartedAt": "2026-11-01T00:00:00Z",
      "periodStart": "2026-11-12T12:00:00Z",
      "lastSettledHandoverAt": "2026-11-12T12:00:00Z",
      "cashPaymentCountSinceLastHandover": 8,
      "cashCollectedSinceLastHandover": 5000.00,
      "cashRefundedSinceLastHandover": 200.00,
      "carriedForwardDue": 300.00,
      "dueToSubmit": 5100.00,
      "pendingHandoverAmount": 1000.00,
      "disputedHandoverAmount": 500.00,
      "availableToSubmit": 3600.00,
      "cashCreditBalance": 0.00
    }
  ],
  "summary": {
    "asOf": "2026-11-17T17:00:00Z",
    "totalDueToSubmit": 5100.00,
    "totalPendingHandoverAmount": 1000.00,
    "totalDisputedHandoverAmount": 500.00,
    "totalAvailableToSubmit": 3600.00
  },
  "page": 0,
  "size": 100,
  "totalPages": 1,
  "totalElements": 1
}
```

All monetary fields are decimal INR amounts, consistent with the existing payment and handover APIs. Return zero rather than null for monetary amounts and counts. Keep timestamps in ISO-8601 UTC. `cashPaymentCountSinceLastHandover` counts cash payment records, not product units; report item quantities separately only if a sale-line aggregation is explicitly required.

## Balance definitions

The backend must calculate balances from the authoritative cash-payment, refund/reversal, handover, and audited opening-balance ledgers. Never calculate a balance from the browser, invoice totals, or client-provided amounts.

1. Include only completed/received **cash** payments credited to that cashier. Exclude UPI, card, bank, wallet, failed, pending, reversed, or otherwise voided payments.
2. Subtract cash refunds/reversals from the cashier's cash due using the payment's actual cash accounting entry. Do not count non-cash refunds against physical cash.
3. Keep an auditable opening due/credit balance when this feature is enabled. Do not assume the opening balance is zero if pre-existing cash was already held by staff.
4. A completed handover is `ACCEPTED` or `RESOLVED`. Subtract only the amount actually transferred to the admin: the declared amount for an accepted exact count, and `resolvedAmount` for a resolved ticket. A pending or disputed ticket never reduces `dueToSubmit`.
5. `dueToSubmit` is the cashier's positive outstanding cash obligation after opening balance, net cash collections, cash refunds/reversals, and completed handovers. If credits exceed the obligation, return `dueToSubmit: 0` and expose the remainder as `cashCreditBalance`; do not silently discard the credit.
6. `pendingHandoverAmount` is the sum of declared amounts on pending tickets. `disputedHandoverAmount` is the amount physically held for disputed tickets, capped per ticket at `min(declaredAmount, receiverCountedAmount)`. These amounts remain part of `dueToSubmit` but are held from being requested a second time.
7. `availableToSubmit = max(0, dueToSubmit - pendingHandoverAmount - disputedHandoverAmount)`. It must never be negative.
8. `lastSettledHandoverAt` is the latest timestamp of an accepted or resolved handover. `periodStart` is that timestamp, or `trackingStartedAt` when no handover has settled. `cashCollectedSinceLastHandover`, refund totals, and payment count describe ledger activity in `[periodStart, asOf]`. `carriedForwardDue` is the unpaid obligation that existed at `periodStart`; do not lose an unpaid remainder when a biller submits only part of their due.

Use a transactionally consistent `asOf` snapshot for all fields in a response. Avoid double counting retries or duplicate payments/tickets by honoring ledger uniqueness and idempotency keys.

## Ticket integration and validation

Keep the existing ticket operations:

- `POST /api/cash-collection-tickets` with `recipientUserId`, `declaredAmount`, `paymentMethod`, `idempotencyKey`, optional `notes`, and (for UPI/card) a `paymentProof` image.
- `POST /api/cash-collection-tickets/{ticketId}/count` with `countedAmount`, `idempotencyKey`, and optional `notes`.
- `POST /api/cash-collection-tickets/{ticketId}/resolve` with `resolvedAmount`, `idempotencyKey`, and required `resolutionNote`.
- `GET /api/cash-collection-tickets/{ticketId}/payment-proof` to return the authenticated image bytes for an authorized ticket participant/admin.

`paymentMethod` is `CASH`, `UPI`, or `CARD`; old tickets with no method are treated as `CASH`. Keep the existing JSON create request for cash. For UPI/card, accept the same fields as `multipart/form-data` plus a required `paymentProof` file (PNG, JPEG, or WebP, maximum 5 MiB). Validate actual file content and size on the server, store it privately, and return no public storage URL. The proof endpoint must enforce the same tenant and ticket visibility rules as the ticket, set the correct image content type, and prevent shared caching.

For UPI/card tickets, the designated recipient must be able to view the proof before counting the ticket. `countedAmount` represents the amount physically counted for cash, or the amount verified from the attached proof for UPI/card. An exact amount accepts the ticket; a mismatch disputes it. Accepted UPI/card tickets settle the sender's due but must not be added to the recipient's physical cash balance or cash reconciliation. Apply the same distinction when resolving disputed tickets. Do not treat the screenshot itself as proof of a backend payment or trust client-supplied method, filename, MIME type, amount, or recipient.

On ticket creation, in one transaction:

1. Lock the cashier's cash-balance/ledger scope.
2. Recalculate `availableToSubmit` from the latest committed ledger state.
3. Reject non-positive amounts and any declared amount greater than the recalculated available amount; the UI submits the full displayed available amount by default. Return `409 Conflict` with a safe refresh message when stale balance or concurrent submission invalidates the request.
4. Verify the recipient is an active store admin in the same tenant.
5. Create the pending ticket and reserve its declared amount so a second ticket cannot claim the same cash.
6. Return the new ticket and the updated balance snapshot (including `senderAvailableCash` only if its semantics are clearly defined; prefer returning the complete `balance` object above).
7. Require and persist a private payment-proof attachment for UPI/card requests; reject proof attachments for cash requests. Bind the file and ticket metadata to the same idempotency operation.

When counting, only the ticket's designated store-admin recipient may act. An exact cash count accepts and transfers the declared cash to that admin. For UPI/card, require the recipient to review the privately served screenshot and verify the payment amount before accepting. A mismatch marks the ticket disputed; it must not credit the admin. Preserve the amount held for dispute from the cashier's available-to-submit amount so that it cannot be submitted twice. When resolving a dispute, only a store admin or system admin in the correct tenant may act; the transfer may not exceed either the declaration or counted/verified amount. Transfer only `resolvedAmount`, leave any difference in the cashier's due, record the resolver, note, timestamp, and idempotency key, then return refreshed cashier/admin balances. Digital settlements must not change physical cash balances.

All balance changes and ticket status transitions must be atomic, locked against concurrent actions, and idempotent. Scope reads and mutations by tenant. Never update the original customer payment or invoice balance when cash custody changes.

## Frontend behavior

- On cashier sign-in/opening the Payments screen, fetch the caller's balance and show cash payments/count and amount collected since the last settled handover, cash refunds, carried-forward due, total due, pending/disputed holds, and exact amount available to submit.
- Load valid recipient admins from `/recipients`; display their names, not a free-form user ID. The server validates the chosen ID again on submit.
- Let cashiers select cash, UPI, or card for each handover. Require an image payment screenshot for UPI/card before submission and show it to the authorized admin before they confirm the verified amount.
- Prefill the handover amount with `availableToSubmit` and prevent the UI from submitting when it is zero or the balance fails to load. After ticket submission/count/resolution, refresh both the ticket list and balances.
- On the store admin screen, show a tenant-wide total and a paginated row per cashier with amount and payment count since last handover, total due, pending, disputed, available-to-submit, and last settled handover. Admin totals must come from the server-wide summary, never be computed from the current page alone.
- Show pending/disputed amounts separately so admins can distinguish money still to be counted/resolved from cash not yet requested.
- Treat the displayed balance as informative, not authorization. The backend recalculates and validates on every submit/count/resolve request.
- The screen reports cash payment records and amounts, not the physical count of products sold. Product-unit reporting requires joining sale lines and must not be conflated with cash due.

## Rollout and opening balances

Before enabling balances:

1. Choose and persist a tenant-level `trackingStartedAt`.
2. Reconcile cash already held by each cashier at rollout. Store a signed/audited opening due or credit per cashier and the admin/actor who approved it.
3. Make migration/backfill idempotent and preserve source references. Do not infer the historical cashier from sale creator or rewrite payment records.
4. Reconcile a sample of each user's payment, refund, handover, and opening-balance entries against the calculated balance.
5. Enable the UI only after `/recipients` and `/balances` are deployed and authorized.

## Acceptance criteria

- A cashier can see the exact current due and the interval since their last completed handover.
- A cashier with no due sees zero available to submit and cannot create an empty/duplicate ticket.
- A ticket reserves its amount; refreshing/retrying cannot increase the cashier's available amount or create a duplicate ticket.
- A store admin can see the total due across the tenant even when the biller list is paginated, and can inspect each biller's due, pending, disputed, and unrequested amounts.
- Cash received after the last handover increases the due; net cash refunds decrease it; non-cash payment/refund activity does not affect it.
- Accepted and resolved handovers decrease the cashier's due by only the amount transferred and increase the admin's cash balance by the same amount.
- Disputed tickets do not credit the admin and cannot be submitted twice.
- Tenant boundaries, recipient identity, active status, role permissions, and amount sufficiency are enforced by the backend on every request.
- Payment records, invoice balances, and customer receipts are unchanged by a handover.
