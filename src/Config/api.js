export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

export const API_ENDPOINTS = {
  login: `${API_BASE_URL}/api/login`,
  signup: `${API_BASE_URL}/api/auth/signup`,
  users: `${API_BASE_URL}/api/users`,
  userById: (id) => `${API_BASE_URL}/api/users/${id}`,
  userStatusById: (id) => `${API_BASE_URL}/api/users/${id}/status`,
  refresh: `${API_BASE_URL}/api/auth/refresh`,
  logout: `${API_BASE_URL}/api/auth/logout`,
  userProfile: `${API_BASE_URL}/api/users/me`,
  shopProfile: `${API_BASE_URL}/api/shop/me`,
  userDashboard: `${API_BASE_URL}/api/users/me/dashboard`,
  customers: `${API_BASE_URL}/api/customers`,
  customerById: (id) => `${API_BASE_URL}/api/customers/${id}`,
  customerByPhone: (phone) => `${API_BASE_URL}/api/customers/phone/${encodeURIComponent(phone)}`,
  customerSearch: (query = '') => `${API_BASE_URL}/api/customers/search?query=${encodeURIComponent(query)}`,
  products: `${API_BASE_URL}/api/products`,
  billingProducts: `${API_BASE_URL}/api/billing/products`,
  productsWithSize: (size = 1000) => `${API_BASE_URL}/api/products?size=${size}`,
  billingProductsPage: (page = 0, size = 100) => `${API_BASE_URL}/api/billing/products?page=${page}&size=${size}`,
  productById: (id) => `${API_BASE_URL}/api/products/${id}`,
  inventoryBulkUpload: `${API_BASE_URL}/api/inventory/upload`,
  inventoryUploadTemplate: `${API_BASE_URL}/api/inventory/upload-template`,
  invoices: `${API_BASE_URL}/api/invoices`,
  invoicesPage: (page = 0, size = 100) => `${API_BASE_URL}/api/invoices?page=${page}&size=${size}`,
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
  auditExport: `${API_BASE_URL}/api/audit/export`,
  mfaSend: `${API_BASE_URL}/api/mfa/send`,
  mfaVerify: `${API_BASE_URL}/api/mfa/verify`,
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

const persistAccessToken = (token) => {
  if (!token) {
    sessionStorage.removeItem('accessToken');
    localStorage.removeItem('accessToken');
    return;
  }

  try {
    sessionStorage.setItem('accessToken', token);
    localStorage.setItem('accessToken', token);
  } catch {
    // Ignore storage quota issues in browser-private or restricted environments.
  }
};

const restoreAccessToken = () => {
  const token = sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken');
  accessToken = token || null;
  return accessToken;
};

export const setAccessToken = (token) => {
  accessToken = token || null;
  persistAccessToken(accessToken);
};

export const getAccessToken = () => accessToken || restoreAccessToken();

export const clearAuthState = () => {
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
  if (typeof document !== 'undefined') {
    document.cookie = 'refreshToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax';
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax';
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

const saveRefreshTokenFallback = (token) => {
  if (token) sessionStorage.setItem('refreshToken', token);
  else sessionStorage.removeItem('refreshToken');
};

const getRefreshTokenFallback = () => sessionStorage.getItem('refreshToken') || '';

export async function refreshAccessToken(username) {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshTokenFallback();
    const refreshHeaders = { 'Content-Type': 'application/json' };
    if (refreshToken) refreshHeaders['X-Refresh-Token'] = refreshToken;

    const response = await fetch(API_ENDPOINTS.refresh, {
      method: 'POST',
      headers: refreshHeaders,
      credentials: 'include',
      ...(refreshToken ? {
        body: JSON.stringify({ username: username || '', refreshToken }),
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

    setAccessToken(nextAccessToken);
    // The cookie is the preferred store; this session-only fallback supports deployments
    // where the backend cannot set/read an HttpOnly cookie.
    if (data.refreshToken) saveRefreshTokenFallback(data.refreshToken);
    return nextAccessToken;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function apiFetch(input, options = {}) {
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

  try {
    const token = await refreshAccessToken(localStorage.getItem('username') || '');
    response = await request(token);
    const retriedBodyText = await response.clone().text().catch(() => '');
    if (!isAuthSessionError(response, retriedBodyText)) return response;
  } catch {
    // Handled below as an expired session, unless the user is simply refreshing without a valid refresh token.
  }

  const hasSavedUser = Boolean(localStorage.getItem('user'));
  const hasRefreshToken = Boolean(sessionStorage.getItem('refreshToken'));

  if (hasSavedUser && !hasRefreshToken) {
    return response;
  }

  clearAuthState();
  emitAuthToast('Your session expired. Please log in again.');
  if (typeof unauthorizedHandler === 'function') unauthorizedHandler();
  return response;
}

export async function logoutRequest(options = {}) {
  const refreshToken = sessionStorage.getItem('refreshToken');
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
