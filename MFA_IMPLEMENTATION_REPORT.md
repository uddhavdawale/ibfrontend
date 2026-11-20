# Email MFA Implementation Report

## Status

The frontend email-MFA flow is implemented. Backend enforcement, challenge storage, and email delivery are not present in this frontend repository and must be completed using the contract in [PASSWORD_RECOVERY_MFA_BACKEND_IMPLEMENTATION_REPORT.md](./PASSWORD_RECOVERY_MFA_BACKEND_IMPLEMENTATION_REPORT.md).

## Frontend flow

1. The user submits the existing login credentials.
2. If MFA is required, the backend returns a `mfaChallenge` with a non-empty `challengeId` and establishes a short-lived, `HttpOnly` pre-authentication cookie. The frontend accepts common response field naming variations but never substitutes a username for the challenge ID.
3. The user explicitly requests a code sent to the registered email address. The UI shows only the backend-provided masked destination.
4. The user enters the six-digit code. Verification returns the authenticated session; the frontend normalizes common top-level and nested (`data`, `session`, `auth`, or `tokens`) response shapes before installing tokens and navigating to the app.
5. Canceling or reloading the pending challenge does not resume a session. The user must sign in again.

## Security properties

- MFA challenge state remains in React memory; it is not written to local or session storage.
- No authenticated access or refresh token is installed or persisted before MFA verification. The challenge cookie binds the send and verify requests.
- Starting MFA clears any stale authenticated tokens/session metadata. On successful verification, the username is saved for refresh requests, returned tokens are installed before navigation, and the automatic session check is deferred to avoid racing the backend session transition.
- MFA is email-only; the previous Firebase phone/reCAPTCHA runtime and SMS fallback have been removed from the MFA service.
- The backend must bind challenge IDs to the pre-authentication cookie, expire and atomically consume codes, limit sends and attempts, and invalidate pending sessions after successful verification or cancellation.
- MFA delivery and code validity are backend responsibilities; frontend checks are for user experience and are not security controls.
- Verification access/refresh tokens and user profile data are normalized from the supported response wrappers before protected-route session checks run.

## MFA API contract

- Send/verify requests use `{ challengeId }` and `{ challengeId, otp }`, respectively, matching the backend's required `MfaChallengeRequest.challengeId`.
- Canceling an active challenge calls `POST /api/mfa/cancel` with `{ challengeId }`.
- If login does not return a challenge ID, the frontend stops with a clear error rather than sending an invalid username-based request or bypassing verification.
- Verification returns the authenticated session tokens/profile; authentication is activated only after successful verification.

## Validation

Run `npm run build` and `npm run lint` after changes. End-to-end security validation requires a backend implementation and tests for challenge replay, expiry, attempt throttling, session fixation, cookie attributes, and account enumeration.
