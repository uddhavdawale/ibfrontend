import { API_ENDPOINTS } from '../../Config/api.js';

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
    payload?.mfa?.required ||
    payload?.mfa?.enabled ||
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

  return {
    enabled,
    email: payload?.email || fallbackUser?.email || security.email || '',
    username: payload?.username || fallbackUser?.username || fallbackUser?.name || payload?.email || '',
    provider: 'email',
    method: 'email',
  };
};

const readResponse = async (response, fallbackMessage) => {
  const responseText = await response.text().catch(() => '');
  let payload = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = {};
  }

  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || payload.data?.message || fallbackMessage);
  }
  return payload;
};

const normalizeMfaSession = (payload = {}) => {
  const containers = [
    payload,
    payload.data,
    payload.result,
    payload.session,
    payload.auth,
    payload.data?.session,
    payload.data?.auth,
    payload.result?.session,
    payload.result?.auth,
  ].filter((value) => value && typeof value === 'object');
  const tokens = containers.map((container) => container.tokens).find(Boolean) || {};
  const tokenSources = [...containers, tokens];
  const findValue = (keys) => {
    for (const source of tokenSources) {
      for (const key of keys) {
        if (source[key]) return source[key];
      }
    }
    return null;
  };
  const user = findValue(['user', 'profile', 'userDetails', 'userInfo', 'account']);
  const result = containers.find((container) =>
    container.accessToken || container.access_token || container.token ||
    container.refreshToken || container.refresh_token || container.user
  ) || payload;

  return {
    ...payload,
    ...result,
    accessToken: findValue(['accessToken', 'access_token', 'token', 'jwtToken', 'jwt', 'idToken', 'id_token']),
    refreshToken: findValue(['refreshToken', 'refresh_token']),
    ...(user ? { user } : {}),
  };
};

const getChallengeId = (context) => String(
  context?.mfaChallenge?.challengeId ||
  context?.mfaChallengeId ||
  context?.challengeId ||
  ''
).trim();

const sendMfaRequest = async (endpoint, payload) => fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  cache: 'no-store',
  body: JSON.stringify(payload),
});

export const cancelMfaChallenge = async (context = {}) => {
  const challengeId = getChallengeId(context);
  if (!challengeId) {
    throw new Error('The sign-in challenge is missing. Please return to sign in.');
  }

  const response = await sendMfaRequest(API_ENDPOINTS.mfaCancel, { challengeId });
  return readResponse(response, 'Unable to cancel the verification challenge. Please try again.');
};

export const sendMfaOtpWithContext = async (context = {}) => {
  const challengeId = getChallengeId(context);
  if (!challengeId) {
    throw new Error('Secure sign-in could not be initialized. Please sign in again.');
  }

  const response = await sendMfaRequest(API_ENDPOINTS.mfaSend, { challengeId });
  return readResponse(response, 'Unable to send a verification code. Please try again.');
};

export const verifyMfaOtpWithContext = async (context = {}, otp = '') => {
  const challengeId = getChallengeId(context);
  const code = String(otp).trim();
  if (!/^\d{6}$/.test(code)) {
    throw new Error('Please enter a valid 6-digit code.');
  }
  if (!challengeId) {
    throw new Error('Secure sign-in could not be initialized. Please sign in again.');
  }

  const response = await sendMfaRequest(API_ENDPOINTS.mfaVerify, { challengeId, otp: code });

  const payload = await readResponse(response, 'The code is invalid or expired. Please try again.');
  return normalizeMfaSession(payload);
};
