import React, { useState } from 'react';
import { APP_CONFIG } from '../../Config/appConfig';
import { cancelMfaChallenge, sendMfaOtpWithContext, verifyMfaOtpWithContext } from './mfaService';

const MfaScreen = ({ user, onVerified, onCancel }) => {
  const [otp, setOtp] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');

  const sendCode = async () => {
    setSending(true);
    setError('');
    try {
      await sendMfaOtpWithContext(user || {});
      setCodeSent(true);
    } catch (sendError) {
      setError(sendError?.message || 'Unable to send a verification code. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedOtp = otp.trim();
    if (!/^\d{6}$/.test(trimmedOtp)) {
      setError('Please enter a valid 6-digit code.');
      return;
    }

    setVerifying(true);
    setError('');
    try {
      const verification = await verifyMfaOtpWithContext(user || {}, trimmedOtp);
      const { user: verifiedProfile, ...session } = verification;
      await onVerified?.({
        ...(user || {}),
        ...(verifiedProfile || {}),
        ...session,
        mfaRequired: false,
        mfaVerified: true,
      });
    } catch (verifyError) {
      setError(verifyError?.message || 'The code is invalid or expired. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    setError('');
    try {
      await cancelMfaChallenge(user || {});
      onCancel?.();
    } catch (cancelError) {
      setError(cancelError?.message || 'Unable to cancel the verification challenge. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  if (!user) {
    return null;
  }

  const busy = sending || verifying || cancelling;
  const destination = user.mfaChallenge?.maskedDestination || 'your registered email address';

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
        <p>Your organization requires an email verification code before you can access the dashboard.</p>

        <div className="visual-stats">
          <div className="mini-stat">
            <strong>Step 1</strong>
            <span>Send a code to your email</span>
          </div>
          <div className="mini-stat">
            <strong>Step 2</strong>
            <span>Enter the one-time code</span>
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
            <span className="logo-text">Email verification</span>
          </div>
          <h1>{codeSent ? 'Enter verification code' : 'Verify your sign-in'}</h1>
          <p>
            {codeSent
              ? `Enter the 6-digit code sent to ${destination}.`
              : `Send a one-time code to ${destination} to continue.`}
          </p>
        </div>

        {error && (
          <div className="error-message" role="alert">
            <span>⚠️</span> {error}
          </div>
        )}

        {!codeSent ? (
          <button type="button" className={`login-btn ${sending ? 'loading' : ''}`} onClick={sendCode} disabled={busy}>
            {sending ? (
              <>
                <span className="spinner"></span>
                Sending code...
              </>
            ) : (
              'Send email code'
            )}
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="login-form mfa-form">
            <div className="input-group">
              <label htmlFor="mfa-otp">One-time code</label>
              <div className="input-wrapper">
                <span className="input-icon" aria-hidden="true">#</span>
                <input
                  type="text"
                  id="mfa-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  disabled={busy}
                  required
                />
              </div>
            </div>

            <button type="submit" className={`login-btn ${verifying ? 'loading' : ''}`} disabled={busy}>
              {verifying ? (
                <>
                  <span className="spinner"></span>
                  Verifying...
                </>
              ) : (
                'Verify & continue'
              )}
            </button>
            <button type="button" className="link-action" onClick={sendCode} disabled={busy}>
              {sending ? 'Sending...' : 'Resend code'}
            </button>
          </form>
        )}

        <div className="mfa-actions">
          <button type="button" className="secondary-action" onClick={handleCancel} disabled={busy}>
            {cancelling ? 'Canceling...' : 'Cancel sign-in'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MfaScreen;
