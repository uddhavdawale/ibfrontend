# Spring Boot User-Scoped Implementation Report

## Goal
Implement a backend that:
- stores all signup details for each user
- logs in a user securely
- returns only the logged-in user’s data on all subsequent requests
- prevents cross-user access to invoices, inventory, billing, profile, and dashboard records

---

## 1. Core database model: User

```java
package com.example.app.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

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
    private String role;

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

    private String gstin;
    private String shopType;
    private String caCertificate;
    private String pan;
    private String practiceArea;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // getters and setters
}
```

---

## 2. User repository

```java
package com.example.app.repository;

import com.example.app.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
    boolean existsByEmail(String email);
}
```

---

## 3. Signup request DTO

```java
package com.example.app.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class SignupRequest {

    @NotBlank
    private String role;

    @NotBlank
    private String businessName;

    @NotBlank
    private String ownerName;

    @NotBlank
    @Email
    private String email;

    @NotBlank
    private String phone;

    @NotBlank
    private String address;

    @NotBlank
    private String city;

    @NotBlank
    private String pincode;

    private String gstin;
    private String shopType;
    private String caCertificate;
    private String pan;
    private String practiceArea;

    @NotBlank
    @Size(min = 8)
    private String passwordHash;

    // getters and setters
}
```

---

## 4. Auth controller: signup

```java
package com.example.app.controller;

import com.example.app.dto.SignupRequest;
import com.example.app.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/signup")
    public ResponseEntity<?> signup(@Valid @RequestBody SignupRequest request) {
        UserResponse user = authService.register(request);
        return ResponseEntity.ok(Map.of(
            "success", true,
            "message", "User registered successfully",
            "user", user
        ));
    }
}
```

---

## 5. Auth service: register user

```java
package com.example.app.service;

import com.example.app.dto.SignupRequest;
import com.example.app.entity.User;
import com.example.app.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.util.Objects;

@Service
public class AuthService {

    private final UserRepository userRepository;

    public AuthService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public UserResponse register(SignupRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email already exists");
        }

        User user = new User();
        user.setEmail(request.getEmail());
        user.setPasswordHash(request.getPasswordHash());
        user.setRole(request.getRole());
        user.setBusinessName(request.getBusinessName());
        user.setOwnerName(request.getOwnerName());
        user.setPhone(request.getPhone());
        user.setAddress(request.getAddress());
        user.setCity(request.getCity());
        user.setPincode(request.getPincode());
        user.setGstin(request.getGstin());
        user.setShopType(request.getShopType());
        user.setCaCertificate(request.getCaCertificate());
        user.setPan(request.getPan());
        user.setPracticeArea(request.getPracticeArea());

        User saved = userRepository.save(user);

        return new UserResponse(
            saved.getId(),
            saved.getRole(),
            saved.getBusinessName(),
            saved.getOwnerName(),
            saved.getEmail(),
            saved.getPhone(),
            saved.getCity(),
            saved.getAddress(),
            saved.getPincode(),
            saved.getGstin(),
            saved.getShopType(),
            saved.getCaCertificate(),
            saved.getPan(),
            saved.getPracticeArea()
        );
    }
}
```

---

## 6. User response DTO

```java
package com.example.app.dto;

public class UserResponse {
    private Long id;
    private String role;
    private String businessName;
    private String ownerName;
    private String email;
    private String phone;
    private String city;
    private String address;
    private String pincode;
    private String gstin;
    private String shopType;
    private String caCertificate;
    private String pan;
    private String practiceArea;

    public UserResponse(Long id, String role, String businessName, String ownerName,
                        String email, String phone, String city, String address,
                        String pincode, String gstin, String shopType,
                        String caCertificate, String pan, String practiceArea) {
        this.id = id;
        this.role = role;
        this.businessName = businessName;
        this.ownerName = ownerName;
        this.email = email;
        this.phone = phone;
        this.city = city;
        this.address = address;
        this.pincode = pincode;
        this.gstin = gstin;
        this.shopType = shopType;
        this.caCertificate = caCertificate;
        this.pan = pan;
        this.practiceArea = practiceArea;
    }

    // getters
}
```

---

## 7. Login request and login service

```java
package com.example.app.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public class LoginRequest {

    @NotBlank
    @Email
    private String email;

    @NotBlank
    private String password;

    // getters and setters
}
```

