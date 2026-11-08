import React, { useMemo, useState } from 'react';
import AdminLayout, { StatusBadge } from './AdminLayout';
import { retailers } from './adminData';

const AdminRetailersPage = () => {
  const [search, setSearch] = useState('');

  const filteredRetailers = useMemo(() => {
    if (!search.trim()) return retailers;
    const term = search.toLowerCase();
    return retailers.filter((retailer) => (
      retailer.businessName.toLowerCase().includes(term)
      || retailer.ownerName.toLowerCase().includes(term)
      || retailer.email.toLowerCase().includes(term)
      || retailer.city.toLowerCase().includes(term)
      || retailer.state.toLowerCase().includes(term)
      || retailer.gstin.toLowerCase().includes(term)
    ));
  }, [search]);

  return (
    <AdminLayout title="Retailer management" subtitle="Search, filter, review, and act on retailer approval status and onboarding records." currentUser="Store Admin">
      <div className="admin-toolbar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by business name, owner, email, GST, city or state"
          className="admin-input"
        />
        <button className="admin-primary-button">Export CSV</button>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>Retailer list</h2>
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th>Retailer</th>
              <th>Owner</th>
              <th>Location</th>
              <th>Status</th>
              <th>Assigned admin</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRetailers.map((retailer) => (
              <tr key={retailer.id}>
                <td>
                  <strong>{retailer.businessName}</strong>
                  <div className="muted-text">{retailer.id}</div>
                </td>
                <td>{retailer.ownerName}</td>
                <td>{retailer.city}, {retailer.state}</td>
                <td><StatusBadge status={retailer.status} /></td>
                <td>{retailer.assignedAdmin}</td>
                <td>
                  <div className="admin-row-actions">
                    <button className="admin-row-button">View</button>
                    <button className="admin-row-button">Approve</button>
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

export default AdminRetailersPage;
