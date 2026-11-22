import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearAuthState, emitAuthLogout } from '../Config/api.js';
import './Admin.css';

const navItems = [
  { label: 'Dashboard', path: '/admin/dashboard' },
  { label: 'HSN/SAC GST Rates', path: '/admin/hsn-tax-rates' },
  { label: 'Retailers', path: '/admin/retailers' },
  { label: 'Organizations', path: '/admin/organizations' },
  { label: 'Signup Approvals', path: '/admin/signup-approvals' },
  { label: 'Users', path: '/admin/users' },
  { label: 'Audit Logs', path: '/admin/audit-logs' },
  { label: 'Reports', path: '/admin/reports' },
];

export const StatusBadge = ({ status = 'Pending' }) => {
  const normalized = String(status).trim().toLowerCase();
  const palette = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger',
    blocked: 'danger',
    'more info required': 'info',
    disabled: 'muted',
    deleted: 'muted',
    active: 'success',
    suspended: 'warning',
    inactive: 'muted',
  };

  return <span className={`admin-status admin-status-${palette[normalized] || 'neutral'}`}>{status}</span>;
};

const AdminLayout = ({ title, subtitle, currentUser = 'Store Admin', children, isPlatformAdmin = true, onLogout, onRefresh }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const visibleNavItems = isPlatformAdmin ? navItems : [];

  const handleLogout = () => {
    if (typeof onLogout === 'function') {
      onLogout();
      return;
    }
    clearAuthState();
    emitAuthLogout();
    navigate('/login', { replace: true });
  };

  const handleRefresh = () => {
    if (typeof onRefresh === 'function') {
      onRefresh();
    }
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand-block">
          <div className="admin-brand-mark">IB</div>
          <div>
            <div className="admin-brand-name">Retail Admin</div>
            <small>{currentUser}</small>
          </div>
        </div>

        <nav className="admin-nav">
          {visibleNavItems.length > 0 ? visibleNavItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`admin-nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          )) : (
            <div className="muted-text">Platform admin access required.</div>
          )}
        </nav>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div>
            <p className="admin-eyebrow">Enterprise admin panel</p>
            <h1>{title}</h1>
          </div>
          <div className="admin-topbar-actions">
            <button
              type="button"
              className="tiny-refresh-btn"
              onClick={handleRefresh}
              aria-label="Refresh page data"
              title="Refresh page data"
            >
              ↻
            </button>
            <button className="admin-primary-button">Export</button>
            <button type="button" className="admin-secondary-button" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        {subtitle && <p className="admin-subtitle">{subtitle}</p>}
        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
};

export default AdminLayout;
