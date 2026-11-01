import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINTS, apiFetch } from '../Config/api';
import { STORE_ROLES } from './storeRoles';
import './StoreUsersPage.css';

const ROLE_OPTIONS = [
  STORE_ROLES.STORE_ADMIN,
  STORE_ROLES.STORE_MANAGER,
  STORE_ROLES.STORE_BILLING_VIEWER,
  STORE_ROLES.STORE_INVENTORY_VIEWER,
];

const ROLE_LABELS = {
  [STORE_ROLES.STORE_ADMIN]: 'Store Admin',
  [STORE_ROLES.STORE_MANAGER]: 'Store Manager',
  [STORE_ROLES.STORE_BILLING_VIEWER]: 'Store Billing Viewer',
  [STORE_ROLES.STORE_INVENTORY_VIEWER]: 'Store Inventory Viewer',
};

const toRoleLabel = (role) => ROLE_LABELS[String(role || '').trim().toLowerCase()] || String(role || 'Unknown');

const parseUsersPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.users)) return payload.users;
  if (Array.isArray(payload?.data?.users)) return payload.data.users;
  if (Array.isArray(payload?.data?.content)) return payload.data.content;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const normalizeUser = (user, index) => {
  const id = user?.id ?? user?.userId ?? user?.uuid ?? `row-${Date.now()}-${index}`;
  const role = String(user?.role || STORE_ROLES.STORE_MANAGER).trim().toLowerCase();
  const statusText = String(user?.status || '').trim().toLowerCase();
  const disabledByStatus = statusText === 'disabled' || statusText === 'inactive';
  const disabledFlag = Boolean(user?.disabled ?? user?.isDisabled ?? false);

  return {
    id,
    name: String(user?.name || user?.ownerName || user?.fullName || '').trim(),
    username: String(user?.username || user?.userName || '').trim(),
    email: String(user?.email || '').trim(),
    phone: String(user?.phone || '').trim(),
    role,
    disabled: disabledByStatus || disabledFlag,
  };
};

