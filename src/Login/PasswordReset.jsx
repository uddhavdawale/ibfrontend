import React, { useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { APP_CONFIG } from '../Config/appConfig';
import { resetPassword } from '../auth/passwordRecoveryService';
import './Login.css';

const PasswordReset = () => {
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const lastHandledHash = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  useLayoutEffect(() => {
    if (lastHandledHash.current === location.hash) return;
    lastHandledHash.current = location.hash;

    const url = new URL(window.location.href);
    const resetToken = new URLSearchParams(location.hash.slice(1)).get('resetToken') || '';
    url.hash = '';
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);

    if (resetToken) {
      setToken(resetToken);
      setError('');
    } else {
      setToken('');
      setError('This password reset link is invalid or expired. Request a new one.');
    }
  }, [location.hash, location.pathname, location.search]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (newPassword.length < 12 || newPassword.length > 128) {
      setError('Choose a password between 12 and 128 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    if (!token) {
      setError('This password reset link is invalid or expired. Request a new one.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setToken('');
      setNewPassword('');
      setConfirmPassword('');
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } catch (resetError) {
      if (resetError?.code === 'invalid-reset-link') {
        setError(resetError.message);
        setToken('');
        setNewPassword('');
        setConfirmPassword('');
      } else if (resetError instanceof TypeError) {
        setError('Network error. Check your connection and try again.');
      } else {
        setError(resetError?.message || 'Unable to reset your password right now. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell theme-light">
      <main className="login-card">
        <header className="login-header">
          <div className="logo">
            <span className="logo-icon" aria-hidden="true">📦</span>
            <span className="logo-text">{APP_CONFIG.appName}</span>
          </div>
          <h1>Reset your password</h1>
          <p>Choose a new password to secure your account.</p>
        </header>

        {error && (
          <div className="error-message" role="alert">
            <span aria-hidden="true">⚠️</span> {error}
          </div>
        )}

        {token ? (
          <form onSubmit={handleSubmit} className="login-form" noValidate>
            <div className="input-group">
              <label htmlFor="reset-new-password">New password</label>
              <div className="input-wrapper">
                <span className="input-icon" aria-hidden="true">🔒</span>
                <input
                  type="password"
                  id="reset-new-password"
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
              <label htmlFor="reset-confirm-password">Confirm new password</label>
              <div className="input-wrapper">
                <span className="input-icon" aria-hidden="true">🔒</span>
                <input
                  type="password"
                  id="reset-confirm-password"
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

            <button type="submit" className={`login-btn ${loading ? 'loading' : ''}`} disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" aria-hidden="true"></span>
                  Updating password...
                </>
              ) : 'Update password'}
            </button>
            <Link className="link-action" to="/login">Back to sign in</Link>
          </form>
        ) : (
          <div className="login-form">
            <Link className="link-action" to="/forgot-password">Request a new reset link</Link>
            <Link className="link-action" to="/login">Back to sign in</Link>
          </div>
        )}
      </main>
    </div>
  );
};

export default PasswordReset;
