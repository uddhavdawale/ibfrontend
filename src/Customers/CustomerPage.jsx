import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './CustomerPage.css';
import { API_ENDPOINTS, apiFetch } from '../Config/api';

const EMPTY_CUSTOMER = {
  id: '',
  customerName: 'Walk-in Customer',
  shopName: 'IB Enterprises',
  address: 'Aurangabad, Maharashtra',
  gstNumber: '27ABCDE1234F1Z5',
  phone: '',
  email: '',
  dueBalance: 0,
  previousOrderCount: 0,
  lastOrderNo: 'INV-000',
  lastInvoiceDate: 'N/A',
};

const formatMoney = (value) => {
  const numericValue = Number(value || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
};

const formatDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const CustomerPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const customerPhone = searchParams.get('phone') || '';
  const customerId = searchParams.get('id') || '';

  const summaryCards = useMemo(() => [
    { label: 'Due Balance', value: formatMoney(customer.dueBalance), tone: customer.dueBalance > 0 ? 'warning' : 'success' },
    { label: 'Previous Orders', value: String(customer.previousOrderCount || 0), tone: 'neutral' },
    { label: 'Last Order No.', value: customer.lastOrderNo || 'INV-000', tone: 'neutral' },
    { label: 'Last Invoice Date', value: formatDate(customer.lastInvoiceDate), tone: 'neutral' },
  ], [customer]);

  useEffect(() => {
    let active = true;

    const loadCustomer = async () => {
      try {
        setLoading(true);
        setError('');

        let response;
        if (customerId) {
          response = await apiFetch(API_ENDPOINTS.customerById(customerId));
        } else if (customerPhone) {
          response = await apiFetch(API_ENDPOINTS.customerByPhone(customerPhone));
        } else {
          response = await apiFetch(API_ENDPOINTS.customers);
        }

        if (!response.ok) {
          throw new Error('Customer details unavailable.');
        }

        const payload = await response.json();
        const maybeCustomers = Array.isArray(payload) ? payload : payload?.content || payload?.data || [];
        const source = Array.isArray(maybeCustomers) && maybeCustomers.length > 0
          ? maybeCustomers[0]
          : payload && typeof payload === 'object'
            ? payload
            : EMPTY_CUSTOMER;

        if (!active) return;

        setCustomer({
          id: source.id || source.customerId || customerId || '',
          customerName: source.customerName || source.name || 'Walk-in Customer',
          shopName: source.shopName || source.businessName || source.storeName || 'IB Enterprises',
          address: source.address || source.shopAddress || 'Aurangabad, Maharashtra',
          gstNumber: source.gstNumber || source.gstin || '27ABCDE1234F1Z5',
          phone: source.phone || source.mobile || customerPhone || '',
          email: source.email || '',
          dueBalance: Number(source.dueBalance ?? source.outstandingBalance ?? 0),
          previousOrderCount: Number(source.previousOrderCount ?? source.totalOrders ?? source.orderCount ?? 0),
          lastOrderNo: source.lastOrderNo || source.lastInvoiceNo || 'INV-000',
          lastInvoiceDate: source.lastInvoiceDate || source.lastOrderDate || '',
        });
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || 'Unable to load customer details.');
        setCustomer({ ...EMPTY_CUSTOMER, phone: customerPhone || '', id: customerId || '' });
      } finally {
        if (active) setLoading(false);
      }
    };

    loadCustomer();
    return () => { active = false; };
  }, [customerId, customerPhone]);

  return (
    <div className="customer-page">
      <header className="customer-header">
        <button type="button" className="back-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div>
          <p className="section-kicker">Customer</p>
          <h1>Customer Details</h1>
        </div>
      </header>

      {error && <div className="customer-alert">{error}</div>}

      {loading ? (
        <div className="customer-card loading-state">Loading customer information...</div>
      ) : (
        <>
          <section className="customer-identity-card">
            <div className="customer-avatar">{customer.customerName?.charAt(0)?.toUpperCase() || 'C'}</div>
            <div>
              <h2>{customer.customerName}</h2>
              <p>{customer.shopName}</p>
            </div>
          </section>

          <section className="summary-grid">
            {summaryCards.map((card) => (
              <div key={card.label} className={`summary-card ${card.tone}`}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </div>
            ))}
          </section>

          <section className="customer-grid">
            <div className="customer-card">
              <h3>Customer Information</h3>
              <div className="detail-row"><label>Name</label><span>{customer.customerName}</span></div>
              <div className="detail-row"><label>Phone</label><span>{customer.phone || 'N/A'}</span></div>
              <div className="detail-row"><label>Email</label><span>{customer.email || 'N/A'}</span></div>
              <div className="detail-row"><label>GST Number</label><span>{customer.gstNumber || 'N/A'}</span></div>
            </div>

            <div className="customer-card">
              <h3>Shop & Billing</h3>
              <div className="detail-row"><label>Shop Name</label><span>{customer.shopName}</span></div>
              <div className="detail-row"><label>Address</label><span>{customer.address}</span></div>
              <div className="detail-row"><label>Last Order No.</label><span>{customer.lastOrderNo}</span></div>
              <div className="detail-row"><label>Last Invoice Date</label><span>{formatDate(customer.lastInvoiceDate)}</span></div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default CustomerPage;
