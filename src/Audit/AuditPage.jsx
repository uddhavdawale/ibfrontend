import React, { useEffect, useMemo, useRef, useState } from 'react';
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

  if (Array.isArray(source)) {
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
  const ACTIVITY_PAGE_SIZE = 8;
  const [stats, setStats] = useState(fallbackAuditStats);
  const [activity, setActivity] = useState(fallbackAuditActivity);
  const [checks, setChecks] = useState(fallbackAuditChecks);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalActivityPages, setTotalActivityPages] = useState(1);
  const hasLoadedSummaryRef = useRef(false);

  useEffect(() => {
    let active = true;

    const readSafePageNumber = (value, fallback = 0) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) return fallback;
      return Math.floor(parsed);
    };

    const loadAuditData = async () => {
      const isInitialLoad = !hasLoadedSummaryRef.current;
      if (isInitialLoad) setLoading(true);
      setEventsLoading(true);

      try {
        let summary = null;
        if (isInitialLoad) {
          summary = await readAuditPayload(API_ENDPOINTS.auditSummary).catch((error) => {
            console.warn('Audit summary load failed:', error);
            return {};
          });
        }

        const eventPayload = await readAuditPayload(
          API_ENDPOINTS.auditEventsPage(currentPage, ACTIVITY_PAGE_SIZE)
        ).catch((error) => {
          console.warn('Audit events load failed:', error);
          return {};
        });

        if (!active) return;

        if (summary !== null) {
          setStats(normalizeAuditStats(summary));
          hasLoadedSummaryRef.current = true;
        }

        const normalizedActivity = normalizeAuditActivity(eventPayload);
        const payloadPage = readSafePageNumber(
          eventPayload?.page?.number ?? eventPayload?.page,
          currentPage
        );
        const payloadTotalPages = readSafePageNumber(
          eventPayload?.page?.totalPages ?? eventPayload?.totalPages,
          0
        );
        const payloadSize = readSafePageNumber(
          eventPayload?.page?.size ?? eventPayload?.size,
          ACTIVITY_PAGE_SIZE
        );
        const payloadTotalItems = readSafePageNumber(
          eventPayload?.page?.totalElements ?? eventPayload?.totalItems ?? eventPayload?.total,
          0
        );

        const inferredTotalPages = payloadTotalPages > 0
          ? payloadTotalPages
          : (payloadTotalItems > 0 ? Math.ceil(payloadTotalItems / Math.max(payloadSize, 1)) : 1);

        setActivity(normalizedActivity);
        setChecks(normalizeAuditChecks(eventPayload));
        setTotalActivityPages(Math.max(1, inferredTotalPages));

        if (payloadPage !== currentPage) {
          setCurrentPage(Math.max(0, Math.min(payloadPage, Math.max(1, inferredTotalPages) - 1)));
        }
      } catch {
        if (active) {
          if (isInitialLoad) {
            setStats(fallbackAuditStats);
            hasLoadedSummaryRef.current = true;
          }
          setActivity(fallbackAuditActivity);
          setChecks(fallbackAuditChecks);
          setTotalActivityPages(Math.max(1, Math.ceil(fallbackAuditActivity.length / ACTIVITY_PAGE_SIZE)));
        }
      } finally {
        if (active) {
          setEventsLoading(false);
          setLoading(false);
        }
      }
    };

    loadAuditData();
    return () => { active = false; };
  }, [currentPage]);

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

  const summaryLabel = useMemo(() => ((loading || eventsLoading) ? 'Loading live data...' : 'Live'), [loading, eventsLoading]);

  const goToPage = (page) => {
    const nextPage = Number(page);
    if (!Number.isFinite(nextPage)) return;
    if (nextPage < 0 || nextPage >= totalActivityPages) return;
    setCurrentPage(nextPage);
  };

  return (
    <div className="audit-page">
      <div className="audit-page__header">
        <div>
          <p className="audit-page__eyebrow">Audit & Compliance</p>
          <h1>Audit overview</h1>
          <p className="audit-page__subtitle">Track system events, review checks, and maintain compliance visibility.</p>
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

            {!activity.length && (
              <div className="audit-table__empty">No recent activity available.</div>
            )}
          </div>

          <div className="audit-pagination">
            <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 0 || eventsLoading}>
              ← Previous
            </button>
            <span>Page {currentPage + 1} of {totalActivityPages}</span>
            <button
              type="button"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage + 1 >= totalActivityPages || eventsLoading}
            >
              Next →
            </button>
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
