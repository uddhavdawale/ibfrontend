# Frontend Audit Integration Report

Date: 2026-11-01
Audience: Frontend team
Purpose: Provide complete implementation guidance for the Audit page against current backend APIs and security behavior.

## 1. Scope

This report defines frontend implementation for:
- Audit events list page
- Audit summary cards
- Audit CSV export flow
- Role-based visibility and behavior
- Error and empty-state UX
- Pagination and filters
- QA checklist and release acceptance criteria

## 2. Backend APIs Available for Frontend

Base route:
- /api/audit

Endpoints:
1. GET /api/audit/events
2. GET /api/audit/summary
3. GET /api/audit/export

Auth requirement:
- Bearer token is required.
- Unauthorized and forbidden requests return standard 401/403 JSON messages.

## 3. Role Access Matrix for UI

Allowed roles for Audit page visibility:
- system_administrator
- store_admin
- audit_related

Export button allowed roles:
- system_administrator
- store_admin

UI behavior by role:
1. system_administrator
- Can view all audit data.
- Can optionally filter by tenantId (if UI provides tenant selector).
- Can export CSV.

2. store_admin
- Can view only own tenant audit data (backend enforces scope).
- Can export CSV for own tenant scope.

3. audit_related
- Can view own tenant audit data.
- Must not see enabled export action (or show disabled with tooltip).

4. all other roles
- Hide audit navigation item.
- If route is accessed manually, frontend should redirect to access denied.

## 4. Endpoint Contracts for Frontend

### 4.1 GET /api/audit/events

Query parameters:
- page: number, default 0
- size: number, default 50, max 200
- from: ISO-8601 instant or yyyy-MM-dd
- to: ISO-8601 instant or yyyy-MM-dd
- actionType: string
- outcome: string
- tenantId: number (use only for system_administrator context)

Response shape:
- items: array
- page: number
- size: number
- totalItems: number
- totalPages: number
- scopeTenantId: number or null
- role: string
- hasMore: boolean

Per item fields:
- audit_id
- actor_user_id
- actor_role
- action_type
- resource_type
- resource_id
- tenant_id
- event_timestamp
- outcome
- ip_address
- device_context
- metadata

Frontend mapping recommendation:
- Event ID: audit_id
- Actor: actor_user_id + actor_role
- Action: action_type
- Resource: resource_type + resource_id
- Time: event_timestamp (display in local timezone)
- Outcome: success/failure/denied chip
- Metadata drawer or modal: pretty-print metadata.raw if present

### 4.2 GET /api/audit/summary

Query parameters:
- days: number (1 to 365), default 30
- tenantId: number (system role only)

Response fields:
- totalChecks
- recentAccessEvents
- exceptionCount
- complianceScore
- windowDays
- scopeTenantId
- role

Summary card mapping:
1. Total Checks -> totalChecks
2. Recent Access Events (24h) -> recentAccessEvents
3. Exceptions -> exceptionCount
4. Compliance Score (%) -> complianceScore

### 4.3 GET /api/audit/export

Query parameters:
- from, to, actionType, outcome, tenantId
- maxRows: number, default 1000, max 5000

Response:
- Content-Type: text/csv
- File attachment with filename
- Header X-Export-Truncated indicates if capped by maxRows

CSV columns:
- audit_id, actor_user_id, actor_role, action_type, resource_type, resource_id, tenant_id, event_timestamp, outcome, ip_address, device_context, endpoint, http_method, metadata

Frontend export UX:
1. Use current filters for export.
2. Show spinner state while downloading.
3. On success, trigger file download and show toast.
4. If X-Export-Truncated=true, show informational message to refine filters.
5. If 403, show permission message and hide export affordance for future session state.

## 5. Recommended Audit Page UX Structure

Page sections:
1. Header
- Title: Audit Logs
- Subtitle: Compliance and security activity timeline
- Optional: last refresh timestamp

2. Controls row
- Date range picker (from/to)
- Action filter dropdown
- Outcome filter dropdown
- Page size selector (25, 50, 100, 200)
- Refresh button
- Export CSV button (role-based)

3. Summary cards row
- Total Checks
- Recent Access Events
- Exception Count
- Compliance Score

4. Events table
Columns:
- Time
- Action
- Outcome
- Actor
- Resource
- Tenant
- Network (IP / device)
- Metadata (view)

5. Pagination footer
- Current page, total pages, total items
- Next/Prev controls

## 6. Filter and Query Behavior

Default load:
- summary: days=30
- events: page=0, size=50

When filters change:
- reset page to 0
- re-fetch events
- summary should stay tied to selected period window (days), not page

