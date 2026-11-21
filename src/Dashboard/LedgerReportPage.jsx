import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINTS, apiFetch } from '../Config/api';
import './LedgerReportPage.css';

const PAGE_SIZE = 200;
const PAYMENT_PAGE_SIZE = 100;
const PAYMENT_RANGE_DAYS = 365;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

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

const readAmount = (...values) => {
  const value = values.find((candidate) => candidate !== undefined && candidate !== null && candidate !== '');
  if (value === undefined) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
};

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const getRetailDate = (date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(date);

const getPaymentDateRanges = (invoices) => {
  const invoiceDates = invoices
    .map((invoice) => invoice.date ? new Date(invoice.date).getTime() : Number.NaN)
    .filter(Number.isFinite);
  if (invoices.length && invoiceDates.length === 0) {
    throw new Error('Invoice dates are unavailable, so payment history cannot be reconciled.');
  }

  const today = getRetailDate(new Date());
  const firstInvoiceDate = invoiceDates.length
    ? getRetailDate(new Date(Math.min(...invoiceDates)))
    : today;
  const start = new Date(`${firstInvoiceDate}T00:00:00.000Z`);
  const end = new Date(`${today}T00:00:00.000Z`);
  if (start > end) return [{ from: today, to: today }];

  const ranges = [];
  while (start <= end) {
    const rangeEnd = new Date(Math.min(
      start.getTime() + PAYMENT_RANGE_DAYS * DAY_IN_MILLISECONDS,
      end.getTime()
    ));
    ranges.push({ from: getRetailDate(start), to: getRetailDate(rangeEnd) });
    start.setTime(rangeEnd.getTime() + DAY_IN_MILLISECONDS);
  }
  return ranges;
};

const extractPayments = (payload) => {
  if (Array.isArray(payload?.payments)) return payload.payments;
  if (Array.isArray(payload)) return payload;
  if (payload?.data !== undefined) return extractPayments(payload.data);
  return null;
};

const fetchPaymentRange = async ({ from, to }) => {
  const fetchPage = async (page) => {
    const params = new URLSearchParams({
      from,
      to,
      method: 'ALL',
      page: String(page),
      size: String(PAYMENT_PAGE_SIZE),
    });
    const response = await apiFetch(`${API_ENDPOINTS.payments}?${params.toString()}`);
    if (!response.ok) throw new Error(`Payment history request failed (${response.status}).`);
    const payload = await response.json();
    const payments = extractPayments(payload);
    if (!payments) throw new Error('Payment history API returned an unsupported response format.');
    return { payload, payments };
  };

  const firstPage = await fetchPage(0);
  const pageInfo = [
    firstPage.payload?.page,
    firstPage.payload?.pagination,
    firstPage.payload?.meta,
    firstPage.payload?.data?.page,
    firstPage.payload?.data?.pagination,
    firstPage.payload?.data?.meta,
    firstPage.payload?.data,
    firstPage.payload,
  ].find((candidate) => candidate && (
    candidate.totalPages !== undefined || candidate.totalElements !== undefined
  ));
  const outstandingAmount = readAmount(firstPage.payload?.summary?.outstandingAmount);
  const totalCollected = readAmount(firstPage.payload?.summary?.totalCollected);
  if (outstandingAmount === null || totalCollected === null) {
    throw new Error('Payment history API did not return valid collection and outstanding totals.');
  }
  const pageNumber = readAmount(pageInfo?.page);
  const pageSize = readAmount(pageInfo?.size);
  const totalPages = readAmount(pageInfo?.totalPages);
  const totalElements = readAmount(pageInfo?.totalElements);
  if (pageNumber !== 0 || pageSize === null || totalPages === null || totalElements === null
    || totalPages < 0 || totalPages > 100) {
    throw new Error('Payment history API returned invalid pagination details.');
  }

  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(totalPages - 1, 0) }, (_, index) => fetchPage(index + 1))
  );
  const payments = [
    ...firstPage.payments,
    ...remainingPages.flatMap((page) => page.payments),
  ];
  const listedCollectionTotal = roundMoney(payments.reduce((total, payment) => {
    const record = payment?.payment && typeof payment.payment === 'object'
      ? { ...payment, ...payment.payment }
      : payment;
    const amount = readAmount(
      record?.amount,
      record?.paymentAmount,
      record?.collectedAmount,
      record?.amountReceived
    );
    if (amount === null) throw new Error('Payment history contains a record without a valid amount.');
    return total + amount;
  }, 0));
  if (Math.round(listedCollectionTotal * 100) !== Math.round(totalCollected * 100)) {
    throw new Error('Payment history rows do not reconcile with the payment report total.');
  }
  return { payments, outstandingAmount, totalCollected };
};

