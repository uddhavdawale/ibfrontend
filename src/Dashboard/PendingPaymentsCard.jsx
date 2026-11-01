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
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8);

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
    if (customers.length > 0) {
      return customers.reduce((sum, customer) => sum + Number(customer.amount || 0), 0);
    }
    return Number(defaultTotal || 0);
  }, [customers, defaultTotal]);

  const uniqueCustomers = useMemo(() => {
    const seen = new Map();

    (customers || []).forEach((customer) => {
      const key = String(customer?.name || '').trim().toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, customer);
        return;
      }

      const current = seen.get(key);
      const count = Number(current?.duplicateCount || 0) + 1;
      seen.set(key, { ...customer, duplicateCount: count });
    });

    return (customers || []).map((customer) => {
      const key = String(customer?.name || '').trim().toLowerCase();
      const duplicateCount = Number((customers || []).filter((item) => String(item?.name || '').trim().toLowerCase() === key).length - 1);
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
    <div
      className="stat-card pending-payments-card pending-card"
      onClick={() => setShowDropdown((prev) => !prev)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setShowDropdown((prev) => !prev);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="stat-info">
        <h3>₹{total.toLocaleString()}</h3>
        <p>Pending Payments</p>
      </div>
      <div className="stat-change negative">{loading ? 'Loading...' : '-₹500'}</div>

      {showDropdown && (
        <div className="pending-payment-dropdown">
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

          {uniqueCustomers.length > 0 ? (
            <ul>
              {uniqueCustomers.map((customer) => (
                <li key={`${customer.name}-${customer.invoiceNo}`}>
                  <span>{customer.displayName || customer.name}</span>
                  <strong>₹{Number(customer.amount || 0).toLocaleString()}</strong>
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
