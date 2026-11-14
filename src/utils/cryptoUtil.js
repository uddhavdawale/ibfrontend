const normalizePem = (pem = '') => String(pem || '').trim();

const arrayBufferToBase64 = (bytesOrBuffer) => {
  const view = bytesOrBuffer instanceof Uint8Array ? bytesOrBuffer : new Uint8Array(bytesOrBuffer);
  let binary = '';

  for (let i = 0; i < view.byteLength; i += 1) {
    binary += String.fromCharCode(view[i]);
  }

  return btoa(binary);
};

const pemToArrayBuffer = (pem) => {
  const normalizedPem = normalizePem(pem).replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\r|\n/g, '');
  const binary = atob(normalizedPem);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
};

export const getLoginPublicKeyPem = () => (
  import.meta.env.VITE_LOGIN_RSA_PUBLIC_KEY ||
  import.meta.env.VITE_AUTH_PUBLIC_KEY ||
  ''
).trim();

export const isLoginEncryptionEnabled = () => {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    return false;
  }

  return Boolean(getLoginPublicKeyPem());
};

export async function encryptLoginPayload(payloadObject) {
  const publicKeyPem = getLoginPublicKeyPem();

  if (!publicKeyPem) {
    throw new Error('Login public key is missing. Set VITE_LOGIN_RSA_PUBLIC_KEY in the frontend environment.');
  }

  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API is not available in this browser environment.');
  }

  const encoder = new TextEncoder();
  const loginJson = JSON.stringify(payloadObject);
  const aesKey = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt']
  );
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const encryptedPayloadBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoder.encode(loginJson)
  );

  const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey);
  const rsaPublicKey = await window.crypto.subtle.importKey(
    'spki',
    pemToArrayBuffer(publicKeyPem),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );

  const encryptedAesKeyBuffer = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    rsaPublicKey,
    rawAesKey
  );

  return {
    scheme: 'rsa-aes-gcm-v1',
    keyId: 'login-rsa-key',
    timestamp: new Date().toISOString(),
    iv: arrayBufferToBase64(iv),
    encryptedKey: arrayBufferToBase64(new Uint8Array(encryptedAesKeyBuffer)),
    encryptedPayload: arrayBufferToBase64(new Uint8Array(encryptedPayloadBuffer)),
  };
}

export async function buildLoginRequest(payloadObject) {
  if (!isLoginEncryptionEnabled()) {
    if (import.meta.env.PROD || String(import.meta.env.VITE_ENFORCE_LOGIN_ENCRYPTION || '').toLowerCase() === 'true') {
      throw new Error('Login encryption is required in production and no RSA public key is configured.');
    }

    return payloadObject;
  }

  try {
    return await encryptLoginPayload(payloadObject);
  } catch (error) {
    if (import.meta.env.PROD || String(import.meta.env.VITE_ENFORCE_LOGIN_ENCRYPTION || '').toLowerCase() === 'true') {
      throw new Error('Secure login encryption failed in production.');
    }

    console.warn('Secure login encryption failed; falling back to plain payload.', error);
    return payloadObject;
  }
}
