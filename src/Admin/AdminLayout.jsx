import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Admin.css';

const navItems = [
  { label: 'Dashboard', path: '/admin/dashboard' },
  { label: 'Retailers', path: '/admin/retailers' },
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

const AdminLayout = ({ title, subtitle, currentUser = 'Store Admin', children }) => {
  const location = useLocation();

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
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`admin-nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div>
            <p className="admin-eyebrow">Enterprise admin panel</p>
            <h1>{title}</h1>
          </div>
          <div className="admin-topbar-actions">
            <button className="admin-primary-button">Export</button>
          </div>
        </header>

        {subtitle && <p className="admin-subtitle">{subtitle}</p>}
        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
};

export default AdminLayout;
