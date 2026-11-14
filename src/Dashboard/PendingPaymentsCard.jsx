import React, { useEffect, useMemo, useState } from 'react';
import { API_ENDPOINTS, apiFetch } from '../Config/api';

const normalizePendingPaymentCustomer = (invoice) => {
  const customerName = invoice?.customerName ?? invoice?.customer?.name ?? 'Walk-in Customer';
  const totalAmount = Number(
    invoice?.grandTotal ?? invoice?.total ?? invoice?.amount ?? invoice?.totalAmount ?? 0
  );
  const paidAmount = Number(
    invoice?.paidAmount ?? invoice?.amountPaid ?? invoice?.totalPaid ?? invoice?.receivedAmount ?? 0
  );
  const rawStatus = String(
    invoice?.paymentStatus ?? invoice?.payment_status ?? invoice?.status ?? 'pending'
  ).trim().toLowerCase();

  const isPending = rawStatus === 'pending' || rawStatus === 'partial' || rawStatus === 'unpaid' || paidAmount < totalAmount;
  if (!isPending) return null;

  const invoiceNo = invoice?.invoiceNo ?? invoice?.invoice_number ?? `INV-${invoice?.id ?? 'N/A'}`;
  return {
    name: customerName,
    amount: Math.max(totalAmount - paidAmount, 0),
    invoiceNo,
    displayName: customerName && invoiceNo ? `${customerName} (${invoiceNo})` : customerName
  };
};

const fetchPendingPaymentCustomers = async () => {
  const candidateUrls = [
    API_ENDPOINTS.invoicesPage(0, 100),
    API_ENDPOINTS.invoiceLegacyPage(0, 100),
    API_ENDPOINTS.ordersPage(0, 100)
  ];

  for (const url of candidateUrls) {
    try {
      const response = await apiFetch(url);
      if (!response.ok) continue;
      const payload = await response.json();
      const invoiceList = Array.isArray(payload?.content)
        ? payload.content
        : Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.invoices)
            ? payload.invoices
            : Array.isArray(payload?.data)
              ? payload.data
              : [];

      const pendingCustomers = invoiceList
        .map(normalizePendingPaymentCustomer)
        .filter(Boolean)
        .sort((a, b) => b.amount - a.amount);

      if (pendingCustomers.length > 0) return pendingCustomers;
    } catch {
      // Ignore and try the next endpoint.
    }
  }

  return [];
};

const PendingPaymentsCard = ({ defaultTotal = 0 }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadCustomers = async () => {
      try {
        const data = await fetchPendingPaymentCustomers();
        if (active) {
          setCustomers(data);
        }
      } catch {
        if (active) setCustomers([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadCustomers();
    return () => { active = false; };
  }, []);

  const total = useMemo(() => {
    if (Number(defaultTotal) > 0) {
      return Number(defaultTotal);
    }
    if (customers.length > 0) {
      return customers.reduce((sum, customer) => sum + Number(customer.amount || 0), 0);
    }
    return Number(defaultTotal || 0);
  }, [customers, defaultTotal]);

  const uniqueCustomers = useMemo(() => {
    const duplicateCounts = new Map();
    customers.forEach((customer) => {
      const key = String(customer?.name || '').trim().toLowerCase();
      duplicateCounts.set(key, (duplicateCounts.get(key) || 0) + 1);
    });

    return customers.map((customer) => {
      const key = String(customer?.name || '').trim().toLowerCase();
      const duplicateCount = (duplicateCounts.get(key) || 1) - 1;
      return {
        ...customer,
        duplicateCount,
        displayName:
          duplicateCount > 0
            ? `${customer.name} (${customer.invoiceNo})`
            : customer.name
      };
    });
  }, [customers]);

  return (
    <div className="pending-payments-card pending-card">
      <button
        type="button"
        className="stat-card pending-payments-trigger"
        onClick={() => setShowDropdown((prev) => !prev)}
        aria-expanded={showDropdown}
        aria-controls="pending-payments-list"
      >
        <span className="stat-info">
          <strong className="stat-value">₹{total.toLocaleString('en-IN')}</strong>
          <span className="stat-label">Pending Payments</span>
        </span>
        <span className={`stat-change ${loading ? '' : total > 0 ? 'negative' : 'positive'}`}>
          {loading ? 'Loading…' : total > 0 ? 'View details' : 'No outstanding'}
        </span>
      </button>

      {showDropdown && (
        <div className="pending-payment-dropdown" id="pending-payments-list">
          <div className="pending-payment-header">
            <span>Retailers with dues</span>
            <button
              type="button"
              className="pending-payment-close"
              onClick={(event) => {
                event.stopPropagation();
                setShowDropdown(false);
              }}
              aria-label="Close pending payments"
            >
              ×
            </button>
          </div>

          {loading ? (
            <ul>
              <li><span>Loading pending retailers…</span><strong>—</strong></li>
            </ul>
          ) : uniqueCustomers.length > 0 ? (
            <ul>
              {uniqueCustomers.map((customer) => (
                <li key={`${customer.name}-${customer.invoiceNo}`}>
                  <span>{customer.displayName || customer.name}</span>
                  <strong>₹{Number(customer.amount || 0).toLocaleString('en-IN')}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <ul>
              <li>
                <span>No pending retailers</span>
                <strong>₹0</strong>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default PendingPaymentsCard;
