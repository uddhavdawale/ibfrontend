# User-Scoped Data Backend Implementation Report

## Business requirement
When a user signs up, the backend must persist the full profile information submitted by that user. On subsequent login, only that authenticated user’s own records must be visible to them. No user should be able to fetch or manipulate another user’s records.

This requirement applies to all user-owned data, including profile information, inventory, billing, invoices, GST records, and partner data.

---

## Core rule
Every data record must be associated with a userId (or ownerId) and every read/write operation must enforce:

- authenticated user must be present
- request userId == authenticated user id
- repository queries must filter by userId

This is the key requirement that keeps the data isolated per user.

---

## Signup payload already used by frontend
The frontend signup request currently sends the following fields:

```json
{
  "role": "retailer",
  "businessName": "Dawale Kirana Store",
  "ownerName": "Uddhav Dawale",
  "email": "uddhav@example.com",
  "phone": "9876543210",
  "address": "Pune",
  "city": "Pune",
  "pincode": "411001",
  "gstin": "27ABCDE1234F1Z5",
  "shopType": "Grocery",
  "passwordHash": "base64EncodedPassword",
  "caCertificate": "",
  "pan": "",
  "practiceArea": ""
}
```

For partner accounts, the same model is used with retailer fields left blank and partner-specific fields filled:

```json
{
  "role": "partner",
  "businessName": "Dawale CA Services",
  "ownerName": "Uddhav Dawale",
  "email": "partner@example.com",
  "phone": "9876543210",
  "address": "Pune",
  "city": "Pune",
  "pincode": "411001",
  "caCertificate": "CERT-123",
  "pan": "ABCDE1234F",
  "practiceArea": "GST, Taxation",
  "passwordHash": "base64EncodedPassword"
}
```

---

## Backend design requirement
Create a dedicated user profile model and bind all other data to that user.

### User entity
```java
@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private String role; // retailer, partner, admin

    @Column(nullable = false)
    private String businessName;

    @Column(nullable = false)
    private String ownerName;

    @Column(nullable = false)
    private String phone;

    @Column(nullable = false)
    private String address;

    @Column(nullable = false)
    private String city;

    @Column(nullable = false)
    private String pincode;

    @Column
    private String gstin;

    @Column
    private String shopType;

    @Column
    private String caCertificate;

    @Column
    private String pan;

    @Column
    private String practiceArea;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;
}
```

### Why this matters
This gives every authenticated user a unique identity and stores the complete signup information in a single profile record.

---

## Recommended authentication contract
### 1. Signup endpoint
POST /api/auth/signup

Request body:
```json
{
  "role": "retailer",
  "businessName": "Dawale Kirana Store",
  "ownerName": "Uddhav Dawale",
  "email": "uddhav@example.com",
  "phone": "9876543210",
  "passwordHash": "base64EncodedPassword",
  "address": "Pune",
  "city": "Pune",
  "pincode": "411001",
  "gstin": "27ABCDE1234F1Z5",
  "shopType": "Grocery"
}
```

Validation rules:
- email must be unique
- passwordHash must be present and valid
- role must be allowed value
- businessName and ownerName required
- phone/email required for profile creation

Success response:
```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": 12,
    "role": "retailer",
    "businessName": "Dawale Kirana Store",
    "ownerName": "Uddhav Dawale",
    "email": "uddhav@example.com",
    "phone": "9876543210"
  }
}
```

Error response:
```json
{
  "success": false,
  "message": "Email already exists",
  "errors": [
    "email must be unique"
  ]
}
```

---

### 2. Login endpoint
POST /api/auth/login

Request body:
```json
{
  "email": "uddhav@example.com",
  "password": "securePassword123"
}
```

Server behavior:
- validate email/password
- load user from database
- generate JWT token containing user id and role
- return the user profile information for that authenticated user only

Success response:
```json
{
  "success": true,
  "message": "Login successful",
  "accessToken": "jwt-token",
  "refreshToken": "refresh-token",
  "user": {
    "id": 12,
    "role": "retailer",
    "businessName": "Dawale Kirana Store",
    "ownerName": "Uddhav Dawale",
    "email": "uddhav@example.com",
    "phone": "9876543210",
    "city": "Pune"
  }
}
```

---

## User-specific data visibility rule
Once the user is authenticated, the backend must never return records from other users.

### Example rule for any repository query
```java
public interface InventoryRepository extends JpaRepository<Inventory, Long> {
    List<Inventory> findByUserId(Long userId);
    Optional<Inventory> findByIdAndUserId(Long id, Long userId);
}
```

