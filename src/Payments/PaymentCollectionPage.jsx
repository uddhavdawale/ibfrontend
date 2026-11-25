import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINTS, apiFetch, getAuthContext } from '../Config/api';
import {
  canAccessCashCollectionTickets,
  canReviewCashCollectionTicket,
  canSubmitCashCollectionTicket,
  canWriteBilling,
  getCurrentUserRole,
  isBillingOnlyRole,
  isCashCollectionSeller,
  isStoreAdmin,
  isSystemAdmin,
} from '../Security/storeRoles';
import createSecureIdempotencyKey from '../utils/createSecureIdempotencyKey';
import './PaymentCollectionPage.css';

const todayInRetailerTimezone = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const dateRangeLength = (from, to) => {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
  const [toYear, toMonth, toDay] = to.split('-').map(Number);
  return (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay))
    / (24 * 60 * 60 * 1000);
};

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const normalizePaymentRecord = (payment, index) => {
  const record = payment?.payment && typeof payment.payment === 'object'
    ? { ...payment, ...payment.payment }
    : payment;
  const amountValue = record?.amount
    ?? record?.paymentAmount
    ?? record?.collectedAmount
    ?? record?.amountReceived;
  const amount = Number(amountValue);
  if (!Number.isFinite(amount)) {
    throw new Error('The payment-report service returned a payment without a valid amount.');
  }

  return {
    ...record,
    paymentId: record.paymentId ?? record.id ?? `${record.invoiceId ?? record.invoiceNo ?? 'payment'}-${record.collectedAt ?? index}`,
    receiptNo: record.receiptNo ?? record.receiptNumber ?? record.receipt_no,
    invoiceNo: record.invoiceNo ?? record.invoiceNumber ?? record.invoice?.invoiceNo,
    customerName: record.customerName ?? record.customer?.name,
    collectorName: record.collectorName ?? record.collectedByName ?? record.collectedBy?.name,
    method: record.method ?? record.paymentMethod,
    amount,
    collectedAt: record.collectedAt ?? record.paymentDate,
  };
};

const csvValue = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const PAYMENT_PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PAYMENT_PROOF_SIZE = 5 * 1024 * 1024;

