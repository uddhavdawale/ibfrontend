import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  downloadCustomerLedgerCsv,
  fetchCustomerLedgerPage,
} from './customerLedgerService';
import '../../Dashboard/LedgerReportPage.css';

const PAGE_SIZE = 25;
const EMPTY_SUMMARY = {
  billed: 0,
  received: 0,
  customerDue: 0,
  customerCount: 0,
};

const formatMoney = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getPaymentStatusClass = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (['paid', 'complete', 'completed'].includes(normalized)) return 'paid';
  if (['cancelled', 'canceled', 'void', 'returned', 'return'].includes(normalized)) return 'cancelled';
  if (['partial', 'partially_paid'].includes(normalized)) return 'partial';
  return 'pending';
};

const CustomerLedgerPage = ({ onBackToDashboard }) => {
  const navigate = useNavigate();
  const backToDashboard = () => {
    if (onBackToDashboard) onBackToDashboard();
    else navigate('/dashboard');
  };
  const [invoices, setInvoices] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const filtersPending = search.trim() !== debouncedSearch;
  const hasFilters = selectedCustomer !== 'all'
    || Boolean(search.trim())
    || Boolean(startDate)
    || Boolean(endDate);
  const firstVisibleRecord = totalRecords > 0 ? currentPage * PAGE_SIZE + 1 : 0;
  const lastVisibleRecord = Math.min((currentPage + 1) * PAGE_SIZE, totalRecords);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    if (filtersPending) return undefined;

    let active = true;
    const controller = new AbortController();
    const loadPage = async () => {
      setLoading(true);
      setError('');
      try {
        const result = await fetchCustomerLedgerPage({
          page: currentPage,
          size: PAGE_SIZE,
          search: debouncedSearch,
          customerKey: selectedCustomer,
          from: startDate,
          to: endDate,
        }, controller.signal);
        if (!active) return;

        const lastPage = Math.max(result.page.totalPages - 1, 0);
        if (currentPage > lastPage) {
          setCurrentPage(lastPage);
          return;
        }

        setInvoices(result.rows);
        setTotalRecords(result.page.totalElements);
        setTotalPages(Math.max(result.page.totalPages, 1));
        setSummary(result.summary);
        if (Array.isArray(result.customerOptions)) {
          setCustomerOptions(result.customerOptions);
        }
      } catch (loadError) {
        if (!active || loadError.name === 'AbortError') return;
        setInvoices([]);
        setTotalRecords(0);
        setTotalPages(1);
        setSummary(EMPTY_SUMMARY);
        setError(loadError instanceof Error
          ? `Unable to load customer ledger: ${loadError.message}`
          : 'Unable to load customer ledger.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPage();
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    currentPage,
    debouncedSearch,
    endDate,
    filtersPending,
    refreshKey,
    selectedCustomer,
    startDate,
  ]);

  const refreshLedger = () => setRefreshKey((key) => key + 1);

  const exportLedger = async () => {
    setIsExporting(true);
    setError('');
    try {
      await downloadCustomerLedgerCsv({
        search: debouncedSearch,
        customerKey: selectedCustomer,
        from: startDate,
        to: endDate,
      });
    } catch (exportError) {
      setError(exportError instanceof Error
        ? `Unable to export customer ledger: ${exportError.message}`
        : 'Unable to export customer ledger.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="ledger-page">
      <header className="ledger-header">
        <div className="ledger-header-main">
          <button type="button" className="ledger-button secondary" onClick={backToDashboard}>
            ← Back to dashboard
          </button>
          <div className="ledger-header-copy">
            <p className="ledger-eyebrow">Smart business reports</p>
            <h1>Customer ledger</h1>
            <p>Review invoice charges, payments, and customer balances using this shop’s invoice and payment records.</p>
          </div>
        </div>
        <div className="ledger-header-actions">
          <button type="button" className="ledger-button secondary" onClick={refreshLedger} disabled={loading}>Refresh</button>
          <button
            type="button"
            className="ledger-button primary"
            onClick={exportLedger}
            disabled={loading || filtersPending || isExporting}
          >
            {isExporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </header>

      {error && <div className="ledger-message" role="alert">{error}</div>}
      {loading && <div className="ledger-message" role="status">Loading customer ledger…</div>}

      <section className="ledger-summary" aria-label="Ledger summary">
        <article className="ledger-summary-card">
          <span>Billed</span><strong>{formatMoney(summary.billed)}</strong><small>{totalRecords} invoices</small>
        </article>
        <article className="ledger-summary-card">
          <span>Payments received</span><strong>{formatMoney(summary.received)}</strong>
          <small>{!hasFilters
            ? 'All-time net total from payment report'
            : 'Net payments for matching invoices'}</small>
        </article>
        <article className="ledger-summary-card due">
          <span>Current customer due</span><strong>{formatMoney(summary.customerDue)}</strong>
          <small>{!hasFilters
            ? 'Shop total from payment report'
            : `${summary.customerCount} matching customer accounts`}</small>
        </article>
      </section>

      <section className="ledger-panel">
        <div className="ledger-toolbar">
          <label>
            <span>Search</span>
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setCurrentPage(0);
              }}
              placeholder="Customer, phone or invoice"
            />
          </label>
          <label>
            <span>Customer account</span>
            <select
              value={selectedCustomer}
              onChange={(event) => {
                setSelectedCustomer(event.target.value);
                setCurrentPage(0);
              }}
            >
              <option value="all">All customers</option>
              {customerOptions.map((customer) => (
                <option key={customer.key} value={customer.key}>
                  {customer.phone ? `${customer.name} (${customer.phone})` : customer.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>From</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setCurrentPage(0);
              }}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setCurrentPage(0);
              }}
            />
          </label>
          <button type="button" className="ledger-button text" onClick={() => {
            setSearch('');
            setDebouncedSearch('');
            setSelectedCustomer('all');
            setStartDate('');
            setEndDate('');
            setCurrentPage(0);
          }}>Clear filters</button>
        </div>

        <div className="ledger-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Date</th><th>Invoice</th><th>Customer</th><th>Type</th><th>Payment</th><th>Status</th>
                <th className="numeric">Opening balance</th><th className="numeric">Billed</th>
                <th className="numeric">Received</th><th className="numeric">Invoice due</th><th className="numeric">Balance after</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={`${invoice.billType}-${invoice.id}`}>
                  <td>{formatDate(invoice.date)}</td>
                  <td><strong>{invoice.invoiceNo}</strong></td>
                  <td>{invoice.customerName}{invoice.customerPhone && <small>{invoice.customerPhone}</small>}</td>
                  <td><span className={`ledger-type ${invoice.billType === 'GST' ? 'gst' : 'non-gst'}`}>{invoice.billType}</span></td>
                  <td>{invoice.paymentMethod || '—'}</td>
                  <td><span className={`ledger-status ${getPaymentStatusClass(invoice.paymentStatus)}`}>{invoice.paymentStatus}</span></td>
                  <td className="numeric">{formatMoney(invoice.openingBalance)}</td>
                  <td className="numeric">{formatMoney(invoice.total)}</td>
                  <td className="numeric">{formatMoney(invoice.paid)}</td>
                  <td className={`numeric ${invoice.invoiceDue > 0 ? 'amount-due' : ''}`}>{formatMoney(invoice.invoiceDue)}</td>
                  <td className={`numeric ${invoice.closingBalance > 0 ? 'amount-due' : ''}`}>{formatMoney(invoice.closingBalance)}</td>
                </tr>
              ))}
              {!loading && totalRecords === 0 && (
                <tr><td className="ledger-empty" colSpan="11">{error ? 'Invoice data is unavailable.' : 'No invoices match these filters.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <nav className="ledger-pagination" aria-label="Customer ledger pagination">
          <span className="ledger-page-range">
            Showing {firstVisibleRecord}–{lastVisibleRecord} of {totalRecords} records
          </span>
          <div className="ledger-page-controls">
            <button
              type="button"
              className="ledger-button secondary"
              onClick={() => setCurrentPage(Math.max(currentPage - 1, 0))}
              disabled={loading || currentPage === 0}
              aria-label="Previous ledger page"
            >
              Previous
            </button>
            <span aria-live="polite">Page {currentPage + 1} of {totalPages}</span>
            <button
              type="button"
              className="ledger-button secondary"
              onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages - 1))}
              disabled={loading || currentPage >= totalPages - 1}
              aria-label="Next ledger page"
            >
              Next
            </button>
          </div>
        </nav>
      </section>
      <p className="ledger-footnote">Invoice payments include recorded refunds. The unfiltered shop totals come from the payment report; filtered customer balances are reconstructed from that account’s invoice history.</p>
    </div>
  );
};

export default CustomerLedgerPage;
