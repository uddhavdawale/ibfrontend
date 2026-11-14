# Backend login encryption requirements

## Objective
The frontend now encrypts the login payload before it reaches the browser network layer by using the Web Crypto API. This keeps the request body opaque to network observers while keeping the app lightweight and dependency-free.

Production requirement: encrypted payloads are the primary and expected login contract. Plaintext login is treated as a temporary compatibility fallback during transition only and should be disabled in production environments.

## Frontend request contract
The frontend sends a POST request to `/api/login` with one of these payload styles:

### 1) Secure encrypted payload (required in production)

```json
{
  "scheme": "rsa-aes-gcm-v1",
  "keyId": "login-rsa-key",
  "timestamp": "2026-11-03T12:00:00.000Z",
  "iv": "<base64-encoded-12-byte-IV>",
  "encryptedKey": "<base64-encoded-rsa-wrapped-aes-key>",
  "encryptedPayload": "<base64-encoded-aes-gcm-encrypted-json>"
}
```

The actual plaintext JSON is:

```json
{
  "username": "store@demo.com",
  "password": "SecretPass123",
  "role": "store_manager",
  "email": "store@demo.com"
}
```

### 2) Legacy plaintext payload (temporary fallback only)

```json
{
  "username": "store@demo.com",
  "password": "SecretPass123",
  "role": "store_manager",
  "email": "store@demo.com"
}
```

> Plaintext is accepted only during migration or local development. Production should reject it and require the encrypted format.

## Encryption details
Frontend uses:
- AES-GCM with a random 12-byte IV
- AES key length: 256-bit
- RSA-OAEP wrapping of the AES key using SHA-256
- Public key: `VITE_LOGIN_RSA_PUBLIC_KEY` in the Vite frontend environment

The encryption is performed in the browser with the native Web Crypto API, so there is no extra dependency or heavy library.

## Required backend behavior
On the server, the controller should inspect the request body for the encrypted fields:
- `encryptedPayload`
- `encryptedKey`
- `iv`
- `scheme`

When those fields are present:

1. Read the backend RSA private key from a secure environment variable, for example: `RSA_PRIVATE_KEY_BASE64`.
2. Base64-decode the private key into a PKCS#8 RSA private key.
3. Decrypt the wrapped AES key using `RSA/ECB/OAEPWithSHA-256AndMGF1Padding`.
4. Reconstruct the AES-GCM cipher with the decrypted raw key and the supplied IV.
5. Decrypt the payload bytes and parse the resulting JSON.
6. Continue with the normal username/password validation flow.

## Java decryption contract
The backend should ultimately resolve to this plaintext JSON payload before authentication:

```json
{
  "username": "store@demo.com",
  "password": "SecretPass123",
  "role": "store_manager",
  "email": "store@demo.com"
}
```

## Security notes
- Never expose the RSA private key in frontend code or source control.
- Keep the backend private key in a secret manager or environment variable only.
- Prefer rejecting plaintext login attempts in production.
- Verify the decrypted JSON structure before authentication.
- Reject malformed encrypted requests with `401 Unauthorized` or `400 Bad Request` without logging plaintext secrets.

## Recommended implementation shape
A backend util class should be added with a method like:

```java
String decryptLoginRequest(String encryptedPayloadB64, String encryptedKeyB64, String ivB64, String rsaPrivateKeyBase64)
```

This method should return the raw JSON string to be converted into the existing `LoginRequest` model.

## Compatibility recommendation
For a safe rollout:
1. Deploy backend support for encrypted login requests.
2. Keep the plaintext fallback available only during controlled staging or maintenance windows.
3. Enforce encrypted-only login in production after validation.
4. Remove plaintext compatibility from the final production build once the rollout is stable.
