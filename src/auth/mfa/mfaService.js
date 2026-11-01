import { API_BASE_URL, API_ENDPOINTS, apiFetch } from '../../Config/api.js';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

const FIREBASE_ENV = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

let recaptchaVerifier = null;
let confirmationResult = null;
const DEFAULT_COUNTRY_CODE = String(import.meta.env.VITE_DEFAULT_COUNTRY_CODE || '+91').trim();

const hasFirebaseConfig = () => (
  Boolean(FIREBASE_ENV.apiKey) &&
  Boolean(FIREBASE_ENV.authDomain) &&
  Boolean(FIREBASE_ENV.projectId) &&
  Boolean(FIREBASE_ENV.appId)
);

const validateFirebaseConfig = () => {
  if (!hasFirebaseConfig()) {
    throw new Error('Firebase MFA is not configured. Missing VITE_FIREBASE_* environment variables.');
  }

  if (!String(FIREBASE_ENV.authDomain).includes('.')) {
    throw new Error('VITE_FIREBASE_AUTH_DOMAIN looks invalid. Use the value from Firebase SDK config (example: <project-id>.firebaseapp.com).');
  }

  if (!/^1:\d+:web:[a-zA-Z0-9]+$/.test(String(FIREBASE_ENV.appId))) {
    throw new Error('VITE_FIREBASE_APP_ID is invalid. It must match Firebase Web App ID format like 1:1234567890:web:abcdef123456.');
  }

  if (!/^\d+$/.test(String(FIREBASE_ENV.messagingSenderId || ''))) {
    throw new Error('VITE_FIREBASE_MESSAGING_SENDER_ID is invalid. Use numeric sender ID from Firebase SDK config.');
  }
};

const getFirebaseAuth = () => {
  validateFirebaseConfig();

  const app = getApps().length > 0
    ? getApps()[0]
    : initializeApp(FIREBASE_ENV);

  return getAuth(app);
};

const ensureRecaptcha = (auth, containerId = 'firebase-recaptcha-container') => {
  if (typeof window === 'undefined') {
    throw new Error('MFA can only run in a browser environment.');
  }

  if (recaptchaVerifier) return recaptchaVerifier;

  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error('reCAPTCHA container is missing. Please refresh and try again.');
  }

  recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
  });

  return recaptchaVerifier;
};

const clearRecaptcha = () => {
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
    recaptchaVerifier = null;
  }
};

const normalizePhone = (phone = '') => String(phone || '').replace(/[\s\-()]/g, '').trim();

