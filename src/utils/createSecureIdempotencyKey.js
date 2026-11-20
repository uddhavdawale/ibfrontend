const createSecureIdempotencyKey = () => {
  if (!window.crypto?.getRandomValues) {
    throw new Error('Secure payment submission is not supported by this browser.');
  }
  if (window.crypto.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export default createSecureIdempotencyKey;
