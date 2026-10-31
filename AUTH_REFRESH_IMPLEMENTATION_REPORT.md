# Frontend Auth and Refresh Flow Implementation Report

## Summary

Updated the frontend authentication flow to support the backend's access-token and rotating refresh-token contract.

## Changes made

- **Login** (`src/Login/Login.jsx`)
  - Posts the username and Base64-encoded password to `/api/login` to preserve the current backend request contract.
  - Base64 is encoding, not BCrypt; BCrypt hashing is performed by the backend.
  - Sends cookies with the request and reads `accessToken` (with `token` as a compatibility fallback).
  - Keeps the access token in memory and the refresh token in `sessionStorage` as a session-only fallback.
  - Saves the user's name, email, and role for the authenticated UI.
- **Shared API/auth handling** (`src/Config/api.js`)
  - Adds `apiFetch`, which sends `Authorization: Bearer <accessToken>` and includes cookies by default.
  - On a 401, requests `/api/auth/refresh`, updates rotated tokens, and retries the original request once.
  - Clears auth state and invokes the configured unauthorized handler when refresh fails.
  - Calls `/api/auth/logout` and clears the local token state on logout.
- **Session restoration and routing** (`src/AppRouter.jsx`)
  - Attempts refresh on startup when a saved user is present.
  - Protects dashboard, profile, billing, inventory, and sales routes.
  - Clears the session when refresh cannot restore authentication.
- **Protected API calls**
  - Updated inventory, billing, and GST API requests to use `apiFetch`.

## Password request compatibility

The login request uses the legacy Base64 password value, and signup sends both the raw `password` field and the legacy Base64 `passwordHash` field. This matches the frontend's previous request shape while leaving BCrypt hashing to the backend's `BCryptPasswordEncoder`.

## Token storage behavior

The access token is held in JavaScript memory and is not persisted across page reloads. Refresh and logout requests include cookies to support an HttpOnly refresh-token cookie. If the backend returns a refresh token in its JSON response, the frontend stores it in `sessionStorage` for the current browser session as a fallback.

## Verification

- Ran `npm.cmd run build` successfully in `ibfrontend`.
- Vite emitted a large-chunk size warning during the build; the build completed successfully.

## Files updated

- `src/Config/api.js`
- `src/AppRouter.jsx`
- `src/Login/Login.jsx`
- `src/Inventory/Inventory.jsx`
- `src/Billing/BillingPage.jsx`
- `src/GSTFiling/GSTDashboard.jsx`
