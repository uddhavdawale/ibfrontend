import React, { useCallback, useEffect, useState } from 'react';
import { API_ENDPOINTS, apiFetch } from '../../Config/api';
import './WhatsAppIntegrationSettings.css';

const EMPTY_CONFIG = {
  phoneNumberId: '',
  wabaId: '',
  displayPhoneNumber: '',
  accessToken: '',
};

const readResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const WhatsAppIntegrationSettings = () => {
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [connected, setConnected] = useState(false);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadIntegration = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const response = await apiFetch(API_ENDPOINTS.whatsappIntegration, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const payload = await readResponse(response);
      if (!response.ok) {
        throw new Error(payload.message || `Unable to load integration (${response.status})`);
      }

      const integration = payload.integration || {};
      setConnected(Boolean(integration.connected));
      setTokenConfigured(Boolean(integration.tokenConfigured));
      setWebhookUrl(integration.webhookUrl || API_ENDPOINTS.whatsappWebhook);
      setConfig({
        phoneNumberId: integration.phoneNumberId || '',
        wabaId: integration.wabaId || '',
        displayPhoneNumber: integration.displayPhoneNumber || '',
        accessToken: '',
      });
    } catch (loadError) {
      setError(loadError.message || 'Unable to load WhatsApp integration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIntegration();
  }, [loadIntegration]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setConfig((current) => ({ ...current, [name]: value }));
    setMessage('');
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const response = await apiFetch(API_ENDPOINTS.whatsappIntegration, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          phoneNumberId: config.phoneNumberId.trim(),
          wabaId: config.wabaId.trim(),
          displayPhoneNumber: config.displayPhoneNumber.trim(),
          accessToken: config.accessToken,
        }),
      });
      const payload = await readResponse(response);
      if (!response.ok) {
        throw new Error(payload.message || `Unable to save integration (${response.status})`);
      }
      const integration = payload.integration || {};
      setConnected(Boolean(integration.connected));
      setTokenConfigured(Boolean(integration.tokenConfigured));
      setConfig((current) => ({ ...current, accessToken: '' }));
      setMessage('WhatsApp settings saved securely.');
    } catch (saveError) {
      setError(saveError.message || 'Unable to save WhatsApp settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect WhatsApp from this shop? New messages will no longer be processed.')) return;
    setError('');
    setMessage('');
    setDisconnecting(true);
    try {
      const response = await apiFetch(API_ENDPOINTS.whatsappIntegration, { method: 'DELETE' });
      const payload = await readResponse(response);
      if (!response.ok) {
        throw new Error(payload.message || `Unable to disconnect integration (${response.status})`);
      }
      setConnected(false);
      setTokenConfigured(false);
      setConfig(EMPTY_CONFIG);
      setMessage('WhatsApp has been disconnected.');
    } catch (disconnectError) {
      setError(disconnectError.message || 'Unable to disconnect WhatsApp.');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <section className="profile-card integrations-card" aria-labelledby="integrations-title">
      <div className="integrations-heading">
        <div>
          <h2 id="integrations-title">Integrations</h2>
          <p>Connect services to this shop. Each retailer configures their own account.</p>
        </div>
      </div>

      {error && <div className="profile-feedback profile-feedback-error" role="alert">{error}</div>}
      {message && <div className="profile-feedback profile-feedback-success" role="status">{message}</div>}

      {loading ? (
        <div className="shop-profile-loading" role="status">Loading integrations...</div>
      ) : (
        <>
          <article className="integration-provider-card">
            <header className="integration-provider-heading">
              <div>
                <span className="integration-provider-icon" aria-hidden="true">◉</span>
                <div>
                  <h3>WhatsApp Cloud API</h3>
                  <p>Securely receive and reply to messages for this shop.</p>
                </div>
              </div>
              <span className={`integration-status ${connected ? 'connected' : ''}`}>
                {connected ? 'Connected' : 'Not connected'}
              </span>
            </header>

            <form className="integration-form" onSubmit={handleSave}>
              <label>
                WhatsApp Business phone number ID
                <input
                  name="phoneNumberId"
                  value={config.phoneNumberId}
                  onChange={handleChange}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength="64"
                  required
                />
              </label>
              <label>
                WhatsApp Business Account ID
                <input
                  name="wabaId"
                  value={config.wabaId}
                  onChange={handleChange}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength="64"
                  required
                />
              </label>
              <label>
                Business WhatsApp number
                <input
                  name="displayPhoneNumber"
                  value={config.displayPhoneNumber}
                  onChange={handleChange}
                  type="tel"
                  autoComplete="tel"
                  maxLength="32"
                  placeholder="+91 98765 43210"
                  required
                />
              </label>
              <label>
                WhatsApp Cloud API access token
                <input
                  name="accessToken"
                  value={config.accessToken}
                  onChange={handleChange}
                  type="password"
                  autoComplete="new-password"
                  maxLength="4096"
                  placeholder={tokenConfigured ? 'Saved securely; enter only to replace' : 'Paste the shop’s access token'}
                  required={!tokenConfigured}
                />
                <small>The token is sent over HTTPS, encrypted by the backend, and never returned to this page.</small>
              </label>

              <small>The sender must use the active store administrator's registered phone number.</small>

              <div className="integration-webhook">
                <strong>Shared webhook callback URL</strong>
                <code>{webhookUrl || 'Configure the backend public URL to display this callback.'}</code>
                <small>Meta verifies one platform webhook. Incoming events are routed to this shop by its phone number ID.</small>
              </div>

              <div className="integration-actions">
                {connected && (
                  <button
                    className="integration-disconnect"
                    type="button"
                    onClick={handleDisconnect}
                    disabled={disconnecting || saving}
                  >
                    {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                )}
                <button className="shop-profile-save" type="submit" disabled={saving || disconnecting}>
                  {saving ? 'Saving...' : connected ? 'Save changes' : 'Connect WhatsApp'}
                </button>
              </div>
            </form>
          </article>

          <article className="integration-provider-card future-integration-card">
            <div>
              <h3>More integrations</h3>
              <p>There is room to add accounting, e-commerce, and messaging integrations here.</p>
            </div>
            <span className="integration-status">Coming later</span>
          </article>
        </>
      )}
    </section>
  );
};

export default WhatsAppIntegrationSettings;
