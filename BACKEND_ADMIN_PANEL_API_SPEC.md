# Backend Admin Panel API Specification

## Objective

Add an enterprise admin panel to the existing Retailer IBS System without breaking the current retailer signup, login, dashboard, and session flows.

This document is written for the backend team and matches the current frontend admin contract already used in the React app.

---

## 1. Base URL and auth

All admin APIs must be protected and must require the same JWT/session authentication already used by the application.

Base path:

- `/api/admin`

Authentication requirements:

- valid access token in `Authorization: Bearer <token>`
- same session/cookie behavior already used by existing app auth
- user role and permissions validated on the backend
- frontend route guards are only UI-level checks and are not a security boundary

Required headers forwarded by frontend:

- `Authorization: Bearer <token>`
- `X-User-Id`
- `X-Username`
- `X-User-Role`
- `X-Tenant-Id` (if available)
- `X-Organization-Id` (if available)
- `X-Shop-Id` (if available)

---

## 2. Role and permission model

Use the existing role model and extend it with admin-oriented permissions.

### Supported admin roles

- `SYSTEM_ADMIN`
- `STORE_ADMIN`
- `RETAILER_USER`

### Required permissions

- `ADMIN_DASHBOARD_VIEW`
- `RETAILER_VIEW`
- `RETAILER_APPROVE`
- `RETAILER_REJECT`
- `RETAILER_REQUEST_INFO`
- `RETAILER_BLOCK`
- `RETAILER_UNBLOCK`
- `RETAILER_ENABLE`
- `RETAILER_DISABLE`
- `RETAILER_DELETE`
- `RETAILER_EXPORT`
- `USER_VIEW`
- `USER_BLOCK`
- `USER_ENABLE`
- `USER_DISABLE`
- `AUDIT_LOG_VIEW`
- `ADMIN_SETTINGS_MANAGE`

### Security rules

- Only `SYSTEM_ADMIN` or authorized `STORE_ADMIN` users may access admin APIs.
- A `STORE_ADMIN` must not modify a `SYSTEM_ADMIN` record.
- Self-role changes and self-status changes must be blocked.
- Admin actions must be logged to immutable audit records.
- Blocked or disabled users must have their active sessions invalidated.

---

## 3. Retailer lifecycle status model

Use the approved retailer lifecycle status values throughout the backend and UI.

Allowed values:

- `PENDING_EMAIL_VERIFICATION`
- `PENDING_APPROVAL`
- `APPROVED`
- `REJECTED`
- `MORE_INFO_REQUIRED`
- `BLOCKED`
- `SUSPENDED`
- `DISABLED`
- `DELETED`

### Important flow

1. New retailer signup is created.
2. Status enters `PENDING_APPROVAL` for admin review.
3. Existing email verification flow stays intact.
4. Retailer dashboard access remains blocked until approved.
5. Admin may approve, reject, request more information, or block the retailer.
6. Every transition is audited and may trigger notifications.

---

## 4. Admin API contract

### 4.1 Dashboard

#### GET /api/admin/dashboard

Returns summary metrics for the admin dashboard.

Success response example:

```json
{
  "totalRetailers": 128,
  "activeRetailers": 94,
  "pendingApprovals": 12,
  "approvalRate": 91,
  "averageApprovalTime": "3.6 days",
  "recentRequests": [
    {
      "id": 1,
      "businessName": "ABC Mart",
      "ownerName": "Amit Singh",
      "status": "Pending"
    }
  ],
  "recentActivity": [
    {
      "actor": "Super Admin",
      "action": "Approved retailer",
      "at": "2026-11-08T10:00:00Z"
    }
  ],
  "growthTrend": [
    { "label": "Jan", "value": 28 },
    { "label": "Feb", "value": 35 }
  ],
  "cityDistribution": [
    { "city": "Bengaluru", "count": 42 }
  ],
  "stateDistribution": [
    { "state": "Karnataka", "count": 56 }
  ],
  "rejectionReasons": [
    { "reason": "Document mismatch", "count": 6 }
  ]
}
```

Alternative valid backend response:

```json
{
  "data": {
    "totalRetailers": 128,
    "activeRetailers": 94,
    "pendingApprovals": 12,
    "approvalRate": 91,
    "averageApprovalTime": "3.6 days"
  }
}
```

---

### 4.2 Retailer list

#### GET /api/admin/retailers

Returns a list of retailer records for the admin panel.

Success response example:

```json
{
  "data": [
    {
      "id": 101,
      "businessName": "Prime Retail",
      "ownerName": "Rohit Nair",
      "email": "rohit@example.com",
      "phone": "9876543210",
      "gstin": "29ABCDE1234F1Z5",
      "city": "Bengaluru",
      "state": "Karnataka",
      "status": "PENDING_APPROVAL",
      "businessType": "Retail Store",
      "assignedAdmin": "Asha",
      "createdAt": "2026-11-01T09:30:00Z"
    }
  ]
}
```

---

### 4.3 Fetch retailer by id

#### GET /api/admin/retailers/{id}

Returns one retailer record with details relevant to approval review.

Success response example:

```json
{
  "id": 101,
  "businessName": "Prime Retail",
  "ownerName": "Rohit Nair",
  "email": "rohit@example.com",
  "phone": "9876543210",
  "gstin": "29ABCDE1234F1Z5",
  "status": "PENDING_APPROVAL",
  "documents": [
    "GST Certificate",
    "PAN Card",
    "Business Proof"
  ],
  "reviewNote": "Documents verified and pending final approval.",
  "createdAt": "2026-11-01T09:30:00Z"
}
```

---

### 4.4 Retailer approval actions

#### PATCH /api/admin/retailers/{id}/approve

Request body:

```json
{
  "action": "approve",
  "reason": "Documents verified",
  "note": "Approved by platform admin"
}
```

