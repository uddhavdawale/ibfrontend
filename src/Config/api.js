export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "";

export const API_ENDPOINTS = {
  login: `${API_BASE_URL}/api/login`,
  signup: `${API_BASE_URL}/api/auth/signup`,
  passwordRecovery: `${API_BASE_URL}/api/auth/password/forgot`,
  passwordReset: `${API_BASE_URL}/api/auth/password/reset`,
  users: `${API_BASE_URL}/api/users`,
  existingUsers: `${API_BASE_URL}/api/users/existing`,
  userById: (id) => `${API_BASE_URL}/api/users/${id}`,
  userStatusById: (id) => `${API_BASE_URL}/api/users/${id}/status`,
  userResendPasswordById: (id) => `${API_BASE_URL}/api/users/${id}/resend-password`,
  refresh: `${API_BASE_URL}/api/auth/refresh`,
  logout: `${API_BASE_URL}/api/auth/logout`,
  userProfile: `${API_BASE_URL}/api/users/me`,
  shopProfile: `${API_BASE_URL}/api/shop/me`,
  userDashboard: `${API_BASE_URL}/api/users/me/dashboard`,
  customers: `${API_BASE_URL}/api/customers`,
  customerProfiles: `${API_BASE_URL}/api/customer_profiles`,
  customerById: (id) => `${API_BASE_URL}/api/customers/${id}`,
  customerProfileById: (id) => `${API_BASE_URL}/api/customer_profiles/${id}`,
  customerByPhone: (phone) => `${API_BASE_URL}/api/customers/phone/${encodeURIComponent(phone)}`,
  customerProfileByPhone: (phone) => `${API_BASE_URL}/api/customer_profiles/phone/${encodeURIComponent(phone)}`,
  customerSearch: (query = '') => `${API_BASE_URL}/api/customers/search?query=${encodeURIComponent(query)}`,
  customerProfilesSearch: (query = '') => `${API_BASE_URL}/api/customer_profiles/search?query=${encodeURIComponent(query)}`,
  products: `${API_BASE_URL}/api/products`,
  billingProducts: `${API_BASE_URL}/api/billing/products`,
  productsWithSize: (size = 1000) => `${API_BASE_URL}/api/products?size=${size}`,
  billingProductsPage: (page = 0, size = 100) => `${API_BASE_URL}/api/billing/products?page=${page}&size=${size}`,
  productById: (id) => `${API_BASE_URL}/api/products/${id}`,
  inventoryBulkUpload: `${API_BASE_URL}/api/inventory/upload`,
  inventoryUploadTemplate: `${API_BASE_URL}/api/inventory/upload-template`,
  invoices: `${API_BASE_URL}/api/invoices`,
  invoicesPage: (page = 0, size = 100) => `${API_BASE_URL}/api/invoices?page=${page}&size=${size}`,
  invoicePaymentsById: (id) => `${API_BASE_URL}/api/invoices/${id}/payments`,
  invoiceLegacyPage: (page = 0, size = 100) => `${API_BASE_URL}/api/invoice?page=${page}&size=${size}`,
  ordersPage: (page = 0, size = 100) => `${API_BASE_URL}/api/orders?page=${page}&size=${size}`,
  invoiceById: (id) => `${API_BASE_URL}/api/invoices/${id}`,
  invoiceDetailsById: (id) => `${API_BASE_URL}/api/invoices/${id}/details`,
  invoiceItemsById: (id) => `${API_BASE_URL}/api/invoices/${id}/items`,
  invoiceLegacyById: (id) => `${API_BASE_URL}/api/invoice/${id}`,
  invoiceLegacyDetailById: (id) => `${API_BASE_URL}/api/invoice-detail/${id}`,
  returns: `${API_BASE_URL}/api/returns`,
  returnById: (id) => `${API_BASE_URL}/api/returns/${id}`,
  returnByInvoice: (invoiceId) => `${API_BASE_URL}/api/returns/invoice/${encodeURIComponent(invoiceId)}`,
  exchanges: `${API_BASE_URL}/api/exchanges`,
  exchangeById: (id) => `${API_BASE_URL}/api/exchanges/${id}`,
  exchangeByInvoice: (invoiceId) => `${API_BASE_URL}/api/exchanges/invoice/${encodeURIComponent(invoiceId)}`,
  nonGstInvoices: `${API_BASE_URL}/api/non-gst-invoices`,
  nonGstInvoicesPage: (page = 0, size = 200) => `${API_BASE_URL}/api/non-gst-invoices?page=${page}&size=${size}`,
  nonGstInvoiceById: (id) => `${API_BASE_URL}/api/non-gst-invoices/${id}`,
  nonGstInvoicePaymentsById: (id) => `${API_BASE_URL}/api/non-gst-invoices/${id}/payments`,
  payments: `${API_BASE_URL}/api/payments`,
  paymentRefundsById: (id) => `${API_BASE_URL}/api/payments/${id}/refunds`,
  cashReconciliations: `${API_BASE_URL}/api/cash-reconciliations`,
  cashCollectionTickets: `${API_BASE_URL}/api/cash-collection-tickets`,
  cashCollectionTicketRecipients: `${API_BASE_URL}/api/cash-collection-tickets/recipients`,
  cashCollectionTicketBalances: `${API_BASE_URL}/api/cash-collection-tickets/balances`,
  cashCollectionTicketCountById: (id) => `${API_BASE_URL}/api/cash-collection-tickets/${encodeURIComponent(id)}/count`,
  cashCollectionTicketResolveById: (id) => `${API_BASE_URL}/api/cash-collection-tickets/${encodeURIComponent(id)}/resolve`,
  cashCollectionTicketProofById: (id) => `${API_BASE_URL}/api/cash-collection-tickets/${encodeURIComponent(id)}/payment-proof`,
  dashboardSummary: `${API_BASE_URL}/api/dashboard/summary`,
  dashboardLegacy: `${API_BASE_URL}/api/dashboard`,
  metrics: `${API_BASE_URL}/api/metrics`,
  salesLastSixMonths: `${API_BASE_URL}/api/sales/last-six-months`,
  gstSummary: `${API_BASE_URL}/api/gst/summary`,
  gstStats: `${API_BASE_URL}/api/gst/stats`,
  gstOverview: `${API_BASE_URL}/api/gst/overview`,
  gstReturnsByPeriod: (period) => `${API_BASE_URL}/api/gst/returns?period=${encodeURIComponent(period)}`,
  gstFilingsByPeriod: (period) => `${API_BASE_URL}/api/gst/filings?period=${encodeURIComponent(period)}`,
  gstFilings: `${API_BASE_URL}/api/gst/filings`,
  auditSummary: `${API_BASE_URL}/api/audit/summary`,
  auditEvents: `${API_BASE_URL}/api/audit/events`,
  auditEventsPage: (page = 0, size = 50) => `${API_BASE_URL}/api/audit/events?page=${page}&size=${size}`,
  auditExport: `${API_BASE_URL}/api/audit/export`,
  adminDashboard: `${API_BASE_URL}/api/admin/dashboard`,
  adminHsnTaxRatesUpload: `${API_BASE_URL}/api/admin/hsn-tax-rates/upload`,
  adminOrganizations: `${API_BASE_URL}/api/admin/organizations`,
  adminOrganizationsPage: (page = 0, size = 20) => `${API_BASE_URL}/api/admin/organizations?page=${page}&size=${size}`,
  adminStores: (page = 0, size = 20, search = '') => `${API_BASE_URL}/api/admin/stores?page=${page}&size=${size}&search=${encodeURIComponent(search)}`,
  adminOrganizationStore: (organizationId, tenantId) => (
    `${API_BASE_URL}/api/admin/organizations/${encodeURIComponent(organizationId)}/stores/${encodeURIComponent(tenantId)}`
  ),
  adminRetailers: `${API_BASE_URL}/api/admin/retailers`,
  adminRetailerById: (id) => `${API_BASE_URL}/api/admin/retailers/${id}`,
  adminRetailerAction: (id, action) => `${API_BASE_URL}/api/admin/retailers/${id}/${action}`,
  adminUsersList: `${API_BASE_URL}/api/admin/users`,
  adminUserById: (id) => `${API_BASE_URL}/api/admin/users/${id}`,
  adminUserStatus: (id) => `${API_BASE_URL}/api/admin/users/${id}/status`,
  adminAuditLogs: `${API_BASE_URL}/api/admin/audit-logs`,
  mfaSend: `${API_BASE_URL}/api/mfa/send`,
  mfaVerify: `${API_BASE_URL}/api/mfa/verify`,
  mfaCancel: `${API_BASE_URL}/api/mfa/cancel`,
};

