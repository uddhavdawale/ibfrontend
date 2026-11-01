# Backend Existing Users Enterprise Actions Report

Date: 2026-11-01
Project: ibfrontend (frontend contract for backend alignment)
Audience: Backend engineering team
Related UI: Existing Users page (Store Admin)

## 1. Purpose
This document defines backend requirements for the Existing Users page so Store Admin users can safely manage users belonging only to their own shop/tenant.

Primary actions required:
- List existing users (shop scoped)
- Rename/modify user
- Disable/enable user
- Delete user
- Resend password/reset link

Non-functional requirements:
- Preserve existing retailer behavior
- Enforce strong security boundaries
- Keep implementation cloud cost friendly at scale

---

## 2. Frontend Behavior Contract (Current)
The frontend now expects these capabilities from backend while preserving existing route behavior:

- Existing Users opens via current menu path and calls users APIs.
- User list is treated as scoped to current shop/tenant.
- Admin can perform per-user actions from the table.
- Frontend blocks self-disable and self-delete in UI, but backend must enforce this too.
- Frontend supports status endpoint fallback behavior already; backend should standardize preferred endpoints to reduce long-term complexity.

---

## 3. Required Backend Capabilities

### 3.1 Shop-scoped listing
Implement list endpoint so response only contains users from authenticated caller scope.

Required behavior:
- Resolve tenant/shop from auth context (JWT/session), not from request body.
- Return only users within same tenant/shop.
- Never leak other tenant users.

Recommended endpoint:
- GET /api/users

Optional query support for scale:
- page, size
- q (search)
- role
- status (active/disabled)
- sort

### 3.2 Modify user (rename/edit)
Support update of allowed fields only.

Recommended endpoint:
- PUT /api/users/{id}

Allowed fields (by current frontend form):
- name
- username
- email
- phone
- role

Mandatory constraints:
- Target user must belong to same tenant/shop as caller.
- Caller must have Store Admin privilege.
- Cannot elevate into unsupported roles.
- Validate username/email uniqueness with tenant policy.

### 3.3 Disable/enable user
Support toggling user active status.

Preferred endpoint:
- PATCH /api/users/{id}/status

Body:
- disabled: true/false

Mandatory constraints:
- Same-tenant/shop ownership check.
- Store Admin privilege required.
- Caller cannot disable self.

### 3.4 Delete user
Support user deletion policy.

Recommended endpoint:
- DELETE /api/users/{id}

Policy options:
- Preferred: soft delete with deletedAt/deletedBy (audit-friendly)
- Acceptable: hard delete only if no dependent records and policy allows

Mandatory constraints:
- Same-tenant/shop ownership check.
- Store Admin privilege required.
- Caller cannot delete self.

### 3.5 Resend password/reset link
Support resend action from Existing Users page.

Preferred endpoint:
- POST /api/users/{id}/resend-password

Recommended behavior:
- Generate secure one-time reset token (short TTL).
- Deliver via configured channel (email/SMS) through async queue.
- Do not reveal sensitive internals in response.

Mandatory constraints:
- Same-tenant/shop ownership check.
- Store Admin privilege required.
- Rate limit to prevent abuse.

---

## 4. Security Requirements (Must Implement)

### 4.1 Scope enforcement
- Derive tenantId/shopId from authenticated principal.
- Reject any cross-tenant operation regardless of client payload.

### 4.2 Authorization
- Only Store Admin (canonical role: store_admin) can perform user management actions.
- Return 403 for unauthorized role.

### 4.3 Self-protection
- Block self-disable and self-delete with clear error message.
- Return 400 or 409 (team choice), but keep message deterministic.

### 4.4 Input validation
- Enforce minimum username quality.
- Enforce email format and uniqueness policy.
- Normalize and validate role values to canonical set.

### 4.5 Auditability
Log immutable audit records for:
- who performed action
- action type
- target user id
- tenant/shop
- timestamp
- outcome
- request correlation id

### 4.6 Data minimization
- Never return password hash, reset token, internal secret fields.
- Return only fields required by UI.

---

## 5. Cloud Cost Friendly Implementation Guidelines

### 5.1 List API efficiency
- Implement server-side pagination and filtering.
- Avoid full table scans for large tenants.

Suggested indexes:
- (tenant_id, username)
- (tenant_id, status)
- (tenant_id, role)
- (tenant_id, email) per uniqueness policy

### 5.2 Resend password scalability
- Use async job queue for email/SMS dispatch.
- Return quickly after enqueue.
- Add retry with backoff in worker, not request thread.

### 5.3 Rate limiting
- Apply per-actor and per-target throttles for resend-password.
- Add low-cost in-memory or Redis based limiter.

### 5.4 Observability
- Emit structured logs and metrics:
  - user_mgmt.list.count
  - user_mgmt.update.success/fail
  - user_mgmt.disable.success/fail
  - user_mgmt.delete.success/fail
  - user_mgmt.resend.success/fail

---

## 6. API Response Shape Compatibility
To keep existing frontend behavior stable, ensure list responses remain compatible with one of these forms:
- array
- { users: [...] }
- { data: { users: [...] } }
- { data: { content: [...] } }
- { content: [...] }

Each user row should include at least:
- id
- name
- username
- email
- phone
- role
- status or disabled flag
- tenantId/shopId/ownerName when available

Status compatibility:
- disabled true/false preferred
- or status values active/inactive/disabled

---

## 7. Error Handling Matrix

- 200/201: success
- 400: validation failure, self-action blocked, invalid role
- 401: session/auth invalid
- 403: insufficient permission
- 404: user not found in caller scope
- 409: uniqueness conflict (username/email)
- 429: resend-password rate limit
- 500: unexpected internal error

Error payload recommendation:
- success: false
- message: human-readable stable message
- code: machine-readable code
- fieldErrors: optional map for form-friendly validation

---

## 8. Backward Compatibility and Non-Regression
Do not break existing flows:
- login
- token refresh
- dashboard
- current users list retrieval contract

If migrating endpoints:
- keep old behavior temporarily behind compatibility layer
- deprecate with explicit timeline

---

## 9. Suggested Implementation Sequence

1. Enforce scope + authorization in shared middleware/service guard.
2. Stabilize GET /api/users with pagination/filtering and strict scope.
3. Stabilize PUT /api/users/{id} and PATCH /api/users/{id}/status.
4. Implement DELETE /api/users/{id} with policy and audit.
5. Implement POST /api/users/{id}/resend-password with queue + rate limit.
6. Add metrics, logs, and regression tests.

---

## 10. Test Plan (Backend)

### Unit tests
- store_admin can manage same-tenant users
- non-admin receives 403
- cross-tenant access rejected
- self-disable and self-delete rejected
- role normalization and validation behave as expected

### Integration tests
- list returns only caller tenant users
- modify updates allowed fields only
- disable toggles status correctly
- delete obeys policy
- resend-password enqueues/reset behavior and rate limits

### Regression tests
- existing auth/session endpoints unchanged
- existing users listing contract shape remains parseable by frontend

---

## 11. Done Criteria
Backend work is complete when:
- All five actions work for Store Admin on same-shop users only.
- Cross-tenant and unauthorized paths are blocked with clear codes.
- Self-disable/self-delete blocked server-side.
- Resend-password is secure, rate-limited, and asynchronous.
- Performance and logs/metrics are production-ready.
