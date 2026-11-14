# Backend Admin Implementation Report

## Summary
This document outlines the backend implementation approach for the enterprise admin panel and retailer signup approval flow while maintaining backward compatibility with the existing Retailer IBS System.

## Current project alignment
The frontend already uses:
- centralized auth/session management in `src/Config/api.js`
- centralized role logic in `src/Security/storeRoles.js`
- route-based authorization in `src/AppRouter.jsx`

The backend should preserve the existing REST conventions, user lifecycle, JWT/session mechanism, and business workflows.

## Target modules
The new backend work should be additive within the existing Spring Boot architecture:
- `AuthController` / `AuthService` (unchanged, extended)
- `UserController` / `UserService`
- `RetailerController` / `RetailerService`
- `AdminDashboardController` / `AdminDashboardService`
- `RetailerApprovalService`
- `AdminAuditLogService`
- `AdminNotificationService`
- `PermissionService`
- `RetailerDocumentService`
- `ExceptionHandler` and validation layer

## Backward-compatible database changes
Additive migration strategy:
- new nullable columns on the existing retailer table
- new tables for approval history, audit entries, notifications, and notes
- no renames, no deletions, no destructive changes

## Status model
Use the retailer lifecycle required in the business specification:
- `PENDING_EMAIL_VERIFICATION`
- `PENDING_APPROVAL`
- `APPROVED`
- `REJECTED`
- `MORE_INFO_REQUIRED`
- `BLOCKED`
- `SUSPENDED`
- `DISABLED`
- `DELETED`

## Workflow logic
1. Retailer signs up.
2. Retailer record is created and placed in `PENDING_APPROVAL`.
3. Existing email verification flow is preserved.
4. Dashboard access remains blocked until the retailer is approved.
5. Store Admin or Super Admin reviews the account.
6. Action is recorded in `retailer_approval_history` and `admin_audit_log`.
7. Email and in-app notification are sent after transitions.

## Permission model
Use existing role/permission architecture and extend it with the required admin permissions:
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

## Authorization rules
- Every admin API validates the logged-in user permission.
- UI route guards are not the security boundary.
- Store Admin cannot modify Super Admin or their own account status.
- Self-role changes and self-status changes are blocked.

## API design
Admin endpoints are intentionally additive:
- `GET /api/admin/dashboard`
- `GET /api/admin/retailers`
- `GET /api/admin/retailers/{id}`
- `PATCH /api/admin/retailers/{id}/approve`
- `PATCH /api/admin/retailers/{id}/reject`
- `PATCH /api/admin/retailers/{id}/request-info`
- `PATCH /api/admin/retailers/{id}/block`
- `PATCH /api/admin/retailers/{id}/unblock`
- `PATCH /api/admin/retailers/{id}/disable`
- `PATCH /api/admin/retailers/{id}/enable`
- `DELETE /api/admin/retailers/{id}`
- `GET /api/admin/users`
- `PATCH /api/admin/users/{id}/status`
- `PATCH /api/admin/users/{id}/role`
- `POST /api/admin/users/{id}/reset-password`
- `GET /api/admin/audit-logs`
- `GET /api/admin/reports/retailer-onboarding`
- `GET /api/admin/export/retailers`

## Security controls
- validate all admin inputs
- rate-limit admin and auth actions
- use prepared statements/JPA parameterization
- validate uploaded document type and size
- use audit log before/after values
- revoke sessions after block or disable
- ensure immutability of audit rows

## Cloud-smart implementation notes
- use database indexes on status/date/filter fields
- aggregate dashboard metrics on the backend
- paginate and filter before export
- do not pull all retailer rows into memory for dashboard calculations
- keep notifications asynchronous where possible

## Rollout and rollback
- Deploy via additive migration and feature flags.
- Enable approval gating in a controlled phase.
- Roll back using feature flag off + no destructive schema changes.

## Conclusion
This approach preserves the current user experience, adds a clean approval workflow, and keeps the solution compatible with legacy clients and existing backend patterns.