const normalizeCountryCode = (countryCode = '') => {
  const digits = String(countryCode || '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
};

const toE164Phone = (phone = '') => {
  const normalized = normalizePhone(phone);
  if (!normalized) return '';

  if (normalized.startsWith('+')) return normalized;

  const digits = normalized.replace(/\D/g, '');
  const countryCode = normalizeCountryCode(DEFAULT_COUNTRY_CODE);
  const countryDigits = countryCode.replace('+', '');

  if (digits.length === 10 && countryDigits) {
    return `+${countryDigits}${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('0') && countryDigits) {
    return `+${countryDigits}${digits.slice(1)}`;
  }

  return normalized;
};

const isE164Phone = (phone = '') => /^\+[1-9]\d{7,14}$/.test(phone);

const canSendMobileOtp = (context = {}) => {
  const normalizedPhone = toE164Phone(context.phone || '');
  return Boolean(normalizedPhone) && isE164Phone(normalizedPhone) && hasFirebaseConfig();
};

const getBackendOtpTarget = (context = {}) => context.email || context.username || '';

const resolveMfaProvider = (payload = {}, fallbackUser = {}) => {
  const source = payload?.config || payload?.authConfig || payload?.securityConfig || payload?.security || payload?.mfa || {};
  const security = source.security || source.auth || source.mfa || {};
  const rawProvider = (
    payload?.mfaProvider ||
    payload?.provider ||
    source.mfaProvider ||
    security.provider ||
    source.provider ||
    import.meta.env.VITE_MFA_PROVIDER ||
    ''
  );

  const provider = String(rawProvider || '').toLowerCase();
  if (provider.includes('firebase') || provider.includes('phone')) return 'firebase-phone';

  const phone = (
    payload?.phone || payload?.mobile || payload?.phoneNumber ||
    fallbackUser?.phone || fallbackUser?.mobile || fallbackUser?.phoneNumber ||
    security.phone || security.mobile || source.phone || source.mobile || ''
  );

  if (phone && hasFirebaseConfig()) return 'firebase-phone';
  return 'backend-otp';
};

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
  const phone = payload?.phone || payload?.mobile || payload?.phoneNumber || fallbackUser?.phone || fallbackUser?.mobile || fallbackUser?.phoneNumber || security.phone || security.mobile || source.phone || source.mobile || '';
  const username = payload?.username || fallbackUser?.username || fallbackUser?.name || email || '';
  const provider = resolveMfaProvider(payload, fallbackUser);

  return {
    enabled,
    email,
    phone: normalizePhone(phone),
    username,
    provider,
    recaptchaContainerId: 'firebase-recaptcha-container',
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

export const maskPhone = (phone = '') => {
  const normalized = normalizePhone(phone);
  if (!normalized) return 'your phone';
  if (normalized.length <= 6) return normalized;
  const suffix = normalized.slice(-4);
  return `${normalized.slice(0, 2)}******${suffix}`;
};

const sendFirebaseOtp = async ({ phone, recaptchaContainerId }) => {
  const normalizedPhone = toE164Phone(phone);
  if (!isE164Phone(normalizedPhone)) {
    throw new Error('A valid phone number in E.164 format is required (example: +919876543210).');
  }

  const auth = getFirebaseAuth();
  const verifier = ensureRecaptcha(auth, recaptchaContainerId);
  confirmationResult = await signInWithPhoneNumber(auth, normalizedPhone, verifier);
  return { success: true, provider: 'firebase-phone' };
};

const verifyFirebaseOtp = async ({ otp }) => {
  if (!confirmationResult) {
    throw new Error('No OTP request found. Please request a new code.');
  }

  const trimmedOtp = String(otp || '').trim();
  if (!/^\d{6}$/.test(trimmedOtp)) {
    throw new Error('Please enter a valid 6-digit OTP.');
  }

  const credential = await confirmationResult.confirm(trimmedOtp);
  const idToken = await credential.user.getIdToken(true);

  return {
    success: true,
    provider: 'firebase-phone',
    firebaseUid: credential.user.uid,
    firebasePhoneNumber: credential.user.phoneNumber,
    firebaseIdToken: idToken,
  };
};

export const disposeMfaRuntime = () => {
  confirmationResult = null;
  clearRecaptcha();
};

export const sendMfaOtp = async ({ username, email } = {}, baseUrl = API_BASE_URL) => {
  const targetUsername = username || email || '';
  if (!targetUsername) {
    throw new Error('Email or username is required to send the OTP.');
  }

  const endpoint = baseUrl === API_BASE_URL ? API_ENDPOINTS.mfaSend : `${baseUrl}/api/mfa/send`;
  const response = await apiFetch(endpoint, {
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

export const sendMfaOtpWithContext = async (context = {}, baseUrl = API_BASE_URL) => {
  const channelsSent = [];
  const channelIssues = [];
  const sendResults = [];
  const preferredChannel = String(context.preferredChannel || 'any').toLowerCase();
  const shouldSendMobile = preferredChannel === 'any' || preferredChannel === 'mobile';
  const shouldSendEmail = preferredChannel === 'any' || preferredChannel === 'email';

  if (!['any', 'mobile', 'email'].includes(preferredChannel)) {
    throw new Error('Invalid OTP channel selected.');
  }

  const hasPhoneInput = Boolean(normalizePhone(context.phone || ''));
  if (shouldSendMobile && canSendMobileOtp(context)) {
    sendResults.push(
      sendFirebaseOtp({
        phone: context.phone,
        recaptchaContainerId: context.recaptchaContainerId || 'firebase-recaptcha-container',
      }).then((result) => {
        channelsSent.push('mobile');
        return result;
      })
    );
  } else if (shouldSendMobile && hasPhoneInput) {
    channelIssues.push('Mobile OTP skipped because phone format is invalid for Firebase (use +<countrycode><number>).');
  } else if (shouldSendMobile) {
    channelIssues.push('Mobile OTP skipped because no phone number is available.');
  }

  const backendTarget = getBackendOtpTarget(context);
  if (shouldSendEmail && backendTarget) {
    sendResults.push(
      sendMfaOtp({ username: backendTarget, email: context.email || backendTarget }, baseUrl)
        .then((result) => {
          channelsSent.push('email');
          return result;
        })
    );
  } else if (shouldSendEmail) {
    channelIssues.push('Email OTP skipped because no email/username is available.');
  }

  if (sendResults.length === 0) {
    throw new Error('No valid MFA channel is available for the selected destination.');
  }

  const settled = await Promise.allSettled(sendResults);
  const successfulCount = settled.filter((result) => result.status === 'fulfilled').length;

  if (successfulCount === 0) {
    const message = settled
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason?.message || String(result.reason || 'MFA send failed'))
      .join(' | ');
    throw new Error(message || 'Unable to send MFA code.');
  }

  return {
    success: true,
    channelsSent,
    channelIssues,
    partial: successfulCount !== settled.length,
  };
};

export const verifyMfaOtp = async ({ username, otp, provider } = {}, baseUrl = API_BASE_URL) => {
  if (provider === 'firebase-phone') {
    return verifyFirebaseOtp({ otp });
  }

  const targetUsername = username || '';
  const trimmedOtp = String(otp || '').trim();

  if (!targetUsername) {
    throw new Error('Username is required for MFA verification.');
  }

  if (!/^\d{6}$/.test(trimmedOtp)) {
    throw new Error('Please enter a valid 6-digit OTP.');
  }

  const endpoint = baseUrl === API_BASE_URL ? API_ENDPOINTS.mfaVerify : `${baseUrl}/api/mfa/verify`;
  const response = await apiFetch(endpoint, {
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

export const verifyMfaOtpWithContext = async (context = {}, otp = '', baseUrl = API_BASE_URL) => {
  const channels = Array.isArray(context.channelsSent) ? context.channelsSent : [];
  const preferredChannel = String(context.preferredChannel || 'any').toLowerCase();
  const errors = [];

  const mobileAvailable = channels.length === 0
    ? canSendMobileOtp(context)
    : channels.includes('mobile');

  const emailAvailable = channels.length === 0
    ? Boolean(getBackendOtpTarget(context))
    : channels.includes('email');

  if (preferredChannel === 'mobile' && !mobileAvailable) {
    throw new Error('Mobile OTP is not available for this session. Please choose email or resend OTP.');
  }

  if (preferredChannel === 'email' && !emailAvailable) {
    throw new Error('Email OTP is not available for this session. Please choose mobile or resend OTP.');
  }

  const shouldTryMobile = preferredChannel === 'any'
    ? mobileAvailable
    : preferredChannel === 'mobile';

  if (shouldTryMobile) {
    try {
      return await verifyMfaOtp({ username: context.username, otp, provider: 'firebase-phone' }, baseUrl);
    } catch (error) {
      errors.push(error?.message || 'Mobile OTP verification failed.');
    }
  }

  const shouldTryEmail = preferredChannel === 'any'
    ? emailAvailable
    : preferredChannel === 'email';

  if (shouldTryEmail) {
    try {
      const backendTarget = getBackendOtpTarget(context);
      return await verifyMfaOtp({ username: backendTarget, otp, provider: 'backend-otp' }, baseUrl);
    } catch (error) {
      errors.push(error?.message || 'Email OTP verification failed.');
    }
  }

  throw new Error(errors.filter(Boolean).join(' | ') || 'MFA verification failed. Please try again.');
};
