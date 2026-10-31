# Frontend User-Scoped Alignment Report

## Goal
Align the frontend with the backend requirement that:
- a user signs up with full profile details
- a user logs in and receives only their own profile/session data
- subsequent requests use the authenticated user context
- no client-side code should assume it can show another user’s records

---

## What was misaligned before
The frontend had two important gaps:

1. The profile page used hardcoded mock profile values instead of a real authenticated profile endpoint.
2. Session restoration only relied on local storage and did not refresh the current authenticated user from `/api/users/me`.

This means the UI was not fully aligned with the user-scoped backend requirement even though the endpoint structure and auth flow were present.

---

## What was implemented
The following frontend changes were made to align with the backend contract:

### 1. Added user profile endpoint contract to API config
In [src/Config/api.js](src/Config/api.js):
- added `userProfile` endpoint
- added `userDashboard` endpoint
- added `getCurrentUserProfile()` helper

### 2. Restored session using authenticated profile data
In [src/AppRouter.jsx](src/AppRouter.jsx):
- session restore now refreshes auth token
- then fetches `/api/users/me`
- merges the backend profile into the stored local user object
- updates local storage with the hydrated profile

### 3. Replaced mocked profile screen data
In [src/Profile/ProfilePage.jsx](src/Profile/ProfilePage.jsx):
- removed hardcoded profile content
- load live profile data from the authenticated endpoint
- show loading and error states
- preserve editing flow while keeping the UI ready for backend update endpoints

---

## Backend responsibility that still remains server-side
The frontend can only request the authenticated user identity and render it. The actual security enforcement must remain on the backend:

- `userId` must be attached to each record
- repository queries must filter by authenticated user
- every read/write API must reject mismatched user access with `403` or `401`
- entities like inventory, invoices, billing, and dashboard summaries must be scoped to the logged-in user

This cannot be enforced by frontend-only logic.

---

## Current status
The frontend is now aligned with the user-scoped profile contract for:
- authenticated profile hydration
- session restoration using live profile data
- replacing hardcoded profile details with backend-backed values

The remaining protection still belongs to the backend implementation layer.

---

## Final verdict
The frontend now matches the expected user-scoped profile flow more closely, but full user-isolation enforcement remains a server-side requirement and must be implemented in the Spring Boot backend.
