# Password Recovery and Email MFA — Backend Implementation Report

## Executive summary

The frontend now exposes password recovery and email-only MFA. This repository contains no backend implementation, so the endpoints, persistence, email delivery, abuse controls, and security tests below are required before enabling the flows in production.

## End-to-end delivery plan

1. **Agree on contracts:** implement the endpoint schemas below; keep user-facing responses generic.
2. **Build token/challenge persistence:** store only keyed hashes, expiry, attempt counts, and consumption state; enforce single-use behavior atomically.
3. **Integrate email delivery:** use the organization’s approved transactional mail provider and a bounded asynchronous queue with retry/dead-letter handling.
4. **Enforce auth boundaries:** issue a pre-authentication cookie for MFA, and issue an authenticated session only after MFA verification.
5. **Add abuse protection and telemetry:** apply per-IP and per-account throttles, security audit events, redacted logs, and alerts.
6. **Test and stage:** run the security and integration cases below against a non-production mail sink; deploy behind a feature flag and monitor before broad enablement.
7. **Operate:** set retention/cleanup policies, monitor delivery and abuse metrics, rotate cryptographic keys, and document incident response.

## Required API contract

All JSON endpoints require HTTPS, `Cache-Control: no-store`, strict JSON parsing, request-size limits, and credentialed CORS restricted to the known application origin. Never log passwords, reset tokens, OTP values, cookies, or authorization headers.

### Password reset request

`POST /api/auth/password/forgot`

Request:

```json
{ "email": "person@example.com" }
```

For both known and unknown addresses, return the same `202 Accepted` status, response shape, and user-facing message:

```json
{ "message": "If an account matches that email, password reset instructions will arrive shortly." }
```

For a known, eligible account, queue an email containing a cryptographically random, single-use token. Link to the frontend as `/login#resetToken=<url-encoded-token>`; a fragment is not sent in HTTP requests or referrer headers. The backend must never put the token in application logs, analytics, or redirect query parameters.

### Password reset completion

`POST /api/auth/password/reset`

Request:

```json
{ "token": "<reset-token>", "newPassword": "<new-password>" }
```

Return `204 No Content` only after a successful atomic consume and password change. Invalid, expired, already-used, or unknown tokens must produce a generic failure that does not reveal account existence. Enforce the password policy on the server (the frontend currently asks for 12–128 characters); use a modern adaptive password hash (Argon2id preferred, or appropriately tuned bcrypt/scrypt/PBKDF2), with no reversible encryption.

On success, increment an authentication/session version and revoke existing refresh tokens/sessions, then send a separate security-notification email. Do not automatically authenticate the browser that completed the reset.

### Login with required MFA

`POST /api/login` retains the existing credential request. When valid credentials belong to an account requiring MFA, return `202 Accepted`:

```json
{
  "mfaRequired": true,
  "mfaChallenge": {
    "challengeId": "<opaque non-secret identifier>",
    "maskedDestination": "p***@example.com",
    "expiresAt": "2026-01-01T12:05:00Z"
  }
}
```

Set a short-lived pre-authentication cookie (`Secure`, `HttpOnly`, `SameSite=Strict` where deployment topology permits, narrowly scoped path/domain, and no broad `Domain`). For cross-site frontend/API hosting, use `SameSite=None; Secure`, exact-origin credentialed CORS, and CSRF/origin protections. Bind the cookie server-side to the challenge, user, login attempt, and expiry.

**Do not return an access token, refresh token, authenticated session cookie, or full credential-bearing user object in this response.** The same generic invalid-credentials behavior must apply to nonexistent users and incorrect passwords. Do not issue an MFA challenge before validating the primary credential.

### Send email MFA code

`POST /api/mfa/send`

Request:

```json
{ "challengeId": "<opaque identifier>" }
```

Require the matching pre-authentication cookie. Resolve the email from the account server-side; never accept an arbitrary destination from the client. Return `202 Accepted` with a generic success message and the masked destination. Throttle sends per challenge, account, IP, and mail-recipient; enforce a resend cooldown and daily quota.

Generate a six-digit cryptographically secure code. Store a keyed hash (HMAC using a managed secret), challenge binding, creation/expiry time, and attempt state—not the raw code. Keep validity short (for example, five minutes), limit failed attempts, and invalidate a previous code when resending. Queue mail asynchronously and avoid SMTP/API calls on request threads.

### Verify email MFA code

`POST /api/mfa/verify`

Request:

```json
{ "challengeId": "<opaque identifier>", "otp": "123456" }
```

