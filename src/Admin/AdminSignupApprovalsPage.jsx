import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout, { StatusBadge } from './AdminLayout';
import { pendingApprovals as fallbackApprovals } from './adminData';
import { API_ENDPOINTS, apiFetch } from '../Config/api';

const normalizeApproval = (retailer = {}) => ({
  id: retailer.id || retailer.retailerId || 'N/A',
  businessName: retailer.businessName || retailer.name || retailer.shopName || 'Unknown retailer',
  ownerName: retailer.ownerName || retailer.owner || 'Unknown owner',
  email: retailer.email || retailer.ownerEmail || 'N/A',
  submittedOn: retailer.submittedOn || retailer.createdAt || retailer.created_on || 'N/A',
  documents: Array.isArray(retailer.documents) ? retailer.documents : ['GST Certificate', 'PAN Card'],
  lastUpdate: retailer.lastUpdate || retailer.reviewNote || retailer.status || 'Awaiting review',
});

const extractApprovalList = (payload) => {
  const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload?.retailers) ? payload.retailers : [])));
  return list.filter((retailer) => {
    const status = String(retailer.status || retailer.approvalStatus || '').toLowerCase();
    return status.includes('pending') || status.includes('more info') || status.includes('review');
  });
};

const AdminSignupApprovalsPage = ({ onLogout }) => {
  const [approvals, setApprovals] = useState(fallbackApprovals);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const loadApprovals = async () => {
      try {
        const response = await apiFetch(API_ENDPOINTS.adminRetailers);
        if (!response.ok) throw new Error('Approvals unavailable');
        const payload = await response.json().catch(() => ({}));
        const list = extractApprovalList(payload).map(normalizeApproval);
        if (active) setApprovals(list.length ? list : fallbackApprovals);
      } catch {
        if (active) setApprovals(fallbackApprovals);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadApprovals();
    return () => { active = false; };
  }, [refreshKey]);

  const handleRefresh = () => {
    setLoading(true);
    setRefreshKey((value) => value + 1);
  };

  const handleAction = async (retailerId, action) => {
    try {
      const response = await apiFetch(API_ENDPOINTS.adminRetailerAction(retailerId, action), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) throw new Error('Update failed');
      setApprovals((current) => current.filter((retailer) => retailer.id !== retailerId));
    } catch {
      alert('Unable to update retailer approval status right now.');
    }
  };

  const visibleApprovals = useMemo(() => approvals, [approvals]);

  return (
    <AdminLayout title="Signup approvals" subtitle="Review retailer applications, verify uploaded documents, and approve or reject new retailer requests." currentUser="Store Admin" onLogout={onLogout} onRefresh={handleRefresh}>
      {loading && <p className="muted-text">Loading signup approvals…</p>}
      <div className="admin-grid two-up">
        {visibleApprovals.map((retailer) => (
          <section key={retailer.id} className="admin-approval-card">
            <div className="admin-approval-topline">
              <div>
                <h3>{retailer.businessName}</h3>
                <small>{retailer.ownerName}</small>
              </div>
              <StatusBadge status="Pending" />
            </div>

            <div className="admin-approval-meta">
              <span>{retailer.id}</span>
              <span>{retailer.email}</span>
              <span>Submitted {retailer.submittedOn}</span>
            </div>

            <ul className="admin-doc-list">
              {retailer.documents.map((document) => (
                <li key={`${retailer.id}-${document}`}>{document}</li>
              ))}
            </ul>

            <div className="admin-note-box">
              <strong>Review note:</strong> {retailer.lastUpdate}
            </div>

            <div className="admin-row-actions large-gap">
              <button className="admin-primary-button" onClick={() => handleAction(retailer.id, 'approve')}>Approve</button>
              <button className="admin-secondary-button" onClick={() => handleAction(retailer.id, 'request-info')}>Request info</button>
              <button className="admin-danger-button" onClick={() => handleAction(retailer.id, 'reject')}>Reject</button>
            </div>
          </section>
        ))}
      </div>
    </AdminLayout>
  );
};

export default AdminSignupApprovalsPage;
