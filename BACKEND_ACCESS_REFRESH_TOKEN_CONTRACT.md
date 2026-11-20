# Backend Access and Refresh Token Contract

## Purpose

The frontend now follows a single access/refresh-token lifecycle:

1. Sign-in or successful MFA verification establishes a server-managed refresh-token cookie and returns a short-lived access token. For compatibility with existing backend deployments, a refresh token returned in JSON is also supported as a session-only fallback.
2. The frontend keeps the access token in memory and sends it as a bearer token on protected API requests.
3. On an expired/invalid access-token response, the frontend calls the refresh endpoint with cookies, replaces the in-memory access token, and retries the original request once.
4. If refresh fails, the frontend clears its local session and routes the user to `/login`.
5. On reload, the frontend obtains a new access token through the refresh endpoint before restoring the saved user UI.

The frontend keeps access tokens in memory and `sessionStorage` (not `localStorage`) so a still-valid access token can preserve the session if refresh temporarily fails. It prefers the HttpOnly refresh-token cookie, but can use a refresh token returned in JSON as a `sessionStorage` fallback, passing it to refresh/logout requests in the `X-Refresh-Token` header and request body.

## Required backend behavior

### Login and MFA

- On a successful password login **without pending MFA**, return the access token in JSON as `accessToken` (the frontend currently accepts `token` for compatibility) and set the refresh token as a cookie.
- Do not establish a refresh session before a required MFA challenge is completed.
- On successful MFA verification, return an access token and set the refresh cookie. If MFA verification does not return an access token, the frontend immediately calls the refresh endpoint and requires the cookie to be present.
- Prefer not to include the refresh token in JSON or user/profile payloads. If a legacy deployment returns it in JSON, the frontend stores it only in `sessionStorage` as a compatibility fallback.

### Refresh

- `POST /api/auth/refresh` should authenticate using the refresh cookie; the frontend sends `credentials: include`. For legacy deployments, it also sends a session fallback token in the `X-Refresh-Token` header and request body when one was returned by login/MFA.
- On success, return a fresh access token in JSON and rotate the refresh token by setting the replacement cookie.
- Validate refresh-token expiry, revocation, reuse, and token-family status server-side. Refresh rotation should be atomic and handle concurrent refresh attempts safely, including requests from multiple browser tabs.
- On missing, expired, revoked, or reused refresh credentials, return `401 Unauthorized` and expire/clear the refresh cookie using matching cookie attributes.
- Do not return `200` with an empty/invalid access token on refresh failure.

### Protected APIs and status codes

- Accept the access token in `Authorization: Bearer <access-token>`.
- Return `401 Unauthorized` for missing, invalid, or expired authentication. Use `403 Forbidden` for an authenticated user who lacks permission; do not use `403` for an expired access token.
- Protected API requests must not require a refresh-token header or body.

### Logout

- `POST /api/auth/logout` should use the refresh cookie, revoke the associated refresh-token session/family, and clear the cookie. For legacy deployments, the frontend includes the session fallback token in the request body when available.
- Cookie deletion must use the same path/domain and compatible attributes as cookie creation.

## Cookie and CORS requirements

- Set the refresh cookie with `HttpOnly`, `Secure` in production, an appropriately restrictive `SameSite` policy, and the narrowest workable `Path`/`Domain`.
- For a cross-site frontend/backend deployment, use `SameSite=None; Secure`; for same-site deployments, prefer `Lax` when the deployment permits it.
- Because browser requests use credentials, configure CORS with the exact allowed frontend origin(s) and `Access-Control-Allow-Credentials: true`. Do not use wildcard origins with credentialed requests.
- Ensure preflight handling permits the frontend's `Authorization`, `Content-Type`, and application context headers.
- Return `Cache-Control: no-store` for login, refresh, logout, and authenticated responses.

## Frontend expectations and rollout note

- The frontend stores non-token user metadata in `localStorage` and session-only access/refresh tokens in `sessionStorage`.
- A page reload first attempts refresh, while keeping a saved session if refresh fails but the existing access token still works.
- Failed authentication after the access token expires still requires sign-in if refresh cannot restore the session.
- The backend should store `replacement_token_ciphertext` in a column large enough for the encrypted token; a 255-character limit can make refresh fail with a database error.

## Verification checklist

- Successful login and MFA verification each set the HttpOnly refresh cookie and return an access token.
- A protected request with an expired access token refreshes and retries successfully without exposing the refresh token to JavaScript.
- Reloading the page refreshes the access token from the cookie before opening protected routes.
- Expired/revoked refresh credentials return `401`, clear the cookie, and lead to the login page.
- Logout revokes the refresh session and clears the cookie; a subsequent refresh attempt fails.
- Permission failures remain `403` and do not get treated as token expiry.
