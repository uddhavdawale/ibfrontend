import React from 'react';
import AdminLayout from './AdminLayout';
import { auditLogs } from './adminData';

const AdminAuditLogsPage = () => (
  <AdminLayout title="Audit log viewer" subtitle="Immutable, append-only record of sensitive admin actions and operational changes." currentUser="System Admin">
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
          {auditLogs.map((log) => (
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

export default AdminAuditLogsPage;