const parseResponsePayload = async (response) => {
  const text = await response.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const StoreUsersPage = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState({
    name: '',
    username: '',
    email: '',
    phone: '',
    role: STORE_ROLES.STORE_MANAGER,
  });

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
      return a.username.localeCompare(b.username);
    });
  }, [users]);

  const loadUsers = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    setError('');

    try {
      const response = await apiFetch(API_ENDPOINTS.users, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      const payload = await parseResponsePayload(response);

      if (response.status === 401) {
        navigate('/login', { replace: true });
        return;
      }

      if (response.status === 403) {
        setError('You do not have permission to view store users.');
        return;
      }

      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || `Unable to load users (${response.status}).`);
      }

      const normalizedUsers = parseUsersPayload(payload).map(normalizeUser);
      setUsers(normalizedUsers);
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load users right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadUsers(false);
  }, [loadUsers]);

  const startEdit = (user) => {
    setEditingId(String(user.id));
    setEditForm({
      name: user.name || '',
      username: user.username || '',
      email: user.email || '',
      phone: user.phone || '',
      role: ROLE_OPTIONS.includes(user.role) ? user.role : STORE_ROLES.STORE_MANAGER,
    });
    setSuccess('');
    setError('');
  };

  const cancelEdit = () => {
    setEditingId('');
    setEditForm({
      name: '',
      username: '',
      email: '',
      phone: '',
      role: STORE_ROLES.STORE_MANAGER,
    });
  };

  const saveEdit = async (userId) => {
    setSavingId(String(userId));
    setError('');
    setSuccess('');

    try {
      const response = await apiFetch(API_ENDPOINTS.userById(userId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(editForm.name || '').trim(),
          username: String(editForm.username || '').trim(),
          email: String(editForm.email || '').trim(),
          phone: String(editForm.phone || '').trim(),
          role: String(editForm.role || STORE_ROLES.STORE_MANAGER).trim(),
        }),
      });

      const payload = await parseResponsePayload(response);

      if (response.status === 401) {
        navigate('/login', { replace: true });
        return;
      }

      if (response.status === 403) {
        setError('You do not have permission to modify this user.');
        return;
      }

      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || `Unable to save user (${response.status}).`);
      }

      setUsers((prev) => prev.map((item) => (
        String(item.id) === String(userId)
          ? { ...item, ...normalizeUser({ ...item, ...editForm }, 0) }
          : item
      )));
      setSuccess('User details updated.');
      cancelEdit();
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save user changes.');
    } finally {
      setSavingId('');
    }
  };

  const toggleDisabled = async (user) => {
    const userId = user.id;
    const nextDisabled = !user.disabled;

    setSavingId(String(userId));
    setError('');
    setSuccess('');

    try {
      let response = await apiFetch(API_ENDPOINTS.userStatusById(userId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disabled: nextDisabled,
        }),
      });

      if (response.status === 404 || response.status === 405) {
        response = await apiFetch(API_ENDPOINTS.userById(userId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: user.name,
            username: user.username,
            email: user.email,
            phone: user.phone,
            role: user.role,
            disabled: nextDisabled,
          }),
        });
      }

      const payload = await parseResponsePayload(response);

      if (response.status === 401) {
        navigate('/login', { replace: true });
        return;
      }

      if (response.status === 403) {
        setError('You do not have permission to change user status.');
        return;
      }

      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || `Unable to update status (${response.status}).`);
      }

      setUsers((prev) => prev.map((item) => (
        String(item.id) === String(userId)
          ? { ...item, disabled: nextDisabled }
          : item
      )));
      setSuccess(nextDisabled ? 'User disabled successfully.' : 'User enabled successfully.');
    } catch (statusError) {
      setError(statusError?.message || 'Unable to update user status.');
    } finally {
      setSavingId('');
    }
  };

  const deleteUser = async (user) => {
    const userId = user.id;
    const confirmed = window.confirm(`Delete user ${user.username || user.name || userId}?`);
    if (!confirmed) return;

    setDeletingId(String(userId));
    setError('');
    setSuccess('');

    try {
      const response = await apiFetch(API_ENDPOINTS.userById(userId), {
        method: 'DELETE',
      });

      const payload = await parseResponsePayload(response);

      if (response.status === 401) {
        navigate('/login', { replace: true });
        return;
      }

      if (response.status === 403) {
        setError('You do not have permission to delete this user.');
        return;
      }

      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || `Unable to delete user (${response.status}).`);
      }

      setUsers((prev) => prev.filter((item) => String(item.id) !== String(userId)));
      setSuccess('User deleted successfully.');
    } catch (deleteError) {
      setError(deleteError?.message || 'Unable to delete user.');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div className="store-users-page">
      <div className="store-users-card">
        <div className="store-users-head">
          <button type="button" className="back-btn" onClick={() => navigate('/dashboard')}>← Back</button>
          <h1>Store Users</h1>
          <p>View and manage existing store users.</p>
        </div>

        {error && <div className="panel-alert error">{error}</div>}
        {success && <div className="panel-alert success">{success}</div>}

        <div className="store-users-toolbar">
          <button type="button" className="secondary-btn" onClick={() => navigate('/users-roles')}>Add Users / Roles</button>
          <button type="button" className="primary-btn" onClick={() => loadUsers(true)} disabled={refreshing || loading}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <p className="store-users-empty">Loading users...</p>
        ) : sortedUsers.length === 0 ? (
          <p className="store-users-empty">No users found.</p>
        ) : (
          <div className="store-users-table" role="table" aria-label="Store users">
            <div className="store-users-row header" role="row">
              <div role="columnheader">Name</div>
              <div role="columnheader">Username</div>
              <div role="columnheader">Role</div>
              <div role="columnheader">Email</div>
              <div role="columnheader">Status</div>
              <div role="columnheader">Actions</div>
            </div>

            {sortedUsers.map((user) => {
              const rowBusy = savingId === String(user.id) || deletingId === String(user.id);
              const isEditing = editingId === String(user.id);

              return (
                <div className="store-users-row" role="row" key={String(user.id)}>
                  <div role="cell">
                    {isEditing ? (
                      <input value={editForm.name} onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))} />
                    ) : (
                      <strong>{user.name || '-'}</strong>
                    )}
                  </div>
                  <div role="cell">
                    {isEditing ? (
                      <input value={editForm.username} onChange={(e) => setEditForm((prev) => ({ ...prev, username: e.target.value }))} />
                    ) : (
                      user.username || '-'
                    )}
                  </div>
                  <div role="cell">
                    {isEditing ? (
                      <select value={editForm.role} onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))}>
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>{toRoleLabel(role)}</option>
                        ))}
                      </select>
                    ) : (
                      toRoleLabel(user.role)
                    )}
                  </div>
                  <div role="cell">
                    {isEditing ? (
                      <input value={editForm.email} onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))} />
                    ) : (
                      user.email || '-'
                    )}
                  </div>
                  <div role="cell">
                    <span className={user.disabled ? 'status-chip disabled' : 'status-chip active'}>
                      {user.disabled ? 'Disabled' : 'Active'}
                    </span>
                  </div>
                  <div role="cell" className="row-actions">
                    {isEditing ? (
                      <>
                        <button type="button" className="tiny-btn save" onClick={() => saveEdit(user.id)} disabled={rowBusy}>Save</button>
                        <button type="button" className="tiny-btn" onClick={cancelEdit} disabled={rowBusy}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="tiny-btn" onClick={() => startEdit(user)} disabled={rowBusy}>Modify</button>
                        <button type="button" className="tiny-btn" onClick={() => toggleDisabled(user)} disabled={rowBusy}>
                          {user.disabled ? 'Enable' : 'Disable'}
                        </button>
                        <button type="button" className="tiny-btn danger" onClick={() => deleteUser(user)} disabled={rowBusy}>Delete</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StoreUsersPage;
