# Backend User-Scoped Implementation Report

## Scope
Implement the server-side enforcement for the requirement that each authenticated user can only access their own data and cannot see other users’ records, profile data, inventory, billing, or invoice content.

This project currently contains the frontend only. The actual enforcement must be implemented in the Spring Boot backend service.

---

## Core requirement
The system must enforce the following rules at the backend layer:

1. Every user entity has a unique identity.
2. Every record that belongs to a user stores the owning `userId` or `user` relation.
3. Every authenticated request resolves the logged-in user from the JWT/session context.
4. Every read/write endpoint filters by the current user.
5. Requests for another user’s resource are rejected with `401` or `403`.
6. Dashboard summaries, inventory, billing, and invoice queries must all be filtered by the authenticated user.

---

## Mandatory backend design

### 1. User ownership model
Add a strict ownership relationship to all domain entities.

Recommended patterns:
- `User` is the root entity.
- `InventoryItem` includes `@ManyToOne User user`
- `Invoice` includes `@ManyToOne User user`
- `BillingEntry` includes `@ManyToOne User user`
- `DashboardSummary` is derived at query time based on the current user

Example:

```java
@Entity
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String ownerName;
    private String businessName;
    private String email;
    private String phone;
    private String passwordHash;
    private String role;
    private String city;
    private String address;
    private String gstNumber;
    private String panNumber;
    private String pincode;

    @CreationTimestamp
    private Instant createdAt;
}
```

```java
@Entity
public class InventoryItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    private String itemName;
    private String sku;
    private BigDecimal price;
    private Integer stockQuantity;
    private String category;
}
```

---

### 2. JWT / security identity
The backend must extract the current user from JWT claims and never trust a client-controlled `userId` parameter.

Required behavior:
- JWT contains `sub` or `userId`
- `SecurityContext` resolves the authenticated user
- use `@AuthenticationPrincipal` or a custom principal to get `currentUserId`
- reject requests if user cannot be resolved

Example:

```java
public record AuthenticatedUser(Long id, String email, String role) {}
```

In the authentication filter:
- parse token
- load user by ID
- set `Authentication` with user details
- attach request-scoped principal

---

### 3. Service-level access control
Every service method that reads or writes records should be user-scoped.

Bad pattern:
```java
inventoryRepository.findAll();
```

Correct pattern:
```java
inventoryRepository.findByUserId(currentUserId);
```

Rules:
- create: always attach current user
- read: filter by current user
- update: fetch `entityByIdAndUserId`
- delete: fetch `entityByIdAndUserId`
- dashboard: aggregate only for current user

Example:

```java
public InventoryItem getInventoryById(Long id, Long userId) {
    return inventoryRepository.findByIdAndUserId(id, userId)
        .orElseThrow(() -> new AccessDeniedException("Inventory item not found for this user"));
}
```

---

### 4. Repository contract
Repositories must expose user-scoped query methods.

Recommended repository methods:

```java
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
}

public interface InventoryRepository extends JpaRepository<InventoryItem, Long> {
    List<InventoryItem> findByUserId(Long userId);
    Optional<InventoryItem> findByIdAndUserId(Long id, Long userId);
}

public interface InvoiceRepository extends JpaRepository<Invoice, Long> {
    List<Invoice> findByUserId(Long userId);
    Optional<Invoice> findByIdAndUserId(Long id, Long userId);
}

public interface BillingRepository extends JpaRepository<BillingEntry, Long> {
    List<BillingEntry> findByUserId(Long userId);
    Optional<BillingEntry> findByIdAndUserId(Long id, Long userId);
}
```

Use `@Query` if more complex filtering is needed.

---

### 5. API contract enforcement
Every endpoint must be validated against the current authenticated user context.

#### Profile
- `GET /api/users/me` returns the authenticated user profile only
- never return another user’s profile by ID
- `PUT /api/users/me` updates only the current user

