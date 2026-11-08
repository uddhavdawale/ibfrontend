import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout, { StatusBadge } from './AdminLayout';
import { adminUsers as fallbackUsers } from './adminData';
import { API_ENDPOINTS, apiFetch } from '../Config/api';

const normalizeUser = (user = {}) => ({
  id: user.id || user.userId || 'N/A',
  name: user.name || user.fullName || user.ownerName || 'Unknown user',
  email: user.email || user.username || '',
  role: user.role || user.userRole || 'Retailer User',
  status: user.status || user.accountStatus || 'Active',
  retailer: user.retailer || user.businessName || user.shopName || 'All Retailers',
  lastLogin: user.lastLogin || user.lastSeen || user.updatedAt || 'N/A',
});

const extractUsersList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.users)) return payload.users;
  return [];
};

const AdminUsersPage = ({ onLogout }) => {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState(fallbackUsers);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadUsers = async () => {
      try {
        const response = await apiFetch(API_ENDPOINTS.adminUsersList);
        if (!response.ok) throw new Error('Users request failed');
        const payload = await response.json().catch(() => ({}));
        const list = extractUsersList(payload).map(normalizeUser);
        if (active) setUsers(list.length ? list : fallbackUsers);
      } catch {
        if (active) setUsers(fallbackUsers);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadUsers();
    return () => { active = false; };
  }, []);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const term = search.toLowerCase();
    return users.filter((user) => (
      String(user.name || '').toLowerCase().includes(term)
      || String(user.email || '').toLowerCase().includes(term)
      || String(user.role || '').toLowerCase().includes(term)
      || String(user.retailer || '').toLowerCase().includes(term)
    ));
  }, [search, users]);

  const updateUserStatus = async (userId, nextStatus) => {
    try {
      const response = await apiFetch(API_ENDPOINTS.adminUserStatus(userId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) throw new Error('Update failed');
      setUsers((current) => current.map((user) => user.id === userId ? { ...user, status: nextStatus } : user));
    } catch {
      alert('Unable to update user status right now.');
    }
  };

  return (
    <AdminLayout title="User management" subtitle="Manage retailer users with role, access, and account status controls while preserving existing flows." currentUser="Store Admin" onLogout={onLogout}>
      {loading && <p className="muted-text">Loading user list…</p>}
      <div className="admin-toolbar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, email, retailer, or role"
          className="admin-input"
        />
        <button className="admin-primary-button">Export users</button>
      </div>

      <section className="admin-panel">
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Retailer</th>
              <th>Status</th>
              <th>Last login</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.name}</strong>
                  <div className="muted-text">{user.email}</div>
                </td>
                <td>{user.role}</td>
                <td>{user.retailer}</td>
                <td><StatusBadge status={user.status} /></td>
                <td>{user.lastLogin}</td>
                <td>
                  <div className="admin-row-actions">
                    <button className="admin-row-button" onClick={() => updateUserStatus(user.id, user.status === 'Active' ? 'Disabled' : 'Active')}>{user.status === 'Active' ? 'Disable' : 'Enable'}</button>
                    <button className="admin-row-button">Edit</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminLayout>
  );
};

export default AdminUsersPage;
