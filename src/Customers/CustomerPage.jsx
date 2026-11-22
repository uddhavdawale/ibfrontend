import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './CustomerPage.css';
import { API_ENDPOINTS, apiFetch } from '../Config/api';
import { getShopDisplayName, readStoredShopProfile } from '../modules/shopProfile/shopProfileService';
import { openWhatsAppChat } from '../utils/whatsapp';
import { buildPaymentReminderMessage } from '../utils/whatsappCommerce';

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
  lastOrderId: 0,
  lastOrderNo: 'INV-000',
  lastInvoiceDate: 'N/A',
};

const normalizeCustomerRecord = (source = {}, fallback = EMPTY_CUSTOMER) => {
  const dueBalance = Number(
    source.dueBalance
      ?? source.outstandingBalance
      ?? source.balanceDue
      ?? source.pendingAmount
      ?? source.pendingBalance
      ?? source.currentBalance
      ?? source.amountDue
      ?? source.totalDue
      ?? source.customerDue
      ?? source.balance
      ?? source.receivable
      ?? source.outstanding
      ?? fallback.dueBalance
      ?? 0
  );
  return {
    id: source.id ?? source.customerId ?? fallback.id ?? '',
    customerName: source.customerName || source.name || source.customer || fallback.customerName || 'Walk-in Customer',
    shopName: source.shopName || source.businessName || source.storeName || source.shop || fallback.shopName || 'IB Enterprises',
    address: source.address || source.shopAddress || source.location || fallback.address || 'Aurangabad, Maharashtra',
    gstNumber: source.gstNumber || source.gstin || source.gst || fallback.gstNumber || 'N/A',
    phone: source.phone || source.mobile || source.contactNumber || fallback.phone || '',
    email: source.email || source.mail || fallback.email || '',
    dueBalance: Number.isFinite(dueBalance) ? Math.max(dueBalance, 0) : 0,
    previousOrderCount: Number(source.previousOrderCount ?? source.totalOrders ?? source.orderCount ?? source.orderCountTotal ?? fallback.previousOrderCount ?? 0),
    lastOrderId: Number(source.lastOrderId ?? source.lastOrder ?? source.orderId ?? fallback.lastOrderId ?? 0),
    lastOrderNo: source.lastOrderNo || source.lastInvoiceNo || source.lastOrderNumber || source.invoiceNumber || fallback.lastOrderNo || 'INV-000',
    lastInvoiceDate: source.lastInvoiceDate || source.lastOrderDate || source.updatedAt || fallback.lastInvoiceDate || '',
  };
};

