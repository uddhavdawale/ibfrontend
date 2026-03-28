import React from 'react';
import { Link } from 'react-router-dom';
import './App.css';

function App() {
  return (
    <div className="app-landing">
      <header className="landing-header">
        <div className="logo">
          <span className="logo-icon">📦</span>
          <h1>Inventory & Billing Platform</h1>
        </div>
        <p>Professional dashboard for inventory management & billing</p>
      </header>

      <main className="landing-main">
        <div className="login-promo">
          <h2>Get Started</h2>
          <p>Login to access your dashboard</p>
          <Link to="/login" className="cta-button">
            Login Now →
          </Link>
        </div>

        <div className="features">
          <div className="feature">
            <span>📊</span>
            <h3>Real-time Dashboard</h3>
            <p>Sales, inventory, and metrics at a glance</p>
          </div>
          <div className="feature">
            <span>📦</span>
            <h3>Inventory Management</h3>
            <p>Track stock, reorder, and manage products</p>
          </div>
          <div className="feature">
            <span>💰</span>
            <h3>Billing & Payments</h3>
            <p>Manage invoices and track payments</p>
          </div>
        </div>
      </main>

      <footer className="landing-footer">
        <p>&copy; 2026 Inventory & Billing Platform</p>
      </footer>
    </div>
  );
}

export default App;