import React, { useEffect, useState } from 'react';
import AdminLayout from './AdminLayout';
import { auditLogs as fallbackLogs } from './adminData';
import { API_ENDPOINTS, apiFetch } from '../Config/api';

const normalizeAuditLog = (log = {}) => ({
  id: log.id || log.auditId || 'N/A',
  actor: log.actor || log.userName || 'System',
  action: log.action || log.eventType || 'Unknown action',
  target: log.target || log.entityName || 'N/A',
  time: log.time || log.createdAt || log.timestamp || 'N/A',
  status: log.status || 'Completed',
});

const extractAuditLogs = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.logs)) return payload.logs;
  return [];
};

const AdminAuditLogsPage = ({ onLogout }) => {
  const [logs, setLogs] = useState(fallbackLogs);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const loadLogs = async () => {
      try {
        const response = await apiFetch(API_ENDPOINTS.adminAuditLogs);
        if (!response.ok) throw new Error('Audit logs unavailable');
        const payload = await response.json().catch(() => ({}));
        const list = extractAuditLogs(payload).map(normalizeAuditLog);
        if (active) setLogs(list.length ? list : fallbackLogs);
      } catch {
        if (active) setLogs(fallbackLogs);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadLogs();
    return () => { active = false; };
  }, [refreshKey]);

  const handleRefresh = () => {
    setLoading(true);
    setRefreshKey((value) => value + 1);
  };

  return (
    <AdminLayout title="Audit log viewer" subtitle="Immutable, append-only record of sensitive admin actions and operational changes." currentUser="System Admin" onLogout={onLogout} onRefresh={handleRefresh}>
      {loading && <p className="muted-text">Loading audit records…</p>}
      <section className="admin-panel">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Audit ID</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Time (UTC)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.id}</td>
                <td>{log.actor}</td>
                <td>{log.action}</td>
                <td>{log.target}</td>
                <td>{log.time}</td>
                <td><span className="admin-status admin-status-neutral">{log.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminLayout>
  );
};

export default AdminAuditLogsPage;
