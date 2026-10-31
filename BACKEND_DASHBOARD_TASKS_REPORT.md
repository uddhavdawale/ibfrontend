# Frontend Agent Contract Report

## Overview
This document is the frontend source-of-truth contract for the Inventory & Billing backend. It defines the exact API shape expected by the UI for authentication, dashboard metrics, inventory, billing, and GST workflows.

The backend implementation is expected to remain stable across refreshes and to return numeric values, predictable field names, and consistent JSON structures.

---

## 1. Authentication Contract

### 1.1 Login
- Method: `POST`
- Path: `/api/login`
- Request body:

```json
{
  "username": "admin",
  "password": "base64EncodedPassword",
  "email": "admin@example.com",
  "role": "ADMIN"
}
```

Expected behavior:
- Validate credentials
- Return an access token for authenticated API usage
- Return a refresh token, either in JSON or as an HttpOnly cookie
- Return user metadata including `name`, `email`, and `role`

Recommended response:

```json
{
  "message": "Login successful",
  "accessToken": "jwt.access.token",
  "refreshToken": "rotating.refresh.token",
  "user": {
    "id": 1,
    "username": "admin",
    "name": "Admin User",
    "email": "admin@example.com",
    "role": "ADMIN"
  }
}
```

### 1.2 Refresh token
- Method: `POST`
- Path: `/api/auth/refresh`
- Request body:

```json
{
  "username": "admin",
  "refreshToken": "currentRefreshToken"
}
```

Expected behavior:
- Validate the refresh token
- Issue a new access token and a new refresh token when rotation is enabled
- Return `401` when the token is invalid, expired, or reused after rotation
- Do not retry infinitely after refresh failure; frontend must invalidate session immediately

Recommended response:

```json
{
  "accessToken": "new.jwt.access.token",
  "refreshToken": "new.rotating.refresh.token",
  "user": {
    "id": 1,
    "username": "admin",
    "name": "Admin User",
    "email": "admin@example.com",
    "role": "ADMIN"
  }
}
```

### 1.3 Logout
- Method: `POST`
- Path: `/api/auth/logout`
- Expected behavior:
  - Invalidate the refresh token or revoke active session
  - Optionally clear cookie storage
  - Return `200` or `204` on success

### 1.4 Unauthorized handling
- Any `401 Unauthorized` on a protected endpoint must trigger immediate frontend logout
- Frontend should show a session expiration toast and redirect to login

---

## 2. Dashboard Data Contract

### 2.1 Summary metrics
The dashboard expects numeric KPI values for primary cards.

```json
{
  "salesToday": 15420,
  "pendingPayments": 2500,
  "lowStock": 8,
  "ordersToday": 12
}
```

### 2.2 Sales trend
- Endpoint: `/api/sales/last-six-months`
- Method: `GET`

Expected payload:

```json
[
  { "month": "Jan", "sales": 4000 },
  { "month": "Feb", "sales": 3000 },
  { "month": "Mar", "sales": 2000 },
  { "month": "Apr", "sales": 2780 },
  { "month": "May", "sales": 1890 },
  { "month": "Jun", "sales": 2390 }
]
```

Accepted alternative:

```json
{
  "data": [
    { "month": "Jan", "sales": 4000 },
    { "month": "Feb", "sales": 3000 }
  ]
}
```

Notes:
- Sort in ascending month order
- Keep values numeric
- Keep names short and chart-friendly

---

## 3. Inventory Contract

### 3.1 Product listing
- Endpoint: `/api/products`
- Method: `GET`
- Query parameters:
  - `page` (0-based index)
  - `size` (page size, e.g. 10 or 20)
  - optional `search`

Expected response:

```json
{
  "content": [
    {
      "id": 1,
      "name": "Product A",
      "sku": "SKU-01",
      "quantity": 10,
      "minStock": 20,
      "price": 299,
      "category": "Electronics",
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "totalPages": 5,
  "totalElements": 42,
  "number": 0,
  "size": 10
}
```

