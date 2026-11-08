import React from 'react';
import AdminLayout, { StatusBadge } from './AdminLayout';
import { pendingApprovals } from './adminData';

const AdminSignupApprovalsPage = () => (
  <AdminLayout title="Signup approvals" subtitle="Review retailer applications, verify uploaded documents, and approve or reject new retailer requests." currentUser="Store Admin">
    <div className="admin-grid two-up">
      {pendingApprovals.map((retailer) => (
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
              <li key={document}>{document}</li>
            ))}
          </ul>

          <div className="admin-note-box">
            <strong>Review note:</strong> {retailer.lastUpdate}
          </div>

          <div className="admin-row-actions large-gap">
            <button className="admin-primary-button">Approve</button>
            <button className="admin-secondary-button">Request info</button>
            <button className="admin-danger-button">Reject</button>
          </div>
        </section>
      ))}
    </div>
  </AdminLayout>
);

export default AdminSignupApprovalsPage;
