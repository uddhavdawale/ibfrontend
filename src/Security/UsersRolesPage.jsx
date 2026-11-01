import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINTS, apiFetch, getAuthContext } from '../Config/api';
import { STORE_ROLES } from './storeRoles';
import './UsersRolesPage.css';

const MIN_PASSWORD_LENGTH = 12;

const ROLE_OPTIONS = [
  { value: STORE_ROLES.STORE_MANAGER, label: 'Store Manager' },
  { value: STORE_ROLES.STORE_BILLING_VIEWER, label: 'Store Billing Viewer' },
  { value: STORE_ROLES.STORE_INVENTORY_VIEWER, label: 'Store Inventory Viewer' },
  { value: STORE_ROLES.STORE_ADMIN, label: 'Store Admin' },
  { value: STORE_ROLES.SYSTEM_ADMINISTRATOR, label: 'System Administrator' },
  { value: STORE_ROLES.AUDIT_RELATED, label: 'Audit Related' },
];

const ROLE_LABEL_MAP = Object.freeze({
  [STORE_ROLES.STORE_ADMIN]: 'Store Admin',
  [STORE_ROLES.STORE_MANAGER]: 'Store Manager',
  [STORE_ROLES.STORE_BILLING_VIEWER]: 'Store Billing Viewer',
  [STORE_ROLES.STORE_INVENTORY_VIEWER]: 'Store Inventory Viewer',
  [STORE_ROLES.SYSTEM_ADMINISTRATOR]: 'System Administrator',
  [STORE_ROLES.AUDIT_RELATED]: 'Audit Related',
});

const FIELD_RULES = {
  [STORE_ROLES.STORE_ADMIN]: {
    show: ['name', 'username', 'email', 'phone', 'password', 'confirmPassword', 'employeeId', 'department', 'address'],
    required: ['name', 'username', 'email', 'phone', 'password', 'confirmPassword', 'employeeId'],
  },
  [STORE_ROLES.STORE_MANAGER]: {
    show: ['name', 'username', 'email', 'phone', 'password', 'confirmPassword', 'employeeId', 'department', 'address'],
    required: ['name', 'username', 'email', 'phone', 'password', 'confirmPassword', 'employeeId'],
  },
  [STORE_ROLES.STORE_BILLING_VIEWER]: {
    show: ['name', 'username', 'email', 'phone', 'password', 'confirmPassword', 'employeeId', 'billingDeskId'],
    required: ['name', 'username', 'email', 'phone', 'password', 'confirmPassword', 'employeeId', 'billingDeskId'],
  },
  [STORE_ROLES.STORE_INVENTORY_VIEWER]: {
    show: ['name', 'username', 'email', 'phone', 'password', 'confirmPassword', 'employeeId', 'warehouseSection'],
    required: ['name', 'username', 'email', 'phone', 'password', 'confirmPassword', 'employeeId', 'warehouseSection'],
  },
  [STORE_ROLES.SYSTEM_ADMINISTRATOR]: {
    show: ['name', 'username', 'email', 'phone', 'password', 'confirmPassword', 'employeeId', 'department', 'address'],
    required: ['name', 'username', 'email', 'phone', 'password', 'confirmPassword', 'employeeId'],
  },
  [STORE_ROLES.AUDIT_RELATED]: {
    show: ['name', 'username', 'email', 'phone', 'password', 'confirmPassword', 'employeeId', 'department', 'address'],
    required: ['name', 'username', 'email', 'phone', 'password', 'confirmPassword', 'employeeId'],
  },
};

const isValidEmail = (value = '') => /.+@.+\..+/.test(String(value).trim());

