import { API_BASE_URL } from '../../Config/api.js';

export const normalizeMfaFlag = (value) => {
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'enabled', 'on'].includes(value.toLowerCase());
  }
  return Boolean(value);
};

export const resolveMfaContext = (payload = {}, fallbackUser = {}) => {
  const source = payload?.config || payload?.authConfig || payload?.securityConfig || payload?.security || payload?.mfa || {};
  const security = source.security || source.auth || source.mfa || {};

  const enabled = normalizeMfaFlag(
    payload?.requiresMfa ||
    payload?.requires_mfa ||
    payload?.mfaRequired ||
    payload?.requireMfa ||
    payload?.mfaEnabled ||
    payload?.mfa_required ||
    source.mfaEnabled ||
    source.requireMfa ||
    source.mfa_required ||
    source.mfaRequired ||
    security.mfaEnabled ||
    security.requireMfa ||
    security.mfa_required ||
    security.enabled ||
    fallbackUser?.mfaRequired ||
    fallbackUser?.requireMfa ||
    fallbackUser?.mfaEnabled ||
    fallbackUser?.mfa_required ||
    false
  );

  const email = payload?.email || fallbackUser?.email || security.email || '';
  const username = payload?.username || fallbackUser?.username || fallbackUser?.name || email || '';

  return {
    enabled,
    email,
    username,
    method: security.method || source.mfaMethod || 'otp',
  };
};

export const getMfaUsername = (payload = {}, fallbackUsername = '') => {
  const email = payload?.email || '';
  const username = payload?.username || fallbackUsername || '';
  return username || email || '';
};

export const maskEmail = (email = '') => {
  if (!email) return 'your email';
  const trimmed = String(email).trim();
  const atIndex = trimmed.indexOf('@');

  if (atIndex <= 1) return trimmed;

  const localPart = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const maskedLocal = `${localPart.slice(0, 1)}***`;

  return `${maskedLocal}@${domain}`;
};

export const sendMfaOtp = async ({ username, email } = {}, baseUrl = API_BASE_URL) => {
  const targetUsername = username || email || '';
  if (!targetUsername) {
    throw new Error('Email or username is required to send the OTP.');
  }

  const response = await fetch(`${baseUrl}/api/mfa/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username: targetUsername }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Unable to send MFA code. Please try again.');
  }

  return payload;
};

export const verifyMfaOtp = async ({ username, otp } = {}, baseUrl = API_BASE_URL) => {
  const targetUsername = username || '';
  const trimmedOtp = String(otp || '').trim();

  if (!targetUsername) {
    throw new Error('Username is required for MFA verification.');
  }

  if (!/^\d{6}$/.test(trimmedOtp)) {
    throw new Error('Please enter a valid 6-digit OTP.');
  }

  const response = await fetch(`${baseUrl}/api/mfa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username: targetUsername, otp: trimmedOtp }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Invalid or expired OTP. Please try again.');
  }

  return payload;
};
