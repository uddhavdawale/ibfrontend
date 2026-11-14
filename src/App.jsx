import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './App.css';
import { APP_CONFIG } from './Config/appConfig';
import ProductTour from './modules/marketing/ProductTour';

const themeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'aurora', label: 'Aurora' }
];

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('ib-theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ib-theme', theme);
  }, [theme]);

  return (
    <div className={`app-landing theme-${theme}`}>
      <div className="landing-glow landing-glow-one" />
      <div className="landing-glow landing-glow-two" />

      <header className="landing-header">
        <nav className="landing-nav">
          <div className="brand-mark">
            <span className="logo-icon">📦</span>
            <div>
              <strong>{APP_CONFIG.appName}</strong>
              <small>{APP_CONFIG.appTagline}</small>
            </div>
          </div>
          <div className="nav-actions">
            <span className="nav-pill">Made for Indian retail</span>
            <span className="nav-pill muted">Stock · Billing · Reports</span>
            <div className="theme-switcher" aria-label="Theme selector">
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
            <Link to="/login" className="nav-login">Login</Link>
          </div>
        </nav>
      </header>

      <main className="landing-main">
        <section className="hero-copy">
          <div className="eyebrow">Your shop, running in sync</div>
          <h1>Everyday retail operations, made simpler.</h1>
          <p>
            Keep products and stock organized, create customer invoices, track dues, and review business reports from one workspace built for Indian retailers and their CA partners.
          </p>

          <div className="hero-actions">
            <Link to="/login" className="cta-button primary">Sign in to your workspace</Link>
            <Link to="/signup" className="cta-button secondary">Set up your account</Link>
          </div>

          <div className="proof-row">
            <div>
              <strong>01</strong>
              <span>Manage products</span>
            </div>
            <div>
              <strong>02</strong>
              <span>Bill customers</span>
            </div>
            <div>
              <strong>03</strong>
              <span>Review reports</span>
            </div>
          </div>
        </section>

        <section className="hero-panel">
          <div className="panel-card primary-card">
            <div className="card-topline">
              <span className="status-dot" />
              Your retail workspace
            </div>
            <div className="metric-stack">
              <div>
                <label>Products & stock</label>
                <strong>Know what is on hand</strong>
              </div>
              <div>
                <label>Sales & invoices</label>
                <strong>Keep every sale recorded</strong>
              </div>
            </div>
            <div className="mini-chart">
              <span style={{ height: '35%' }} />
              <span style={{ height: '56%' }} />
              <span style={{ height: '48%' }} />
              <span style={{ height: '76%' }} />
              <span style={{ height: '62%' }} />
              <span style={{ height: '92%' }} />
            </div>
          </div>

          <div className="panel-card lower-card">
            <div className="card-list-item">
              <span className="icon-badge purple">📦</span>
              <div>
                <strong>Inventory health</strong>
                <small>Keep an eye on stock levels</small>
              </div>
            </div>
            <div className="card-list-item">
              <span className="icon-badge blue">💰</span>
              <div>
                <strong>Billing flow</strong>
                <small>Create GST and non-GST bills</small>
              </div>
            </div>
            <div className="card-list-item">
              <span className="icon-badge green">📋</span>
              <div>
                <strong>GST compliance</strong>
                <small>Review your business reports</small>
              </div>
            </div>
          </div>
        </section>
      </main>

      <ProductTour />

      <section className="feature-band">
        <div className="feature-card">
          <span>📊</span>
          <h3>A clear business overview</h3>
          <p>Review sales, customer dues, and day-to-day activity from your dashboard.</p>
        </div>
        <div className="feature-card">
          <span>📦</span>
          <h3>Inventory intelligence</h3>
          <p>Organize your products and follow stock movement as you buy and sell.</p>
        </div>
        <div className="feature-card">
          <span>💳</span>
          <h3>Billing and customer dues</h3>
          <p>Create invoices, record payments, and keep customer balances close at hand.</p>
        </div>
        <div className="feature-card">
          <span>🧾</span>
          <h3>GST-ready records</h3>
          <p>Keep invoice and tax details organized for your own review and CA workflows.</p>
        </div>
      </section>

      <footer className="landing-footer">
        <p>© {APP_CONFIG.footerYear} {APP_CONFIG.appName}. Tools for Indian retailers and their accounting partners.</p>
      </footer>
    </div>
  );
}

export default App;