Require the same pre-authentication cookie and exact challenge binding. Validate format, expiry, attempt limits, and single-use state, then atomically consume the challenge/code to prevent concurrent replay. Return a generic failure for incorrect, expired, consumed, or mismatched challenges.

Only after success, create the authenticated session and clear the pre-authentication cookie. Prefer a short-lived access token returned to the frontend plus a rotated `Secure; HttpOnly` refresh cookie; never return a refresh token to browser storage. Record the MFA method and successful authentication in the audit trail.

### Cancel pending MFA challenge

`POST /api/mfa/cancel`

Request:

```json
{ "challengeId": "<opaque identifier>" }
```

Require the matching pre-authentication cookie, invalidate the challenge idempotently, clear the pre-authentication cookie, and return `204 No Content` (or a generic success response). A cancellation for an expired/already-consumed challenge should not reveal account information.

## Persistence model

Use the backend’s established database and transaction conventions. A minimal model should cover:

- **password_reset_tokens:** user ID, unique keyed token digest, issued/expiry timestamps, consumed timestamp, request metadata needed for throttling/audit. Add indexes for digest and expiry; purge expired records in bounded batches.
- **auth_challenges:** challenge ID, user ID, keyed code digest, challenge/session binding, issue/expiry timestamps, failed-attempt count, send count, consumed/invalidated timestamps, and delivery status. Ensure atomic attempt increments and one-time consumption.
- **rate-limit state:** use a shared, bounded store (for example Redis with TTLs) when horizontally scaled; do not rely on process-local counters.

Never persist plaintext reset tokens or OTPs. Protect HMAC keys in a managed secret store, separate key material by purpose, support rotation, and version digests for rotation windows.

## Security, privacy, and operations

- Return indistinguishable reset-request responses and comparable timing for known/unknown emails. Apply a small bounded response-time floor only if profiling demonstrates a measurable enumeration risk; avoid unbounded sleeps.
- Rate-limit by multiple dimensions, use progressive backoff, and alert on credential-stuffing, OTP guessing, excessive delivery, and reset spikes. Do not permanently lock accounts based solely on unauthenticated traffic.
- Use an established mail provider with SPF, DKIM, and DMARC configured. Use an asynchronous queue with bounded retries, idempotency, and a dead-letter path; do not retry indefinitely.
- Audit reset requested/completed, MFA sent/failed/succeeded, and session revocation with actor/account identifiers and outcome only. Redact email local parts where feasible; never record secrets or message bodies.
- Validate `Origin`/CSRF controls on cookie-authenticated state-changing endpoints, reject unexpected content types, and disable caching at proxy/CDN layers.
- Keep operational work bounded: indexed point lookups, TTL expiration, batched cleanup, fixed-length code hashing, no polling loops, and bounded queue concurrency. Monitor p50/p95 endpoint latency, mail queue depth, delivery failures, rejected OTP rates, and resource utilization.

## Required backend test coverage

1. Reset-request response/status/body and response timing do not disclose whether an account exists.
2. Reset token has sufficient entropy, is stored hashed, expires, is single-use, and cannot be replayed concurrently.
3. Reset completion enforces server password policy and revokes existing sessions/refresh tokens.
4. MFA-enabled login returns no authenticated token/session before code verification; MFA-disabled login remains unchanged.
5. Challenge cookie attributes and binding are correct; missing, expired, cross-user, or replayed challenges fail.
6. Email destination is sourced only from the verified account and all UI-visible addresses are masked.
7. OTP expiry, resend invalidation, attempt exhaustion, per-IP/account limits, and atomic one-time consumption behave under concurrent requests.
8. Mail provider outage is observable and does not create a success-shaped authenticated state.
9. Logs, traces, metrics, and audit events contain no passwords, tokens, cookies, or OTPs.
10. CORS/CSRF, HTTPS, proxy cache behavior, and session-cookie rotation are verified in the deployed topology.

## Frontend integration status and release gate

Implemented in this frontend repository:

- Login-page forgot-password and reset-password forms. Reset tokens are read from the URL fragment and removed from browser history before submission.
- Email-only MFA send/verify UI and API calls.
- MFA challenge-ID requests that match the backend `MfaChallengeRequest` contract. The frontend fails closed when login does not return the challenge ID.
- No local/session-storage persistence of pre-authentication MFA users or challenges; no access/refresh token is installed before MFA verification.
- API endpoint constants and generic user feedback for reset requests.

**Release gate:** do not enable account MFA or advertise password reset as production-ready until backend endpoints, cookie/session semantics, delivery configuration, abuse controls, and the tests above are implemented and verified. Backend source was not available in this repository, so this report is an implementation specification, not a claim that backend services have been delivered.
