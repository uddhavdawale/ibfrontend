import React, { useEffect, useState } from 'react';
import AdminLayout, { StatusBadge } from './AdminLayout';
import { adminOverview } from './adminData';
import { API_ENDPOINTS, apiFetch } from '../Config/api';

const StatCard = ({ label, value, footnote }) => (
  <div className="admin-stat-card">
    <p>{label}</p>
    <h3>{value}</h3>
    <small>{footnote}</small>
  </div>
);

const normalizeDashboardPayload = (payload = {}) => {
  const source = Array.isArray(payload) ? payload[0] || {} : (payload.data && typeof payload.data === 'object' ? payload.data : payload);
  const summary = source.summary && typeof source.summary === 'object' ? source.summary : source;

  return {
    totalRetailers: Number(summary.totalRetailers ?? summary.totalRetailerCount ?? adminOverview.totalRetailers),
    activeRetailers: Number(summary.activeRetailers ?? summary.activeRetailerCount ?? adminOverview.activeRetailers),
    pendingApprovals: Number(summary.pendingApprovals ?? summary.pendingApprovalCount ?? adminOverview.pendingApprovals),
    approvalRate: Number(summary.approvalRate ?? adminOverview.approvalRate),
    averageApprovalTime: summary.averageApprovalTime ?? adminOverview.averageApprovalTime,
    recentRequests: Array.isArray(summary.recentRequests) ? summary.recentRequests : (Array.isArray(payload?.recentRequests) ? payload.recentRequests : adminOverview.recentRequests),
    recentActivity: Array.isArray(summary.recentActivity) ? summary.recentActivity : (Array.isArray(payload?.recentActivity) ? payload.recentActivity : adminOverview.recentActivity),
    growthTrend: Array.isArray(summary.growthTrend) ? summary.growthTrend : (Array.isArray(payload?.growthTrend) ? payload.growthTrend : adminOverview.growthTrend),
    cityDistribution: Array.isArray(summary.cityDistribution) ? summary.cityDistribution : (Array.isArray(payload?.cityDistribution) ? payload.cityDistribution : adminOverview.cityDistribution),
    stateDistribution: Array.isArray(summary.stateDistribution) ? summary.stateDistribution : (Array.isArray(payload?.stateDistribution) ? payload.stateDistribution : adminOverview.stateDistribution),
    rejectionReasons: Array.isArray(summary.rejectionReasons) ? summary.rejectionReasons : (Array.isArray(payload?.rejectionReasons) ? payload.rejectionReasons : adminOverview.rejectionReasons),
  };
};

const AdminDashboardPage = ({ onLogout }) => {
  const [dashboardData, setDashboardData] = useState(adminOverview);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      try {
        const response = await apiFetch(API_ENDPOINTS.adminDashboard);
        if (!response.ok) throw new Error('Admin dashboard unavailable');
        const payload = await response.json().catch(() => ({}));
        if (active) {
          setDashboardData({ ...adminOverview, ...normalizeDashboardPayload(payload) });
        }
      } catch {
        if (active) {
          setDashboardData(adminOverview);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadDashboard();
    return () => { active = false; };
  }, [refreshKey]);

  const handleRefresh = () => {
    setLoading(true);
    setRefreshKey((value) => value + 1);
  };

  const { totalRetailers, activeRetailers, pendingApprovals, approvalRate, averageApprovalTime, recentRequests, recentActivity, growthTrend, cityDistribution, stateDistribution, rejectionReasons } = dashboardData;

  return (
    <AdminLayout title="Admin dashboard" subtitle="Operational view of retailer onboarding, approvals, and risk signals." currentUser="Store Admin" onLogout={onLogout} onRefresh={handleRefresh}>
      {loading && <p className="muted-text">Loading admin dashboard…</p>}
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
              <div key={item.label || item.month || item.name} className="admin-bar-wrap">
                <div className="admin-bar" style={{ height: `${Math.max((Number(item.value || item.count || 0) / 250) * 100, 18)}%` }} />
                <span>{item.label || item.month || item.name}</span>
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
              <li key={item.reason || item.label}>
                <span>{item.reason || item.label}</span>
                <strong>{item.count || item.value || 0}</strong>
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
          <div className="admin-table-scroll">
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
                  <tr key={item.id || item.retailerId}>
                    <td>{item.businessName || item.name}</td>
                    <td>{item.ownerName || item.owner}</td>
                    <td><StatusBadge status={item.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Recent admin activity</h2>
          </div>
          <ul className="admin-activity-list">
            {recentActivity.map((item, index) => (
              <li key={`${item.actor || 'actor'}-${index}`}>
                <strong>{item.actor}</strong>
                <span>{item.action}</span>
                <small>{item.at || item.time}</small>
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
              <li key={item.city || item.label}>
                <span>{item.city || item.label}</span>
                <strong>{item.count || item.value || 0}</strong>
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
              <li key={item.state || item.label}>
                <span>{item.state || item.label}</span>
                <strong>{item.count || item.value || 0}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboardPage;
