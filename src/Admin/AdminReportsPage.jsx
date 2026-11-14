import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout, { StatusBadge } from './AdminLayout';
import { API_ENDPOINTS, apiFetch } from '../Config/api';

const extractRetailersList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.content)) return payload.content;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.retailers)) return payload.retailers;
  if (payload.data && typeof payload.data === 'object') return extractRetailersList(payload.data);
  return [];
};

const normalizeRetailer = (retailer = {}) => ({
  id: retailer.id || retailer.retailerId || retailer.businessId || 'N/A',
  businessName: retailer.businessName || retailer.name || retailer.shopName || 'Unknown retailer',
  ownerName: retailer.ownerName || retailer.owner || retailer.contactName || 'Unknown owner',
  email: retailer.email || retailer.ownerEmail || '',
  phone: retailer.phone || retailer.contactPhone || '',
  gstin: retailer.gstin || retailer.taxId || 'N/A',
  city: retailer.city || 'N/A',
  state: retailer.state || 'N/A',
  status: retailer.status || retailer.approvalStatus || 'Unknown',
  createdAt: retailer.createdAt || retailer.created_on || retailer.submittedOn || '',
});

const getCreatedAtTime = (retailer) => {
  const timestamp = Date.parse(retailer.createdAt);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const csvValue = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

const SummaryCard = ({ label, value, detail }) => (
  <div className="admin-stat-card">
    <p>{label}</p>
    <h3>{value}</h3>
    <small>{detail}</small>
  </div>
);

const AdminReportsPage = ({ onLogout }) => {
  const [retailers, setRetailers] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [period, setPeriod] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const loadRetailers = async () => {
      setError('');
      try {
        const response = await apiFetch(API_ENDPOINTS.adminRetailers);
        if (!response.ok) {
          throw new Error(`Retailer report request failed (${response.status}).`);
        }
        const payload = await response.json();
        const list = extractRetailersList(payload);
        if (!Array.isArray(list)) {
          throw new Error('The retailer report response has an unsupported format.');
        }
        if (active) setRetailers(list.map(normalizeRetailer));
      } catch (requestError) {
        if (active) {
          setRetailers([]);
          setError(requestError instanceof Error ? requestError.message : 'Unable to load the retailer report.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadRetailers();
    return () => { active = false; };
  }, [refreshKey]);

  const filteredRetailers = useMemo(() => {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === '30') startDate.setDate(startDate.getDate() - 30);
    if (period === '90') startDate.setDate(startDate.getDate() - 90);
    if (period === 'year') startDate.setMonth(0, 1);
    const term = search.trim().toLowerCase();

    return retailers.filter((retailer) => {
      const createdAt = getCreatedAtTime(retailer);
      const matchesPeriod = period === 'all' || (createdAt !== null && createdAt >= startDate.getTime());
      const matchesStatus = statusFilter === 'all' || retailer.status.trim().toLowerCase() === statusFilter;
      const matchesSearch = !term || [
        retailer.businessName,
        retailer.ownerName,
        retailer.email,
        retailer.gstin,
        retailer.city,
        retailer.state,
      ].some((value) => String(value).toLowerCase().includes(term));
      return matchesPeriod && matchesStatus && matchesSearch;
    });
  }, [period, retailers, search, statusFilter]);

  const summary = useMemo(() => {
    const statuses = filteredRetailers.reduce((counts, retailer) => {
      const status = retailer.status.trim().toLowerCase();
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {});
    const cities = filteredRetailers.reduce((counts, retailer) => {
      counts[retailer.city] = (counts[retailer.city] || 0) + 1;
      return counts;
    }, {});

    return {
      total: filteredRetailers.length,
      approved: (statuses.approved || 0) + (statuses.active || 0),
      pending: Object.entries(statuses)
        .filter(([status]) => status.includes('pending') || status.includes('info'))
        .reduce((count, [, total]) => count + total, 0),
      blocked: (statuses.blocked || 0) + (statuses.rejected || 0),
      statuses: Object.entries(statuses).sort((a, b) => b[1] - a[1]),
      cities: Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [filteredRetailers]);

  const handleRefresh = () => {
    setLoading(true);
    setRefreshKey((value) => value + 1);
  };

  const handleExport = () => {
    const columns = ['Retailer ID', 'Business name', 'Owner', 'Email', 'Phone', 'GSTIN', 'City', 'State', 'Status', 'Created at'];
    const rows = filteredRetailers.map((retailer) => [
      retailer.id,
      retailer.businessName,
      retailer.ownerName,
      retailer.email,
      retailer.phone,
      retailer.gstin,
      retailer.city,
      retailer.state,
      retailer.status,
      retailer.createdAt,
    ]);
    const csv = [columns, ...rows].map((row) => row.map(csvValue).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `retailer-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout
      title="Retailer reports"
      subtitle="Platform-wide retailer onboarding and status report. Filter the live retailer data and export the current result."
      currentUser="Platform Admin"
      onLogout={onLogout}
      onRefresh={handleRefresh}
    >
      <div className="admin-grid three-up">
        <SummaryCard label="Retailers in report" value={summary.total} detail="Matching current filters" />
        <SummaryCard label="Approved / active" value={summary.approved} detail="Approved or currently active" />
        <SummaryCard label="Pending review" value={summary.pending} detail="Pending or awaiting more information" />
        <SummaryCard label="Blocked / rejected" value={summary.blocked} detail="Blocked or rejected accounts" />
      </div>

      <div className="admin-toolbar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search retailer, owner, GSTIN, city or state"
          className="admin-input"
          aria-label="Search retailer report"
        />
        <select className="admin-input" value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Filter by signup period">
          <option value="all">All signup dates</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="year">This year</option>
        </select>
        <select className="admin-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by retailer status">
          <option value="all">All statuses</option>
          {Array.from(new Set(retailers.map((retailer) => retailer.status))).sort().map((status) => (
            <option key={status} value={status.toLowerCase()}>{status}</option>
          ))}
        </select>
        <button type="button" className="admin-primary-button" onClick={handleExport} disabled={loading || Boolean(error)}>
          Export CSV
        </button>
      </div>

      {loading && <p className="muted-text" role="status">Loading retailer report…</p>}
      {error && (
        <div className="admin-panel" role="alert">
          <p>{error}</p>
          <button type="button" className="admin-secondary-button" onClick={handleRefresh}>Try again</button>
        </div>
      )}

      <div className="admin-panel-grid">
        <section className="admin-panel">
          <div className="admin-panel-header"><h2>Retailer status breakdown</h2></div>
          {summary.statuses.length ? (
            <ul className="admin-list">
              {summary.statuses.map(([status, count]) => (
                <li key={status}><span>{status}</span><strong>{count}</strong></li>
              ))}
            </ul>
          ) : <p className="muted-text">No retailer status data for these filters.</p>}
        </section>
        <section className="admin-panel">
          <div className="admin-panel-header"><h2>Top retailer cities</h2></div>
          {summary.cities.length ? (
            <ul className="admin-list">
              {summary.cities.map(([city, count]) => (
                <li key={city}><span>{city}</span><strong>{count}</strong></li>
              ))}
            </ul>
          ) : <p className="muted-text">No location data for these filters.</p>}
        </section>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-header"><h2>Retailer records ({filteredRetailers.length})</h2></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Retailer</th>
                <th>Owner</th>
                <th>Contact</th>
                <th>GSTIN</th>
                <th>Location</th>
                <th>Status</th>
                <th>Signup date</th>
              </tr>
            </thead>
            <tbody>
              {filteredRetailers.map((retailer, index) => (
                <tr key={`${retailer.id}-${index}`}>
                  <td><strong>{retailer.businessName}</strong><div className="muted-text">{retailer.id}</div></td>
                  <td>{retailer.ownerName}</td>
                  <td>{retailer.email || retailer.phone || '—'}</td>
                  <td>{retailer.gstin}</td>
                  <td>{retailer.city}, {retailer.state}</td>
                  <td><StatusBadge status={retailer.status} /></td>
                  <td>{retailer.createdAt || '—'}</td>
                </tr>
              ))}
              {!loading && !error && filteredRetailers.length === 0 && (
                <tr><td colSpan="7">No retailers match the selected filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  );
};

export default AdminReportsPage;
