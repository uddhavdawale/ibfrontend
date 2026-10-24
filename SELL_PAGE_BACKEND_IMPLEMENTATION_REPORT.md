# Sell Page Backend Implementation Report

## Purpose
This report defines the exact backend contract needed for the sell page to work correctly and reliably. It covers invoice listing, invoice detail, payment status, inventory upload scoping, authentication, and tenant ownership.

---

## 1. Authentication and tenant contract

### Required login and session behavior
The backend must return a valid authenticated session with:
- access token
- refresh token
- user identity
- tenant id

The frontend expects protected APIs to require:
- `Authorization: Bearer <accessToken>`
- refresh-token support via `/api/auth/refresh`
- cookies for refresh token when applicable

### Required user contract
Each authenticated user must resolve to:
- `id`
- `email`
- `role`
- `tenantId`
- `businessName` or equivalent business identity

The backend should not trust a client-provided tenant id. It must resolve tenant from the JWT/session and enforce it server-side.

---

## 2. Required invoice API contract

### Endpoint 1: List invoices
GET `/api/invoices`

### Required response shape
The frontend expects a paginated or array result and normalizes it.

Example response:

```json
{
  "content": [
    {
      "id": 101,
      "invoiceNo": "INV-2026/0001",
      "date": "2026-10-24",
      "customerName": "Ravi Sharma",
      "customerPhone": "9876543210",
      "customerEmail": "ravi@example.com",
      "paymentMethod": "UPI",
      "subtotal": 850.00,
      "gstAmount": 150.00,
      "grandTotal": 1000.00,
      "paidAmount": 350.00,
      "outstandingAmount": 650.00,
      "paymentStatus": "PARTIAL",
      "status": "Pending",
      "tenantId": 7,
      "userId": 12,
      "items": [
        {
          "id": 1,
          "name": "Rice",
          "hsn": "1006",
          "quantity": 2,
          "price": 250,
          "gstRate": 5,
          "total": 525
        }
      ]
    }
  ],
  "totalElements": 1,
  "page": 0,
  "size": 50
}
```

### Backend requirements
- should return only invoices belonging to the authenticated user and tenant
- `status` may be a legacy field, but `paymentStatus` must be canonical
- `paidAmount` and `outstandingAmount` must be accurate
- `tenantId` and `userId` must be persisted on the invoice

---

### Endpoint 2: Single invoice detail
GET `/api/invoices/{id}`

Example response:

```json
{
  "id": 101,
  "invoiceNo": "INV-2026/0001",
  "customerName": "Ravi Sharma",
  "customerPhone": "9876543210",
  "customerEmail": "ravi@example.com",
  "date": "2026-10-24",
  "paymentMethod": "UPI",
  "subtotal": 850.00,
  "gstAmount": 150.00,
  "grandTotal": 1000.00,
  "paidAmount": 350.00,
  "outstandingAmount": 650.00,
  "paymentStatus": "PARTIAL",
  "status": "Pending",
  "tenantId": 7,
  "userId": 12,
  "items": [
    {
      "id": 1,
      "name": "Rice",
      "hsn": "1006",
      "quantity": 2,
      "price": 250,
      "gstRate": 5,
      "total": 525
    }
  ]
}
```

### Backend requirement
If `/api/invoices/{id}` is called for an invoice not belonging to the current user/tenant, return:
- 403 Forbidden or 404 Not Found

Do not leak records across users or tenants.

---

## 3. Payment state contract

### Canonical payment fields
The backend must expose these fields consistently:
- `paymentStatus`: `PENDING`, `PARTIAL`, `PAID`, `CANCELLED`
- `paidAmount`: number
- `totalAmount`: grand total
- `outstandingAmount`: `totalAmount - paidAmount`
- `status`: optional legacy status string for compatibility

### Required payment rules
- if `paidAmount >= totalAmount`, then payment is effectively `PAID`
- if `paidAmount > 0` and `< totalAmount`, then `PARTIAL`
- if `paidAmount == 0`, then `PENDING`
- if `status` is stale or legacy, do not use it as the final source of truth

### Required frontend behavior
The frontend may normalize values, but the backend should return canonical values so the UI can display the correct payment state without guessing.

---

