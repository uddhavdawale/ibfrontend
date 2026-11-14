import React, { useEffect, useState } from 'react';
import './Login.css';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL, setAccessToken } from '../Config/api';
import { APP_CONFIG } from '../Config/appConfig';
import { resolveMfaContext } from '../auth/mfa/mfaService';
import logger from '../utils/logger';
import { buildLoginRequest } from '../utils/cryptoUtil';
import { normalizeStoreRole } from '../Security/storeRoles';
import ProductTour from '../modules/marketing/ProductTour';
import { requestPasswordReset, resetPassword } from '../auth/passwordRecoveryService';

const themeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'aurora', label: 'Aurora' }
];

const isMfaMessage = (message = '') => {
  const normalized = String(message || '').toLowerCase();
  if (!normalized) return false;

  const mentionsMfa = /\bmfa\b|\botp\b|two[- ]factor|verification code/.test(normalized);
  const impliesChallenge = /required|verify|verification|pending|challenge|needed/.test(normalized);
  return mentionsMfa && impliesChallenge;
};

const isPendingApprovalResponse = (data = {}) => {
  const statusFields = ['approvalStatus', 'accountStatus', 'retailerStatus', 'userStatus', 'status'];
  const payloads = [data, data.user].filter(Boolean);
  const pendingStatuses = new Set([
    'pending',
    'pending approval',
    'pending_approval',
    'awaiting approval',
    'awaiting_approval',
    'under review',
    'under_review'
  ]);
  const statusMatch = payloads.some((payload) =>
    statusFields.some((field) =>
      pendingStatuses.has(String(payload[field] || '').trim().toLowerCase())
    )
  );
  const message = [data.message, data.error, data.details]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return statusMatch || /pending (?:admin(?:istrator)? )?approval|awaiting (?:admin(?:istrator)? )?approval|under review|not yet approved/.test(message);
};

const resolveMfaChallenge = (data = {}, user = {}) => {
  const challenge = data.mfaChallenge ||
    data.mfa_challenge ||
    data.challenge ||
    data.mfa ||
    data.data?.mfaChallenge ||
    data.data?.mfa_challenge ||
    data.data?.challenge ||
    data.data?.mfa ||
    user.mfaChallenge ||
    {};
  const challengeId = challenge.challengeId ||
    challenge.challenge_id ||
    challenge.id ||
    data.mfaChallengeId ||
    data.mfa_challenge_id ||
    data.challengeId ||
    data.challenge_id ||
    data.mfa?.challengeId ||
    data.mfa?.challenge_id ||
    data.mfa?.id ||
    data.data?.mfaChallengeId ||
    data.data?.mfa_challenge_id ||
    data.data?.challengeId ||
    data.data?.challenge_id ||
    data.data?.mfa?.challengeId ||
    data.data?.mfa?.challenge_id ||
    data.data?.mfa?.id ||
    user.mfaChallengeId ||
    '';

  return {
    challengeId: String(challengeId).trim(),
    maskedDestination: challenge.maskedDestination ||
      challenge.maskedEmail ||
      data.maskedDestination ||
      data.data?.maskedDestination ||
      data.mfa?.maskedDestination ||
      data.data?.mfa?.maskedDestination ||
      '',
  };
};

const readBackendConfig = async () => {
  try {
    const response = await fetch('/config.json', { cache: 'no-store' });
    if (!response.ok) return {};
    const config = await response.json();
    return config || {};
  } catch (error) {
    logger.warn('Backend config load failed; continuing with defaults', error);
    return {};
  }
};

const getPasswordResetToken = (location) => {
  const searchParams = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.slice(1));
  return searchParams.get('resetToken') ||
    searchParams.get('token') ||
    hashParams.get('resetToken') ||
    hashParams.get('token') ||
    '';
};

