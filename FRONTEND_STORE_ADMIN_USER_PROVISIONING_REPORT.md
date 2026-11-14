# Frontend Store-Admin User Provisioning Report

Date: 2026-10-29
Project: ibbackend
Audience: Frontend Team
Reference: BACKEND_STORE_ADMIN_USER_PROVISIONING_REPORT.md

## 1. Purpose
This report defines the frontend integration contract for tenant-safe user provisioning via store-admin flows.

Goal:
- Keep current payload compatibility.
- Enforce backend-owned tenant and owner assignment.
- Ensure frontend UX handles authorization and validation outcomes correctly.

## 2. Current Endpoint Contract

Primary endpoint currently used:
- POST /api/auth/signup

Flow split enforced by backend:
- Unauthenticated request: root signup flow.
- Authenticated request from admin-capable role: child-user creation flow.

## 3. Tenant and Owner Rules (Frontend Critical)

Backend behavior now active:
- tenantId and ownerName in authenticated create-user requests are treated as advisory.
- Backend always resolves creator from auth context and forces child tenant/owner from creator.

Frontend rules:
- You may continue sending tenantId and ownerName for backward compatibility.
- Do not assume sent values are persisted as-is.
- Always render persisted tenant/owner from response/list APIs after create.

## 4. Authorization and Role Behavior

Backend-enforced behavior:
- Non-admin creators get HTTP 403.
- Incoming role text is normalized to canonical backend roles.
- Unsupported roles return HTTP 400.

Frontend action:
- Show clear "insufficient permissions" UX for 403.
- Map 400 role errors to role field validation.
- Keep role picker aligned to canonical role labels to reduce avoidable 400s.

## 5. Password Handling

Backend behavior:
- Password hashing is server-side via PasswordSecurityService.
- Raw password should be sent in current legacy field name passwordHash.

Frontend action:
- Do not hash password in browser.
- Keep password policy validation in UI (minimum length per backend policy).

## 6. Response and Error Handling Matrix

Expected handling:
- 2xx: user created successfully; refresh user list.
- 400: validation issue (role/password/input); show field-level errors.
- 401: session invalid; force re-auth.
- 403: current user not allowed to create users.
- 409: duplicate username/email conflict (when applicable by policy).

## 7. Regression Status Relevant to Frontend

Validated in this session:
- Login payload contract remains intact.
- Refresh-token unauthorized path remains intact.
- Shop profile payload contract remains intact.
- Root signup flow remains intact.

Test evidence source:
- FrontendContractContractTest targeted run: 11 passed, 0 failed.
- AuthControllerTenantTest::signup_shouldCreateUniqueTenantForEachUser: 1 passed, 0 failed.

Compatibility fix applied:
- GST invoice creation contract path was patched to stay compatible with manual/mock controller test wiring while preserving tenant-safe lookup behavior.

## 8. Frontend Implementation Checklist

1. Keep create-user request on POST /api/auth/signup until dedicated /api/users is introduced.
2. Continue sending tenantId/ownerName only as advisory compatibility fields.
3. Handle 403 with explicit permission-denied UX and no silent retry.
4. Handle 400 with field-level validation mapping (role/password/email/username).
5. Use canonical role options in UI and normalize legacy labels client-side where helpful.
6. Refresh users list after successful creation; do not trust pre-submit tenant/owner values.
7. Keep auth interceptor behavior strict for 401/403.

## 9. Ready/Not Ready Summary

Ready now:
- Frontend can proceed with provisioning UI integration on current endpoint and updated permission/error behavior.

Still pending backend items (plan awareness):
- DB constraints/migrations for created_by and tenant-username uniqueness are tracked but not yet completed.
- Dedicated POST /api/users endpoint decision remains open.

## 10. File References

- src/main/java/org/ib/ibbackend/controller/AuthController.java
- src/main/java/org/ib/ibbackend/service/UserProvisioningService.java
- src/test/java/org/ib/ibbackend/controller/AuthControllerTenantTest.java
- src/test/java/org/ib/ibbackend/controller/FrontendContractContractTest.java
- STORE_ADMIN_USER_PROVISIONING_EXECUTION_TRACKER.md
