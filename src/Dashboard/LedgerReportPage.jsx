import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINTS, apiFetch } from '../Config/api';
import './LedgerReportPage.css';

const PAGE_SIZE = 200;

const extractInvoices = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  for (const key of ['content', 'items', 'invoices', 'results', 'records']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  if (payload.data !== undefined) return extractInvoices(payload.data);
  if (payload.id !== undefined || payload.invoiceNo || payload.invoiceNumber) return [payload];
  return null;
};

const fetchInvoicePages = async (endpointForPage) => {
  const firstResponse = await apiFetch(endpointForPage(0));
  if (!firstResponse.ok) throw new Error(`Invoice request failed (${firstResponse.status}).`);

  const firstPayload = await firstResponse.json();
  const firstPage = extractInvoices(firstPayload);
  if (!firstPage) throw new Error('Invoice API returned an unsupported response format.');
  const invoices = [...firstPage];
  const pageInfo = [
    firstPayload?.page,
    firstPayload?.pageable,
    firstPayload?.pagination,
    firstPayload?.meta,
    firstPayload?.data?.page,
    firstPayload?.data?.pageable,
    firstPayload?.data?.pagination,
    firstPayload?.data?.meta,
    firstPayload?.data,
    firstPayload,
  ].find((candidate) => candidate && (
    candidate.totalPages !== undefined
    || candidate.totalElements !== undefined
    || candidate.last !== undefined
  ));
  const pageSize = Number(pageInfo?.size || PAGE_SIZE);
  const totalPages = Number(
    pageInfo?.totalPages
    ?? (pageInfo?.totalElements !== undefined ? Math.ceil(Number(pageInfo.totalElements) / pageSize) : undefined)
    ?? 1
  );
  if (!Number.isFinite(totalPages) || totalPages < 0 || totalPages > 100) {
    throw new Error('Invoice API returned invalid pagination details.');
  }
  const pagesToLoad = totalPages > 1
    ? Array.from({ length: totalPages - 1 }, (_, index) => index + 1)
    : [];

  const remainingPages = await Promise.all(pagesToLoad.map(async (page) => {
    const response = await apiFetch(endpointForPage(page));
    if (!response.ok) throw new Error(`Invoice page ${page + 1} request failed (${response.status}).`);
    const records = extractInvoices(await response.json());
    if (!records) throw new Error(`Invoice page ${page + 1} returned an unsupported response format.`);
    return records;
  }));

  remainingPages.forEach((page) => invoices.push(...page));
  return invoices;
};

const fetchInvoiceSource = async (primaryEndpoint, legacyEndpoint) => {
  try {
    return await fetchInvoicePages(primaryEndpoint);
  } catch (primaryError) {
    try {
      return await fetchInvoicePages(legacyEndpoint);
    } catch (legacyError) {
      throw new Error(`Unable to load invoices: ${legacyError.message || primaryError.message}`);
    }
  }
};

const normalizePhone = (value) => String(value || '').replace(/\D/g, '').replace(/^0+/, '');

const getCustomerKey = (source = {}) => {
  const customerId = source.customerId ?? source.customer?.id;
  if (customerId !== undefined && customerId !== null && String(customerId).trim()) {
    return `id:${String(customerId).trim()}`;
  }
  const phone = normalizePhone(source.customerPhone ?? source.phone ?? source.customer?.phone);
  if (phone) return `phone:${phone}`;
  const name = String(source.customerName ?? source.customer?.name ?? source.customer ?? '').trim().toLowerCase();
  return `name:${name || 'walk-in-customer'}`;
};

const getCustomerMatchKeys = (source = {}) => {
  const keys = [];
  const customerId = source.customerId ?? source.customer?.id;
  const phone = normalizePhone(source.customerPhone ?? source.phone ?? source.customer?.phone);
  const name = String(source.customerName ?? source.customer?.name ?? source.customer ?? '').trim().toLowerCase();
  if (customerId !== undefined && customerId !== null && String(customerId).trim()) keys.push(`id:${String(customerId).trim()}`);
  if (phone) keys.push(`phone:${phone}`);
  if (name) keys.push(`name:${name}`);
  if (!keys.length) keys.push('name:walk-in-customer');
  return keys;
};

