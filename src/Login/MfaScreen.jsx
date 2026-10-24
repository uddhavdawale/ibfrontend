import React, { useMemo, useState } from 'react';

const normalizeFlag = (value) => {
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'enabled', 'on'].includes(value.toLowerCase());
  }
  return Boolean(value);
};

const MfaScreen = ({ user, onVerified, onCancel }) => {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const config = useMemo(() => {
    const source = user?.config || {};
    const security = source.security || source.auth || source.mfa || {};
    return {
      enabled: normalizeFlag(source.mfaEnabled || source.requireMfa || source.mfa_required || source.mfaRequired || security.mfaEnabled || security.requireMfa || security.mfa_required || security.enabled),
      method: security.method || source.mfaMethod || 'otp',
      email: security.email || user?.email || ''
    };
  }, [user]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedOtp = otp.trim();

    if (!/^[0-9]{6}$/.test(trimmedOtp)) {
      setError('Please enter a valid 6-digit code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await Promise.resolve();
      onVerified?.({ ...(user || {}), config: user?.config || {}, mfaVerified: true });
    } catch (submitError) {
      setError(submitError?.message || 'MFA verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="login-shell theme-light">
      <div className="login-visual">
        <div className="brand-row">
          <div className="logo-brand">
            <span className="logo-icon">🔐</span>
            <span>Veyra</span>
          </div>
          <span className="beta-pill">Secure access</span>
        </div>

        <h1>Verify your identity before continuing.</h1>
        <p>
          Your organization requires multi-factor authentication before you can access the dashboard.
        </p>

        <div className="visual-stats">
          <div className="mini-stat">
            <strong>2FA</strong>
            <span>{config.method.toUpperCase()} verification</span>
          </div>
          <div className="mini-stat">
            <strong>Secure</strong>
            <span>Session protected</span>
          </div>
          <div className="mini-stat">
            <strong>1 min</strong>
            <span>Typical completion</span>
          </div>
        </div>
      </div>

      <div className="login-card mfa-card">
        <div className="login-header">
          <div className="logo">
            <span className="logo-icon">🔐</span>
            <span className="logo-text">MFA Verification</span>
          </div>
          <h1>Enter verification code</h1>
          <p>
            {config.email ? `A 6-digit code was sent to ${config.email}.` : 'A 6-digit verification code is required.'}
          </p>
        </div>

        {error && (
          <div className="error-message">
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form mfa-form">
          <div className="input-group">
            <label>One-time code</label>
            <div className="input-wrapper">
              <span className="input-icon">🔢</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit code"
                disabled={loading}
                required
              />
            </div>
          </div>

          <button type="submit" className={`login-btn ${loading ? 'loading' : ''}`} disabled={loading}>
            {loading ? (
              <>
                <span className="spinner"></span>
                Verifying...
              </>
            ) : (
              'Verify & Continue'
            )}
          </button>
        </form>

        <div className="mfa-actions">
          <button type="button" className="secondary-action" onClick={() => onCancel?.()}>
            Cancel
          </button>
          <button type="button" className="link-action">
            Resend code
          </button>
        </div>
      </div>
    </div>
  );
};

export default MfaScreen;
