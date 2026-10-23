import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './App.css';

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
              <strong>Veyra</strong>
              <small>CA + Retail Suite</small>
            </div>
          </div>
          <div className="nav-actions">
            <span className="nav-pill">GST Ready</span>
            <span className="nav-pill muted">Retail Ops</span>
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
          <div className="eyebrow">Built for modern finance teams</div>
          <h1>Smarter inventory, billing, and GST operations for retailers and CAs.</h1>
          <p>
            Manage stock movement, invoice flows, receivables, and compliance from one elegant workspace designed for fast-moving businesses and trusted advisory teams.
          </p>

          <div className="hero-actions">
            <Link to="/login" className="cta-button primary">Access dashboard</Link>
            <Link to="/signup" className="cta-button secondary">Create account</Link>
          </div>

          <div className="proof-row">
            <div>
              <strong>12k+</strong>
              <span>Invoices processed</span>
            </div>
            <div>
              <strong>99.2%</strong>
              <span>Data accuracy</span>
            </div>
            <div>
              <strong>24/7</strong>
              <span>Monitoring</span>
            </div>
          </div>
        </section>

        <section className="hero-panel">
          <div className="panel-card primary-card">
            <div className="card-topline">
              <span className="status-dot" />
              Live operational snapshot
            </div>
            <div className="metric-stack">
              <div>
                <label>Monthly sales</label>
                <strong>₹18.4L</strong>
              </div>
              <div>
                <label>Pending collections</label>
                <strong>₹2.6L</strong>
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
                <small>8 low-stock alerts</small>
              </div>
            </div>
            <div className="card-list-item">
              <span className="icon-badge blue">💰</span>
              <div>
                <strong>Billing flow</strong>
                <small>42 invoices this week</small>
              </div>
            </div>
            <div className="card-list-item">
              <span className="icon-badge green">📋</span>
              <div>
                <strong>GST compliance</strong>
                <small>2 filings ready</small>
              </div>
            </div>
          </div>
        </section>
      </main>

      <section className="feature-band">
        <div className="feature-card">
          <span>📊</span>
          <h3>Real-time dashboards</h3>
          <p>Track sales, cash flow, and operational metrics across retail branches and partner accounts.</p>
        </div>
        <div className="feature-card">
          <span>📦</span>
          <h3>Inventory intelligence</h3>
          <p>Monitor stock health, reorder thresholds, and product movement with actionable alerts.</p>
        </div>
        <div className="feature-card">
          <span>💳</span>
          <h3>Billing + collections</h3>
          <p>Prepare invoices, reconcile payments, and reduce delays in customer follow-up.</p>
        </div>
        <div className="feature-card">
          <span>🧾</span>
          <h3>GST / CA workflows</h3>
          <p>Keep filing summaries, taxable values, and reporting aligned with compliance calendars.</p>
        </div>
      </section>

      <footer className="landing-footer">
        <p>© 2026 Veyra. Designed for retailers, finance teams, and CA partners.</p>
      </footer>
    </div>
  );
}

export default App;