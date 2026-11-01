import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { normalizeStoreRole } from './storeRoles';
import './AccessDenied.css';

const roleToLabel = (role) => {
  const normalized = normalizeStoreRole(role);
  if (normalized === 'store_admin') return 'Store Admin';
  if (normalized === 'store_manager') return 'Store Manager';
  if (normalized === 'billing_manager') return 'Billing Manager';
  if (normalized === 'inventory_manager') return 'Inventory Manager';
  if (normalized === 'store_billing_viewer') return 'Store Billing Viewer';
  if (normalized === 'store_inventory_viewer') return 'Store Inventory Viewer';
  if (normalized === 'system_administrator') return 'System Administrator';
  if (normalized === 'audit_related') return 'Audit Manager';
  return 'Store Manager';
};

const AccessDenied = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const from = location?.state?.from || 'this page';
  const role = roleToLabel(location?.state?.role);

  return (
    <div className="access-denied-wrap">
      <div className="access-denied-card">
        <div className="access-denied-icon">🚫</div>
        <h1>Access Denied</h1>
        <p>
          Your role <strong>{role}</strong> does not have permission to open <strong>{from}</strong>.
        </p>
        <div className="access-denied-actions">
          <button type="button" className="deny-btn secondary" onClick={() => navigate('/dashboard')}>
            Go to Dashboard
          </button>
          <button type="button" className="deny-btn primary" onClick={() => navigate(-1)}>
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccessDenied;