const ROLE_ALIASES = Object.freeze({
  store_admin: STORE_ROLES.STORE_ADMIN,
  admin: STORE_ROLES.STORE_ADMIN,
  owner: STORE_ROLES.STORE_ADMIN,
  retailer: STORE_ROLES.STORE_ADMIN,
  shop_owner: STORE_ROLES.STORE_ADMIN,
  super_admin: STORE_ROLES.STORE_ADMIN,
  org_admin: STORE_ROLES.STORE_ADMIN,
  store_manager: STORE_ROLES.STORE_MANAGER,
  manager: STORE_ROLES.STORE_MANAGER,
  store_billing_viewer: STORE_ROLES.STORE_BILLING_VIEWER,
  store_billing_viwer: STORE_ROLES.STORE_BILLING_VIEWER,
  billing_viewer: STORE_ROLES.STORE_BILLING_VIEWER,
  store_inventory_viewer: STORE_ROLES.STORE_INVENTORY_VIEWER,
  store_inventory_viwer: STORE_ROLES.STORE_INVENTORY_VIEWER,
  inventory_viewer: STORE_ROLES.STORE_INVENTORY_VIEWER,
  system_administrator: STORE_ROLES.SYSTEM_ADMINISTRATOR,
  'system administrator': STORE_ROLES.SYSTEM_ADMINISTRATOR,
  system_admin: STORE_ROLES.SYSTEM_ADMINISTRATOR,
  sys_admin: STORE_ROLES.SYSTEM_ADMINISTRATOR,
  audit_related: STORE_ROLES.AUDIT_RELATED,
  audit: STORE_ROLES.AUDIT_RELATED,
  audit_related_role: STORE_ROLES.AUDIT_RELATED,
  audit_role: STORE_ROLES.AUDIT_RELATED,
});

const normalizeRequestedRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  return ROLE_ALIASES[normalized] || '';
};

const toDisplayRole = (role) => ROLE_LABEL_MAP[normalizeRequestedRole(role)] || 'Unknown';

const toLowerText = (value) => String(value || '').trim().toLowerCase();

