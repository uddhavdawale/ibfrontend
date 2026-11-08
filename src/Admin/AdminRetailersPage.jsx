import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout, { StatusBadge } from './AdminLayout';
import { retailers as fallbackRetailers } from './adminData';
import { API_ENDPOINTS, apiFetch } from '../Config/api';

const normalizeRetailer = (retailer = {}) => ({
  id: retailer.id || retailer.retailerId || retailer.businessId || 'N/A',
  businessName: retailer.businessName || retailer.name || retailer.shopName || 'Unknown retailer',
  ownerName: retailer.ownerName || retailer.owner || retailer.contactName || 'Unknown owner',
  email: retailer.email || retailer.ownerEmail || '',
  phone: retailer.phone || retailer.contactPhone || '',
  gstin: retailer.gstin || retailer.taxId || 'N/A',
  city: retailer.city || 'N/A',
  state: retailer.state || 'N/A',
  status: retailer.status || retailer.approvalStatus || 'Pending',
  businessType: retailer.businessType || 'Retail Store',
  assignedAdmin: retailer.assignedAdmin || retailer.assignee || 'Unassigned',
  createdAt: retailer.createdAt || retailer.created_on || retailer.submittedOn || '',
  approvedAt: retailer.approvedAt || retailer.approved_at || null,
});

const extractRetailersList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.retailers)) return payload.retailers;
  return [];
};

const AdminRetailersPage = ({ onLogout }) => {
  const [search, setSearch] = useState('');
  const [retailers, setRetailers] = useState(fallbackRetailers);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadRetailers = async () => {
      try {
        const response = await apiFetch(API_ENDPOINTS.adminRetailers);
        if (!response.ok) throw new Error('Retailers request failed');
        const payload = await response.json().catch(() => ({}));
        const list = extractRetailersList(payload).map(normalizeRetailer);
        if (active) setRetailers(list.length ? list : fallbackRetailers);
      } catch {
        if (active) setRetailers(fallbackRetailers);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadRetailers();
    return () => { active = false; };
  }, []);

  const handleAction = async (retailerId, action) => {
    try {
      const response = await apiFetch(API_ENDPOINTS.adminRetailerAction(retailerId, action), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        throw new Error('Action failed');
      }

      setRetailers((current) => current.map((retailer) => {
        if (retailer.id !== retailerId) return retailer;
        const nextStatus = action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : action === 'request-info' ? 'More Info Required' : action === 'block' ? 'Blocked' : retailer.status;
        return { ...retailer, status: nextStatus };
      }));
    } catch {
      alert('Unable to update retailer status right now.');
    }
  };

  const filteredRetailers = useMemo(() => {
    if (!search.trim()) return retailers;
    const term = search.toLowerCase();
    return retailers.filter((retailer) => (
      String(retailer.businessName || '').toLowerCase().includes(term)
      || String(retailer.ownerName || '').toLowerCase().includes(term)
      || String(retailer.email || '').toLowerCase().includes(term)
      || String(retailer.city || '').toLowerCase().includes(term)
      || String(retailer.state || '').toLowerCase().includes(term)
      || String(retailer.gstin || '').toLowerCase().includes(term)
    ));
  }, [search, retailers]);

  return (
    <AdminLayout title="Retailer management" subtitle="Search, filter, review, and act on retailer approval status and onboarding records." currentUser="Store Admin" onLogout={onLogout}>
      {loading && <p className="muted-text">Loading retailer list…</p>}
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
                    <button className="admin-row-button" onClick={() => handleAction(retailer.id, 'approve')}>Approve</button>
                    <button className="admin-row-button" onClick={() => handleAction(retailer.id, 'request-info')}>Info</button>
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