Date handling rules:
- if user selects date-only values, send yyyy-MM-dd
- if datetime picker exists, send ISO-8601
- for export, reuse exact active filter state

## 7. Error Handling Requirements

Handle and display clearly:
1. 401 Unauthorized
- Message: Session expired, please login again.
- Action: redirect to login.

2. 403 Forbidden
- Message: You do not have permission to access audit data.
- Action: redirect to access denied route.

3. 400 Bad Request
- Usually invalid date filter format.
- Message: Invalid filter input. Please correct date range.

4. 5xx Server errors
- Message: Could not load audit data. Try again.
- Action: show retry button.

## 8. Performance and Cloud-Cost-Friendly Frontend Behavior

Do:
1. Keep default page size to 50.
2. Debounce filter updates by 300-500ms.
3. Avoid auto-refresh loops.
4. Trigger export only on explicit user action.
5. Do not request very large maxRows by default.

Do not:
1. Poll audit events continuously.
2. Fetch all pages for client-side aggregation.
3. Render full metadata JSON inline in table cells.

## 9. Suggested Frontend Data Types

TypeScript interfaces:

```ts
export interface AuditEvent {
  audit_id: number;
  actor_user_id: number | null;
  actor_role: string;
  action_type: string;
  resource_type: string;
  resource_id: string | null;
  tenant_id: number | null;
  event_timestamp: string;
  outcome: string;
  ip_address: string | null;
  device_context: string | null;
  metadata: { raw?: string; request_id?: string; request_path?: string; http_method?: string; detail?: string };
}

export interface AuditEventsResponse {
  items: AuditEvent[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
  scopeTenantId: number | null;
  role: string;
  hasMore: boolean;
}

export interface AuditSummaryResponse {
  totalChecks: number;
  recentAccessEvents: number;
  exceptionCount: number;
  complianceScore: number;
  windowDays: number;
  scopeTenantId: number | null;
  role: string;
}
```

## 10. Suggested Frontend API Service Layer

```ts
const base = '/api/audit';

export const fetchAuditEvents = (params: URLSearchParams, token: string) =>
  fetch(`${base}/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });

export const fetchAuditSummary = (params: URLSearchParams, token: string) =>
  fetch(`${base}/summary?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });

export const exportAuditCsv = (params: URLSearchParams, token: string) =>
  fetch(`${base}/export?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });
```

## 11. Frontend QA Checklist

Functional:
- Audit page visible only for allowed roles.
- audit_related can view but cannot export.
- store_admin can export.
- system_administrator can use tenant filter if UI supports it.
- Pagination works and respects backend total counts.
- Date filters produce expected subset.
- Summary cards load correctly.
- CSV download works and filename is respected.

Security:
- Unauthorized users do not see audit data.
- 401 leads to login flow.
- 403 leads to access denied flow.
- No audit payload cached in frontend storage beyond session needs.

UX:
- Empty state for no records.
- Loading skeleton/spinner for summary and table.
- Clear error states and retry option.
- Metadata details open in modal/drawer, not inline clutter.

## 12. Release Acceptance Criteria for Frontend

1. Role-based visibility implemented as specified.
2. All three endpoints integrated.
3. Export flow works for privileged roles only.
4. Filter, pagination, and summary are stable across refreshes.
5. 401/403/400/5xx handling verified.
6. QA checklist items completed and signed.

## 13. Known Backend Behaviors Frontend Should Respect

1. Backend always enforces tenant scope and role checks server-side.
2. Even if frontend sends tenantId for non-system roles, backend denies mismatched scope.
3. Export response may be truncated by maxRows; frontend should message this clearly.
4. Date parsing accepts ISO instant and yyyy-MM-dd formats.

## 14. Integration Plan for FE Team

Phase 1:
- Build API service and state model.
- Implement page shell + summary cards + table.

Phase 2:
- Add filters, pagination, and metadata drawer.
- Add role-aware export button.

Phase 3:
- Add robust error states and loading UX.
- Execute QA checklist and role-wise UAT.

## 15. Final Frontend Recommendation

Proceed with implementation immediately using this report as contract.
Prioritize a secure-by-default UX:
- hide unauthorized affordances,
- keep export explicit and bounded,
- and preserve tenant/context integrity in every request.

## 16. Implementation Status and Validation

This frontend audit integration is currently aligned with the app’s role model and route guards:
- Audit page visibility is limited to `system_administrator`, `store_admin`, and `audit_related`.
- The route falls back to access denied for unauthorized users.
- The implementation was validated with the project production build, which succeeded.

Evidence:
- Command run: `npm run build`
- Result: Vite production build completed successfully with `✓ built in 6.29s`

This confirms the audit page integration is consistent with the current security model and frontend build pipeline.