const parseFieldErrors = (status, message) => {
  const normalized = toLowerText(message);
  const nextFieldErrors = {
    role: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
  };

  if (status === 409) {
    if (normalized.includes('username')) nextFieldErrors.username = message || 'Username already exists.';
    if (normalized.includes('email')) nextFieldErrors.email = message || 'Email already exists.';
    if (!nextFieldErrors.username && !nextFieldErrors.email) {
      nextFieldErrors.username = 'Username or email already exists.';
    }
    return nextFieldErrors;
  }

  if (status === 400) {
    if (normalized.includes('role')) nextFieldErrors.role = message || 'Please select a valid role.';
    if (normalized.includes('password')) nextFieldErrors.password = message || `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (normalized.includes('confirm')) nextFieldErrors.confirmPassword = message || 'Password confirmation is invalid.';
    if (normalized.includes('email')) nextFieldErrors.email = message || 'Please enter a valid email.';
    if (normalized.includes('username')) nextFieldErrors.username = message || 'Please enter a valid username.';
  }

  return nextFieldErrors;
};

const getStoreAdminIdentity = () => {
  const context = getAuthContext();
  let user = {};
  let shopProfile = {};

  try {
    user = JSON.parse(window.localStorage.getItem('user') || '{}');
  } catch {
    user = {};
  }

  try {
    shopProfile = JSON.parse(window.localStorage.getItem('shopProfile') || '{}');
  } catch {
    shopProfile = {};
  }

  const ownerName = String(
    user?.name
      || user?.ownerName
      || user?.username
      || shopProfile?.ownerName
      || shopProfile?.businessName
      || ''
  ).trim();

  return {
    tenantId: context?.tenantId ? String(context.tenantId) : '',
    ownerName,
  };
};

const UsersRolesPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState({
    role: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [createdUsers, setCreatedUsers] = useState([]);

  const [form, setForm] = useState({
    role: STORE_ROLES.STORE_MANAGER,
    name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    employeeId: '',
    department: '',
    address: '',
    billingDeskId: '',
    warehouseSection: '',
  });

  const rules = useMemo(() => FIELD_RULES[form.role] || FIELD_RULES[STORE_ROLES.STORE_MANAGER], [form.role]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError('');
    if (success) setSuccess('');
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: '' }));
    }
  };

  const validate = () => {
    const nextFieldErrors = {
      role: '',
      email: '',
      username: '',
      password: '',
      confirmPassword: '',
    };

    const normalizedRole = normalizeRequestedRole(form.role);
    if (!normalizedRole) {
      nextFieldErrors.role = 'Please select a valid role.';
      setFieldErrors(nextFieldErrors);
      return 'Please select a valid role.';
    }

    for (const key of rules.required) {
      if (!String(form[key] || '').trim()) {
        if (Object.prototype.hasOwnProperty.call(nextFieldErrors, key)) {
          nextFieldErrors[key] = `${key} is required.`;
        }
        setFieldErrors(nextFieldErrors);
        return `${key} is required.`;
      }
    }

    if (!isValidEmail(form.email)) {
      nextFieldErrors.email = 'Please enter a valid email address.';
      setFieldErrors(nextFieldErrors);
      return 'Please enter a valid email address.';
    }

    if (String(form.password || '').length < MIN_PASSWORD_LENGTH) {
      nextFieldErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
      setFieldErrors(nextFieldErrors);
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
    }

    if (form.password !== form.confirmPassword) {
      nextFieldErrors.confirmPassword = 'Password and confirm password must match.';
      setFieldErrors(nextFieldErrors);
      return 'Password and confirm password must match.';
    }

    setFieldErrors(nextFieldErrors);

    return '';
  };

  const toPayload = () => {
    const creator = getStoreAdminIdentity();

    return {
      role: normalizeRequestedRole(form.role),
      name: form.name.trim(),
      username: form.username.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      passwordHash: form.password,
      employeeId: form.employeeId.trim(),
      department: form.department.trim(),
      address: form.address.trim(),
      billingDeskId: form.billingDeskId.trim(),
      warehouseSection: form.warehouseSection.trim(),
      tenantId: creator.tenantId,
      ownerName: creator.ownerName,
    };
  };

  const submit = async (event) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setFieldErrors({
      role: '',
      email: '',
      username: '',
      password: '',
      confirmPassword: '',
    });

    try {
      const creator = getStoreAdminIdentity();
      if (!creator.tenantId) {
        throw new Error('Unable to resolve tenant ID from current store admin session. Please log in again.');
      }

      if (!creator.ownerName) {
        throw new Error('Unable to resolve store admin name for owner assignment. Please update profile or log in again.');
      }

      const response = await apiFetch(API_ENDPOINTS.signup, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload()),
      });

      const text = await response.text().catch(() => '');
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { message: text };
      }

      if (!response.ok || payload?.success === false) {
        const message = payload?.message || payload?.error || `Registration failed (${response.status})`;

        if (response.status === 401) {
          setError('Session expired. Please login again.');
          window.setTimeout(() => navigate('/login', { replace: true }), 350);
          return;
        }

        if (response.status === 403) {
          setError('You do not have permission to create users for this store.');
          return;
        }

        const nextFieldErrors = parseFieldErrors(response.status, message);
        const hasFieldError = Object.values(nextFieldErrors).some(Boolean);
        if (hasFieldError) {
          setFieldErrors(nextFieldErrors);
        }

        if (response.status === 409) {
          setError(message || 'Username or email already exists.');
          return;
        }

        if (response.status === 400) {
          setError(message || 'Please correct the highlighted fields and try again.');
          return;
        }

        throw new Error(message);
      }

      const createdUser = payload?.user || payload?.data || null;
      const fallbackRole = normalizeRequestedRole(form.role);
      setCreatedUsers((prev) => {
        const nextEntry = {
          id: createdUser?.id ?? `${Date.now()}`,
          name: String(createdUser?.name || form.name || '').trim(),
          username: String(createdUser?.username || form.username || '').trim(),
          email: String(createdUser?.email || form.email || '').trim(),
          role: String(createdUser?.role || fallbackRole || '').trim(),
          tenantId: String(createdUser?.tenantId || getStoreAdminIdentity().tenantId || '').trim(),
          ownerName: String(createdUser?.ownerName || getStoreAdminIdentity().ownerName || '').trim(),
        };

        return [nextEntry, ...prev].slice(0, 8);
      });

      setSuccess('User registered successfully.');
      setForm((prev) => ({
        ...prev,
        name: '',
        username: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
        employeeId: '',
        department: '',
        address: '',
        billingDeskId: '',
        warehouseSection: '',
      }));
    } catch (submitError) {
      setError(submitError?.message || 'Unable to register user.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="users-roles-page">
      <div className="users-roles-card">
        <div className="users-roles-head">
          <button type="button" className="back-btn" onClick={() => navigate('/dashboard')}>← Back</button>
          <h1>Users / Roles Registration</h1>
          <p>Create store users and assign role-specific access.</p>
        </div>

        {error && <div className="form-alert error">{error}</div>}
        {success && <div className="form-alert success">{success}</div>}

        <form className="users-roles-form" onSubmit={submit}>
          <label>
            User Role
            <select value={form.role} onChange={(e) => updateField('role', e.target.value)}>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {fieldErrors.role && <span className="field-error">{fieldErrors.role}</span>}
          </label>

          {rules.show.includes('name') && (
            <label>
              Full Name
              <input value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Enter full name" />
            </label>
          )}

          {rules.show.includes('username') && (
            <label>
              Username
              <input value={form.username} onChange={(e) => updateField('username', e.target.value)} placeholder="Enter username" />
              {fieldErrors.username && <span className="field-error">{fieldErrors.username}</span>}
            </label>
          )}

          {rules.show.includes('email') && (
            <label>
              Email
              <input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} placeholder="name@domain.com" />
              {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
            </label>
          )}

          {rules.show.includes('phone') && (
            <label>
              Phone
              <input value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="9876543210" />
            </label>
          )}

          {rules.show.includes('employeeId') && (
            <label>
              Employee ID
              <input value={form.employeeId} onChange={(e) => updateField('employeeId', e.target.value)} placeholder="EMP-001" />
            </label>
          )}

          {rules.show.includes('department') && (
            <label>
              Department
              <input value={form.department} onChange={(e) => updateField('department', e.target.value)} placeholder="Operations / Management" />
            </label>
          )}

          {rules.show.includes('address') && (
            <label>
              Address
              <input value={form.address} onChange={(e) => updateField('address', e.target.value)} placeholder="Store branch address" />
            </label>
          )}

          {rules.show.includes('billingDeskId') && (
            <label>
              Billing Desk ID
              <input value={form.billingDeskId} onChange={(e) => updateField('billingDeskId', e.target.value)} placeholder="BILL-DESK-01" />
            </label>
          )}

          {rules.show.includes('warehouseSection') && (
            <label>
              Warehouse Section
              <input value={form.warehouseSection} onChange={(e) => updateField('warehouseSection', e.target.value)} placeholder="Aisle / rack section" />
            </label>
          )}

          {rules.show.includes('password') && (
            <label>
              Password
              <input type="password" value={form.password} onChange={(e) => updateField('password', e.target.value)} placeholder={`Minimum ${MIN_PASSWORD_LENGTH} characters`} />
              {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
            </label>
          )}

          {rules.show.includes('confirmPassword') && (
            <label>
              Confirm Password
              <input type="password" value={form.confirmPassword} onChange={(e) => updateField('confirmPassword', e.target.value)} placeholder="Retype password" />
              {fieldErrors.confirmPassword && <span className="field-error">{fieldErrors.confirmPassword}</span>}
            </label>
          )}

          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => navigate('/dashboard')}>Cancel</button>
            <button type="submit" className="primary" disabled={loading}>{loading ? 'Creating User...' : 'Create User'}</button>
          </div>
        </form>

        <div className="created-users-panel">
          <div className="created-users-head">
            <h2>Created Users</h2>
            <span>{createdUsers.length} shown</span>
          </div>

          {createdUsers.length === 0 ? (
            <p className="created-users-empty">No users created in this session yet.</p>
          ) : (
            <div className="created-users-list" role="table" aria-label="Recently created users">
              {createdUsers.map((entry) => (
                <div className="created-users-row" key={`${entry.id}-${entry.username}`} role="row">
                  <div role="cell"><strong>{entry.name || '-'}</strong></div>
                  <div role="cell">{entry.username || '-'}</div>
                  <div role="cell">{toDisplayRole(entry.role)}</div>
                  <div role="cell">{entry.email || '-'}</div>
                  <div role="cell">Tenant: {entry.tenantId || '-'}</div>
                  <div role="cell">Owner: {entry.ownerName || '-'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UsersRolesPage;