const extractCustomerList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.customers)) return payload.customers;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (payload && typeof payload === 'object') {
    const candidate = payload.data?.customers ?? payload.data?.content ?? payload.data?.items ?? payload.customers ?? payload.content ?? payload.items;
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
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

const normalizePhoneNumber = (value) => {
  let digits = String(value || '').replace(/\D/g, '').replace(/^00/, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return /^\d{8,15}$/.test(digits) ? digits : '';
};

const CustomerPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reminderChannel, setReminderChannel] = useState('whatsapp');
  const [dailyRemindersEnabled, setDailyRemindersEnabled] = useState(() => {
    try {
      return localStorage.getItem('ib-daily-payment-reminders') === 'enabled';
    } catch {
      return false;
    }
  });

  const customerPhone = searchParams.get('phone') || '';
  const customerId = searchParams.get('id') || '';

  const selectedCustomer = useMemo(
    () => customers.find((customer) => String(customer.id) === String(selectedCustomerId)) || customers[0] || EMPTY_CUSTOMER,
    [customers, selectedCustomerId]
  );

  const summaryCards = useMemo(() => [
    { label: 'Due Balance', value: formatMoney(selectedCustomer.dueBalance), tone: selectedCustomer.dueBalance > 0 ? 'warning' : 'success' },
    { label: 'Previous Orders', value: String(selectedCustomer.previousOrderCount || 0), tone: 'neutral' },
    { label: 'Last Order No.', value: selectedCustomer.lastOrderNo || 'INV-000', tone: 'neutral' },
    { label: 'Last Invoice Date', value: formatDate(selectedCustomer.lastInvoiceDate), tone: 'neutral' },
  ], [selectedCustomer]);

  const loadCustomers = async (query = '') => {
    try {
      setLoading(true);
      setError('');

      const endpoints = query
        ? [API_ENDPOINTS.customerProfilesSearch(query), API_ENDPOINTS.customerSearch(query)]
        : [API_ENDPOINTS.customerProfiles, API_ENDPOINTS.customers];

      let list = [];
      let lastError = null;
      let hasSuccessfulResponse = false;

      for (const endpoint of endpoints) {
        try {
          const response = await apiFetch(endpoint);
          if (!response.ok) {
            lastError = new Error(`Request failed for ${endpoint}`);
            continue;
          }

          const payload = await response.json();
          hasSuccessfulResponse = true;
          const records = extractCustomerList(payload);
          if (records.length > 0) {
            list = records;
            break;
          }
        } catch (requestError) {
          lastError = requestError;
        }
      }

      if (!hasSuccessfulResponse && lastError) {
        throw lastError;
      }

      const normalizedList = list.map((item) => normalizeCustomerRecord(item, EMPTY_CUSTOMER));
      setCustomers(normalizedList);
      setSelectedCustomerId((currentId) => {
        if (normalizedList.length === 0) return '';
        if (currentId && normalizedList.some((item) => String(item.id) === String(currentId))) return currentId;
        return String(normalizedList[0].id || '');
      });
    } catch (loadError) {
      setError(loadError.message || 'Unable to load customer records.');
      setCustomers([]);
      setSelectedCustomerId('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const loadCustomerDetail = async () => {
      if (customerId || customerPhone) {
        try {
          setLoading(true);
          setError('');

          const endpoints = [];
          if (customerId) {
            endpoints.push(API_ENDPOINTS.customerProfileById(customerId), API_ENDPOINTS.customerById(customerId));
          } else {
            endpoints.push(API_ENDPOINTS.customerProfileByPhone(customerPhone), API_ENDPOINTS.customerByPhone(customerPhone));
          }

          let detailPayload = null;
          for (const endpoint of endpoints) {
            try {
              const response = await apiFetch(endpoint);
              if (!response.ok) continue;
              detailPayload = await response.json();
              break;
            } catch {
              // continue to next endpoint candidate
            }
          }

          if (!detailPayload || !active) return;

          const normalizedCustomer = normalizeCustomerRecord(detailPayload, EMPTY_CUSTOMER);
          setCustomers([normalizedCustomer]);
          setSelectedCustomerId(String(normalizedCustomer.id || ''));
        } catch (loadError) {
          if (!active) return;
          setError(loadError.message || 'Unable to load customer details.');
          setCustomers([]);
          setSelectedCustomerId('');
        } finally {
          if (active) setLoading(false);
        }
        return;
      }

      const initialSearch = searchParams.get('query') || '';
      setSearchTerm(initialSearch);
      loadCustomers(initialSearch);
    };

    loadCustomerDetail();
    return () => { active = false; };
  }, [customerId, customerPhone, searchParams]);

  const handleSearchSubmit = async (event) => {
    event.preventDefault();
    await loadCustomers(searchTerm.trim());
  };

  const handleSendPaymentReminder = () => {
    const phone = normalizePhoneNumber(selectedCustomer.phone);
    const dueBalance = Number(selectedCustomer.dueBalance);
    if (!phone || !Number.isFinite(dueBalance) || dueBalance <= 0) return;

    const shopName = getShopDisplayName(readStoredShopProfile());
    const customerName = String(selectedCustomer.customerName || 'there').trim();
    const message = buildPaymentReminderMessage({
      customerName,
      shopName,
      dueBalance,
      invoiceNo: selectedCustomer.lastOrderNo,
    });
    if (reminderChannel === 'sms') {
      window.location.href = `sms:${phone}?body=${encodeURIComponent(message)}`;
      return;
    }

    openWhatsAppChat(phone, message);
  };

  const selectedCustomerDue = Number.isFinite(selectedCustomer.dueBalance)
    ? Math.max(selectedCustomer.dueBalance, 0)
    : 0;
  const reminderPhoneAvailable = Boolean(normalizePhoneNumber(selectedCustomer.phone));
  const dueCustomers = useMemo(
    () => customers.filter((customer) => Number(customer.dueBalance || 0) > 0),
    [customers]
  );

  const handleDailyReminderToggle = async (enabled) => {
    setDailyRemindersEnabled(enabled);
    try {
      localStorage.setItem('ib-daily-payment-reminders', enabled ? 'enabled' : 'disabled');
    } catch {
      // Reminder preference is optional; customer reminder actions remain available.
    }

    if (enabled && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => 'denied');
    }
  };

  useEffect(() => {
    if (!dailyRemindersEnabled || dueCustomers.length === 0) return undefined;
    if (!('Notification' in window) || Notification.permission !== 'granted') return undefined;

    const dueKey = `ib-daily-reminder-notified:${new Date().toLocaleDateString('en-CA')}`;
    if (localStorage.getItem(dueKey)) return undefined;

    const timer = window.setTimeout(() => {
      new Notification('Customer payment reminders ready', {
        body: `${dueCustomers.length} customer${dueCustomers.length === 1 ? '' : 's'} have outstanding balances.`,
        tag: 'ib-daily-payment-reminders',
      });
      localStorage.setItem(dueKey, '1');
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [dailyRemindersEnabled, dueCustomers.length]);

  return (
    <div className="customer-page">
      <header className="customer-header">
        <button type="button" className="back-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div>
          <p className="section-kicker">Customer</p>
          <h1>Customer Directory</h1>
        </div>
      </header>

      {error && <div className="customer-alert">{error}</div>}

      <div className="customer-toolbar">
        <form onSubmit={handleSearchSubmit} className="customer-search-form">
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by name, phone, email..."
            aria-label="Search customers"
          />
          <button type="submit" className="primary-btn">Search</button>
        </form>
        <button type="button" className="secondary-btn" onClick={() => loadCustomers(searchTerm.trim())}>Refresh</button>
      </div>

      {loading ? (
        <div className="customer-card loading-state">Loading customer records...</div>
      ) : customers.length === 0 ? (
        <div className="customer-empty-state">
          <h3>No customer records found</h3>
          <p>Try a different name, phone number, or email address.</p>
        </div>
      ) : (
        <div className="customer-layout">
          <aside className="customer-list-panel">
            {customers.map((customer) => (
              <button
                type="button"
                key={customer.id || `${customer.phone}-${customer.customerName}`}
                className={`customer-list-item ${String(selectedCustomer.id || '') === String(customer.id || '') ? 'active' : ''}`}
                onClick={() => setSelectedCustomerId(String(customer.id || ''))}
              >
                <div className="customer-list-avatar">{customer.customerName?.charAt(0)?.toUpperCase() || 'C'}</div>
                <div className="customer-summary-text">
                  <strong>{customer.customerName}</strong>
                  <span>{customer.phone || 'No phone'}</span>
                  <small>{customer.shopName}</small>
                </div>
                <span className="customer-due-pill">₹{Number(customer.dueBalance || 0).toLocaleString('en-IN')}</span>
              </button>
            ))}
          </aside>

          <section className="customer-details-panel">
            <div className="customer-identity-card">
              <div className="customer-avatar">{selectedCustomer.customerName?.charAt(0)?.toUpperCase() || 'C'}</div>
              <div>
                <h2>{selectedCustomer.customerName}</h2>
                <p>{selectedCustomer.shopName}</p>
              </div>
            </div>

            <section className="customer-follow-up-card" aria-labelledby="customer-follow-up-heading">
              <div>
                <p className="customer-follow-up-kicker">Payment follow-up</p>
                <h3 id="customer-follow-up-heading">Outstanding balance</h3>
                <strong>{formatMoney(selectedCustomerDue)}</strong>
                <p className="customer-follow-up-note">
                  Choose a channel to open a prefilled message for you to review and send.
                </p>
              </div>
              <div className="customer-follow-up-actions">
                <label htmlFor="customer-reminder-channel">Send reminder via</label>
                <select
                  id="customer-reminder-channel"
                  value={reminderChannel}
                  onChange={(event) => setReminderChannel(event.target.value)}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                </select>
                <button
                  type="button"
                  className="primary-btn customer-reminder-btn"
                  onClick={handleSendPaymentReminder}
                  disabled={!reminderPhoneAvailable || selectedCustomerDue <= 0}
                  title={!reminderPhoneAvailable ? 'Add a valid customer phone number to send a reminder.' : undefined}
                >
                  {reminderPhoneAvailable ? `Prepare ${reminderChannel === 'sms' ? 'SMS' : 'WhatsApp'} reminder` : 'Customer phone required'}
                </button>
                <label className="daily-reminder-toggle">
                  <input
                    type="checkbox"
                    checked={dailyRemindersEnabled}
                    onChange={(event) => handleDailyReminderToggle(event.target.checked)}
                  />
                  Daily reminder notification
                </label>
                {dueCustomers.length > 0 && (
                  <span className="daily-reminder-count">{dueCustomers.length} customer{dueCustomers.length === 1 ? '' : 's'} in the due queue</span>
                )}
              </div>
            </section>

            <div className="summary-grid">
              {summaryCards.map((card) => (
                <div key={card.label} className={`summary-card ${card.tone}`}>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </div>
              ))}
            </div>

            <div className="customer-grid">
              <div className="customer-card">
                <h3>Customer Information</h3>
                <div className="detail-row"><label>Name</label><span>{selectedCustomer.customerName}</span></div>
                <div className="detail-row"><label>Phone</label><span>{selectedCustomer.phone || 'N/A'}</span></div>
                <div className="detail-row"><label>Email</label><span>{selectedCustomer.email || 'N/A'}</span></div>
                <div className="detail-row"><label>GST Number</label><span>{selectedCustomer.gstNumber || 'N/A'}</span></div>
              </div>

              <div className="customer-card">
                <h3>Shop & Billing</h3>
                <div className="detail-row"><label>Shop Name</label><span>{selectedCustomer.shopName}</span></div>
                <div className="detail-row"><label>Address</label><span>{selectedCustomer.address}</span></div>
                <div className="detail-row"><label>Last Order ID</label><span>{selectedCustomer.lastOrderId || 'N/A'}</span></div>
                <div className="detail-row"><label>Last Order No.</label><span>{selectedCustomer.lastOrderNo}</span></div>
                <div className="detail-row"><label>Last Invoice Date</label><span>{formatDate(selectedCustomer.lastInvoiceDate)}</span></div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default CustomerPage;