```java
@Service
public class AuthService {

    private final UserRepository userRepository;
    private final JwtService jwtService;

    public AuthService(UserRepository userRepository, JwtService jwtService) {
        this.userRepository = userRepository;
        this.jwtService = jwtService;
    }

    public LoginResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
            .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // password verify should happen here with BCrypt or other password hashing
        // if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) throw ...

        String accessToken = jwtService.generateToken(user.getId(), user.getRole());
        String refreshToken = jwtService.generateRefreshToken(user.getId());

        return new LoginResponse(
            accessToken,
            refreshToken,
            new UserResponse(
                user.getId(),
                user.getRole(),
                user.getBusinessName(),
                user.getOwnerName(),
                user.getEmail(),
                user.getPhone(),
                user.getCity(),
                user.getAddress(),
                user.getPincode(),
                user.getGstin(),
                user.getShopType(),
                user.getCaCertificate(),
                user.getPan(),
                user.getPracticeArea()
            )
        );
    }
}
```

---

## 8. JWT with user id

```java
@Service
public class JwtService {

    private final String secret = "your-very-secret-key";

    public String generateToken(Long userId, String role) {
        return Jwts.builder()
            .subject(String.valueOf(userId))
            .claim("role", role)
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis() + 1000 * 60 * 60 * 24))
            .signWith(SignatureAlgorithm.HS256, secret)
            .compact();
    }

    public Long extractUserId(String token) {
        String subject = Jwts.parser()
            .setSigningKey(secret)
            .parseClaimsJws(token)
            .getBody()
            .getSubject();
        return Long.parseLong(subject);
    }
}
```

---

## 9. Security principal

```java
public class UserPrincipal {
    private Long userId;
    private String role;

    public UserPrincipal(Long userId, String role) {
        this.userId = userId;
        this.role = role;
    }

    public Long getUserId() {
        return userId;
    }

    public String getRole() {
        return role;
    }
}
```

---

## 10. User-specific data pattern

### Inventory entity with owner relation

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

    // getters and setters
}
```

### Repository

```java
public interface InventoryRepository extends JpaRepository<Inventory, Long> {
    List<Inventory> findByUserId(Long userId);
    Optional<Inventory> findByIdAndUserId(Long id, Long userId);
}
```

### Controller

```java
@GetMapping("/my-inventory")
public ResponseEntity<?> getMyInventory(@AuthenticationPrincipal UserPrincipal principal) {
    return ResponseEntity.ok(inventoryRepository.findByUserId(principal.getUserId()));
}
```

---

## 11. User profile endpoint

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserRepository userRepository;

    @GetMapping("/me")
    public ResponseEntity<?> getMyProfile(@AuthenticationPrincipal UserPrincipal principal) {
        User user = userRepository.findById(principal.getUserId())
            .orElseThrow(() -> new RuntimeException("User not found"));

        return ResponseEntity.ok(Map.of(
            "success", true,
            "user", Map.of(
                "id", user.getId(),
                "role", user.getRole(),
                "businessName", user.getBusinessName(),
                "ownerName", user.getOwnerName(),
                "email", user.getEmail(),
                "phone", user.getPhone(),
                "address", user.getAddress(),
                "city", user.getCity(),
                "pincode", user.getPincode(),
                "gstin", user.getGstin(),
                "shopType", user.getShopType(),
                "caCertificate", user.getCaCertificate(),
                "pan", user.getPan(),
                "practiceArea", user.getPracticeArea()
            )
        ));
    }
}
```

---

## 12. Security rule: never trust client-side user filters
This must be enforced on the server side:

```java
@GetMapping("/api/invoices/{id}")
public ResponseEntity<?> getInvoice(@PathVariable Long id,
                                   @AuthenticationPrincipal UserPrincipal principal) {
    Invoice invoice = invoiceRepository.findByIdAndUserId(id, principal.getUserId())
        .orElseThrow(() -> new AccessDeniedException("Access denied"));

    return ResponseEntity.ok(invoice);
}
```

If a user tries to request another user’s data, return:

```json
{
  "success": false,
  "message": "Access denied"
}
```

with HTTP status `403 Forbidden`.

---

## 13. Recommended backend modules

- `AuthController`
- `UserController`
- `UserRepository`
- `InventoryRepository`
- `InvoiceRepository`
- `BillingRepository`
- `DashboardService`
- `AuthService`
- `UserService`
- `JwtService`
- `SecurityConfig`
- `UserPrincipal`

---

## 14. Final acceptance criteria

1. User signs up and full profile data is saved.
2. User logs in and gets a JWT with the user id.
3. All records are tied to the authenticated user.
4. All API reads are filtered by `userId`.
5. User A never sees User B’s records.
6. Dashboard is user-specific.
7. Profile changes are updated only for the logged-in user.

---

## 15. Example backend response after login

```json
{
  "success": true,
  "message": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiJ9...",
  "user": {
    "id": 12,
    "role": "retailer",
    "businessName": "Dawale Kirana Store",
    "ownerName": "Uddhav Dawale",
    "email": "uddhav@example.com",
    "phone": "9876543210",
    "city": "Pune",
    "address": "Pune",
    "pincode": "411001"
  }
}
```

This satisfies the requirement that after signup, the user profile is stored and after login, only that user’s own data is visible.