const safeParseJson = (value, fallback = {}) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfterMs = (response) => {
  const retryAfter = Number(response?.headers?.get('Retry-After'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }
  return 1200;
};

export const getAuthContext = () => {
  if (typeof window === 'undefined') return {};

  const user = safeParseJson(localStorage.getItem('user'), {});
  const shop = safeParseJson(localStorage.getItem('shopProfile'), {});

  const username = String(user?.username || user?.userName || user?.email || user?.name || localStorage.getItem('username') || '').trim();
  const role = String(user?.role || '').trim().toUpperCase();

  return {
    userId: user?.id ?? user?.userId ?? null,
    username: username || null,
    role: role || null,
    tenantId: user?.tenantId ?? user?.tenant?.id ?? shop?.tenantId ?? shop?.id ?? null,
    organizationId: user?.organizationId ?? user?.orgId ?? user?.organization?.id ?? null,
    shopId: user?.shopId ?? shop?.shopId ?? shop?.id ?? null,
  };
};

let accessToken = null;
let refreshPromise = null;
let unauthorizedHandler = () => {};
let authSessionRevision = 0;

export const advanceAuthSessionRevision = () => {
  authSessionRevision += 1;
};

const persistAccessToken = (token) => {
  try {
    if (token) {
      sessionStorage.setItem('accessToken', token);
    } else {
      sessionStorage.removeItem('accessToken');
    }
    localStorage.removeItem('accessToken');
  } catch {
    // Keep the in-memory session usable when browser storage is unavailable.
  }
};

const restoreAccessToken = () => {
  try {
    accessToken = sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken') || null;
  } catch {
    accessToken = null;
  }
  return accessToken;
};

export const setAccessToken = (token) => {
  accessToken = token || null;
  persistAccessToken(accessToken);
};

export const getAccessToken = () => accessToken || restoreAccessToken();

export const clearAuthState = () => {
  advanceAuthSessionRevision();
  accessToken = null;
  refreshPromise = null;
  sessionStorage.removeItem('refreshToken');
  sessionStorage.removeItem('accessToken');
  localStorage.removeItem('user');
  localStorage.removeItem('username');
  localStorage.removeItem('shopProfile');
  localStorage.removeItem('accessToken');
  localStorage.removeItem('auth_logout');
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('shopProfile:'))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore storage errors.
  }
};

