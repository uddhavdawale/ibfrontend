import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINTS, apiFetch, getAuthContext } from '../Config/api';
import { STORE_ROLES } from './storeRoles';
import './StoreUsersPage.css';

const PAGE_SIZE = 10;

const ROLE_OPTIONS = [
  STORE_ROLES.STORE_ADMIN,
  STORE_ROLES.STORE_MANAGER,
  STORE_ROLES.BILLING_MANAGER,
  STORE_ROLES.STORE_BILLING_VIEWER,
  STORE_ROLES.INVENTORY_MANAGER,
  STORE_ROLES.STORE_INVENTORY_VIEWER,
  STORE_ROLES.AUDIT_RELATED,
];

const ROLE_LABELS = {
  [STORE_ROLES.STORE_ADMIN]: 'Store Admin',
  [STORE_ROLES.STORE_MANAGER]: 'Store Manager',
  [STORE_ROLES.BILLING_MANAGER]: 'Billing Manager',
  [STORE_ROLES.STORE_BILLING_VIEWER]: 'Store Billing Viewer',
  [STORE_ROLES.INVENTORY_MANAGER]: 'Inventory Manager',
  [STORE_ROLES.STORE_INVENTORY_VIEWER]: 'Store Inventory Viewer',
  [STORE_ROLES.AUDIT_RELATED]: 'Audit Manager',
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
    tenantId: String(user?.tenantId ?? user?.tenant?.id ?? '').trim(),
    shopId: String(user?.shopId ?? user?.shop?.id ?? '').trim(),
    ownerName: String(user?.ownerName || '').trim(),
    disabled: disabledByStatus || disabledFlag,
  };
};

const toLowerText = (value) => String(value || '').trim().toLowerCase();

