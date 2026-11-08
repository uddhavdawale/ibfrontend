import React, { useMemo, useState } from 'react';
import AdminLayout, { StatusBadge } from './AdminLayout';
import { adminUsers } from './adminData';

const AdminUsersPage = () => {
  const [search, setSearch] = useState('');

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return adminUsers;
    const term = search.toLowerCase();
    return adminUsers.filter((user) => (
      user.name.toLowerCase().includes(term)
      || user.email.toLowerCase().includes(term)
      || user.role.toLowerCase().includes(term)
      || user.retailer.toLowerCase().includes(term)
    ));
  }, [search]);

  return (
    <AdminLayout title="User management" subtitle="Manage retailer users with role, access, and account status controls while preserving existing flows." currentUser="Store Admin">
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
                    <button className="admin-row-button">Block</button>
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