export const setUnauthorizedHandler = (handler) => {
  unauthorizedHandler = handler || (() => {});
};

export const emitAuthLogout = () => {
  try {
    localStorage.setItem('auth_logout', Date.now().toString());
  } catch {
    // Ignore storage failures when browser state is unavailable.
  }
};

export const emitAuthToast = (message = 'Your session expired. Please log in again.') => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('auth:toast', {
    detail: { message }
  }));
};

export const emitApiToast = (message = 'Request failed. Please try again.') => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('api:toast', {
    detail: { message }
  }));
};

const getRefreshTokenFallback = () => sessionStorage.getItem('refreshToken') || '';

const saveRefreshTokenFallback = (token) => {
  if (token) sessionStorage.setItem('refreshToken', token);
  else sessionStorage.removeItem('refreshToken');
};

export async function refreshAccessToken(username = '') {
  if (refreshPromise) return refreshPromise;

  const refreshSessionRevision = authSessionRevision;
  const requestPromise = (async () => {
    const refreshToken = getRefreshTokenFallback();
    const headers = { 'Content-Type': 'application/json' };
    if (refreshToken) headers['X-Refresh-Token'] = refreshToken;

    const response = await fetch(API_ENDPOINTS.refresh, {
      method: 'POST',
      headers,
      credentials: 'include',
      ...(refreshToken ? {
        body: JSON.stringify({ username, refreshToken }),
      } : {}),
    });

    const responseText = await response.text().catch(() => '');
    let data = {};
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = { message: responseText };
    }

    if (!response.ok) {
      throw new Error(data.message || data.error || `Refresh failed (${response.status})`);
    }
    const nextAccessToken = data.accessToken || data.token;
    if (!nextAccessToken || data.success === false) {
      throw new Error(data.message || data.error || 'Refresh response did not include an access token.');
    }

    if (refreshSessionRevision !== authSessionRevision) {
      throw new Error('Authentication session changed during token refresh.');
    }

    setAccessToken(nextAccessToken);
    if (data.refreshToken) saveRefreshTokenFallback(data.refreshToken);
    return nextAccessToken;
  })();
  refreshPromise = requestPromise;

  try {
    return await requestPromise;
  } finally {
    if (refreshPromise === requestPromise) refreshPromise = null;
  }
}

