import React from 'react';
import AdminLayout, { StatusBadge } from './AdminLayout';
import { adminOverview } from './adminData';

const StatCard = ({ label, value, footnote }) => (
  <div className="admin-stat-card">
    <p>{label}</p>
    <h3>{value}</h3>
    <small>{footnote}</small>
  </div>
);

const AdminDashboardPage = () => {
  const { totalRetailers, activeRetailers, pendingApprovals, approvalRate, averageApprovalTime, recentRequests, recentActivity, growthTrend, cityDistribution, stateDistribution, rejectionReasons } = adminOverview;

  return (
    <AdminLayout title="Admin dashboard" subtitle="Operational view of retailer onboarding, approvals, and risk signals." currentUser="Store Admin">
      <div className="admin-grid three-up">
        <StatCard label="Total retailers onboarded" value={totalRetailers} footnote="All stores tracked" />
        <StatCard label="Active retailers" value={activeRetailers} footnote="Currently active" />
        <StatCard label="Pending approvals" value={pendingApprovals} footnote="Awaiting action" />
        <StatCard label="Approval rate" value={`${approvalRate}%`} footnote={`Avg approval time: ${averageApprovalTime}`} />
      </div>

      <div className="admin-panel-grid">
        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Retailer growth trend</h2>
          </div>
          <div className="admin-chart-bars">
            {growthTrend.map((item) => (
              <div key={item.label} className="admin-bar-wrap">
                <div className="admin-bar" style={{ height: `${Math.max((item.value / 250) * 100, 18)}%` }} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Rejection reasons</h2>
          </div>
          <ul className="admin-list">
            {rejectionReasons.map((item) => (
              <li key={item.reason}>
                <span>{item.reason}</span>
                <strong>{item.count}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="admin-panel-grid">
        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Recent signup requests</h2>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Retailer</th>
                <th>Owner</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentRequests.map((item) => (
                <tr key={item.id}>
                  <td>{item.businessName}</td>
                  <td>{item.ownerName}</td>
                  <td><StatusBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Recent admin activity</h2>
          </div>
          <ul className="admin-activity-list">
            {recentActivity.map((item, index) => (
              <li key={`${item.actor}-${index}`}>
                <strong>{item.actor}</strong>
                <span>{item.action}</span>
                <small>{item.at}</small>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="admin-panel-grid">
        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>City distribution</h2>
          </div>
          <ul className="admin-list">
            {cityDistribution.map((item) => (
              <li key={item.city}>
                <span>{item.city}</span>
                <strong>{item.count}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>State distribution</h2>
          </div>
          <ul className="admin-list">
            {stateDistribution.map((item) => (
              <li key={item.state}>
                <span>{item.state}</span>
                <strong>{item.count}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboardPage;