const readAmount = (...values) => {
  const value = values.find((candidate) => candidate !== undefined && candidate !== null && candidate !== '');
  if (value === undefined) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
};

const normalizeInvoice = (invoice, index, billType) => {
  const total = readAmount(
    invoice.grandTotal,
    invoice.totalAmount,
    invoice.total,
    invoice.amount,
    invoice.invoiceTotal
  ) ?? (
    (readAmount(invoice.subtotal) || 0) + (readAmount(invoice.gstAmount, invoice.taxAmount) || 0)
  );
  const status = String(invoice.paymentStatus || invoice.payment_status || invoice.status || 'unknown').trim();
  const normalizedStatus = status.toLowerCase();
  const isVoided = ['cancelled', 'canceled', 'void', 'returned', 'return'].includes(normalizedStatus);
  const paidValue = readAmount(
    invoice.receivedAmount,
    invoice.paidAmount,
    invoice.amountPaid,
    invoice.totalPaid,
    invoice.amountReceived
  );
  const paid = isVoided ? 0 : paidValue === null
    ? (normalizedStatus === 'paid' ? total : 0)
    : paidValue;
  const invoiceDue = isVoided
    ? 0
    : Math.max(readAmount(invoice.outstandingAmount, invoice.invoiceDueAmount, invoice.dueAmount) ?? (total - paid), 0);
  const savedPreviousBalance = readAmount(invoice.previousBalance, invoice.openingBalance);
  const savedBalance = readAmount(invoice.currentBalance, invoice.balanceAmount, invoice.totalDueAmount);
  const invoiceNo = invoice.invoiceNo || invoice.invoiceNumber || invoice.invoice_number || `INV-${invoice.id ?? index + 1}`;
  const customerName = invoice.customerName || invoice.customer?.name || invoice.customer || 'Walk-in Customer';
  const customerPhone = invoice.customerPhone || invoice.customer?.phone || invoice.phone || '';
  const rawDate = invoice.invoiceDate || invoice.createdAt || invoice.orderDate || invoice.date || invoice.created_on || '';
  const timestamp = rawDate ? new Date(rawDate).getTime() : 0;

  return {
    id: String(invoice.id ?? invoiceNo),
    invoiceNo: String(invoiceNo),
    customerName: String(customerName),
    customerPhone: String(customerPhone),
    customerKey: getCustomerKey(invoice),
    customerMatchKeys: getCustomerMatchKeys(invoice),
    date: rawDate,
    timestamp: Number.isNaN(timestamp) ? 0 : timestamp,
    total: isVoided ? 0 : Math.max(total, 0),
    paid: Math.min(Math.max(paid, 0), Math.max(total, 0)),
    previousBalance: savedPreviousBalance === null ? null : Math.max(savedPreviousBalance, 0),
    invoiceDue,
    savedBalance: savedBalance === null ? null : Math.max(savedBalance, 0),
    paymentMethod: invoice.paymentMethod || invoice.payment_method || '—',
    paymentStatus: status,
    isVoided,
    billType,
  };
};

const extractCustomers = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  for (const key of ['customers', 'content', 'items', 'results', 'records']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  if (payload.data !== undefined) return extractCustomers(payload.data);
  return null;
};

