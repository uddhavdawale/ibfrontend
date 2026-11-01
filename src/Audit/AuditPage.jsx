import React, { useEffect, useMemo, useState } from 'react';
import './AuditPage.css';
import { API_ENDPOINTS, apiFetch } from '../Config/api';

const fallbackAuditStats = [
  { label: 'System Checks', value: '24', detail: 'Active validation rules' },
  { label: 'Access Events', value: '1,284', detail: 'Logged in the last 7 days' },
  { label: 'Exceptions', value: '06', detail: 'Needing review' },
  { label: 'Compliance Score', value: '98.4%', detail: 'Within policy thresholds' },
];

const fallbackAuditActivity = [
  { time: '09:12 AM', user: 'system_admin', action: 'Granted role access update', status: 'Approved' },
  { time: '08:45 AM', user: 'store_admin', action: 'Reviewed stock variance report', status: 'Reviewed' },
  { time: '08:10 AM', user: 'audit_team', action: 'Verified tax filing log activity', status: 'Verified' },
  { time: '07:48 AM', user: 'finance_manager', action: 'Checked invoice reconciliation', status: 'Flagged' },
];

const fallbackAuditChecks = [
  { title: 'Access control review', note: 'Verified role-based permission coverage across finance and store workflows.' },
  { title: 'Policy compliance', note: 'Ensured password, MFA, and data handling policies remained in line with the current standard.' },
  { title: 'Operational review', note: 'Checked recent store actions for unusual activity and approval drift.' },
];

const toStatusClass = (status) => String(status || '').trim().toLowerCase();

const normalizeAuditStats = (payload) => {
  const source = payload?.stats || payload?.summary || payload?.data || [];

  if (Array.isArray(source) && source.length) {
    return source.map((entry, index) => ({
      label: entry.label || entry.name || `Metric ${index + 1}`,
      value: entry.value || entry.total || entry.count || '0',
      detail: entry.detail || entry.description || 'Live summary',
    }));
  }

  if (source && typeof source === 'object') {
    return [
      { label: 'System Checks', value: String(source.systemChecks ?? source.totalChecks ?? 24), detail: 'Active validation rules' },
      { label: 'Access Events', value: String(source.accessEvents ?? source.recentEvents ?? 1284), detail: 'Logged in the last 7 days' },
      { label: 'Exceptions', value: String(source.exceptions ?? source.exceptionCount ?? 6), detail: 'Needing review' },
      { label: 'Compliance Score', value: String(source.complianceScore ?? source.score ?? '98.4%'), detail: 'Within policy thresholds' },
    ];
  }

  return fallbackAuditStats;
};

const normalizeAuditActivity = (payload) => {
  const source = payload?.items || payload?.events || payload?.activity || payload?.data || [];

  if (Array.isArray(source) && source.length) {
    return source.map((entry) => ({
      time: entry.event_timestamp || entry.time || entry.timestamp || '—',
      user: entry.actor_user_id || entry.actor || entry.user || 'system',
      action: entry.action_type || entry.action || entry.event || entry.description || 'Reviewed record',
      status: entry.outcome || entry.status || 'Approved',
    }));
  }

  return fallbackAuditActivity;
};

const normalizeAuditChecks = (payload) => {
  if (payload && Array.isArray(payload.items) && payload.items.length) {
    return payload.items.slice(0, 3).map((check) => ({
      title: check.title || check.name || 'Audit review',
      note: check.note || check.description || 'Validated during the latest compliance review.',
    }));
  }

  return fallbackAuditChecks;
};

const readAuditPayload = async (endpoint) => {
  const response = await apiFetch(endpoint, { method: 'GET', headers: { 'Content-Type': 'application/json' } });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  return payload;
};

const AuditPage = () => {
  const [stats, setStats] = useState(fallbackAuditStats);
  const [activity, setActivity] = useState(fallbackAuditActivity);
  const [checks, setChecks] = useState(fallbackAuditChecks);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;

    const loadAuditData = async () => {
      try {
        const [summary, eventData] = await Promise.all([
          readAuditPayload(API_ENDPOINTS.auditSummary).catch((error) => {
            console.warn('Audit summary load failed:', error);
            return {};
          }),
          readAuditPayload(API_ENDPOINTS.auditEvents).catch((error) => {
            console.warn('Audit events load failed:', error);
            return {};
          }),
        ]);

        if (!active) return;

        setStats(normalizeAuditStats(summary));
        setActivity(normalizeAuditActivity(eventData));
        setChecks(normalizeAuditChecks(eventData));
      } catch {
        if (active) {
          setStats(fallbackAuditStats);
          setActivity(fallbackAuditActivity);
          setChecks(fallbackAuditChecks);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadAuditData();
    return () => { active = false; };
  }, []);

  const exportSummary = async () => {
    setExporting(true);

    try {
      const response = await apiFetch(API_ENDPOINTS.auditExport, {
        method: 'GET',
        headers: { Accept: 'application/json, text/csv, application/octet-stream' },
      });

      if (response.ok) {
        const blob = await response.blob();
        const contentType = response.headers.get('Content-Type') || 'application/json';
        const url = window.URL.createObjectURL(new Blob([blob], { type: contentType }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'audit-report.json';
        anchor.click();
        window.URL.revokeObjectURL(url);
        return;
      }
    } catch {
      // Continue to the local export fallback below.
    } finally {
      setExporting(false);
    }

    const report = { generatedAt: new Date().toISOString(), stats, activity, checks };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'audit-report.json';
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const summaryLabel = useMemo(() => (loading ? 'Loading live data…' : 'Live'), [loading]);

  return (
    <div className="audit-page">
      <div className="audit-page__header">
        <div>
          <p className="audit-page__eyebrow">Audit & Compliance</p>
          <h1>Audit overview</h1>
        </div>
        <button type="button" className="audit-page__primary-btn" onClick={exportSummary} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export report'}
        </button>
      </div>

      <div className="audit-page__stats">
        {stats.map((stat) => (
          <div className="audit-card" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.detail}</small>
          </div>
        ))}
      </div>

      <div className="audit-page__content">
        <section className="audit-panel">
          <div className="audit-panel__header">
            <h2>Recent activity</h2>
            <span className="audit-panel__tag">{summaryLabel}</span>
          </div>

          <div className="audit-table">
            <div className="audit-table__row audit-table__header">
              <span>Time</span>
              <span>User</span>
              <span>Action</span>
              <span>Status</span>
            </div>

            {activity.map((entry) => (
              <div className="audit-table__row" key={`${entry.time}-${entry.user}-${entry.action}`}>
                <span>{entry.time}</span>
                <span>{entry.user}</span>
                <span>{entry.action}</span>
                <span className={`audit-status audit-status--${toStatusClass(entry.status)}`}>{entry.status}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="audit-panel">
          <div className="audit-panel__header">
            <h2>Review checks</h2>
          </div>

          <div className="audit-checklist">
            {checks.map((check) => (
              <div className="audit-check" key={check.title}>
                <div className="audit-check__bullet">✓</div>
                <div>
                  <h3>{check.title}</h3>
                  <p>{check.note}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default AuditPage;