const fetchPaymentHistory = async (invoices) => {
  const ranges = getPaymentDateRanges(invoices);
  const pages = await Promise.all(ranges.map(fetchPaymentRange));
  return {
    payments: pages.flatMap((page) => page.payments),
    outstandingAmount: pages[pages.length - 1].outstandingAmount,
    totalCollected: roundMoney(pages.reduce((total, page) => total + page.totalCollected, 0)),
  };
};

const normalizeInvoice = (invoice, index, billType) => {
  const rawTotal = readAmount(
    invoice.grandTotal,
    invoice.totalAmount,
    invoice.total,
    invoice.amount,
    invoice.invoiceTotal
  ) ?? (
    (readAmount(invoice.subtotal) || 0) + (readAmount(invoice.gstAmount, invoice.taxAmount) || 0)
  );
  const total = Math.max(roundMoney(rawTotal), 0);
  const status = String(invoice.paymentStatus || invoice.payment_status || invoice.status || 'unknown').trim();
  const normalizedStatus = status.toLowerCase();
  const isVoided = ['cancelled', 'canceled', 'void', 'returned', 'return'].includes(normalizedStatus);
  const paidValue = readAmount(
    invoice.receivedAmount,
    invoice.paidAmount,
    invoice.amountPaid,
    invoice.totalPaid,
    invoice.amountReceived,
    invoice.totalReceived,
    invoice.totalPaidAmount
  );
  const dueValue = readAmount(
    invoice.outstandingAmount,
    invoice.invoiceDueAmount,
    invoice.dueAmount,
    invoice.dueCollection,
    invoice.balanceDue,
    invoice.pendingAmount,
    invoice.pendingBalance
  );
  const boundedDue = dueValue === null ? null : Math.min(Math.max(roundMoney(dueValue), 0), total);
  const paid = isVoided ? 0 : paidValue !== null
    ? Math.min(Math.max(roundMoney(paidValue), 0), total)
    : boundedDue !== null
      ? roundMoney(total - boundedDue)
      : normalizedStatus === 'paid' ? total : 0;
  const invoiceDue = isVoided ? 0 : roundMoney(total - paid);
  const savedPreviousBalance = readAmount(invoice.previousBalance, invoice.openingBalance);
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
    date: rawDate,
    timestamp: Number.isNaN(timestamp) ? 0 : timestamp,
    total: isVoided ? 0 : total,
    paid,
    previousBalance: savedPreviousBalance === null ? null : Math.max(roundMoney(savedPreviousBalance), 0),
    invoiceDue,
    paymentMethod: invoice.paymentMethod || invoice.payment_method || '—',
    paymentStatus: status,
    isVoided,
    billType,
  };
};