Success response:

```json
{
  "success": true,
  "message": "Retailer approved successfully",
  "status": "APPROVED"
}
```

#### PATCH /api/admin/retailers/{id}/reject

Request body:

```json
{
  "action": "reject",
  "reason": "GST document mismatch",
  "note": "Needs corrected documents"
}
```

Success response:

```json
{
  "success": true,
  "message": "Retailer rejected successfully",
  "status": "REJECTED"
}
```

#### PATCH /api/admin/retailers/{id}/request-info

Request body:

```json
{
  "action": "request-info",
  "reason": "Additional verification required",
  "note": "Please upload the updated PAN and GST documents"
}
```

Success response:

```json
{
  "success": true,
  "message": "More information requested",
  "status": "MORE_INFO_REQUIRED"
}
```

#### PATCH /api/admin/retailers/{id}/block

Success response:

```json
{
  "success": true,
  "message": "Retailer blocked successfully",
  "status": "BLOCKED"
}
```

#### PATCH /api/admin/retailers/{id}/unblock

Success response:

```json
{
  "success": true,
  "message": "Retailer unblocked successfully",
  "status": "APPROVED"
}
```

#### PATCH /api/admin/retailers/{id}/disable

Success response:

```json
{
  "success": true,
  "message": "Retailer disabled successfully",
  "status": "DISABLED"
}
```

#### PATCH /api/admin/retailers/{id}/enable

Success response:

```json
{
  "success": true,
  "message": "Retailer enabled successfully",
  "status": "APPROVED"
}
```

---

### 4.5 User management

#### GET /api/admin/users

Returns retailer users for admin review and status toggling.

Success response example:

```json
{
  "data": [
    {
      "id": 44,
      "name": "Arjun Sharma",
      "email": "arjun@example.com",
      "role": "STORE_ADMIN",
      "status": "ACTIVE",
      "retailer": "Prime Retail",
      "lastLogin": "2026-11-08T08:16:00Z"
    }
  ]
}
```

#### PATCH /api/admin/users/{id}/status

Request body:

```json
{
  "status": "DISABLED"
}
```

Success response:

```json
{
  "success": true,
  "message": "User status updated successfully",
  "status": "DISABLED"
}
```

Valid status values for user accounts should match the app conventions and include at least:

- `ACTIVE`
- `DISABLED`
- `BLOCKED`
- `SUSPENDED`

---

### 4.6 Audit logs

#### GET /api/admin/audit-logs

Returns append-only admin audit events.

Success response example:

```json
{
  "data": [
    {
      "id": "AUD-1001",
      "actor": "System Admin",
      "action": "APPROVE_RETAILER",
      "target": "Retailer #101",
      "time": "2026-11-08T09:45:00Z",
      "status": "Completed"
    }
  ]
}
```

---

## 5. Audit logging requirements

The backend must write audit records for all administrative changes, including:

- retailer approval/rejection
- request-for-info action
- block/unblock
- enable/disable
- user status changes
- role changes
- export actions
- password reset actions
- login restrictions / access denial events

Audit log event structure should include at least:

- `id`
- `actorUserId`
- `actorName`
- `entityType`
- `entityId`
- `action`
- `beforeValue`
- `afterValue`
- `timestamp`
- `sourceIp` or remote metadata if available
- `status`

Recommended rule:

- audit entries are append-only
- never delete or update existing audit rows
- store the before/after state for traceability

---

## 6. Database guidance

The backend should use additive changes rather than destructive schema changes.

### Suggested new tables

- `retailer_approval_history`
- `admin_audit_log`
- `retailer_document_verification`
- `admin_notification`

### Suggested new or nullable columns

On the existing retailer table:

- `approval_status`
- `approval_notes`
- `approved_by`
- `approved_at`
- `last_reviewed_by`
- `last_reviewed_at`
- `is_blocked`
- `is_disabled`
- `more_info_required`

### Indexing recommendations

- `status`
- `created_at`
- `approved_at`
- `tenant_id`
- `organization_id`
- `assigned_admin_id`
- `email`

---

## 7. Error handling

Use consistent HTTP semantics:

- `200 OK` for successful reads and updates
- `201 Created` for creation if applicable
- `400 Bad Request` for invalid payloads
- `401 Unauthorized` for missing/expired auth
- `403 Forbidden` for insufficient permission
- `404 Not Found` for missing retailer/user
- `409 Conflict` for invalid status transitions
- `500 Internal Server Error` only for real server failures

Error response format:

```json
{
  "success": false,
  "message": "Access denied for this resource",
  "errorCode": "ADMIN_FORBIDDEN"
}
```

---

## 8. Acceptance criteria

The backend is considered complete when:

- all frontend admin pages load data from backend endpoints successfully
- admin dashboard metrics update from live backend data
- retailer approval actions modify backend state correctly
- user enable/disable toggles work correctly
- audit logs capture every admin action
- unauthorized users get `403` access denied
- store admin cannot manage system admin resources
- expired sessions are refreshed or terminated gracefully
- app continues to support the existing retailer workflow without regression

---

## 9. Implementation note for the current frontend

The current frontend already calls:

- `GET /api/admin/dashboard`
- `GET /api/admin/retailers`
- `PATCH /api/admin/retailers/{id}/{action}`
- `GET /api/admin/users`
- `PATCH /api/admin/users/{id}/status`
- `GET /api/admin/audit-logs`

The backend should return JSON that matches those fields closely; otherwise, the frontend normalizers currently handle fallback parsing, but live data should match the expected names above to avoid UI mismatches.

---

## 10. Final recommendation

Keep the implementation additive and non-destructive. Do not change the legacy retailer login or signup flow. Add the admin functionality behind the existing auth model and permissions model, then roll it out in controlled phases.