const parseStorageJson = (key) => {
  try {
    return JSON.parse(window.localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
};

const resolveScopeContext = () => {
  const authContext = getAuthContext();
  const user = parseStorageJson('user');
  const shopProfile = parseStorageJson('shopProfile');

  return {
    tenantId: String(authContext?.tenantId ?? user?.tenantId ?? shopProfile?.tenantId ?? '').trim(),
    shopId: String(authContext?.shopId ?? user?.shopId ?? shopProfile?.shopId ?? shopProfile?.id ?? '').trim(),
    ownerName: toLowerText(user?.ownerName || user?.name || shopProfile?.ownerName || shopProfile?.businessName || ''),
    currentUserId: String(authContext?.userId ?? user?.id ?? user?.userId ?? '').trim(),
  };
};

const matchesScope = (user, scope) => {
  const hasUserScopeFields = Boolean(user.tenantId || user.shopId || user.ownerName);
  const hasCallerScope = Boolean(scope.tenantId || scope.shopId || scope.ownerName);

  // Preserve existing behavior when the backend does not return scope metadata.
  if (!hasUserScopeFields || !hasCallerScope) return true;

  if (scope.tenantId && user.tenantId) return scope.tenantId === user.tenantId;
  if (scope.shopId && user.shopId) return scope.shopId === user.shopId;
  if (scope.ownerName && user.ownerName) return scope.ownerName === toLowerText(user.ownerName);

  return false;
};

const userMatchesSearch = (user, query) => {
  const normalizedQuery = toLowerText(query);
  if (!normalizedQuery) return true;
  const haystack = [user.name, user.username, user.email, user.phone, toRoleLabel(user.role)].map(toLowerText).join(' ');
  return haystack.includes(normalizedQuery);
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
  const [resettingId, setResettingId] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [editForm, setEditForm] = useState({
    name: '',
    username: '',
    email: '',
    phone: '',
    role: STORE_ROLES.STORE_MANAGER,
  });

  const scopeContext = useMemo(() => resolveScopeContext(), []);

  const sortedUsers = useMemo(() => {
    return users
      .filter((item) => matchesScope(item, scopeContext))
      .sort((a, b) => {
      if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
      return a.username.localeCompare(b.username);
      });
  }, [scopeContext, users]);

  const filteredUsers = useMemo(() => {
    return sortedUsers.filter((item) => {
      const roleMatches = roleFilter === 'all' ? true : item.role === roleFilter;
      const statusMatches = statusFilter === 'all'
        ? true
        : statusFilter === 'active'
          ? !item.disabled
          : item.disabled;
      return roleMatches && statusMatches && userMatchesSearch(item, search);
    });
  }, [roleFilter, search, sortedUsers, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pagedUsers = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE;
    return filteredUsers.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredUsers, page]);

  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, statusFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
    const trimmedName = String(editForm.name || '').trim();
    const trimmedUsername = String(editForm.username || '').trim();
    const trimmedEmail = String(editForm.email || '').trim();
    const trimmedPhone = String(editForm.phone || '').trim();

    if (!trimmedName || !trimmedUsername) {
      setError('Name and username are required.');
      return;
    }

    if (trimmedUsername.length < 3) {
      setError('Username must have at least 3 characters.');
      return;
    }

    setSavingId(String(userId));
    setError('');
    setSuccess('');

    try {
      const response = await apiFetch(API_ENDPOINTS.userById(userId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          username: trimmedUsername,
          email: trimmedEmail,
          phone: trimmedPhone,
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

    if (String(scopeContext.currentUserId) && String(userId) === String(scopeContext.currentUserId)) {
      setError('You cannot disable your own account.');
      return;
    }

    const confirmationText = nextDisabled
      ? `Disable user ${user.username || user.name || userId}?`
      : `Enable user ${user.username || user.name || userId}?`;
    if (!window.confirm(confirmationText)) return;

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

    if (String(scopeContext.currentUserId) && String(userId) === String(scopeContext.currentUserId)) {
      setError('You cannot delete your own account.');
      return;
    }

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

  const resendPassword = async (user) => {
    const userId = user.id;
    setResettingId(String(userId));
    setError('');
    setSuccess('');

    const tryResend = async (url) => {
      const response = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          username: user.username,
          email: user.email,
        }),
      });
      const payload = await parseResponsePayload(response);
      return { response, payload };
    };

    try {
      let result = await tryResend(API_ENDPOINTS.userResendPasswordById(userId));

      if (result.response.status === 404 || result.response.status === 405) {
        result = await tryResend(`${API_ENDPOINTS.userById(userId)}/password/resend`);
      }

      if (result.response.status === 404 || result.response.status === 405) {
        result = await tryResend(`${API_ENDPOINTS.userById(userId)}/resend-reset`);
      }

      if (result.response.status === 401) {
        navigate('/login', { replace: true });
        return;
      }

      if (result.response.status === 403) {
        setError('You do not have permission to resend passwords.');
        return;
      }

      if (!result.response.ok || result.payload?.success === false) {
        throw new Error(result.payload?.message || result.payload?.error || `Unable to resend password (${result.response.status}).`);
      }

      setSuccess(`Password reset instructions sent to ${user.username || user.name}.`);
    } catch (resetError) {
      setError(resetError?.message || 'Unable to resend password right now.');
    } finally {
      setResettingId('');
    }
  };

  const activeCount = sortedUsers.filter((item) => !item.disabled).length;
  const disabledCount = sortedUsers.length - activeCount;

  return (
    <div className="store-users-page">
      <div className="store-users-card">
        <div className="store-users-head">
          <button type="button" className="back-btn" onClick={() => navigate('/dashboard')}>← Back</button>
          <h1>Existing Users</h1>
          <p>Enterprise user controls for this shop only.</p>
        </div>

        {error && <div className="panel-alert error">{error}</div>}
        {success && <div className="panel-alert success">{success}</div>}

        <div className="store-users-toolbar">
          <div className="store-users-summary" aria-label="Store users summary">
            <span className="summary-chip">Total: {sortedUsers.length}</span>
            <span className="summary-chip active">Active: {activeCount}</span>
            <span className="summary-chip disabled">Disabled: {disabledCount}</span>
          </div>

          <input
            type="search"
            className="toolbar-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, username, email"
            aria-label="Search existing users"
          />

          <select className="toolbar-select" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filter by role">
            <option value="all">All Roles</option>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>{toRoleLabel(role)}</option>
            ))}
          </select>

          <select className="toolbar-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>

          <button type="button" className="secondary-btn" onClick={() => navigate('/users-roles')}>Add Users / Roles</button>
          <button type="button" className="primary-btn" onClick={() => loadUsers(true)} disabled={refreshing || loading}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <p className="store-users-empty">Loading users...</p>
        ) : filteredUsers.length === 0 ? (
          <p className="store-users-empty">No users found for the selected filters.</p>
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

            {pagedUsers.map((user) => {
              const rowBusy = savingId === String(user.id) || deletingId === String(user.id) || resettingId === String(user.id);
              const isEditing = editingId === String(user.id);
              const isCurrentUser = String(scopeContext.currentUserId) && String(scopeContext.currentUserId) === String(user.id);

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
                        <button type="button" className="tiny-btn" onClick={() => startEdit(user)} disabled={rowBusy}>Rename / Modify</button>
                        <button type="button" className="tiny-btn" onClick={() => resendPassword(user)} disabled={rowBusy}>Resend Password</button>
                        <button type="button" className="tiny-btn" onClick={() => toggleDisabled(user)} disabled={rowBusy || isCurrentUser}>
                          {user.disabled ? 'Enable' : 'Disable'}
                        </button>
                        <button type="button" className="tiny-btn danger" onClick={() => deleteUser(user)} disabled={rowBusy || isCurrentUser}>Delete</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && filteredUsers.length > 0 && (
          <div className="users-pagination" aria-label="Users pagination">
            <button type="button" className="tiny-btn" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button type="button" className="tiny-btn" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page >= totalPages}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default StoreUsersPage;