const reconcileInvoicePayments = (invoices, payments) => {
  const invoicesByNumber = new Map();
  const invoicesById = new Map();
  invoices.forEach((invoice) => {
    const addReference = (map, reference) => {
      if (!reference) return;
      const key = String(reference).trim().toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(invoice);
    };
    addReference(invoicesByNumber, invoice.invoiceNo);
    addReference(invoicesById, invoice.id);
  });

  const paymentsByInvoice = new Map();
  let unmatchedPayments = 0;
  payments.forEach((payment) => {
    const record = payment?.payment && typeof payment.payment === 'object'
      ? { ...payment, ...payment.payment }
      : payment;
    const amount = readAmount(
      record?.amount,
      record?.paymentAmount,
      record?.collectedAmount,
      record?.amountReceived
    );
    if (amount === null) {
      throw new Error('Payment history contains a record without a valid amount.');
    }

    const invoiceNo = record.invoiceNo
      ?? record.invoiceNumber
      ?? record.invoice?.invoiceNo
      ?? record.invoice?.invoiceNumber;
    const invoiceId = record.invoiceId ?? record.invoice?.id;
    const numberCandidates = invoiceNo
      ? invoicesByNumber.get(String(invoiceNo).trim().toLowerCase())
      : undefined;
    const idCandidates = invoiceId
      ? invoicesById.get(String(invoiceId).trim().toLowerCase())
        || invoicesByNumber.get(String(invoiceId).trim().toLowerCase())
      : undefined;
    const invoiceType = String(record.invoiceType ?? record.billType ?? '').toLowerCase();
    const candidates = numberCandidates?.length === 1
      ? numberCandidates
      : idCandidates?.length === 1
        ? idCandidates
        : numberCandidates || idCandidates;
    const typedCandidates = invoiceType
      ? candidates?.filter((candidate) => (
        invoiceType.includes('non') ? candidate.billType === 'Non-GST' : candidate.billType === 'GST'
      ))
      : candidates;
    const invoice = typedCandidates?.length === 1 ? typedCandidates[0] : null;
    if (!invoice) {
      unmatchedPayments += 1;
      return;
    }

    const key = `${invoice.billType}:${invoice.id}`;
    paymentsByInvoice.set(key, roundMoney((paymentsByInvoice.get(key) || 0) + amount));
  });

  return {
    invoices: invoices.map((invoice) => {
      const paymentKey = `${invoice.billType}:${invoice.id}`;
      if (invoice.isVoided) return invoice;
      if (!paymentsByInvoice.has(paymentKey)) return invoice;

      const paid = Math.min(Math.max(paymentsByInvoice.get(paymentKey) || 0, 0), invoice.total);
      const invoiceDue = roundMoney(invoice.total - paid);
      const paymentStatus = invoiceDue === 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING';
      return { ...invoice, paid, invoiceDue, paymentStatus };
    }),
    unmatchedPayments,
  };
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

const LedgerReportPage = ({ onBackToDashboard }) => {
  const navigate = useNavigate();
  const backToDashboard = () => {
    if (onBackToDashboard) onBackToDashboard();
    else navigate('/dashboard');
  };
  const [invoices, setInvoices] = useState([]);
  const [paymentReportOutstanding, setPaymentReportOutstanding] = useState(null);
  const [paymentReportCollected, setPaymentReportCollected] = useState(null);
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
      setPaymentReportOutstanding(null);
      setPaymentReportCollected(null);
      try {
        const results = await Promise.allSettled([
          fetchInvoiceSource(
            (page) => API_ENDPOINTS.invoicesPage(page, PAGE_SIZE),
            (page) => API_ENDPOINTS.invoiceLegacyPage(page, PAGE_SIZE)
          ),
          fetchInvoicePages((page) => API_ENDPOINTS.nonGstInvoicesPage(page, PAGE_SIZE)),
        ]);

        const invoiceResult = results[0];
        const nonGstResult = results[1];
        if (!active) return;

        if (invoiceResult.status === 'rejected' && nonGstResult.status === 'rejected') {
          setInvoices([]);
          setError(`${invoiceResult.reason.message} ${nonGstResult.reason.message}`);
        } else {
          const gstInvoices = invoiceResult.status === 'fulfilled'
            ? invoiceResult.value.map((invoice, index) => normalizeInvoice(invoice, index, 'GST'))
            : [];
          const nonGstInvoices = nonGstResult.status === 'fulfilled'
            ? nonGstResult.value.map((invoice, index) => normalizeInvoice(invoice, index, 'Non-GST'))
            : [];
          const normalizedInvoices = [...gstInvoices, ...nonGstInvoices];
          let paymentHistory;
          try {
            paymentHistory = await fetchPaymentHistory(normalizedInvoices);
          } catch (paymentError) {
            if (!active) return;
            setInvoices(normalizedInvoices);
            const reason = paymentError instanceof Error
              ? paymentError.message
              : 'Unexpected payment-history response.';
            setError(`Payment history could not be reconciled. Showing saved invoice balances instead. ${reason}`);
            return;
          }
          if (!active) return;
          const reconciled = reconcileInvoicePayments(normalizedInvoices, paymentHistory.payments);
          setInvoices(reconciled.invoices);
          setPaymentReportOutstanding(roundMoney(paymentHistory.outstandingAmount));
          setPaymentReportCollected(normalizedInvoices.length
            ? roundMoney(paymentHistory.totalCollected)
            : null);
          setCanExport(
            invoiceResult.status === 'fulfilled'
            && nonGstResult.status === 'fulfilled'
            && reconciled.unmatchedPayments === 0
          );
          if (invoiceResult.status === 'rejected' || nonGstResult.status === 'rejected') {
            setError('Some invoice records could not be loaded. Totals may be incomplete; refresh to try again.');
          } else if (reconciled.unmatchedPayments > 0) {
            setError(`${reconciled.unmatchedPayments} payment record(s) could not be matched to an invoice. Ledger totals may be incomplete.`);
          }
        }
      } catch (loadError) {
        if (active) {
          setInvoices([]);
          setPaymentReportOutstanding(null);
          setPaymentReportCollected(null);
          setCanExport(false);
          setError(loadError instanceof Error
            ? `Unable to reconcile ledger payments: ${loadError.message}`
            : 'Unable to reconcile ledger payments.');
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
          : roundMoney(Math.max(openingBalance + invoice.invoiceDue, 0));
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
        visibleAccounts.set(invoice.customerKey, true);
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

    const reconstructedCustomerDue = roundMoney([...visibleAccounts.keys()].reduce((total, customerKey) => (
      total + (latestBalances.get(customerKey)?.balance ?? 0)
    ), 0));
    const hasCustomerFilters = selectedCustomer !== 'all'
      || Boolean(search.trim())
      || Boolean(startDate)
      || Boolean(endDate);
    const customerDue = !hasCustomerFilters && paymentReportOutstanding !== null
      ? paymentReportOutstanding
      : reconstructedCustomerDue;

    const invoiceTotals = filteredInvoices.reduce((totals, invoice) => ({
      billed: roundMoney(totals.billed + invoice.total),
      received: roundMoney(totals.received + invoice.paid),
    }), { billed: 0, received: 0 });
    const received = !hasCustomerFilters && paymentReportCollected !== null
      ? paymentReportCollected
      : invoiceTotals.received;

    return {
      ...invoiceTotals,
      received,
      customerDue,
      customerCount: visibleAccounts.size,
    };
  }, [
    endDate,
    filteredInvoices,
    ledgerInvoices,
    paymentReportCollected,
    paymentReportOutstanding,
    search,
    selectedCustomer,
    startDate,
  ]);

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
          <p>Review invoice charges, payments, and customer balances using this shop’s invoice and payment records.</p>
        </div>
        <div className="ledger-header-actions">
          <button type="button" className="ledger-button secondary" onClick={backToDashboard}>Back to dashboard</button>
          <button type="button" className="ledger-button secondary" onClick={refreshLedger} disabled={loading}>Refresh</button>
          <button type="button" className="ledger-button primary" onClick={exportLedger} disabled={loading || !canExport || filteredInvoices.length === 0}>Export CSV</button>
        </div>
      </header>

      {error && <div className="ledger-message" role="alert">{error}</div>}
      {loading && <div className="ledger-message" role="status">Loading invoices and payment history…</div>}

      <section className="ledger-summary" aria-label="Ledger summary">
        <article className="ledger-summary-card">
          <span>Billed</span><strong>{formatMoney(summary.billed)}</strong><small>{filteredInvoices.length} invoices</small>
        </article>
        <article className="ledger-summary-card">
          <span>Payments received</span><strong>{formatMoney(summary.received)}</strong>
          <small>{selectedCustomer === 'all' && !search.trim() && !startDate && !endDate
            ? 'All-time net total from payment report'
            : 'Net payments for matching invoices'}</small>
        </article>
        <article className="ledger-summary-card due">
          <span>Current customer due</span><strong>{formatMoney(summary.customerDue)}</strong>
          <small>{selectedCustomer === 'all' && !search.trim() && !startDate && !endDate
            ? 'Shop total from payment report'
            : `${summary.customerCount} matching customer accounts`}</small>
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
      <p className="ledger-footnote">Invoice payments include recorded refunds. The unfiltered shop totals come from the payment report; filtered customer balances are reconstructed from that account’s invoice history.</p>
    </div>
  );
};

export default LedgerReportPage;