const fetchCustomerBalances = async () => {
  let lastError;
  for (const endpoint of [API_ENDPOINTS.customerProfiles, API_ENDPOINTS.customers]) {
    try {
      const response = await apiFetch(endpoint);
      if (!response.ok) {
        lastError = new Error(`Customer balance request failed (${response.status}).`);
        continue;
      }
      const records = extractCustomers(await response.json());
      if (!records) throw new Error('Customer API returned an unsupported response format.');
      return records.map((customer) => ({
        customerKey: getCustomerKey(customer),
        customerMatchKeys: [
          ...getCustomerMatchKeys(customer),
          ...(customer.id !== undefined && customer.id !== null ? [`id:${String(customer.id)}`] : []),
        ],
        customerName: customer.customerName || customer.name || customer.customer || 'Customer',
        customerPhone: customer.phone || customer.mobile || customer.contactNumber || '',
        currentBalance: Math.max(readAmount(
          customer.dueBalance,
          customer.outstandingBalance,
          customer.balanceDue,
          customer.pendingAmount,
          customer.pendingBalance,
          customer.amountDue,
          customer.totalDue,
          customer.customerDue,
          customer.balance,
          customer.receivable,
          customer.outstanding
        ) || 0, 0),
      }));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Customer balances are unavailable.');
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

const toLocalDateInputValue = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getPaymentStatusClass = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (['paid', 'complete', 'completed'].includes(normalized)) return 'paid';
  if (['cancelled', 'canceled', 'void', 'returned', 'return'].includes(normalized)) return 'cancelled';
  if (['partial', 'partially_paid'].includes(normalized)) return 'partial';
  return 'pending';
};

const csvValue = (value) => {
  const rawValue = String(value ?? '');
  const safeValue = /^[\s]*[=+\-@]/.test(rawValue) ? `'${rawValue}` : rawValue;
  return `"${safeValue.replaceAll('"', '""')}"`;
};

const LedgerReportPage = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [customerBalances, setCustomerBalances] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canExport, setCanExport] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const loadLedger = async () => {
      setLoading(true);
      setError('');
      setCanExport(false);
      try {
        const results = await Promise.allSettled([
          fetchInvoiceSource(
            (page) => API_ENDPOINTS.invoicesPage(page, PAGE_SIZE),
            (page) => API_ENDPOINTS.invoiceLegacyPage(page, PAGE_SIZE)
          ),
          fetchInvoicePages((page) => API_ENDPOINTS.nonGstInvoicesPage(page, PAGE_SIZE)),
          fetchCustomerBalances(),
        ]);

        const invoiceResult = results[0];
        const nonGstResult = results[1];
        const customerResult = results[2];
        if (!active) return;

        if (invoiceResult.status === 'rejected' && nonGstResult.status === 'rejected') {
          setInvoices([]);
          setCustomerBalances(customerResult.status === 'fulfilled' ? customerResult.value : []);
          setError(`${invoiceResult.reason.message} ${nonGstResult.reason.message}`);
        } else {
          setCanExport(invoiceResult.status === 'fulfilled' && nonGstResult.status === 'fulfilled');
          const gstInvoices = invoiceResult.status === 'fulfilled'
            ? invoiceResult.value.map((invoice, index) => normalizeInvoice(invoice, index, 'GST'))
            : [];
          const nonGstInvoices = nonGstResult.status === 'fulfilled'
            ? nonGstResult.value.map((invoice, index) => normalizeInvoice(invoice, index, 'Non-GST'))
            : [];
          setInvoices([...gstInvoices, ...nonGstInvoices]);
          setCustomerBalances(customerResult.status === 'fulfilled' ? customerResult.value : []);
          if (invoiceResult.status === 'rejected' || nonGstResult.status === 'rejected') {
            setError('Some invoice records could not be loaded. Totals may be incomplete; refresh to try again.');
          } else if (customerResult.status === 'rejected') {
            setError('Invoice activity loaded, but current customer balances are unavailable. Showing invoice balance snapshots instead.');
          }
        }
      } catch (loadError) {
        if (active) {
          setInvoices([]);
          setCustomerBalances([]);
          setCanExport(false);
          setError(loadError instanceof Error ? loadError.message : 'Unable to load ledger records.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadLedger();
    return () => { active = false; };
  }, [refreshKey]);

  const ledgerInvoices = useMemo(() => {
    const accounts = new Map();
    invoices.forEach((invoice) => {
      if (!accounts.has(invoice.customerKey)) accounts.set(invoice.customerKey, []);
      accounts.get(invoice.customerKey).push(invoice);
    });

    return [...accounts.values()].flatMap((accountInvoices) => {
      const chronological = [...accountInvoices].sort((a, b) => (
        (a.timestamp || 0) - (b.timestamp || 0) || a.invoiceNo.localeCompare(b.invoiceNo)
      ));
      let runningBalance = 0;
      return chronological.map((invoice) => {
        const openingBalance = invoice.previousBalance ?? runningBalance;
        const closingBalance = invoice.isVoided
          ? openingBalance
          : invoice.savedBalance ?? Math.max(openingBalance + invoice.invoiceDue, 0);
        runningBalance = closingBalance;
        return { ...invoice, openingBalance, closingBalance };
      });
    });
  }, [invoices]);

  const customerOptions = useMemo(() => {
    const accounts = new Map();
    ledgerInvoices.forEach((invoice) => {
      if (!accounts.has(invoice.customerKey)) {
        accounts.set(invoice.customerKey, {
          key: invoice.customerKey,
          name: invoice.customerName,
          phone: invoice.customerPhone,
        });
      } else if (!accounts.get(invoice.customerKey).phone && invoice.customerPhone) {
        accounts.get(invoice.customerKey).phone = invoice.customerPhone;
      }
    });
    return [...accounts.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [ledgerInvoices]);

  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ledgerInvoices
      .filter((invoice) => {
        const matchesCustomer = selectedCustomer === 'all' || invoice.customerKey === selectedCustomer;
        const searchable = `${invoice.customerName} ${invoice.customerPhone} ${invoice.invoiceNo}`.toLowerCase();
        const matchesSearch = !term || searchable.includes(term);
        const dateOnly = invoice.date ? toLocalDateInputValue(invoice.date) : '';
        const matchesStart = !startDate || (dateOnly && dateOnly >= startDate);
        const matchesEnd = !endDate || (dateOnly && dateOnly <= endDate);
        return matchesCustomer && matchesSearch && matchesStart && matchesEnd;
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0) || a.invoiceNo.localeCompare(b.invoiceNo));
  }, [endDate, ledgerInvoices, search, selectedCustomer, startDate]);

  const summary = useMemo(() => {
    const visibleAccounts = new Map();
    filteredInvoices.forEach((invoice) => {
      if (!visibleAccounts.has(invoice.customerKey)) {
        visibleAccounts.set(invoice.customerKey, invoice.customerMatchKeys);
      }
    });
    const latestBalances = new Map();
    ledgerInvoices.forEach((invoice) => {
      if (!latestBalances.has(invoice.customerKey)
        || invoice.timestamp >= latestBalances.get(invoice.customerKey).timestamp) {
        latestBalances.set(invoice.customerKey, {
          timestamp: invoice.timestamp,
          balance: invoice.closingBalance,
        });
      }
    });

    const liveBalances = new Map();
    customerBalances.forEach((customer) => {
      customer.customerMatchKeys.forEach((key) => liveBalances.set(key, customer.currentBalance));
    });
    const customerDue = [...visibleAccounts.entries()].reduce((total, [customerKey, matchKeys]) => (
      total + (
        matchKeys.map((key) => liveBalances.get(key))
          .find((balance) => balance !== undefined)
        ?? latestBalances.get(customerKey)?.balance
        ?? 0
      )
    ), 0);

    const invoiceTotals = filteredInvoices.reduce((totals, invoice) => ({
      billed: totals.billed + invoice.total,
      received: totals.received + invoice.paid,
    }), { billed: 0, received: 0 });

    return {
      ...invoiceTotals,
      customerDue,
      customerCount: visibleAccounts.size,
    };
  }, [customerBalances, filteredInvoices, ledgerInvoices]);

  const refreshLedger = () => setRefreshKey((key) => key + 1);

  const exportLedger = () => {
    const columns = ['Date', 'Invoice', 'Customer', 'Phone', 'Bill type', 'Payment method', 'Status', 'Opening balance', 'Billed', 'Received', 'Invoice due', 'Balance after'];
    const rows = filteredInvoices.map((invoice) => [
      invoice.date,
      invoice.invoiceNo,
      invoice.customerName,
      invoice.customerPhone,
      invoice.billType,
      invoice.paymentMethod,
      invoice.paymentStatus,
      invoice.openingBalance.toFixed(2),
      invoice.total.toFixed(2),
      invoice.paid.toFixed(2),
      invoice.invoiceDue.toFixed(2),
      invoice.closingBalance.toFixed(2),
    ]);
    const csv = [columns, ...rows].map((row) => row.map(csvValue).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `customer-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="ledger-page">
      <header className="ledger-header">
        <div>
          <p className="ledger-eyebrow">Smart business reports</p>
          <h1>Customer ledger</h1>
          <p>Review invoice charges, payments, and customer balances using this shop’s saved invoice and customer records.</p>
        </div>
        <div className="ledger-header-actions">
          <button type="button" className="ledger-button secondary" onClick={() => navigate('/dashboard')}>Back to dashboard</button>
          <button type="button" className="ledger-button secondary" onClick={refreshLedger} disabled={loading}>Refresh</button>
          <button type="button" className="ledger-button primary" onClick={exportLedger} disabled={loading || !canExport || filteredInvoices.length === 0}>Export CSV</button>
        </div>
      </header>

      {error && <div className="ledger-message" role="alert">{error}</div>}
      {loading && <div className="ledger-message" role="status">Loading saved invoice activity…</div>}

      <section className="ledger-summary" aria-label="Ledger summary">
        <article className="ledger-summary-card">
          <span>Billed</span><strong>{formatMoney(summary.billed)}</strong><small>{filteredInvoices.length} invoices</small>
        </article>
        <article className="ledger-summary-card">
          <span>Payments received</span><strong>{formatMoney(summary.received)}</strong><small>Recorded against invoices</small>
        </article>
        <article className="ledger-summary-card due">
          <span>Current customer due</span><strong>{formatMoney(summary.customerDue)}</strong><small>{summary.customerCount} customer accounts</small>
        </article>
      </section>

      <section className="ledger-panel">
        <div className="ledger-toolbar">
          <label>
            <span>Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer, phone or invoice" />
          </label>
          <label>
            <span>Customer account</span>
            <select value={selectedCustomer} onChange={(event) => setSelectedCustomer(event.target.value)}>
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
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <button type="button" className="ledger-button text" onClick={() => {
            setSearch('');
            setSelectedCustomer('all');
            setStartDate('');
            setEndDate('');
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
              {filteredInvoices.map((invoice) => (
                <tr key={`${invoice.billType}-${invoice.id}`}>
                  <td>{formatDate(invoice.date)}</td>
                  <td><strong>{invoice.invoiceNo}</strong></td>
                  <td>{invoice.customerName}{invoice.customerPhone && <small>{invoice.customerPhone}</small>}</td>
                  <td><span className={`ledger-type ${invoice.billType === 'GST' ? 'gst' : 'non-gst'}`}>{invoice.billType}</span></td>
                  <td>{invoice.paymentMethod}</td>
                  <td><span className={`ledger-status ${getPaymentStatusClass(invoice.paymentStatus)}`}>{invoice.paymentStatus}</span></td>
                  <td className="numeric">{formatMoney(invoice.openingBalance)}</td>
                  <td className="numeric">{formatMoney(invoice.total)}</td>
                  <td className="numeric">{formatMoney(invoice.paid)}</td>
                  <td className={`numeric ${invoice.invoiceDue > 0 ? 'amount-due' : ''}`}>{formatMoney(invoice.invoiceDue)}</td>
                  <td className={`numeric ${invoice.closingBalance > 0 ? 'amount-due' : ''}`}>{formatMoney(invoice.closingBalance)}</td>
                </tr>
              ))}
              {!loading && filteredInvoices.length === 0 && (
                <tr><td className="ledger-empty" colSpan="11">{error ? 'Invoice data is unavailable.' : 'No invoices match these filters.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <p className="ledger-footnote">Opening balance and invoice balance are read from saved invoice records. Current customer due uses the latest customer profile balance when available; otherwise it uses the latest saved invoice balance. Payments not recorded by the backend are not included.</p>
    </div>
  );
};

export default LedgerReportPage;