const PaymentCollectionPage = ({ onNavigateToSell }) => {
  const navigate = useNavigate();
  const today = todayInRetailerTimezone();
  const [filters, setFilters] = useState({
    from: today,
    to: today,
    method: 'ALL',
    collectorId: '',
    invoiceId: '',
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [report, setReport] = useState(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reconciliationOpen, setReconciliationOpen] = useState(false);
  const [reconciliationDate, setReconciliationDate] = useState(today);
  const [openingFloat, setOpeningFloat] = useState('0.00');
  const [physicalCash, setPhysicalCash] = useState('');
  const [remarks, setRemarks] = useState('');
  const [reconciliations, setReconciliations] = useState([]);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [reconciliationSaving, setReconciliationSaving] = useState(false);
  const [reconciliationError, setReconciliationError] = useState('');
  const [reconciliationSuccess, setReconciliationSuccess] = useState('');
  const [tickets, setTickets] = useState([]);
  const ticketRequestRef = useRef(0);
  const ticketSubmitInFlightRef = useRef(false);
  const ticketActionInFlightRef = useRef(false);
  const [cashBalance, setCashBalance] = useState(null);
  const [cashierBalances, setCashierBalances] = useState([]);
  const [cashierBalanceSummary, setCashierBalanceSummary] = useState(null);
  const [cashBalancePage, setCashBalancePage] = useState(0);
  const [cashBalanceTotalPages, setCashBalanceTotalPages] = useState(1);
  const [cashBalanceLoading, setCashBalanceLoading] = useState(false);
  const [cashBalanceError, setCashBalanceError] = useState('');
  const cashBalanceRequestRef = useRef(0);
  const [storeAdmins, setStoreAdmins] = useState([]);
  const [storeAdminsLoading, setStoreAdminsLoading] = useState(false);
  const [storeAdminsError, setStoreAdminsError] = useState('');
  const [recipientUserId, setRecipientUserId] = useState('');
  const [ticketNotes, setTicketNotes] = useState('');
  const [ticketPaymentMethod, setTicketPaymentMethod] = useState('CASH');
  const [ticketPaymentProof, setTicketPaymentProof] = useState(null);
  const [ticketPaymentProofPreview, setTicketPaymentProofPreview] = useState('');
  const ticketProofInputRef = useRef(null);
  const [ticketProofUrl, setTicketProofUrl] = useState('');
  const [ticketProofLoading, setTicketProofLoading] = useState(false);
  const [ticketProofError, setTicketProofError] = useState('');
  const [ticketIdempotencyKey, setTicketIdempotencyKey] = useState('');
  const [ticketIdempotencyFingerprint, setTicketIdempotencyFingerprint] = useState('');
  const [ticketCounts, setTicketCounts] = useState({});
  const [ticketActionKeys, setTicketActionKeys] = useState({});
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketPage, setTicketPage] = useState(0);
  const [ticketTotalPages, setTicketTotalPages] = useState(1);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketSaving, setTicketSaving] = useState(false);
  const [ticketError, setTicketError] = useState('');
  const [ticketSuccess, setTicketSuccess] = useState('');
  const currentRole = getCurrentUserRole();
  const canAccessTickets = canAccessCashCollectionTickets(currentRole);
  const canSubmitTicket = canSubmitCashCollectionTicket(currentRole);
  const canReviewTicket = canReviewCashCollectionTicket(currentRole);
  const isCashSeller = isCashCollectionSeller(currentRole);
  const canViewCashierBalances = isStoreAdmin(currentRole);
  const currentUserId = getAuthContext().userId;
  const canFilterByCollector = isStoreAdmin(currentRole) || isBillingOnlyRole(currentRole);
  const [selectedRefund, setSelectedRefund] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundIdempotencyKey, setRefundIdempotencyKey] = useState('');
  const [refundSaving, setRefundSaving] = useState(false);
  const [refundError, setRefundError] = useState('');
  const [refundSuccess, setRefundSuccess] = useState('');
  const canManageCash = canWriteBilling(getCurrentUserRole());
  const canRefundPayments = isStoreAdmin(getCurrentUserRole()) || isSystemAdmin(getCurrentUserRole());
  const navigateToSell = () => {
    if (onNavigateToSell) onNavigateToSell();
    else navigate('/sell');
  };

  const loadTickets = useCallback(async (requestedPage = 0) => {
    const requestId = ticketRequestRef.current + 1;
    ticketRequestRef.current = requestId;
    setTicketLoading(true);
    setTicketError('');
    try {
      const params = new URLSearchParams({ page: String(requestedPage), size: '20' });
      const response = await apiFetch(`${API_ENDPOINTS.cashCollectionTickets}?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (requestId !== ticketRequestRef.current) return;
      if (!response.ok) {
        throw new Error(payload.message || payload.error || `Unable to load collection tickets (${response.status}).`);
      }
      if (!Array.isArray(payload.content)
        || !Number.isFinite(Number(payload.page))
        || !Number.isFinite(Number(payload.totalPages))) {
        throw new Error('The collection-ticket service returned an invalid response.');
      }
      setTickets(payload.content);
      setTicketTotalPages(Math.max(Number(payload.totalPages), 1));
      setTicketPage(Number(payload.page));
    } catch (loadError) {
      if (requestId !== ticketRequestRef.current) return;
      setTicketError(loadError.message || 'Unable to load collection tickets.');
    } finally {
      if (requestId === ticketRequestRef.current) setTicketLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canAccessTickets) loadTickets(ticketPage);
  }, [canAccessTickets, loadTickets, ticketPage]);

  const loadCashBalances = useCallback(async (requestedPage = cashBalancePage) => {
    if (!canViewCashierBalances && !canSubmitTicket) return;
    const requestId = cashBalanceRequestRef.current + 1;
    cashBalanceRequestRef.current = requestId;
    setCashBalanceLoading(true);
    setCashBalanceError('');
    try {
      const params = new URLSearchParams({ page: String(requestedPage), size: '100' });
      const response = await apiFetch(`${API_ENDPOINTS.cashCollectionTicketBalances}?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || `Unable to load cash due balances (${response.status}).`);
      }
      if (requestId !== cashBalanceRequestRef.current) return;

      if (canViewCashierBalances) {
        const cashierBalanceFields = [
          'cashPaymentCountSinceLastHandover',
          'cashCollectedSinceLastHandover',
          'cashRefundedSinceLastHandover',
          'carriedForwardDue',
          'dueToSubmit',
          'pendingHandoverAmount',
          'disputedHandoverAmount',
          'availableToSubmit',
          'cashCreditBalance',
        ];
        if (!Array.isArray(payload.content)
          || !Number.isFinite(Number(payload.page))
          || !Number.isFinite(Number(payload.totalPages))
          || !payload.summary
          || !Number.isFinite(Number(payload.summary.totalDueToSubmit))
          || !Number.isFinite(Number(payload.summary.totalPendingHandoverAmount))
          || !Number.isFinite(Number(payload.summary.totalDisputedHandoverAmount))
          || !Number.isFinite(Number(payload.summary.totalAvailableToSubmit))
          || payload.content.some((balance) => balance.userId == null
            || !cashierBalanceFields.every((field) => Number.isFinite(Number(balance[field]))))) {
          throw new Error('The cash-balance service returned an invalid store summary.');
        }
        setCashierBalances(payload.content);
        setCashierBalanceSummary(payload.summary);
        setCashBalancePage(Number(payload.page));
        setCashBalanceTotalPages(Math.max(Number(payload.totalPages), 1));
      } else {
        const balance = payload.balance ?? payload;
        const requiredAmounts = [
          'cashPaymentCountSinceLastHandover',
          'cashCollectedSinceLastHandover',
          'cashRefundedSinceLastHandover',
          'carriedForwardDue',
          'dueToSubmit',
          'pendingHandoverAmount',
          'disputedHandoverAmount',
          'availableToSubmit',
          'cashCreditBalance',
        ];
        if (!balance
          || !requiredAmounts.every((field) => Number.isFinite(Number(balance[field])))) {
          throw new Error('The cash-balance service did not return your current amount due.');
        }
        setCashBalance(balance);
        setCashierBalanceSummary(null);
      }
    } catch (loadError) {
      if (requestId !== cashBalanceRequestRef.current) return;
      setCashBalanceError(loadError.message || 'Unable to load cash due balances.');
      setCashBalance(null);
      setCashierBalances([]);
      setCashierBalanceSummary(null);
    } finally {
      if (requestId === cashBalanceRequestRef.current) setCashBalanceLoading(false);
    }
  }, [canSubmitTicket, canViewCashierBalances, cashBalancePage]);

  useEffect(() => {
    if (canViewCashierBalances || canSubmitTicket) loadCashBalances();
  }, [canSubmitTicket, canViewCashierBalances, loadCashBalances]);

  const loadTicketRecipients = useCallback(async () => {
    setStoreAdminsLoading(true);
    setStoreAdminsError('');
    try {
      const response = await apiFetch(API_ENDPOINTS.cashCollectionTicketRecipients);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || `Unable to load store admins (${response.status}).`);
      }
      if (!Array.isArray(payload.content)
        || payload.content.some((admin) => admin.id == null || !admin.name)) {
        throw new Error('The ticket-recipient service returned an invalid response.');
      }
      setStoreAdmins(payload.content);
      setRecipientUserId((current) => current && payload.content.some((admin) => String(admin.id) === current)
        ? current
        : payload.content.length === 1 ? String(payload.content[0].id) : '');
      if (!payload.content.length) setStoreAdminsError('No active store admins are available to receive cash.');
    } catch (loadError) {
      setStoreAdminsError(loadError.message || 'Unable to load active store admins.');
      setStoreAdmins([]);
      setRecipientUserId('');
    } finally {
      setStoreAdminsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canSubmitTicket) loadTicketRecipients();
  }, [canSubmitTicket, loadTicketRecipients]);

  useEffect(() => {
    if (!ticketPaymentProof) {
      setTicketPaymentProofPreview('');
      return undefined;
    }
    const previewUrl = URL.createObjectURL(ticketPaymentProof);
    setTicketPaymentProofPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [ticketPaymentProof]);

  useEffect(() => {
    let active = true;
    let proofObjectUrl = '';
    const paymentMethod = String(selectedTicket?.paymentMethod || 'CASH').toUpperCase();
    if (!selectedTicket || paymentMethod === 'CASH') {
      setTicketProofUrl('');
      setTicketProofLoading(false);
      setTicketProofError('');
      return undefined;
    }

    setTicketProofUrl('');
    setTicketProofError('');
    setTicketProofLoading(true);
    (async () => {
      try {
        const response = await apiFetch(API_ENDPOINTS.cashCollectionTicketProofById(selectedTicket.id));
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.message || payload.error || `Unable to load payment proof (${response.status}).`);
        }
        const proof = await response.blob();
        if (!PAYMENT_PROOF_TYPES.includes(proof.type)) {
          throw new Error('The payment-proof service returned an unsupported image.');
        }
        if (!active) return;
        proofObjectUrl = URL.createObjectURL(proof);
        setTicketProofUrl(proofObjectUrl);
      } catch (proofError) {
        if (active) setTicketProofError(proofError.message || 'Unable to load payment proof.');
      } finally {
        if (active) setTicketProofLoading(false);
      }
    })();

    return () => {
      active = false;
      if (proofObjectUrl) URL.revokeObjectURL(proofObjectUrl);
    };
  }, [selectedTicket]);

  const loadReport = useCallback(async (requestedPage, signal) => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      from: appliedFilters.from,
      to: appliedFilters.to,
      method: appliedFilters.method,
      page: String(requestedPage),
      size: '50',
    });
    if (canFilterByCollector && appliedFilters.collectorId.trim()) {
      params.set('collectorId', appliedFilters.collectorId.trim());
    }
    if (appliedFilters.invoiceId.trim()) {
      params.set('invoiceId', appliedFilters.invoiceId.trim());
    }

    try {
      const response = await apiFetch(`${API_ENDPOINTS.payments}?${params.toString()}`, { signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || `Unable to load payment report (${response.status}).`);
      }
      const requiredSummaryFields = [
        'netSales',
        'totalCollected',
        'totalRefunds',
        'totalTransactions',
        'cashCollected',
        'upiCollected',
        'cardCollected',
        'outstandingAmount',
      ];
      if (!Array.isArray(payload.payments) || !payload.summary || typeof payload.summary !== 'object'
        || !requiredSummaryFields.every((field) => Number.isFinite(Number(payload.summary[field])))
        || !Number.isFinite(Number(payload.page))
        || !Number.isFinite(Number(payload.size))
        || !Number.isFinite(Number(payload.totalPages))
        || !Number.isFinite(Number(payload.totalElements))) {
        throw new Error('The payment-report service returned an invalid response.');
      }
      setReport({
        ...payload,
        payments: payload.payments.map(normalizePaymentRecord),
      });
    } catch (loadError) {
      if (signal?.aborted) return;
      setReport(null);
      setError(loadError.message || 'Unable to load payment report. Please try again.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [appliedFilters, canFilterByCollector]);

  useEffect(() => {
    if (isCashSeller) return undefined;
    const controller = new AbortController();
    loadReport(page, controller.signal);
    return () => controller.abort();
  }, [isCashSeller, loadReport, page]);

  const loadReconciliations = async () => {
    setReconciliationLoading(true);
    setReconciliationError('');
    try {
      const response = await apiFetch(`${API_ENDPOINTS.cashReconciliations}?page=0&size=20`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || `Unable to load reconciliations (${response.status}).`);
      }
      setReconciliations(Array.isArray(payload.content) ? payload.content : []);
    } catch (loadError) {
      setReconciliationError(loadError.message || 'Unable to load reconciliation history.');
    } finally {
      setReconciliationLoading(false);
    }
  };

  const handleFilterSubmit = (event) => {
    event.preventDefault();
    if (!filters.from || !filters.to || filters.from > filters.to) {
      setError('Choose a valid date range.');
      return;
    }
    if (dateRangeLength(filters.from, filters.to) > 365) {
      setError('Choose a date range of no more than 366 days.');
      return;
    }
    setPage(0);
    setAppliedFilters({ ...filters });
  };

  const exportCurrentPage = () => {
    const rows = report?.payments || [];
    if (!rows.length) return;
    const columns = ['Collected At', 'Receipt', 'Invoice', 'Customer', 'Collector', 'Method', 'Amount', 'Reference'];
    const records = rows.map((payment) => [
      payment.collectedAt || payment.paymentDate,
      payment.receiptNo,
      payment.invoiceNo,
      payment.customerName,
      payment.collectorName || payment.collectedBy,
      payment.method,
      payment.amount,
      payment.referenceNo,
    ]);
    const csv = [columns, ...records].map((row) => row.map(csvValue).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `payment-collections-page-${page + 1}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const submitReconciliation = async (event) => {
    event.preventDefault();
    setReconciliationError('');
    setReconciliationSuccess('');
    if (!reconciliationDate || Number(openingFloat) < 0 || Number(physicalCash) < 0 || physicalCash === '') {
      setReconciliationError('Enter a reconciliation date and valid cash amounts.');
      return;
    }
    setReconciliationSaving(true);
    try {
      const response = await apiFetch(API_ENDPOINTS.cashReconciliations, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reconciliationDate,
          openingFloat: Number(openingFloat),
          physicalCashCounted: Number(physicalCash),
          remarks: remarks.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || `Unable to save reconciliation (${response.status}).`);
      }
      setReconciliations((current) => [payload, ...current]);
      setReconciliationSuccess(`Reconciliation saved. Difference: ${formatMoney(payload.difference)}.`);
      setOpeningFloat('0.00');
      setPhysicalCash('');
      setRemarks('');
    } catch (saveError) {
      setReconciliationError(saveError.message || 'Unable to save reconciliation. Please try again.');
    } finally {
      setReconciliationSaving(false);
    }
  };

  const submitTicket = async (event) => {
    event.preventDefault();
    if (ticketSubmitInFlightRef.current) return;
    setTicketError('');
    setTicketSuccess('');
    const declaredAmount = Number(cashBalance?.availableToSubmit);
    const recipient = storeAdmins.find((admin) => String(admin.id) === recipientUserId);
    if (!recipient) {
      setTicketError('Choose an active store admin to receive the cash.');
      return;
    }
    if (!cashBalance || !Number.isFinite(declaredAmount) || declaredAmount <= 0) {
      setTicketError('There is no available cash due to submit, or your balance has not loaded.');
      return;
    }
    if (!['CASH', 'UPI', 'CARD'].includes(ticketPaymentMethod)) {
      setTicketError('Choose Cash, UPI, or Card as the payment method.');
      return;
    }
    if (ticketPaymentMethod !== 'CASH'
      && (!ticketPaymentProof
        || !PAYMENT_PROOF_TYPES.includes(ticketPaymentProof.type)
        || ticketPaymentProof.size > MAX_PAYMENT_PROOF_SIZE)) {
      setTicketError('Attach a PNG, JPEG, or WebP payment screenshot up to 5 MB before submitting.');
      return;
    }

    ticketSubmitInFlightRef.current = true;
    setTicketSaving(true);
    let conflictStatus = 0;
    try {
      const requestFingerprint = JSON.stringify({
        recipientUserId: recipient.id,
        declaredAmount,
        paymentMethod: ticketPaymentMethod,
        paymentProof: ticketPaymentProof
          ? `${ticketPaymentProof.name}:${ticketPaymentProof.size}:${ticketPaymentProof.lastModified}`
          : '',
        notes: ticketNotes.trim(),
      });
      let idempotencyKey = ticketIdempotencyFingerprint === requestFingerprint
        ? ticketIdempotencyKey
        : '';
      if (!idempotencyKey) {
        idempotencyKey = createSecureIdempotencyKey();
        setTicketIdempotencyKey(idempotencyKey);
        setTicketIdempotencyFingerprint(requestFingerprint);
      }
      const requestFields = {
        recipientUserId: recipient.id,
        declaredAmount,
        paymentMethod: ticketPaymentMethod,
        notes: ticketNotes.trim(),
        idempotencyKey: `cash-drop-${idempotencyKey}`,
      };
      let requestOptions;
      if (ticketPaymentMethod === 'CASH') {
        requestOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestFields),
        };
      } else {
        const formData = new FormData();
        Object.entries(requestFields).forEach(([field, value]) => formData.append(field, String(value)));
        formData.append('paymentProof', ticketPaymentProof);
        requestOptions = { method: 'POST', body: formData };
      }
      const response = await apiFetch(API_ENDPOINTS.cashCollectionTickets, requestOptions);
      conflictStatus = response.status;
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || `Unable to submit collection ticket (${response.status}).`);
      }
      if (payload.id == null) {
        throw new Error('The server did not confirm the collection ticket.');
      }
      setTicketSuccess(`Ticket ${payload.id} submitted to ${payload.recipientName || recipient.name} using ${ticketPaymentMethod}. The amount is reserved while pending admin review.`);
      setTicketNotes('');
      setTicketPaymentMethod('CASH');
      setTicketPaymentProof(null);
      if (ticketProofInputRef.current) ticketProofInputRef.current.value = '';
      setTicketIdempotencyKey('');
      setTicketIdempotencyFingerprint('');
      if (payload.balance && !canViewCashierBalances) setCashBalance(payload.balance);
      await loadTickets(0);
      setTicketPage(0);
      await loadCashBalances(0);
    } catch (saveError) {
      setTicketError(saveError.message || 'Unable to submit collection ticket.');
      if (conflictStatus === 409) {
        await loadCashBalances(0);
        await loadTicketRecipients();
      }
    } finally {
      ticketSubmitInFlightRef.current = false;
      setTicketSaving(false);
    }
  };

  const openTicketForReview = (ticket) => {
    setTicketError('');
    setSelectedTicket(ticket);
  };

  const submitTicketCount = async (ticket) => {
    if (ticketActionInFlightRef.current) return;
    setTicketError('');
    setTicketSuccess('');
    const amountValue = ticketCounts[`${ticket.id}-countedAmount`];
    const countedAmount = Number(amountValue);
    if (amountValue === undefined || amountValue === '' || !Number.isFinite(countedAmount) || countedAmount < 0) {
      setTicketError(String(ticket.paymentMethod || 'CASH').toUpperCase() === 'CASH'
        ? 'Enter the physical amount counted before taking action.'
        : 'Enter the payment amount verified from the screenshot.');
      return;
    }
    const notes = String(ticketCounts[`${ticket.id}-notes`] || '').trim();
    const keyName = `${ticket.id}-count`;

    ticketActionInFlightRef.current = true;
    setTicketSaving(true);
    try {
      const requestFingerprint = JSON.stringify({ countedAmount, notes });
      let actionKey = ticketActionKeys[keyName];
      if (actionKey?.fingerprint !== requestFingerprint) {
        actionKey = { key: createSecureIdempotencyKey(), fingerprint: requestFingerprint };
        setTicketActionKeys((current) => ({ ...current, [keyName]: actionKey }));
      }
      const response = await apiFetch(API_ENDPOINTS.cashCollectionTicketCountById(ticket.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countedAmount,
          idempotencyKey: `cash-count-${actionKey.key}`,
          notes,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || `Unable to count ticket (${response.status}).`);
      }
      setTicketActionKeys((current) => {
        const next = { ...current };
        delete next[keyName];
        return next;
      });
      const status = String(payload.status || '').toUpperCase()
        || (Math.round(countedAmount * 100) === Math.round(Number(ticket.declaredAmount) * 100) ? 'ACCEPTED' : 'DISPUTED');
      const paymentMethod = String(ticket.paymentMethod || 'CASH').toUpperCase();
      const cashBalance = paymentMethod === 'CASH'
        && payload.storeCashAvailable != null
        && Number.isFinite(Number(payload.storeCashAvailable))
        ? ` Store admin available cash: ${formatMoney(payload.storeCashAvailable)}.`
        : '';
      setTicketSuccess(status === 'ACCEPTED'
        ? paymentMethod === 'CASH'
          ? `Ticket ${ticket.id} accepted; ${formatMoney(countedAmount)} transferred to the store admin.${cashBalance}`
          : `Ticket ${ticket.id} accepted; ${formatMoney(countedAmount)} ${paymentMethod} payment verified.`
        : paymentMethod === 'CASH'
          ? `Ticket ${ticket.id} disputed; no cash was transferred to the store admin.`
          : `Ticket ${ticket.id} disputed; the ${paymentMethod} payment needs further review.`);
      setSelectedTicket(null);
      await loadTickets(ticketPage);
      await loadCashBalances(0);
    } catch (actionError) {
      setTicketError(actionError.message || 'Unable to count collection ticket.');
    } finally {
      ticketActionInFlightRef.current = false;
      setTicketSaving(false);
    }
  };

  const resolveTicket = async (ticket) => {
    if (ticketActionInFlightRef.current) return;
    setTicketError('');
    setTicketSuccess('');
    const resolvedAmountValue = ticketCounts[`${ticket.id}-resolvedAmount`];
    const resolvedAmount = Number(resolvedAmountValue);
    const resolutionNote = String(ticketCounts[`${ticket.id}-notes`] || '').trim();
    if (resolvedAmountValue === undefined || resolvedAmountValue === '' || !Number.isFinite(resolvedAmount) || resolvedAmount < 0 || !resolutionNote) {
      setTicketError('Enter the verified amount and a resolution note.');
      return;
    }
    const amountLimit = Math.min(Number(ticket.declaredAmount), Number(ticket.receiverCountedAmount));
    if (!Number.isFinite(amountLimit) || Math.round(resolvedAmount * 100) > Math.round(amountLimit * 100)) {
      setTicketError('The resolved amount cannot exceed the declared or counted amount.');
      return;
    }
    const keyName = `${ticket.id}-resolve`;

    ticketActionInFlightRef.current = true;
    setTicketSaving(true);
    try {
      const requestFingerprint = JSON.stringify({ resolvedAmount, resolutionNote });
      let actionKey = ticketActionKeys[keyName];
      if (actionKey?.fingerprint !== requestFingerprint) {
        actionKey = { key: createSecureIdempotencyKey(), fingerprint: requestFingerprint };
        setTicketActionKeys((current) => ({ ...current, [keyName]: actionKey }));
      }
      const response = await apiFetch(API_ENDPOINTS.cashCollectionTicketResolveById(ticket.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolvedAmount,
          idempotencyKey: `cash-resolution-${actionKey.key}`,
          resolutionNote,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || `Unable to resolve ticket (${response.status}).`);
      }
      setTicketActionKeys((current) => {
        const next = { ...current };
        delete next[keyName];
        return next;
      });
      const paymentMethod = String(ticket.paymentMethod || 'CASH').toUpperCase();
      const cashBalance = paymentMethod === 'CASH'
        && payload.storeCashAvailable != null
        && Number.isFinite(Number(payload.storeCashAvailable))
        ? ` Store admin available cash: ${formatMoney(payload.storeCashAvailable)}.`
        : '';
      setTicketSuccess(paymentMethod === 'CASH'
        ? `Ticket ${ticket.id} resolved; ${formatMoney(resolvedAmount)} transferred to the store admin.${cashBalance}`
        : `Ticket ${ticket.id} resolved; ${formatMoney(resolvedAmount)} ${paymentMethod} payment verified.`);
      setSelectedTicket(null);
      await loadTickets(ticketPage);
      await loadCashBalances(0);
    } catch (resolveError) {
      setTicketError(resolveError.message || 'Unable to resolve collection ticket.');
    } finally {
      ticketActionInFlightRef.current = false;
      setTicketSaving(false);
    }
  };

  const toggleReconciliation = () => {
    const opening = !reconciliationOpen;
    setReconciliationOpen(opening);
    if (opening && reconciliations.length === 0) loadReconciliations();
  };

  const openRefund = (payment) => {
    setSelectedRefund(payment);
    setRefundAmount(String(payment.refundableAmount));
    setRefundReason('');
    setRefundIdempotencyKey('');
    setRefundError('');
    setRefundSuccess('');
  };

  const submitRefund = async (event) => {
    event.preventDefault();
    setRefundError('');
    const amount = Number(refundAmount);
    const refundableAmount = Number(selectedRefund?.refundableAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0 || amount > refundableAmount) {
      setRefundError('Enter an amount no greater than the remaining refundable balance.');
      return;
    }

    let idempotencyKey = refundIdempotencyKey;
    if (!idempotencyKey) {
      try {
        idempotencyKey = createSecureIdempotencyKey();
        setRefundIdempotencyKey(idempotencyKey);
      } catch (keyError) {
        setRefundError(keyError.message);
        return;
      }
    }

    setRefundSaving(true);
    try {
      const response = await apiFetch(API_ENDPOINTS.paymentRefundsById(selectedRefund.paymentId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          reason: refundReason.trim(),
          idempotencyKey: `refund-${idempotencyKey}`,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || `Unable to record refund (${response.status}).`);
      }
      setSelectedRefund(null);
      setRefundIdempotencyKey('');
      setRefundSuccess(`Refund recorded. Receipt ${payload.receiptNo}.`);
      await loadReport(page);
    } catch (saveError) {
      setRefundError(saveError.message || 'Unable to record refund. Please try again.');
    } finally {
      setRefundSaving(false);
    }
  };

  const summary = report?.summary || {};
  const payments = report?.payments || [];
  const totalPages = Math.max(Number(report?.totalPages) || 0, 1);
  const selectedTicketIsRecipient = selectedTicket
    && currentUserId !== null
    && currentUserId !== undefined
    && selectedTicket.recipientUserId !== null
    && selectedTicket.recipientUserId !== undefined
    && String(selectedTicket.recipientUserId) === String(currentUserId);

  return (
    <main className="payment-collection-page">
      <header className="payment-page-header">
        {!isCashSeller && (
          <button type="button" className="payment-back-link" onClick={navigateToSell}>
            ← Sell orders
          </button>
        )}
        <div className="payment-page-heading">
          <h1>{isCashSeller ? 'My cash collections' : 'Payment collections'}</h1>
          <p>{isCashSeller
            ? 'Review your recorded cash sales and submit the amount due to the store admin.'
            : 'Review recorded collections and reconcile your cash drawer.'}</p>
        </div>
        {!isCashSeller && <button type="button" className="payment-primary-button" onClick={navigateToSell}>Find an invoice</button>}
      </header>

      {!isCashSeller && (
      <>
      <form className="payment-filters" onSubmit={handleFilterSubmit}>
        <p className="payment-filter-hint">Showing today by default. Choose a date range of up to 366 days.</p>
        <label>
          From
          <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
        </label>
        <label>
          To
          <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
        </label>
        <label>
          Method
          <select value={filters.method} onChange={(event) => setFilters({ ...filters, method: event.target.value })}>
            <option value="ALL">All methods</option>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
            <option value="BANK">Bank</option>
            <option value="WALLET">Wallet</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        {canFilterByCollector && (
          <label>
            Collector ID
            <input type="text" value={filters.collectorId} maxLength="128"
              placeholder="All collectors"
              onChange={(event) => setFilters({ ...filters, collectorId: event.target.value })} />
          </label>
        )}
        <label>
          Invoice ID
          <input type="text" value={filters.invoiceId} maxLength="128"
            placeholder="All invoices"
            onChange={(event) => setFilters({ ...filters, invoiceId: event.target.value })} />
        </label>
        <button type="submit" className="payment-primary-button" disabled={loading}>Apply filters</button>
      </form>

      {error && <p className="payment-error" role="alert">{error}</p>}

      <section className="payment-summary-grid" aria-label="Sales and collection totals">
        <article><span>Net sales (invoice dates)</span><strong>{formatMoney(summary.netSales)}</strong></article>
        <article><span>Net collected</span><strong>{formatMoney(summary.totalCollected)}</strong></article>
        <article><span>Refunds</span><strong>{formatMoney(summary.totalRefunds)}</strong></article>
        <article><span>Transactions</span><strong>{Number(summary.totalTransactions || 0).toLocaleString('en-IN')}</strong></article>
        <article><span>Net cash</span><strong>{formatMoney(summary.cashCollected)}</strong></article>
        <article><span>UPI + card</span><strong>{formatMoney(Number(summary.upiCollected || 0) + Number(summary.cardCollected || 0))}</strong></article>
        <article><span>Outstanding dues</span><strong>{formatMoney(summary.outstandingAmount)}</strong></article>
      </section>
      <p className="payment-filter-hint">
        Net sales uses the selected invoice-date range and excludes cancelled invoices. Collection totals use receipt/refund dates; cancellation changes them only after an actual refund is recorded.
      </p>

      {refundSuccess && <p className="payment-success" role="status">{refundSuccess}</p>}
      <section className="payment-report-panel">
        <div className="payment-panel-heading">
          <div>
            <h2>Recorded payments</h2>
            <p>{Number(report?.totalElements || 0).toLocaleString('en-IN')} matching transactions</p>
          </div>
          <button type="button" className="payment-secondary-button" onClick={exportCurrentPage} disabled={!payments.length}>
            Export this page
          </button>
        </div>
        {loading ? <p className="payment-empty-state">Loading collections…</p> : payments.length ? (
          <div className="payment-table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Receipt</th><th>Invoice</th><th>Customer</th><th>Collected by</th><th>Method</th><th>Amount</th>{canRefundPayments && <th>Action</th>}</tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.paymentId}>
                    <td>{(payment.collectedAt || payment.paymentDate)
                      ? new Date(payment.collectedAt || payment.paymentDate).toLocaleString('en-IN')
                      : '—'}</td>
                    <td>{payment.receiptNo || '—'}{payment.source === 'LEGACY'
                      ? <small className="payment-legacy-note">Legacy record; collector unavailable</small>
                      : payment.source === 'REFUND' && <small className="payment-legacy-note">Refund</small>}</td>
                    <td>{payment.invoiceNo || '—'}</td>
                    <td>{payment.customerName || 'Walk-in Customer'}</td>
                    <td>{payment.collectorName || payment.collectedBy || '—'}</td>
                    <td>{payment.method}</td>
                    <td>{formatMoney(payment.amount)}</td>
                    {canRefundPayments && <td>
                      {String(payment.status || '').toUpperCase() === 'RECEIVED' && payment.source !== 'REFUND'
                        && Number(payment.refundableAmount) > 0 && (
                          <button type="button" className="payment-secondary-button"
                            onClick={() => openRefund(payment)}>Refund</button>
                        )}
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="payment-empty-state">{error ? 'Collections are unavailable right now.' : 'No payments match this date range and method.'}</p>}
        {canRefundPayments && selectedRefund && (
          <form className="refund-form" onSubmit={submitRefund}>
            <div>
              <h3>Refund {selectedRefund.receiptNo}</h3>
              <p>Remaining refundable amount: {formatMoney(selectedRefund.refundableAmount)}</p>
            </div>
            <label>Amount (₹)
              <input type="number" min="0.01" max={selectedRefund.refundableAmount} step="0.01"
                value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} required />
            </label>
            <label>Reason (optional)
              <input type="text" maxLength="255" value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)} />
            </label>
            <div className="refund-form-actions">
              <button type="submit" className="payment-primary-button" disabled={refundSaving}>
                {refundSaving ? 'Recording…' : 'Confirm refund'}
              </button>
              <button type="button" className="payment-secondary-button" disabled={refundSaving}
                onClick={() => {
                  setSelectedRefund(null);
                  setRefundIdempotencyKey('');
                  loadReport(page);
                }}>Cancel</button>
            </div>
            {refundError && <p className="payment-error" role="alert">{refundError}</p>}
          </form>
        )}
        <div className="payment-pagination">
          <button type="button" onClick={() => setPage((current) => Math.max(current - 1, 0))} disabled={loading || page === 0}>Previous</button>
          <span>Page {page + 1} of {totalPages}</span>
          <button type="button" onClick={() => setPage((current) => current + 1)} disabled={loading || page + 1 >= totalPages}>Next</button>
        </div>
      </section>
      </>
      )}

      {canAccessTickets && (
        <section className="ticket-panel">
          <div className="payment-panel-heading">
            <div>
              <h2>Cash collection tickets</h2>
              <p>{canReviewTicket
                ? 'Review cash handovers and see each biller’s outstanding cash due, pending requests, and disputed amounts.'
                : 'See the cash collected since your last completed handover, your total amount due, and submit that amount to a store admin.'}</p>
            </div>
            <button type="button" className="payment-secondary-button"
              onClick={() => {
                loadTickets(ticketPage);
                loadCashBalances(0);
                if (canSubmitTicket) loadTicketRecipients();
              }}
              disabled={ticketLoading || cashBalanceLoading}>
              {ticketLoading || cashBalanceLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {ticketError && <p className="payment-error" role="alert">{ticketError}</p>}
          {cashBalanceError && <p className="payment-error" role="alert">{cashBalanceError}</p>}
          {ticketSuccess && <p className="payment-success" role="status">{ticketSuccess}</p>}

          {canSubmitTicket && (
            <section className="ticket-due-section" aria-label="Cash due to the counter">
              <div className="ticket-due-heading">
                <h3>Your cash due to the counter</h3>
                <span>{cashBalanceLoading ? 'Updating balance…' : `As of ${cashBalance?.asOf ? new Date(cashBalance.asOf).toLocaleString('en-IN') : 'latest ledger data'}`}</span>
              </div>
              {cashBalance ? (
                <>
                  <div className="ticket-cash-summary">
                    <article><span>Cash payments since last handover</span><strong>{Number(cashBalance.cashPaymentCountSinceLastHandover).toLocaleString('en-IN')}</strong></article>
                    <article><span>Cash collected since last handover</span><strong>{formatMoney(cashBalance.cashCollectedSinceLastHandover)}</strong></article>
                    <article><span>Cash refunds since last handover</span><strong>{formatMoney(cashBalance.cashRefundedSinceLastHandover)}</strong></article>
                    <article><span>Carried-forward due</span><strong>{formatMoney(cashBalance.carriedForwardDue)}</strong></article>
                    <article className="ticket-due-total"><span>Total due to counter</span><strong>{formatMoney(cashBalance.dueToSubmit)}</strong></article>
                    <article><span>Already requested (pending)</span><strong>{formatMoney(cashBalance.pendingHandoverAmount)}</strong></article>
                    <article><span>Under dispute</span><strong>{formatMoney(cashBalance.disputedHandoverAmount)}</strong></article>
                    <article><span>Available to submit now</span><strong>{formatMoney(cashBalance.availableToSubmit)}</strong></article>
                    <article><span>Cash credit balance</span><strong>{formatMoney(cashBalance.cashCreditBalance)}</strong></article>
                  </div>
                  <p className="ticket-form-hint">
                    Balance period starts: {cashBalance.periodStart
                      ? new Date(cashBalance.periodStart).toLocaleString('en-IN')
                      : 'Beginning of cash ledger'}
                    {' · '}Last completed handover: {cashBalance.lastSettledHandoverAt
                      ? new Date(cashBalance.lastSettledHandoverAt).toLocaleString('en-IN')
                      : 'None'}
                  </p>
                </>
              ) : !cashBalanceLoading && <p className="payment-empty-state">Your balance is unavailable; ticket submission is disabled until it loads.</p>}
            </section>
          )}

          {canViewCashierBalances && (
            <section className="ticket-due-section" aria-label="Cash due from billers">
              <div className="ticket-due-heading">
                <h3>Cash due from billers</h3>
                <span>{cashierBalanceSummary?.asOf
                  ? `As of ${new Date(cashierBalanceSummary.asOf).toLocaleString('en-IN')}. `
                  : ''}Due includes outstanding amounts and submitted handovers not yet settled.</span>
              </div>
              <div className="ticket-cash-summary">
                <article className="ticket-due-total">
                  <span>Total outstanding from billers</span>
                  <strong>{cashierBalanceSummary ? formatMoney(cashierBalanceSummary.totalDueToSubmit) : '—'}</strong>
                </article>
                <article>
                  <span>Pending handovers</span>
                  <strong>{cashierBalanceSummary ? formatMoney(cashierBalanceSummary.totalPendingHandoverAmount) : '—'}</strong>
                </article>
                <article>
                  <span>Under dispute</span>
                  <strong>{cashierBalanceSummary ? formatMoney(cashierBalanceSummary.totalDisputedHandoverAmount) : '—'}</strong>
                </article>
                <article>
                  <span>Not yet requested</span>
                  <strong>{cashierBalanceSummary ? formatMoney(cashierBalanceSummary.totalAvailableToSubmit) : '—'}</strong>
                </article>
              </div>
              {cashBalanceLoading ? <p className="payment-empty-state">Loading cashier balances…</p> : cashierBalances.length ? (
                <div className="payment-table-wrap">
                  <table className="cashier-balance-table">
                    <thead>
                      <tr>
                        <th>Biller</th>
                        <th>Cash payments</th>
                        <th>Since last handover</th>
                        <th>Refunds</th>
                        <th>Total due</th>
                        <th>Pending</th>
                        <th>Disputed</th>
                        <th>Not yet requested</th>
                        <th>Last settled handover</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashierBalances.map((balance) => (
                        <tr key={balance.userId}>
                          <td>{balance.userName || balance.name || `User ${balance.userId}`}</td>
                          <td>{Number(balance.cashPaymentCountSinceLastHandover).toLocaleString('en-IN')}</td>
                          <td>{formatMoney(balance.cashCollectedSinceLastHandover)}</td>
                          <td>{formatMoney(balance.cashRefundedSinceLastHandover)}</td>
                          <td><strong>{formatMoney(balance.dueToSubmit)}</strong></td>
                          <td>{formatMoney(balance.pendingHandoverAmount)}</td>
                          <td>{formatMoney(balance.disputedHandoverAmount)}</td>
                          <td>{formatMoney(balance.availableToSubmit)}</td>
                          <td>{balance.lastSettledHandoverAt
                            ? new Date(balance.lastSettledHandoverAt).toLocaleString('en-IN')
                            : 'Never'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : !cashBalanceLoading && <p className="payment-empty-state">No biller cash balances were returned.</p>}
              <div className="payment-pagination">
                <button type="button" onClick={() => setCashBalancePage((current) => Math.max(current - 1, 0))}
                  disabled={cashBalanceLoading || cashBalancePage === 0}>Previous</button>
                <span>Page {cashBalancePage + 1} of {cashBalanceTotalPages}</span>
                <button type="button" onClick={() => setCashBalancePage((current) => current + 1)}
                  disabled={cashBalanceLoading || cashBalancePage + 1 >= cashBalanceTotalPages}>Next</button>
              </div>
            </section>
          )}

          {canSubmitTicket && (
            <form className="ticket-form" onSubmit={submitTicket}>
              <label>Store admin receiving payment
                <select value={recipientUserId} onChange={(event) => setRecipientUserId(event.target.value)}
                  disabled={storeAdminsLoading || !storeAdmins.length} required>
                  <option value="">{storeAdminsLoading ? 'Loading store admins…' : 'Select store admin'}</option>
                  {storeAdmins.map((admin) => (
                    <option key={admin.id} value={String(admin.id)}>{admin.name}</option>
                  ))}
                </select>
              </label>
              {storeAdminsError && <p className="ticket-form-hint payment-error" role="alert">{storeAdminsError}</p>}
              <label>Amount to submit (₹)
                <input type="number" min="0.01" step="0.01"
                  value={cashBalance ? Number(cashBalance.availableToSubmit).toFixed(2) : ''} readOnly required />
              </label>
              <label>Payment method
                <select value={ticketPaymentMethod} onChange={(event) => {
                  const method = event.target.value;
                  setTicketPaymentMethod(method);
                  setTicketError('');
                  if (method === 'CASH') {
                    setTicketPaymentProof(null);
                    if (ticketProofInputRef.current) ticketProofInputRef.current.value = '';
                  }
                }}>
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="CARD">Card</option>
                </select>
              </label>
              {ticketPaymentMethod !== 'CASH' && (
                <div className="ticket-proof-upload">
                  <label htmlFor="ticket-payment-proof">Payment screenshot (required)</label>
                  <input id="ticket-payment-proof" ref={ticketProofInputRef}
                    type="file" accept="image/png,image/jpeg,image/webp" required
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      if (file && (!PAYMENT_PROOF_TYPES.includes(file.type)
                        || file.size > MAX_PAYMENT_PROOF_SIZE)) {
                        setTicketPaymentProof(null);
                        event.target.value = '';
                        setTicketError('Choose a PNG, JPEG, or WebP screenshot up to 5 MB.');
                        return;
                      }
                      setTicketError('');
                      setTicketPaymentProof(file);
                    }} />
                  <span>PNG, JPEG, or WebP; maximum 5 MB.</span>
                  {ticketPaymentProofPreview && (
                    <img src={ticketPaymentProofPreview} alt="Selected payment screenshot preview" />
                  )}
                </div>
              )}
              <label className="ticket-notes">Note (optional)
                <input type="text" maxLength="500" value={ticketNotes}
                  onChange={(event) => setTicketNotes(event.target.value)} />
              </label>
              <button type="submit" className="payment-primary-button"
                disabled={ticketSaving || ticketLoading || cashBalanceLoading || storeAdminsLoading
                  || !cashBalance || Number(cashBalance.availableToSubmit) <= 0 || !storeAdmins.length
                  || (ticketPaymentMethod !== 'CASH' && !ticketPaymentProof)}>
                {ticketSaving ? 'Submitting…' : 'Raise collection request'}
              </button>
            </form>
          )}
          {ticketLoading ? <p className="payment-empty-state">Loading collection tickets…</p> : tickets.length ? (
            <div className="ticket-list">
              {tickets.map((ticket) => {
                const status = String(ticket.status || '').toUpperCase();
                const paymentMethod = String(ticket.paymentMethod || 'CASH').toUpperCase();
                const transferredAmount = status === 'RESOLVED'
                  ? ticket.resolvedAmount
                  : ticket.receiverCountedAmount;
                return (
                  <article className="ticket-row" key={ticket.id}>
                    <div className="ticket-details">
                      <strong>Ticket {ticket.id}</strong>
                      <span>{ticket.senderName || 'Cashier'} → {ticket.recipientName || 'Store Admin'}</span>
                      <span>Payment method: {paymentMethod}</span>
                      <span>Submitted {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('en-IN') : '—'}</span>
                      {ticket.notes && <span>Cashier note: {ticket.notes}</span>}
                      {ticket.receiverCountedAmount != null && <span>Admin counted: {formatMoney(ticket.receiverCountedAmount)}</span>}
                      {ticket.recipientNotes && <span>Admin note: {ticket.recipientNotes}</span>}
                      {ticket.resolutionNote && <span>Resolution: {ticket.resolutionNote}</span>}
                    </div>
                    <div className="ticket-actions">
                      <strong>Declared {formatMoney(ticket.declaredAmount)}</strong>
                      <span className={`ticket-status ticket-status-${status.toLowerCase()}`}>{status}</span>
                      {status === 'DISPUTED' && <span className="ticket-dispute-note">No transfer until resolved.</span>}
                      {status === 'ACCEPTED' && (
                        <span className="payment-success">{paymentMethod === 'CASH'
                          ? `Transferred to store admin: ${formatMoney(transferredAmount)}`
                          : `${paymentMethod} payment verified: ${formatMoney(transferredAmount)}`}</span>
                      )}
                      {status === 'RESOLVED' && (
                        <span className="payment-success">{paymentMethod === 'CASH'
                          ? `Resolved transfer: ${formatMoney(transferredAmount)}`
                          : `Resolved ${paymentMethod} payment: ${formatMoney(transferredAmount)}`}</span>
                      )}
                      {canReviewTicket && (status === 'DISPUTED'
                        || (status === 'PENDING' && isStoreAdmin(currentRole)
                          && currentUserId !== null
                          && currentUserId !== undefined
                          && ticket.recipientUserId !== null
                          && ticket.recipientUserId !== undefined
                          && String(ticket.recipientUserId) === String(currentUserId))) && (
                        <button type="button" className="payment-secondary-button"
                          onClick={() => openTicketForReview(ticket)}>Review ticket</button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : !ticketError && <p className="payment-empty-state">No cash collection tickets.</p>}

          <div className="payment-pagination">
            <button type="button" onClick={() => setTicketPage((current) => Math.max(current - 1, 0))}
              disabled={ticketLoading || ticketPage === 0}>Previous</button>
            <span>Page {ticketPage + 1} of {ticketTotalPages}</span>
            <button type="button" onClick={() => setTicketPage((current) => current + 1)}
              disabled={ticketLoading || ticketPage + 1 >= ticketTotalPages}>Next</button>
          </div>

          {selectedTicket && canReviewTicket && (
            <div className="ticket-review-panel">
              <div className="payment-panel-heading">
                <div>
                  <h3>Review ticket {selectedTicket.id}</h3>
                  <p>{selectedTicket.senderName} → {selectedTicket.recipientName}</p>
                </div>
                <button type="button" className="payment-secondary-button" disabled={ticketSaving}
                  onClick={() => setSelectedTicket(null)}>Close</button>
              </div>
              <div className="ticket-review-summary">
                <span>Declared: <strong>{formatMoney(selectedTicket.declaredAmount)}</strong></span>
                <span>Payment method: <strong>{String(selectedTicket.paymentMethod || 'CASH').toUpperCase()}</strong></span>
                {selectedTicket.receiverCountedAmount != null && (
                  <span>Previously counted: <strong>{formatMoney(selectedTicket.receiverCountedAmount)}</strong></span>
                )}
                {selectedTicket.resolvedAmount != null && (
                  <span>Resolved transfer: <strong>{formatMoney(selectedTicket.resolvedAmount)}</strong></span>
                )}
              </div>
              {String(selectedTicket.paymentMethod || 'CASH').toUpperCase() !== 'CASH' && (
                <div className="ticket-payment-proof">
                  <h4>Attached payment screenshot</h4>
                  {ticketProofLoading && <p className="payment-empty-state">Loading payment screenshot…</p>}
                  {ticketProofError && <p className="payment-error" role="alert">{ticketProofError}</p>}
                  {ticketProofUrl && (
                    <a href={ticketProofUrl} target="_blank" rel="noreferrer">
                      <img src={ticketProofUrl} alt={`Payment proof for ticket ${selectedTicket.id}`} />
                    </a>
                  )}
                </div>
              )}
              <div className="ticket-review-actions">
                {String(selectedTicket.status).toUpperCase() === 'PENDING'
                  && isStoreAdmin(currentRole) && selectedTicketIsRecipient && (
                  <>
                    <label>{String(selectedTicket.paymentMethod || 'CASH').toUpperCase() === 'CASH'
                      ? 'Cash physically counted (₹)'
                      : 'Payment amount verified from screenshot (₹)'}
                      <input type="number" min="0" step="0.01"
                        value={ticketCounts[`${selectedTicket.id}-countedAmount`] ?? ''}
                        onChange={(event) => setTicketCounts((current) => ({ ...current, [`${selectedTicket.id}-countedAmount`]: event.target.value }))} />
                    </label>
                    <label>Admin note (optional)
                      <input type="text" maxLength="500"
                        value={ticketCounts[`${selectedTicket.id}-notes`] || ''}
                        onChange={(event) => setTicketCounts((current) => ({ ...current, [`${selectedTicket.id}-notes`]: event.target.value }))} />
                    </label>
                  </>
                )}
                {String(selectedTicket.status).toUpperCase() === 'DISPUTED' && (
                  <>
                    <label>{String(selectedTicket.paymentMethod || 'CASH').toUpperCase() === 'CASH'
                      ? 'Resolved cash amount (₹)'
                      : 'Resolved payment amount (₹)'}
                      <input type="number" min="0" step="0.01"
                        value={ticketCounts[`${selectedTicket.id}-resolvedAmount`] ?? ''}
                        onChange={(event) => setTicketCounts((current) => ({ ...current, [`${selectedTicket.id}-resolvedAmount`]: event.target.value }))} />
                    </label>
                    <label>Resolution note
                      <input type="text" maxLength="500"
                        value={ticketCounts[`${selectedTicket.id}-notes`] || ''}
                        onChange={(event) => setTicketCounts((current) => ({ ...current, [`${selectedTicket.id}-notes`]: event.target.value }))} />
                    </label>
                  </>
                )}
                <div className="ticket-review-buttons">
                  {String(selectedTicket.status).toUpperCase() === 'PENDING'
                    && isStoreAdmin(currentRole) && selectedTicketIsRecipient && (
                    <button type="button" className="payment-primary-button" disabled={ticketSaving || ticketProofLoading
                      || (String(selectedTicket.paymentMethod || 'CASH').toUpperCase() !== 'CASH' && !ticketProofUrl)}
                      onClick={() => submitTicketCount(selectedTicket)}>
                      {String(selectedTicket.paymentMethod || 'CASH').toUpperCase() === 'CASH'
                        ? 'Submit cash count'
                        : 'Confirm verified payment'}
                    </button>
                  )}
                  {String(selectedTicket.status).toUpperCase() === 'DISPUTED' && canReviewTicket && (
                    <button type="button" className="payment-primary-button" disabled={ticketSaving}
                      onClick={() => resolveTicket(selectedTicket)}>
                      {String(selectedTicket.paymentMethod || 'CASH').toUpperCase() === 'CASH'
                        ? 'Resolve & transfer amount'
                        : 'Resolve payment'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {canManageCash && (
        <section className="reconciliation-panel">
          <div className="payment-panel-heading">
            <div>
              <h2>Cash drawer</h2>
              <p>Expected cash includes this staff member’s collections, refunds, and accepted cash-ticket transfers.</p>
            </div>
            <button type="button" className="payment-secondary-button" onClick={toggleReconciliation}>
              {reconciliationOpen ? 'Hide reconciliation' : 'Reconcile cash'}
            </button>
          </div>
          {reconciliationOpen && (
            <>
              <form className="reconciliation-form" onSubmit={submitReconciliation}>
                <label>Date<input type="date" value={reconciliationDate} onChange={(event) => setReconciliationDate(event.target.value)} required /></label>
                <label>Opening float (₹)<input type="number" min="0" step="0.01" value={openingFloat} onChange={(event) => setOpeningFloat(event.target.value)} required /></label>
                <label>Physical cash counted (₹)<input type="number" min="0" step="0.01" value={physicalCash} onChange={(event) => setPhysicalCash(event.target.value)} required /></label>
                <label className="reconciliation-remarks">Remarks (optional)<input type="text" maxLength="1000" value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label>
                <button type="submit" className="payment-primary-button" disabled={reconciliationSaving}>
                  {reconciliationSaving ? 'Saving…' : 'Submit reconciliation'}
                </button>
              </form>
              {reconciliationError && <p className="payment-error" role="alert">{reconciliationError}</p>}
              {reconciliationSuccess && <p className="payment-success" role="status">{reconciliationSuccess}</p>}
              <h3>Recent reconciliations</h3>
              {reconciliationLoading ? <p className="payment-empty-state">Loading history…</p> : (
                <div className="reconciliation-history">
                  {reconciliations.length ? reconciliations.map((record) => (
                    <div className="reconciliation-history-row" key={record.id}>
                      <span>{record.reconciliationDate} · {record.collectorName}</span>
                      <strong>{record.status} · {formatMoney(record.difference)}</strong>
                    </div>
                  )) : <p className="payment-empty-state">No reconciliations recorded yet.</p>}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
};

export default PaymentCollectionPage;