const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    rememberMe: false
  });
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(() => {
    if (getPasswordResetToken(location) || location.pathname === '/reset-password') return 'reset';
    return location.pathname === '/forgot-password' ? 'forgot' : 'login';
  });
  const [recoveryEmail, setRecoveryEmail] = useState(location.state?.email || '');
  const [recoveryToken, setRecoveryToken] = useState(() => getPasswordResetToken(location));
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('ib-theme') || 'light');

  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ib-theme', theme);
  }, [theme]);

  useEffect(() => {
    const resetToken = getPasswordResetToken(location);
    const resetRoute = location.pathname === '/reset-password';

    if (resetToken) {
      setRecoveryToken(resetToken);
      setRecoveryMode('reset');
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('resetToken');
      cleanUrl.searchParams.delete('token');
      cleanUrl.hash = '';
      window.history.replaceState(window.history.state, '', `${cleanUrl.pathname}${cleanUrl.search}`);
    } else if (resetRoute) {
      setRecoveryToken('');
      setRecoveryMode('reset');
    } else if (location.pathname === '/forgot-password') {
      setRecoveryMode('forgot');
      setRecoveryEmail(location.state?.email || '');
      setRecoveryToken('');
    } else if (location.pathname === '/login' && !window.location.hash) {
      setRecoveryMode('login');
      setRecoveryToken('');
    }
    setError('');
    setRecoveryMessage(location.state?.passwordReset
      ? 'Your password has been reset. Sign in with your new password.'
      : '');
    if (resetRoute && !resetToken) {
      setError('This password reset link is invalid or expired. Request a new one.');
    }
  }, [location.pathname, location.search, location.hash, location.state]);
  
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);
  setError('');
  setRecoveryMessage('');

  try {
    const trimmedUsername = formData.username.trim();
    const loginRequestBody = await buildLoginRequest({
      username: trimmedUsername,
      password: formData.password,
      ...(trimmedUsername.includes('@') ? { email: trimmedUsername } : {}),
      role: 'store_manager'
    });

    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(loginRequestBody),
    });

    const responseText = await response.text();
    let data = {};
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = { message: responseText };
    }

    const accessToken = data.accessToken || data.token || data.user?.accessToken || data.user?.token;
    const userPayload = data.user || {};
    const username = userPayload.username || userPayload.userName || data.username || trimmedUsername;
    const displayName = userPayload.name || userPayload.ownerName || userPayload.businessName || username;
    const backendConfig = {
      ...(await readBackendConfig()),
      ...(data.config || data.authConfig || data.securityConfig || {}),
      ...(userPayload.config || userPayload.security || {})
    };
    const mfaContext = resolveMfaContext({ ...data, ...userPayload, config: backendConfig }, { username, email: userPayload.email || data.email || '' });
    const resolvedUser = {
      id: userPayload.id ?? data.id ?? null,
      username,
      name: displayName,
      email: userPayload.email || data.email || '',
      phone: userPayload.phone || data.phone || userPayload.mobile || data.mobile || '',
          role: normalizeStoreRole(userPayload.role || data.role),
      config: backendConfig,
      mfaRequired: mfaContext.enabled
    };

    const message = data.message || data.error || '';
    const mfaRequiredByMessage = isMfaMessage(message);

    if ((!response.ok || data.success === false) && isPendingApprovalResponse(data)) {
      setError('Your account is pending admin approval. You can sign in once an administrator approves it.');
      return;
    }

    const successfulLogin = response.ok && data.success !== false;
    const mfaChallenge = resolveMfaChallenge(data, userPayload);
    const challengeReturned = Boolean(mfaChallenge.challengeId);
    const requiresMfa = mfaContext.enabled || mfaRequiredByMessage || challengeReturned;

    if (requiresMfa && (successfulLogin || challengeReturned || mfaRequiredByMessage)) {
      if (!challengeReturned) {
        setError('Your account requires email verification, but the sign-in challenge was not returned. Please try again or contact support.');
        return;
      }

      logger.info('Login requires MFA challenge');
      localStorage.removeItem('auth_logout');
      onLogin({
        ...resolvedUser,
        mfaRequired: true,
        mfaChallenge: {
          challengeId: mfaChallenge.challengeId,
          maskedDestination: mfaChallenge.maskedDestination,
        },
      });
      return;
    }

    if (response.ok && data.success !== false) {
      if (accessToken) {
        logger.info('Login succeeded');
        setAccessToken(accessToken);
        localStorage.removeItem('auth_logout');
        if (data.refreshToken) sessionStorage.setItem('refreshToken', data.refreshToken);
        else sessionStorage.removeItem('refreshToken');
        localStorage.setItem('username', username);
        localStorage.setItem('user', JSON.stringify(resolvedUser));
        onLogin(resolvedUser);
        return;
      }
    }

    setError(message || (response.status === 401
      ? 'Invalid username or password.'
      : `Login failed (${response.status}). Please try again.`));
  } catch (error) {
    logger.error('Login request failed', error);
    setError('Unable to sign in right now. Please try again.');
  } finally {
    setLoading(false);
  }
};

  const handleRecoverySubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setRecoveryMessage('');

    try {
      if (recoveryMode === 'forgot') {
        await requestPasswordReset(recoveryEmail);
        setRecoveryMessage('If an account matches that email, password reset instructions will arrive shortly.');
        return;
      }

      if (!recoveryToken) {
        setError('This password reset link is invalid or expired. Request a new one.');
        return;
      }
      if (newPassword.length < 12 || newPassword.length > 128) {
        setError('Choose a password between 12 and 128 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('The passwords do not match.');
        return;
      }

      await resetPassword(recoveryToken, newPassword);
      setRecoveryMode('login');
      setRecoveryToken('');
      setNewPassword('');
      setConfirmPassword('');
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } catch (recoveryError) {
      setError(recoveryError instanceof TypeError
        ? 'Network error. Check your connection and try again.'
        : recoveryError?.message || 'Unable to complete the request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`login-shell theme-${theme}`}>
      <div className="login-visual">
        <div className="brand-row">
          <div className="logo-brand">
            <span className="logo-icon">📦</span>
            <span>{APP_CONFIG.appName}</span>
          </div>
          <div className="header-actions">
            <div className="login-theme-switcher" aria-label="Theme selector">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={theme === option.value ? 'theme-option active' : 'theme-option'}
                  onClick={() => setTheme(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <span className="beta-pill">CA + Retail</span>
          </div>
        </div>

        <h1>Run your shop from one connected workspace.</h1>
        <p>
          Keep stock, sales, customer balances, and business reports together with {APP_CONFIG.appName}.
        </p>

        <div className="feature-list">
          <div>Product & stock management</div>
          <div>GST and non-GST billing</div>
          <div>Customer dues and reports</div>
        </div>
        <ProductTour compact />
      </div>

      <div className="login-card">
        <div className="login-header">
          <div className="logo">
            <span className="logo-icon">📦</span>
            <span className="logo-text">{APP_CONFIG.appName}</span>
          </div>
          <h1>{recoveryMode === 'login' ? 'Welcome back' : recoveryMode === 'forgot' ? 'Forgot password?' : 'Reset your password'}</h1>
          <p>
            {recoveryMode === 'login'
              ? "Sign in to manage your shop's stock, sales, and customers."
              : recoveryMode === 'forgot'
                ? 'Enter your account email and we will send reset instructions if it matches an account.'
                : 'Choose a new password to secure your account.'}
          </p>
        </div>

        {error && (
          <div className="error-message" role="alert">
            <span>⚠️</span> {error}
          </div>
        )}

        {recoveryMessage && (
          <div className="success-message" role="status" aria-live="polite">
            {recoveryMessage}
          </div>
        )}

        {recoveryMode === 'login' ? (
        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label htmlFor="login-username">Username or email</label>
            <div className="input-wrapper">
              <span className="input-icon">👤</span>
              <input
                type="text"
                id="login-username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Enter username or email"
                disabled={loading}
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="login-password">Password</label>
            <div className="input-wrapper">
              <span className="input-icon">🔒</span>
              <input
                type="password"
                id="login-password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter password"
                disabled={loading}
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          <div className="password-recovery-row">
            <Link
              className="forgot-password"
              to="/forgot-password"
              state={{ email: formData.username.includes('@') ? formData.username.trim() : '' }}
            >
              Forgot your password?
            </Link>
          </div>

          <div className="form-options">
            <label className="checkbox-container" htmlFor="remember-me">
              <input
                type="checkbox"
                id="remember-me"
                name="rememberMe"
                checked={formData.rememberMe}
                onChange={handleChange}
              />
              <span className="checkmark" aria-hidden="true"></span>
              Remember me
            </label>
          </div>

          <button 
            type="submit" 
            className={`login-btn ${loading ? 'loading' : ''}`}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Signing In...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
        ) : (
          <form onSubmit={handleRecoverySubmit} className="login-form">
            {recoveryMode === 'forgot' ? (
              <div className="input-group">
                <label htmlFor="recovery-email">Account email</label>
                <div className="input-wrapper">
                  <span className="input-icon" aria-hidden="true">@</span>
                  <input
                    type="email"
                    id="recovery-email"
                    value={recoveryEmail}
                    onChange={(event) => setRecoveryEmail(event.target.value)}
                    placeholder="name@example.com"
                    autoComplete="email"
                    maxLength={254}
                    disabled={loading}
                    required
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="input-group">
                  <label htmlFor="new-password">New password</label>
                  <div className="input-wrapper">
                    <span className="input-icon" aria-hidden="true">🔒</span>
                    <input
                      type="password"
                      id="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      disabled={loading}
                      required
                    />
                  </div>
                  <span className="helper-text">Use 12 to 128 characters.</span>
                </div>
                <div className="input-group">
                  <label htmlFor="confirm-password">Confirm new password</label>
                  <div className="input-wrapper">
                    <span className="input-icon" aria-hidden="true">🔒</span>
                    <input
                      type="password"
                      id="confirm-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      disabled={loading}
                      required
                    />
                  </div>
                </div>
              </>
            )}
            <button type="submit" className={`login-btn ${loading ? 'loading' : ''}`} disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner"></span>
                  {recoveryMode === 'forgot' ? 'Sending...' : 'Updating password...'}
                </>
              ) : (
                recoveryMode === 'forgot' ? 'Send reset instructions' : 'Update password'
              )}
            </button>
            <Link className="link-action" to="/login">
              Back to sign in
            </Link>
            {recoveryMode === 'reset' && (
              <Link className="link-action" to="/forgot-password">
                Request a new reset link
              </Link>
            )}
          </form>
        )}

        {recoveryMode === 'login' && <div className="signup-section">
          <p className="signup-text">New to {APP_CONFIG.appName}?</p>
          <button 
            className="signup-btn"
            type="button"
            onClick={() => navigate('/signup')}
          >
            ➕ Create retailer / partner account
          </button>
        </div>}

        <div className="login-footer">
          <p>© {APP_CONFIG.footerYear} {APP_CONFIG.appName}. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
