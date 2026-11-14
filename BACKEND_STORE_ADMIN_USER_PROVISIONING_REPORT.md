# Backend Store-Admin User Provisioning Report

## Objective
Ensure that when a `store_admin` creates multiple users from the Users/Roles flow, all created users:

1. Are assigned the same tenant as the logged-in store admin.
2. Carry owner information derived from the logged-in store admin.
3. Cannot override tenant ownership via client-supplied values.

This aligns backend behavior with the current frontend payload contract.

---

## Current Frontend Contract
The frontend now posts user creation requests to:

- `POST /api/auth/signup`

With user details and these ownership fields:

- `tenantId`
- `ownerName`

Frontend source of truth:

- Uses authenticated context to resolve current tenant.
- Uses logged-in admin profile (`name`/`ownerName` fallback) to set owner name.

Important: Backend must treat these fields as advisory and always enforce ownership from authenticated session context.

---

## Required Backend Behavior

### 1. Enforce creator context over request body
For authenticated store-admin user creation:

- Resolve creator from JWT/session principal.
- Resolve creator tenant from authenticated principal or creator record.
- Set `newUser.tenantId = creator.tenantId`.
- Set `newUser.ownerName = creator.ownerName` (or creator display name policy).

Do not trust request `tenantId` for ownership decisions.

### 2. Authorization rule
Only users with admin-capable role should be allowed to create child users for a tenant.

Canonical creator role in this project:

- `store_admin`

Note:
- Legacy values such as `owner`, `admin`, `shop_owner`, `retailer`, `super_admin`, `org_admin` are not separate product roles.
- They are only input aliases that should be normalized to `store_admin` for backward compatibility.

Return `403` if caller is not allowed.

### 3. Role normalization (backend)
Normalize legacy role aliases to canonical single-store roles before persistence.

Canonical single-store roles (only these should be persisted):

- `store_admin`
- `store_manager`
- `store_billing_viewer`
- `store_inventory_viewer`

Alias examples to map:

- `retailer`, `shop_owner`, `owner`, `admin` -> `store_admin`
- `super_admin`, `org_admin` -> `store_admin`
- `store_billing_viwer` -> `store_billing_viewer`
- `store_inventory_viwer` -> `store_inventory_viewer`

### 4. Ownership and tenant invariants
When creating tenant users:

- Enforce same-tenant invariant for all child users.
- Reject attempts to set foreign tenant.
- Persist audit metadata: `createdBy`, `createdAt`, optional `createdFromIp`.

---

## Data Model Requirements

## Users table (or equivalent)
Required columns:

- `id`
- `tenant_id` (not null, indexed)
- `role`
- `owner_name`
- `name`
- `username` (unique within tenant)
- `email` (unique globally or per tenant by product policy)
- `phone`
- `password_hash`
- `created_by` (FK to users.id, nullable only for root registration)
- `created_at`
- `updated_at`

Recommended constraints:

- `tenant_id` NOT NULL
- `role` constrained to canonical role set
- unique index: (`tenant_id`, `username`)

---

## API Contract Recommendation

## Endpoint
`POST /api/users` (preferred for authenticated admin user management)

If reusing `POST /api/auth/signup` for admin-created users, split behavior by authentication context:

- Unauthenticated: root registration flow
- Authenticated store_admin: tenant child-user creation flow

## Request (admin flow)
```json
{
  "role": "store_manager",
  "name": "Ravi Patil",
  "username": "ravi.manager",
  "email": "ravi@example.com",
  "phone": "9876543210",
  "passwordHash": "<raw password in transit if legacy contract>",
  "employeeId": "EMP-002",
  "department": "Operations",
  "address": "Main Branch",
  "billingDeskId": "",
  "warehouseSection": "",
  "tenantId": "<ignored/validated against creator>",
  "ownerName": "<ignored/validated against creator>"
}
```

## Server-side assignment logic
```java
User creator = authContext.currentUser();
requireStoreAdmin(creator.role());

CreateUserRequest req = ...;
User child = new User();
child.setTenantId(creator.getTenantId());
child.setOwnerName(creator.getOwnerName());
child.setRole(normalizeRole(req.role()));
child.setCreatedBy(creator.getId());
```

## Response
Return created user without sensitive fields:

```json
{
  "success": true,
  "message": "User created",
  "user": {
    "id": 123,
    "tenantId": "TENANT-001",
    "role": "store_manager",
    "ownerName": "Uddhav Dawale",
    "name": "Ravi Patil",
    "username": "ravi.manager",
    "email": "ravi@example.com"
  }
}
```

---

## Service Layer Checklist

- [ ] Extract creator from authenticated principal.
- [ ] Validate creator has admin privilege.
- [ ] Normalize target role from request.
- [ ] Force child `tenantId` from creator.
- [ ] Force child `ownerName` from creator.
- [ ] Hash password server-side using BCrypt/Argon2 (never persist raw input).
- [ ] Save `createdBy` for auditing.
- [ ] Publish audit event/log entry for user creation.

---

## Security & Validation Checklist

- [ ] Ignore or hard-validate request `tenantId` against creator tenant.
- [ ] Ignore or hard-validate request `ownerName` against creator owner name.
- [ ] Reject creation if creator tenant is null.
- [ ] Reject non-admin creators with `403`.
- [ ] Apply password policy at backend.
- [ ] Prevent cross-tenant duplicate username policy violations.

---

## Test Plan

## Unit tests
- [ ] `store_admin` creating user assigns creator tenant.
- [ ] `store_admin` creating user assigns creator owner name.
- [ ] Non-admin creator gets `403`.
- [ ] Legacy admin-like role aliases normalize to `store_admin`.

## Integration tests
- [ ] Authenticated admin creates 3 users -> all 3 have same `tenant_id` as admin.
- [ ] Request with foreign `tenantId` still persists admin tenant.
- [ ] Request with different `ownerName` still persists admin owner name.
- [ ] Created users can log in and are scoped to same tenant data only.

## Regression tests
- [ ] Public root signup flow still works (if endpoint shared).
- [ ] Existing login + refresh + profile endpoints unaffected.

---

## Migration Notes

If existing users have null tenant or inconsistent owner fields:

1. Backfill `tenant_id` from shop/business linkage.
2. Backfill `owner_name` from primary admin/root account in each tenant.
3. Re-index and enforce constraints after cleanup.

---

## Implementation Priority

1. Backend role normalization and authorization guard.
2. Service logic to force tenant/owner from authenticated creator.
3. DB constraints and audit fields.
4. Integration tests for multi-user creation under one store admin.

---

## Status
Prepared as backend implementation blueprint for the current frontend Users/Roles flow and single-store RBAC model.