#### Inventory
- `GET /api/inventory` -> current user inventory only
- `GET /api/inventory/{id}` -> only if `id` belongs to current user
- `POST /api/inventory` -> set `inventory.user = currentUser`
- `PATCH /api/inventory/{id}` -> authorize by user

#### Billing / invoice
- `GET /api/billing` -> current user bills only
- `GET /api/invoices` -> current user invoices only
- `POST /api/invoices` -> invoice created with current user id

#### Dashboard
- `GET /api/dashboard` -> aggregate only on current user
- `GET /api/dashboard/summary` -> totals for current user only

---

### 6. Security rules and exception handling
Add global security enforcement and consistent error responses.

Use:
- `@PreAuthorize("isAuthenticated()")` on protected endpoints
- `AccessDeniedException` for invalid ownership
- `ResponseStatusException(HttpStatus.FORBIDDEN, ...)` for mismatched user access
- `@ControllerAdvice` to standardize error payloads

Example:

```java
@ExceptionHandler(AccessDeniedException.class)
@ResponseStatus(HttpStatus.FORBIDDEN)
public Map<String, String> handleAccessDenied(AccessDeniedException ex) {
    return Map.of("error", ex.getMessage());
}
```

---

## Required implementation checklist

### Entity and schema
- [ ] Add `user_id` foreign key to all user-owned tables
- [ ] Add `createdAt`, `updatedAt` timestamps
- [ ] Add index on `user_id`
- [ ] Add unique constraints for business email and phone if required

### Authentication
- [ ] Store JWT with `userId` claim
- [ ] Resolve authenticated user in security context
- [ ] Validate token before every protected request

### Repositories
- [ ] Add `findByUserId` and `findByIdAndUserId` for all user-owned records
- [ ] Add user-specific pagination if lists are large

### Services
- [ ] Ensure all service methods receive `currentUserId` from security context
- [ ] Reject access to foreign data
- [ ] Prevent user ID spoofing from request body or URL

### Controllers
- [ ] Replace direct ID-based CRUD with authenticated-user-scoped CRUD
- [ ] Do not accept arbitrary `userId` from clients
- [ ] Return `403` when access is invalid

### Dashboard
- [ ] Build summary queries with `WHERE user_id = :currentUserId`
- [ ] Include only current user’s totals and charts

### Testing
- [ ] Add test: user A cannot fetch user B profile
- [ ] Add test: user A cannot fetch user B inventory item
- [ ] Add test: user A cannot update user B invoice
- [ ] Add test: dashboard totals reflect only current user

---

## Recommended backend package layout

```text
src/main/java/com/example/app/
  config/
    SecurityConfig.java
    JwtAuthenticationFilter.java
  controller/
    AuthController.java
    UserController.java
    InventoryController.java
    InvoiceController.java
    BillingController.java
    DashboardController.java
  dto/
    UserProfileDto.java
    InventoryItemDto.java
    InvoiceDto.java
    DashboardSummaryDto.java
  entity/
    User.java
    InventoryItem.java
    Invoice.java
    BillingEntry.java
  repository/
    UserRepository.java
    InventoryRepository.java
    InvoiceRepository.java
    BillingRepository.java
  service/
    AuthService.java
    UserService.java
    InventoryService.java
    InvoiceService.java
    BillingService.java
    DashboardService.java
  security/
    CurrentUserProvider.java
    UserPrincipal.java
  exception/
    GlobalExceptionHandler.java
```

---

## Final validation criteria
The backend is considered complete only when:

- a user can only fetch their own profile
- a user can only see their own inventory, invoices, and billing data
- no API accepts or trusts client-provided `userId` for access control
- dashboard numbers are user-scoped
- all endpoints are tested for cross-user access denial

---

## Final verdict
Frontend alignment is now improved, but the actual user-scoped protection is backend-enforced and must be implemented in the Spring Boot service. Without that layer, the app can still be abused by a malicious user who changes request identifiers or attempts to access another user’s data.
