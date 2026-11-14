# Backend Crypto Debug Report

## Current status
The backend logs show the failure is happening at the RSA unwrap step, before AES-GCM decryption starts.

Observed pattern:
- `Unable to decrypt encrypted key. Check frontend public key pair and RSA mode/padding`
- same failure occurs across:
  - `RSA/ECB/OAEPWithSHA-256AndMGF1Padding`
  - `RSA/ECB/OAEPWithSHA-1AndMGF1Padding`
  - `RSA/ECB/PKCS1Padding`

This strongly indicates the wrapped AES key is not valid for the private key currently loaded by the backend.

## Most likely root cause
The issue is not AES encryption itself. It is almost certainly one of these:

1. Frontend and backend are using different RSA keypairs.
2. The backend is loading a different private key than the one the frontend public key was generated from.
3. The private key is in the wrong format (PKCS#1 vs PKCS#8) or the env value is malformed.
4. The frontend still sends old/stale data from a cached browser session or a previous env value.
5. The frontend is still performing an older binary-to-base64 conversion before the fix was deployed.

## What the backend should do next
The backend should add a small, temporary debug flow to prove exactly what key is being loaded and whether it matches the frontend key.

### Step 1: print debug metadata at login
In the decrypt service, log:
- source of the key (`property`, `env`, `classpath`, etc.)
- key length in bytes
- whether the loaded key is PKCS#1 or PKCS#8
- first 8 and last 8 bytes of the wrapped AES key
- length of `encryptedKey` and IV

Example debug pattern:

```java
log.debug("Login crypto decrypted key source={}", source);
log.debug("RSA key size={} bits", privateKey.getModulus().bitLength());
log.debug("encryptedKey length={} bytes", encryptedKeyBytes.length);
log.debug("iv length={} bytes", ivBytes.length);
log.debug("encryptedKey prefix={} suffix={}", Base64.getEncoder().encodeToString(Arrays.copyOfRange(encryptedKeyBytes, 0, 8)), Base64.getEncoder().encodeToString(Arrays.copyOfRange(encryptedKeyBytes, encryptedKeyBytes.length - 8, encryptedKeyBytes.length)));
```

### Step 2: validate the exact keypair match
The backend should derive the public key from the configured private key and compare it to the frontend public key string.

Command in local environment:

```bash
openssl rsa -in private_key.pem -pubout -out public_from_private.pem
openssl pkey -pubin -in frontend_public_key.pem -pubout -out public_from_frontend.pem
diff -u public_from_private.pem public_from_frontend.pem
```

If the diff is non-empty, the mismatch is confirmed.

## Recommended backend fix path

### Option A: clean keypair reset (recommended)
Generate a brand-new RSA keypair and use it consistently across both ends.

1. Generate new keypair.
2. Put the public key in the frontend `.env`.
3. Put the matching private key in the backend env/secret store.
4. Restart the backend server.
5. Clear browser cache, then retry login.

This is the cleanest and most reliable approach.

### Option B: enforce key format validation
Before accepting the private key, validate the format in Java:

- if it is PKCS#8, load with `PKCS8EncodedKeySpec`
- if it is PKCS#1, convert it appropriately before use
- reject malformed or empty values early

Example:

```java
private KeyFactory keyFactory = KeyFactory.getInstance("RSA");
```

Then ensure the encoded key is transformed correctly into `PrivateKey` before any decrypt attempt.

## Important backend rule
Do not keep retrying multiple RSA padding modes blindly in production without logging the exact loaded key source. The current logs prove the wrapped key is not decryptable with the configured private key.

The correct fix is to confirm the keypair is matching and the key import is valid, not to continue guessing between paddings.

## Final recommendation
The fastest path to resolution is:

1. Generate a fresh RSA keypair.
2. Confirm frontend public key matches backend private key using OpenSSL.
3. Restart backend and browser.
4. Retest login.
5. Only after that, continue with the encrypted payload rollout.

If the keys match and the issue persists, the next suspicion should be a stale frontend config or a malformed backend env private key, not the Java padding logic itself.
