# Admin Panel Implementation Plan

## Goal
Add an enterprise-level admin panel and retailer approval workflow without changing the existing retailer, login, or session behavior.

## Scope
This implementation is intentionally additive and keeps the existing app stable while adding:
- retailer signup approval lifecycle
- admin dashboard
- retailer and user management pages
- audit log viewer
- permission-aware admin routes

## Architecture alignment
The current app already has a centralized auth/session wrapper in `src/Config/api.js`, route-based access control in `src/AppRouter.jsx`, and role normalization in `src/Security/storeRoles.js`.

The new admin panel should follow the same patterns:
- role-based route guards
- centralized API client
- additive endpoints
- non-destructive database migration
- no duplicate permission system

## Implementation sequence
1. Extend the role model with admin-oriented permissions.
2. Add new admin-only routes and access checks.
3. Add admin dashboard, retailer management, signup approvals, and audit pages.
4. Add a safe approval status model behind the retailer signup process.
5. Add backend service and controller design for approval, block, enable, disable, and audit actions.
6. Add migration scripts and rollback scripts.
7. Validate by running the frontend build and ensuring no existing route breaks.

## Data model and workflow
### Retailer status lifecycle
- `PENDING_EMAIL_VERIFICATION`
- `PENDING_APPROVAL`
- `APPROVED`
- `REJECTED`
- `MORE_INFO_REQUIRED`
- `BLOCKED`
- `SUSPENDED`
- `DISABLED`
- `DELETED`

### Approval logic
- New signup enters `PENDING_APPROVAL` after successful signup.
- Verification is preserved if already present.
- Access to the retailer dashboard is blocked until the retailer is `APPROVED`.
- Admin can approve, reject, or request more information.
- Every action writes an audit record and notification.

## Security requirements
- Enforce permissions on the backend for all admin actions.
- Front-end route guards are UI-only assistance.
- Prevent self-role change or self-status change.
- Prevent a Store Admin from modifying a Super Admin.
- Keep audit logs append-only.

## Cloud-friendly deployment
- Index status and retailer lookup columns.
- Use server-side aggregation for dashboard metrics.
- Use pagination, filtering, and search before export.
- Keep the new feature behind a config flag during rollout.

## Rollout plan
1. Deploy migration with nullable columns and new tables.
2. Enable admin routes and permissions behind a feature flag.
3. Turn on retailer approval gating without changing legacy signup behavior.
4. Monitor approval queue, admin actions, and failed logins.
5. Roll out notifications and exports once verified.

## Rollback plan
- Disable feature flag.
- Keep data migration additive and reversible.
- Do not remove database columns or tables in the first rollback.
- Restore legacy login access only if the approval gate causes operational issues.