export async function apiFetch(input, options = {}) {
  const requestSessionRevision = authSessionRevision;
  const request = async (token) => {
    const headers = new Headers(options.headers || {});
    const activeToken = token || getAccessToken();
    if (activeToken) headers.set('Authorization', `Bearer ${activeToken}`);
    const refreshToken = getRefreshTokenFallback();
    if (refreshToken && !headers.has('X-Refresh-Token')) {
      headers.set('X-Refresh-Token', refreshToken);
    }

    // These headers help backend enforce per-user/tenant authorization and avoid cache sharing.
    const context = getAuthContext();
    if (context.userId && !headers.has('X-User-Id')) headers.set('X-User-Id', String(context.userId));
    if (context.username && !headers.has('X-Username')) headers.set('X-Username', String(context.username));
    if (context.role && !headers.has('X-User-Role')) headers.set('X-User-Role', String(context.role));
    if (context.tenantId && !headers.has('X-Tenant-Id')) headers.set('X-Tenant-Id', String(context.tenantId));
    if (context.organizationId && !headers.has('X-Organization-Id')) headers.set('X-Organization-Id', String(context.organizationId));
    if (context.shopId && !headers.has('X-Shop-Id')) headers.set('X-Shop-Id', String(context.shopId));

    if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
    if (!headers.has('Pragma')) headers.set('Pragma', 'no-cache');

    return fetch(input, {
      ...options,
      headers,
      credentials: options.credentials || 'include',
      cache: 'no-store',
    });
  };

  const retryOnRateLimit = options.retryOn429 !== false;
  const retryCount = Number(options.__retryCount || 0);

  const isAuthSessionError = (response, bodyText = '') => {
    if (response.status === 401) return true;
    if (response.status !== 403) return false;
    const normalizedBody = String(bodyText || '').toLowerCase();
    return [
      'invalid or expired token',
      'expired token',
      'invalid token',
      'unauthorized',
      'access token',
      'jwt'
    ].some((needle) => normalizedBody.includes(needle));
  };

  const activeToken = getAccessToken();
  let response = await request(activeToken);

  if (response.status === 429 && retryOnRateLimit && retryCount < 1) {
    const retryAfterMs = parseRetryAfterMs(response);
    await wait(retryAfterMs);
    response = await apiFetch(input, { ...options, __retryCount: retryCount + 1 });
  }

  if (response.status === 429) {
    emitApiToast('Too many requests. Please retry in a few seconds.');
  }

  if (response.status === 403) {
    const bodyText = await response.clone().text().catch(() => '');
    if (!isAuthSessionError(response, bodyText)) {
      emitApiToast('Access denied for this resource.');
    }
  }

  if (options.skipRefresh) return response;

  const initialBodyText = await response.clone().text().catch(() => '');
  if (!isAuthSessionError(response, initialBodyText)) return response;
  if (requestSessionRevision !== authSessionRevision) return response;

  try {
    const token = await refreshAccessToken();
    response = await request(token);
    const retriedBodyText = await response.clone().text().catch(() => '');
    if (!isAuthSessionError(response, retriedBodyText)) return response;
  } catch {
    // A failed refresh means the expired session cannot be restored.
  }

  if (requestSessionRevision !== authSessionRevision) return response;

  clearAuthState();
  emitAuthToast('Your session expired. Please log in again.');
  if (typeof unauthorizedHandler === 'function') unauthorizedHandler();
  return response;
}

export async function logoutRequest(options = {}) {
  const refreshToken = getRefreshTokenFallback();
  try {
    await fetch(API_ENDPOINTS.logout, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: !!options.keepalive,
      ...(refreshToken ? { body: JSON.stringify({ refreshToken }) } : {}),
    });
  } finally {
    setAccessToken(null);
    saveRefreshTokenFallback(null);
  }
}

export async function getCurrentUserProfile() {
  const response = await apiFetch(API_ENDPOINTS.userProfile, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `Unable to load profile (${response.status})`);
  }

  const payload = await response.json().catch(() => ({}));
  return payload.user || payload.data || payload;
}

export async function getCurrentShopProfile() {
  const response = await apiFetch(API_ENDPOINTS.shopProfile, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `Unable to load shop profile (${response.status})`);
  }

  const payload = await response.json().catch(() => ({}));
  const shop = payload.shop || payload.data || payload;
  if (shop && typeof window !== 'undefined') {
    localStorage.setItem('shopProfile', JSON.stringify(shop));
  }
  return shop;
}

export default API_BASE_URL;
