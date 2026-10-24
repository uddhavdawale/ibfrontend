# MFA Implementation Report

## Overview
This report documents the multi-factor authentication (MFA) flow implemented in the frontend application and the way it is designed to integrate with backend config flags.

## Objectives
- Add a second-factor verification step after login when the backend enables MFA.
- Keep MFA logic modular rather than embedding verification logic directly into the login flow.
- Make the MFA flow compatible with common backend naming variations used in config-driven systems.
- Support a clean redirect flow back to the dashboard after successful verification.

## Architecture
The MFA implementation was structured as a dedicated auth module instead of being jammed into the login screen.

### Key files
- `src/auth/mfa/mfaService.js`
- `src/auth/mfa/MfaScreen.jsx`
- `src/Login/Login.jsx`
- `src/AppRouter.jsx`
- `src/Config/api.js`

### Design approach
- The login screen handles credential submission and decides whether MFA is required.
- MFA evaluation is delegated to a dedicated service layer that normalizes backend flags.
- The MFA screen handles OTP entry and verification separately from login state.
- The app router controls the redirect flow to `/mfa` and then back to `/dashboard` once verified.

## Backend config compatibility
The implementation supports multiple flag variants commonly returned by backend systems. This avoids hard-coding only one property name and makes the frontend safer when the backend config uses different naming conventions.

Typical handled patterns include:
- `mfaEnabled`
- `requireMfa`
- `mfa_required`
- nested config fields such as `security.mfaEnabled`
- other config styles wrapped inside backend metadata

The service layer normalizes these values into a single internal decision before MFA is triggered.

## Flow
1. User submits login credentials.
2. Frontend checks the backend config returned with the user or authentication response.
3. MFA is evaluated via the centralized service.
4. If MFA is required, the app stores the pending user in local storage and redirects to `/mfa`.
5. The MFA screen sends an OTP request automatically or on demand depending on the app flow.
6. The user enters a 6-digit verification code.
7. The app verifies the code and only then marks the session as authenticated.
8. The router navigates the user to `/dashboard`.

## MFA service responsibilities
The dedicated MFA service is responsible for:
- normalizing config flags
- detecting whether MFA context is enabled
- preparing OTP request payloads
- verifying submitted OTP codes
- masking user contact details when showing confirmations or UI states

## Security and UX notes
- MFA is only triggered when backend config indicates it is required.
- Pending MFA users are kept separate from the fully authenticated session.
- Auth state is cleared when MFA is canceled or when the session expires.
- Protected routes continue to block access until authentication is complete.

## Validation
The application was validated by running the production build successfully after integration.

## Notes
This implementation was intentionally kept modular and reusable, so the MFA logic can be extended without embedding conditionals directly inside the login screen or router.
