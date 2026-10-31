import React, { useEffect, useState } from 'react';
import './Login.css';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, setAccessToken } from '../Config/api';
import { resolveMfaContext } from '../auth/mfa/mfaService';
import logger from '../utils/logger';

const themeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'aurora', label: 'Aurora' }
];

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

const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    rememberMe: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('ib-theme') || 'light');

  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ib-theme', theme);
  }, [theme]);
  
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

  try {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        username: formData.username,
        password: btoa(formData.password),
        email: formData.username.includes('@') ? formData.username : `${formData.username}@example.com`,
        role: 'ADMIN'
      }),
    });

    const responseText = await response.text();
    let data = {};
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = { message: responseText };
    }

    const accessToken = data.accessToken || data.token;
    const userPayload = data.user || {};
    const username = userPayload.username || userPayload.name || data.username || formData.username;
    const backendConfig = {
      ...(await readBackendConfig()),
      ...(data.config || data.authConfig || data.securityConfig || {}),
      ...(userPayload.config || userPayload.security || {})
    };
    const mfaContext = resolveMfaContext({ ...data, ...userPayload, config: backendConfig }, { username, email: userPayload.email || data.email || '' });
    const resolvedUser = {
      id: userPayload.id ?? data.id ?? null,
      username,
      name: userPayload.name || username,
      email: userPayload.email || data.email || '',
      role: userPayload.role || data.role || 'ADMIN',
      config: backendConfig,
      mfaRequired: mfaContext.enabled
    };

    if (response.ok && data.success !== false) {
      if (mfaContext.enabled) {
        logger.info('Login succeeded; MFA required before final session activation');
        setAccessToken(null);
        localStorage.removeItem('auth_logout');
        localStorage.setItem('username', username);
        onLogin({ ...resolvedUser, mfaRequired: true });
        return;
      }

      if (accessToken) {
        logger.info('Login succeeded');
        setAccessToken(accessToken);
        localStorage.removeItem('auth_logout');
        if (data.refreshToken) sessionStorage.setItem('refreshToken', data.refreshToken);
        localStorage.setItem('username', username);
        localStorage.setItem('user', JSON.stringify(resolvedUser));
        onLogin(resolvedUser);
        return;
      }
    }

    setError(data.message || (response.status === 401
      ? 'Invalid username or password.'
      : `Login failed (${response.status}). Please try again.`));
  } catch (error) {
    logger.error('Login request failed', error);
    setError('Backend error. Check console.');
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
            <span>Veyra</span>
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

        <h1>Finance operations that feel premium, secure, and fast.</h1>
        <p>
          Built for retailers, finance teams, and CA partners to manage inventory, invoicing, GST compliance, and collections from one modern workspace.
        </p>

        <div className="visual-stats">
          <div className="mini-stat">
            <strong>₹18.4L</strong>
            <span>Monthly sales</span>
          </div>
          <div className="mini-stat">
            <strong>2.6L</strong>
            <span>Receivables</span>
          </div>
          <div className="mini-stat">
            <strong>98.6%</strong>
            <span>Accuracy</span>
          </div>
        </div>

        <div className="feature-list">
          <div>📦 Stock monitoring</div>
          <div>💰 Billing control</div>
          <div>📋 GST readiness</div>
        </div>
      </div>

      <div className="login-card">
        <div className="login-header">
          <div className="logo">
            <span className="logo-icon">📦</span>
            <span className="logo-text">Veyra</span>
          </div>
          <h1>Welcome back</h1>
          <p>Sign in to your retail finance dashboard</p>
        </div>

        {error && (
          <div className="error-message">
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label>Username</label>
            <div className="input-wrapper">
              <span className="input-icon">👤</span>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Enter username"
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label>Password</label>
            <div className="input-wrapper">
              <span className="input-icon">🔒</span>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter password"
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="form-options">
            <label className="checkbox-container">
              <input
                type="checkbox"
                name="rememberMe"
                checked={formData.rememberMe}
                onChange={handleChange}
              />
              <span className="checkmark"></span>
              Remember me
            </label>
            <a href="#" className="forgot-password">Forgot Password?</a>
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

        <div className="demo-info">
          <p><strong>Demo access:</strong> admin / admin123</p>
        </div>

        <div className="signup-section">
          <p className="signup-text">New to Veyra?</p>
          <button 
            className="signup-btn"
            type="button"
            onClick={() => navigate('/signup')}
          >
            ➕ Create retailer / partner account
          </button>
        </div>

        <div className="login-footer">
          <p>© 2026 Veyra. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
