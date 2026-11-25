import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { APP_CONFIG } from '../Config/appConfig';
import { API_ENDPOINTS } from '../Config/api';
import './ContactPage.css';

const themeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'aurora', label: 'Aurora' }
];

const ContactPage = () => {
  const [theme, setTheme] = useState(() => localStorage.getItem('ib-theme') || 'light');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    message: ''
  });
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ib-theme', theme);
  }, [theme]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setStatus('');
    setStatusType('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSending(true);
    setStatus('');
    setStatusType('');

    try {
      const response = await fetch(API_ENDPOINTS.contact, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          message: form.message.trim(),
          website: ''
        })
      });

      let result = {};
      try {
        result = await response.json();
      } catch {
        // Error responses may use a non-JSON format.
      }

      if (!response.ok) {
        const statusMessage = response.status === 429
          ? 'Too many messages were sent. Please wait a minute and try again.'
          : response.status === 502 || response.status === 503
            ? 'We could not send your message right now. Please try again or email us directly.'
            : 'Unable to send your message. Please check your details and try again.';
        throw new Error(result.message || statusMessage);
      }

      setForm({ name: '', email: '', phone: '', message: '' });
      setStatus(result.message || "Your message has been received. We'll reply to the email address you provided.");
      setStatusType('success');
    } catch (error) {
      const message = error instanceof TypeError
        ? 'We could not connect to the contact service. Please try again or email us directly.'
        : error instanceof Error
          ? error.message
          : 'Unable to send your message. Please try again or email us directly.';
      setStatus(message);
      setStatusType('error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`contact-page theme-${theme}`}>
      <div className="contact-glow contact-glow-one" />
      <div className="contact-glow contact-glow-two" />

      <header className="contact-header">
        <nav className="contact-nav" aria-label="Main navigation">
          <Link to="/" className="contact-brand" aria-label={`${APP_CONFIG.appName} home`}>
            <span className="contact-logo">📦</span>
            <div>
              <strong>{APP_CONFIG.appName}</strong>
              <small>{APP_CONFIG.appTagline}</small>
            </div>
          </Link>

          <div className="contact-nav-actions">
            <div className="contact-theme-switcher" aria-label="Theme selector">
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
            <Link to="/" className="contact-back">Back to home</Link>
          </div>
        </nav>
      </header>

      <main className="contact-main">
        <section className="contact-intro" aria-labelledby="contact-title">
          <span className="contact-eyebrow">Talk to our team</span>
          <h1 id="contact-title">How can we help your business?</h1>
          <p>
            Questions about billing, inventory, GST records, account setup, or retail support?
            Send us a message and the right team member will get back to you.
          </p>

          <div className="contact-details">
            <a href="mailto:gurushopops@outlook.com" className="contact-detail-card">
              <span className="contact-detail-icon" aria-hidden="true">✉</span>
              <div>
                <small>Email us</small>
                <strong>gurushopops@outlook.com</strong>
              </div>
            </a>
          </div>
        </section>

        <section className="contact-form-card" aria-labelledby="form-title">
          <div className="contact-form-heading">
            <span>Send a message</span>
            <h2 id="form-title">Tell us what you need</h2>
          </div>

          <form className="contact-form" onSubmit={handleSubmit}>
            <div className="contact-field-row">
              <label>
                Your name *
                <input name="name" value={form.name} onChange={updateField} placeholder="Enter your name" autoComplete="name" maxLength="100" required />
              </label>
              <label>
                Email address *
                <input name="email" type="email" value={form.email} onChange={updateField} placeholder="you@company.com" autoComplete="email" maxLength="254" required />
              </label>
            </div>
            <label>
              Phone number
              <input name="phone" type="tel" value={form.phone} onChange={updateField} placeholder="Optional" autoComplete="tel" maxLength="32" />
            </label>
            <label>
              Message *
              <textarea name="message" value={form.message} onChange={updateField} placeholder="Share a few details about your question..." rows="5" maxLength="3000" required />
            </label>
            <label className="contact-honeypot" aria-hidden="true">
              Website
              <input name="website" tabIndex="-1" autoComplete="off" value="" readOnly />
            </label>
            <p className="contact-privacy-note">Please don’t include passwords, one-time codes, or payment card details.</p>
            {status && <p className={`contact-status ${statusType}`} role={statusType === 'error' ? 'alert' : 'status'}>{status}</p>}
            <button type="submit" className="contact-submit" disabled={sending}>
              {sending ? 'Sending…' : 'Send message'}
              {!sending && <span aria-hidden="true">→</span>}
            </button>
            <p className="contact-email-fallback">
              Prefer email? <a href="mailto:gurushopops@outlook.com">gurushopops@outlook.com</a>
            </p>
          </form>
        </section>
      </main>

      <footer className="contact-footer">
        © {APP_CONFIG.footerYear} {APP_CONFIG.appName}. Tools for Indian retailers and accounting partners.
      </footer>
    </div>
  );
};

export default ContactPage;