### Example service pattern
```java
@Service
public class InventoryService {

    private final InventoryRepository inventoryRepository;

    public List<Inventory> getMyInventory(UserPrincipal principal) {
        return inventoryRepository.findByUserId(principal.getUserId());
    }
}
```

### Example controller pattern
```java
@GetMapping("/my-inventory")
public ResponseEntity<?> getMyInventory(@AuthenticationPrincipal UserPrincipal principal) {
    return ResponseEntity.ok(inventoryRepository.findByUserId(principal.getUserId()));
}
```

This ensures that when user A logs in, they can see only user A’s inventory. User B cannot see user A’s records.

---

## Entity scoping pattern for all modules
Every user-owned table should include a userId field.

### Example inventory entity
```java
@Entity
@Table(name = "inventory")
public class Inventory {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private String product;

    @Column(nullable = false)
    private String sku;

    @Column(nullable = false)
    private Integer qty;

    @Column(nullable = false)
    private Integer minStock;

    @Column(nullable = false)
    private BigDecimal price;

    @Column(nullable = false)
    private String category;
}
```

Same pattern should be used for:
- invoices
- billing records
- gst filings
- transactions
- partner records
- customer data
- dashboard summaries

---

## Security enforcement requirement
This is not only a database concern. It must be enforced in the service and controller layers.

### Required security checks
- JWT must contain authenticated user id
- all controllers must use Spring Security authentication principal
- every repository query must include user id filter
- backend must reject userId mismatch requests with 403 Forbidden

Example:
```java
@GetMapping("/api/invoices/{invoiceId}")
public ResponseEntity<?> getInvoice(@PathVariable Long invoiceId,
                                   @AuthenticationPrincipal UserPrincipal principal) {
    Invoice invoice = invoiceRepository.findByIdAndUserId(invoiceId, principal.getUserId())
        .orElseThrow(() -> new AccessDeniedException("Access denied"));
    return ResponseEntity.ok(invoice);
}
```

---

## User profile retrieval endpoint
### GET /api/users/me
This endpoint should return the currently logged-in user’s profile only.

Response:
```json
{
  "success": true,
  "user": {
    "id": 12,
    "role": "retailer",
    "businessName": "Dawale Kirana Store",
    "ownerName": "Uddhav Dawale",
    "email": "uddhav@example.com",
    "phone": "9876543210",
    "address": "Pune",
    "city": "Pune",
    "pincode": "411001",
    "gstin": "27ABCDE1234F1Z5",
    "shopType": "Grocery",
    "caCertificate": null,
    "pan": null,
    "practiceArea": null
  }
}
```

### GET /api/users/me/dashboard
This should only return the current user’s dashboard data.

Response:
```json
{
  "success": true,
  "dashboard": {
    "totalInventory": 256,
    "monthlySales": 85400,
    "pendingBills": 12,
    "userId": 12
  }
}
```

---

## Data isolation strategy
### Recommended approach
Use a single authenticated user context for all fetch operations and attach userId to all entities.

### For example
- User registers once
- User logs in once
- JWT stores userId
- UI calls /api/users/me for profile and role-based data
- all other endpoints do user-specific filtering automatically

This prevents leakage of another user’s data.

---

## Recommended backend module structure
- AuthController
- UserController
- UserService
- UserRepository
- InventoryController
- InventoryService
- InvoiceController
- BillingController
- DashboardController
- SecurityConfig
- JwtService
- UserPrincipal

---

## Final requirement checklist
The backend implementation must ensure the following:

1. Full signup data is stored during registration.
2. Every user has a unique user record.
3. JWT contains the authenticated user id.
4. All entities are linked to user id.
5. All queries filter by the logged-in user only.
6. No endpoint returns data for another user.
7. Profile retrieval is user-specific and never global.
8. Dashboard, inventory, billing, and invoices are scoped to the current authenticated user.

---

## Implementation note
The frontend already submits all necessary signup data and also stores the logged-in user in local storage. The backend should treat this as the source of truth for identity and must never trust client-side user filters.

The real security boundary must be enforced server-side.

---

## Recommended acceptance criteria
When user A signs up and logs in:
- A sees only A’s data
- A cannot read B’s invoices
- A cannot read B’s inventory
- A cannot read B’s profile details

When user B signs up and logs in:
- B sees only B’s data
- B cannot read A’s records

This is the expected behavior for the final system.
