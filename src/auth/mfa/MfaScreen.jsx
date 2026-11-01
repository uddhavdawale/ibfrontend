import React, { useEffect, useMemo, useState } from 'react';
import { APP_CONFIG } from '../../Config/appConfig';
import {
  disposeMfaRuntime,
  resolveMfaContext,
  verifyMfaOtpWithContext
} from './mfaService';

const MfaScreen = ({ user, onVerified, onCancel }) => {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const mfaContext = useMemo(() => resolveMfaContext(user?.config || {}, user || {}), [user]);
  const effectivePhone = mfaContext.phone;
  const preferredChannel = mfaContext.provider === 'firebase-phone' ? 'mobile' : 'email';

  useEffect(() => {
    return () => {
      disposeMfaRuntime();
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedOtp = otp.trim();

    if (!/^\d{6}$/.test(trimmedOtp)) {
      setError('Please enter a valid 6-digit code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const verification = await verifyMfaOtpWithContext(
        { ...mfaContext, phone: effectivePhone, preferredChannel },
        trimmedOtp
      );
      onVerified?.({ ...(user || {}), config: user?.config || {}, mfaVerified: true, ...verification });
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
            <span>{APP_CONFIG.appName}</span>
          </div>
          <span className="beta-pill">Secure access</span>
        </div>

        <h1>Verify your identity before continuing.</h1>
        <p>
          Your organization requires multi-factor authentication before you can access the dashboard.
        </p>

        <div className="visual-stats">
          <div className="mini-stat">
            <strong>Step 1</strong>
            <span>{String(mfaContext.method).toUpperCase()} verification</span>
          </div>
          <div className="mini-stat">
            <strong>Step 2</strong>
            <span>Enter your OTP code</span>
          </div>
          <div className="mini-stat">
            <strong>Secure</strong>
            <span>Protected account access</span>
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
          <p>Enter the 6-digit code sent to your registered contact.</p>
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
          <button type="button" className="secondary-action" onClick={() => onCancel?.()} disabled={loading}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default MfaScreen;