### 3.2 Product mutation endpoints
- `POST /api/products` create
- `PUT /api/products/{id}` update
- `DELETE /api/products/{id}` delete

Expected fields on create/update:

```json
{
  "name": "Product A",
  "sku": "SKU-01",
  "quantity": 10,
  "minStock": 20,
  "price": 299,
  "category": "Electronics"
}
```

Notes:
- Low-stock logic is based on `quantity < minStock`
- Frontend displays quantity, minimum stock, price, and category

---

## 4. Billing Contract

### 4.1 Invoice list
- Endpoint: `/api/invoices`
- Method: `GET`
- Query parameters:
  - `page`
  - `size`
  - optional `status`

Expected response:

```json
{
  "content": [
    {
      "id": 101,
      "total": 5200,
      "status": "Paid",
      "customerName": "Retailer",
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "totalPages": 3,
  "number": 0
}
```

Frontend requirements:
- invoice list must include at least `id`, `total`, `status`, `customerName`, and `createdAt`
- payment states should align with `Paid`, `Pending`, `Overdue`, or equivalent statuses

---

## 5. GST Contract

### 5.1 GST summary
- Endpoint: `/api/gst/summary`
- Method: `GET`

Expected response:

```json
{
  "period": "2026-10",
  "totalSales": 125000,
  "taxCollected": 15000,
  "returnsFiled": 2,
  "pendingFiling": 1
}
```

### 5.2 GST filings
- Endpoint: `/api/gst/filings`
- Method: `GET`

Expected response:

```json
[
  {
    "id": 1,
    "month": "2026-10",
    "status": "Filed",
    "amount": 15000,
    "submittedAt": "2026-10-15T00:00:00Z"
  }
]
```

---

## 6. Backend Task Checklist

### Must implement
- [x] `POST /api/login` returning access + refresh token and user metadata
- [x] `POST /api/auth/refresh` with rotation and invalidation rules
- [x] `POST /api/auth/logout` to revoke refresh token/session
- [x] `GET /api/products` paginated response with `content` and pagination metadata
- [x] `GET /api/sales/last-six-months` returning monthly sales series
- [x] `GET /api/invoices` returning invoice list with status and total
- [x] `GET /api/gst/summary` returning GST KPI values
- [x] `GET /api/gst/filings` returning filing list
- [x] `401` handling and session invalidation on expired tokens

### Should implement
- [ ] consistent JSON response envelope for all endpoints
- [ ] validation errors with explicit message fields
- [ ] audit timestamps for created/updated records
- [ ] secure HttpOnly refresh token cookies when applicable

### Production readiness requirements
- [ ] use HTTPS in production
- [ ] protect refresh token rotation and invalidation
- [ ] send `Authorization: Bearer <token>` for protected requests
- [ ] avoid silent retry loops when refresh fails
- [ ] return stable field names to match frontend expectations

---

## 7. Frontend Contract Expectations

The frontend expects the backend to remain consistent with the following general contract:
- JSON payloads are returned as readable objects and arrays, not only wrapped strings
- Numeric values remain numeric whenever possible
- Field names are stable and should not change between UI refreshes without coordinated changes
- Refresh flow must be safe: if token refresh cannot succeed, the frontend logs the user out immediately

---

## 8. Acceptance Criteria
The backend is considered ready when:
1. Login returns valid access and refresh tokens
2. Refresh token rotation works reliably and fails with `401` when invalid
3. Dashboard widgets render from backend values instead of static mock data
4. Inventory list supports pagination and stock detection
5. Billing data exposes totals and payment state
6. GST summary and filings render correctly in the UI
7. Authentication failures result in immediate logout and redirect to login

---

## 9. Frontend Implementation Notes
- Treat this document as the API contract source-of-truth
- Any response shape mismatch should be resolved in coordination with the backend team before UI changes are merged
- Prefer resilient parsing for optional fields but maintain the expected contract for required fields
- Session expiration flows should be handled uniformly across dashboard and protected pages
