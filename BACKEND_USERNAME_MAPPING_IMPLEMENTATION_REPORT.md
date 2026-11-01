# Backend Username Mapping Implementation Report

## Objective
The application previously treated the owner's full name as the login username by default. This created ambiguity between the display identity and the authenticated username. The new requirement is to collect a dedicated login username during signup and keep `ownerName` strictly as the human-facing/display name.

## Required Backend Contract

### 1) Signup request
`POST /api/auth/signup`

Required fields:
- `role`
- `businessName`
- `ownerName`
- `username`  (new login identifier, unique per tenant or globally unique depending on the platform policy)
- `email`
- `phone`
- `passwordHash` (legacy field kept for compatibility; backend should hash server-side)

Example payload:
```json
{
  "role": "retailer",
  "businessName": "Dawale Kirana Store",
  "ownerName": "Uddhav Dawale",
  "username": "udhawale",
  "email": "uddhav@example.com",
  "phone": "9876543210",
  "passwordHash": "RawPassword123!"
}
```

### 2) Login request
`POST /api/login`

Expected fields:
- `username`  (authentication key)
- `password`
- optional `email` only when the client is authenticating with an email address

Example payload:
```json
{
  "username": "udhawale",
  "password": "RawPassword123!"
}
```

Important rule:
- `ownerName` must never be used as the backend username lookup key.
- `username` is the login identifier. `ownerName` is only the person or owner label shown in the UI.

### 3) Server-side identity model
Recommended fields in the user record:
- `username`: unique login name
- `ownerName`: display name of the account holder
- `businessName`: shop or company name
- `email`: contact email
- `phone`: mobile number
- `role`: retailer or partner role

## Validation Rules
- Trim leading/trailing whitespace before storing.
- Enforce username uniqueness at the backend level.
- Reject usernames with invalid characters if the platform requires a strict format.
- Keep email uniqueness validation separate from username validation.
- Continue to support legacy rows where username may be missing by falling back to the display name only in UI compatibility paths, but do not treat `ownerName` as the login identifier for new signups.

## Security Requirements
- Hash passwords using a strong algorithm such as BCrypt or Argon2 before persistence.
- Do not log raw passwords or tokens in production logs.
- Require rate limiting and lockout controls for repeated failed login attempts.
- Add audit logging for signup, login, password reset, and user update events.
- Ensure username/email uniqueness checks are atomic to avoid race conditions under concurrent signup requests.

## Cloud Cost & Stability Notes
- Add a unique index on `username` and a separate unique index on `email` to avoid expensive full-table scans.
- Use the existing JWT refresh flow rather than introducing a second auth model.
- Keep payloads small and avoid repeated expensive profile lookups on every request.
- Prefer stable API contracts and backward-compatible fields so retailer flows remain smooth when the application is deployed to cloud environments.

## Impact Summary
This change is intentionally low-risk because:
- the UI still displays the owner name in the account summary,
- the login username is now explicit and separate,
- legacy sessions retain display continuity,
- and the backend contract makes authentication deterministic and secure.

## Acceptance Checklist
- [ ] Signup accepts a new `username` field.
- [ ] Login authenticates using `username`, not `ownerName`.
- [ ] `ownerName` remains available for profile display only.
- [ ] Existing retailers retain smooth access with no forced reset.
- [ ] Passwords are hashed on the backend.
- [ ] Unique validation is enforced for username and email.
