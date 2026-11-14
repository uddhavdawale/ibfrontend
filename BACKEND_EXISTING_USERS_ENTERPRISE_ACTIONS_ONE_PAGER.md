# Existing Users Backend Handoff (One Pager)

Date: 2026-11-01  
Project: ibfrontend  
Audience: Backend engineering lead

## Goal
Enable Store Admin to manage only same-shop users from Existing Users page with secure, scalable APIs.

Actions required:
- List users (shop scoped)
- Rename/modify user
- Disable/enable user
- Delete user
- Resend password/reset link

## API Surface (Preferred)
- GET /api/users
  - Query (recommended): page, size, q, role, status, sort
- PUT /api/users/{id}
  - Allowed fields: name, username, email, phone, role
- PATCH /api/users/{id}/status
  - Body: { "disabled": true|false }
- DELETE /api/users/{id}
- POST /api/users/{id}/resend-password

## Mandatory Security Invariants
- Tenant/shop must come from authenticated principal, never trusted from request body.
- Every read/write must enforce same-tenant/same-shop ownership.
- Only role store_admin can perform user-management actions.
- Block self-disable and self-delete server-side.
- Normalize role input to canonical values before validation/persistence.
- Never return password hash, reset token, or internal secret fields.

## Response Contract (Frontend Compatibility)
List response may be any one of:
- [ ... ]
- { users: [ ... ] }
- { data: { users: [ ... ] } }
- { data: { content: [ ... ] } }
- { content: [ ... ] }

Each user record should include at minimum:
- id, name, username, email, phone, role
- status or disabled
- tenantId/shopId/ownerName (if available)

## Error Contract
- 400 validation/self-action blocked/invalid role
- 401 auth/session invalid
- 403 unauthorized role
- 404 user not found in caller scope
- 409 uniqueness conflict
- 429 resend-password rate limited
- 500 internal error

Payload recommendation:
- success: false
- message: stable human-readable message
- code: machine-readable code
- fieldErrors: optional map for form validation

## Cloud-Cost Friendly Requirements
- Server-side pagination/filtering for user list.
- Indexes: (tenant_id, username), (tenant_id, status), (tenant_id, role), (tenant_id, email).
- Resend-password should enqueue async job (email/SMS) and return fast.
- Apply per-actor and per-target rate limits on resend-password.
- Emit structured metrics/logs for list/update/disable/delete/resend success/failure.

## Implementation Order
1. Shared guard: scope + authorization enforcement.
2. Stabilize GET /api/users with strict scope + pagination/filtering.
3. Stabilize PUT /api/users/{id} and PATCH /api/users/{id}/status.
4. Implement DELETE /api/users/{id} (soft delete preferred) + audit.
5. Implement POST /api/users/{id}/resend-password + queue + rate limit.
6. Add regression tests and observability.

## Acceptance Criteria
- Store Admin can perform all 5 actions only on same-shop users.
- Cross-tenant and unauthorized operations are blocked with correct status codes.
- Self-disable/self-delete blocked backend-side.
- Resend-password is secure, rate-limited, asynchronous.
- Existing login/refresh/dashboard behavior is not regressed.
