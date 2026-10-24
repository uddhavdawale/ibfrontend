import React, { useEffect, useMemo, useState } from 'react';
import { maskEmail, resolveMfaContext, sendMfaOtp, verifyMfaOtp } from './mfaService';

const MfaScreen = ({ user, onVerified, onCancel }) => {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const mfaContext = useMemo(() => resolveMfaContext(user?.config || {}, user || {}), [user]);

  useEffect(() => {
    if (!user) return;

    const sendCode = async () => {
      try {
        setSending(true);
        await sendMfaOtp({ username: mfaContext.username, email: mfaContext.email });
        setInfo(`A 6-digit verification code was sent to ${maskEmail(mfaContext.email || mfaContext.username)}.`);
      } catch (sendError) {
        setError(sendError?.message || 'Unable to send the verification code.');
      } finally {
        setSending(false);
      }
    };

    sendCode();
  }, [user, mfaContext.email, mfaContext.username]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedOtp = otp.trim();

    if (!/^\d{6}$/.test(trimmedOtp)) {
      setError('Please enter a valid 6-digit code.');
      return;
    }

    setLoading(true);
    setError('');
    setInfo('');

    try {
      await verifyMfaOtp({ username: mfaContext.username || user?.username || '', otp: trimmedOtp });
      onVerified?.({ ...(user || {}), config: user?.config || {}, mfaVerified: true });
    } catch (submitError) {
      setError(submitError?.message || 'MFA verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setInfo('');
    try {
      setSending(true);
      await sendMfaOtp({ username: mfaContext.username, email: mfaContext.email });
      setInfo('A fresh verification code has been sent.');
    } catch (resendError) {
      setError(resendError?.message || 'Unable to resend the code right now.');
    } finally {
      setSending(false);
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
            <span>{String(mfaContext.method).toUpperCase()} verification</span>
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
            {mfaContext.email || mfaContext.username
              ? `A 6-digit code was sent to ${maskEmail(mfaContext.email || mfaContext.username)}.`
              : 'A 6-digit verification code is required.'}
          </p>
        </div>

        {error && (
          <div className="error-message">
            <span>⚠️</span> {error}
          </div>
        )}

        {info && (
          <div className="success-message">
            <span>✓</span> {info}
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
                disabled={loading || sending}
                required
              />
            </div>
          </div>

          <button type="submit" className={`login-btn ${loading ? 'loading' : ''}`} disabled={loading || sending}>
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
          <button type="button" className="secondary-action" onClick={() => onCancel?.()} disabled={sending || loading}>
            Cancel
          </button>
          <button type="button" className="link-action" onClick={handleResend} disabled={sending || loading}>
            {sending ? 'Sending...' : 'Resend code'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MfaScreen;