## 4. Inventory upload requirements

### Endpoint
POST `/api/inventory/upload`

### Request payload
The frontend now sends:
- file
- records (JSON array)
- tenantId
- userId
- source: `inventory-upload`

Example JSON rows:

```json
[
  {
    "product": "Rice",
    "sku": "RICE-001",
    "qty": 20,
    "minStock": 5,
    "price": 250,
    "category": "Groceries",
    "tenantId": 7,
    "userId": 12
  }
]
```

### Backend requirement
The backend must:
- accept the uploaded file plus JSON records
- parse the rows or use the JSON payload
- map each row to an inventory product record
- set `tenantId` and `userId` from authenticated principal or validated inputs
- reject any row where tenant/user mismatch occurs

---

## 5. Inventory entity requirements
Every product/inventory item must include ownership fields:

```java
@Entity
public class InventoryItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String productName;
    private String sku;
    private Integer quantity;
    private Integer minStock;
    private BigDecimal price;
    private String category;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Tenant tenant;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
}
```

### Requirements
- no inventory item can exist without tenant and user
- every query must be scoped by `tenantId`
- user-specific lists should also be filtered by `userId` when required

---

## 6. Tenant enforcement rules
The backend must enforce the following:

### For every protected endpoint
- resolve current user from JWT
- resolve current tenant from user profile
- filter all queries by tenant
- filter user-specific operations by user id

### For cross-tenant access
Reject with:
- 401 Unauthorized if session invalid
- 403 Forbidden if user is authenticated but not allowed to read the tenant data

---

## 7. Product and inventory listing contract
GET `/api/products`

### Required behavior
- return products scoped to the current tenant
- if a tenant-specific product list is required, filter by tenant id server-side
- do not trust client-side tenant id selection

### Example response
```json
{
  "content": [
    {
      "id": 1,
      "name": "Rice",
      "sku": "RICE-001",
      "quantity": 20,
      "minStock": 5,
      "price": 250,
      "category": "Groceries",
      "tenantId": 7,
      "userId": 12
    }
  ]
}
```

---

## 8. Dashboard requirements
The dashboard must use authenticated tenant-scoped queries.

### Required endpoints
- GET `/api/dashboard/metrics`
- GET `/api/dashboard/stats`

### Required data
These values must reflect the current tenant only:
- salesToday
- totalRevenue
- pendingPayments
- lowStock
- totalOrders
- totalProducts

No dashboard values should be shared across tenants.

---

## 9. Security and authorization rules

### Required backend protections
- JWT validation required on all protected endpoints
- `tenantId` must not be user-editable from client requests
- `userId` must not be user-editable from client requests
- all ownership checks done on server side
- all queries use authenticated current-user context

### Error handling
Return structured errors like:

```json
{
  "success": false,
  "message": "You do not have access to this tenant's inventory."
}
```

---

## 10. Critical backend checklist for implementation

### Security
- [ ] Validate JWT before every protected route
- [ ] Resolve tenant from authenticated user
- [ ] Resolve user from authenticated principal
- [ ] Reject mismatched tenantId/userId in request payloads

### Invoice APIs
- [ ] `/api/invoices` returns only current tenant invoices
- [ ] `/api/invoices/{id}` validates ownership
- [ ] `paymentStatus`, `paidAmount`, `totalAmount`, `outstandingAmount` are accurate

### Inventory upload
- [ ] `/api/inventory/upload` accepts file + records
- [ ] each item gets `tenantId` and `userId`
- [ ] uploaded rows are saved with owner metadata
- [ ] invalid tenant/user values are rejected

### Dashboard and products
- [ ] all product queries are tenant-scoped
- [ ] dashboard metrics are tenant-scoped

### Tests required
- [ ] user cannot access another tenant's invoices
- [ ] user cannot access another tenant's products
- [ ] uploaded inventory items are saved with the logged-in user's tenant id
- [ ] uploaded inventory items are saved with the logged-in user's id
- [ ] payment state resolves correctly when `paidAmount >= totalAmount`

---

## 11. Final note
The sell page will only behave correctly when the backend returns canonical invoice/payment state and tenant-scoped inventory ownership. The frontend may normalize and display values, but the backend is the final source of truth.
