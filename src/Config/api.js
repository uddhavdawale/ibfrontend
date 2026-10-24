export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

export const API_ENDPOINTS = {
  login: `${API_BASE_URL}/api/login`,
  refresh: `${API_BASE_URL}/api/auth/refresh`,
  logout: `${API_BASE_URL}/api/auth/logout`,
  userProfile: `${API_BASE_URL}/api/users/me`,
  shopProfile: `${API_BASE_URL}/api/shop/me`,
  userDashboard: `${API_BASE_URL}/api/users/me/dashboard`,
  products: `${API_BASE_URL}/api/products`,
  productById: (id) => `${API_BASE_URL}/api/products/${id}`,
  inventoryBulkUpload: `${API_BASE_URL}/api/inventory/upload`,
  inventoryUploadTemplate: `${API_BASE_URL}/api/inventory/upload-template`,
  invoices: `${API_BASE_URL}/api/invoices`,
  dashboardSummary: `${API_BASE_URL}/api/dashboard/summary`,
  salesLastSixMonths: `${API_BASE_URL}/api/sales/last-six-months`,
  gstSummary: `${API_BASE_URL}/api/gst/summary`,
  gstFilings: `${API_BASE_URL}/api/gst/filings`,
};

let accessToken = null;
let refreshPromise = null;
let unauthorizedHandler = () => {};

export const setAccessToken = (token) => {
  accessToken = token || null;
};

export const clearAuthState = () => {
  accessToken = null;
  refreshPromise = null;
  sessionStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  localStorage.removeItem('username');
  localStorage.removeItem('shopProfile');
  localStorage.removeItem('auth_logout');
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

const saveRefreshTokenFallback = (token) => {
  if (token) sessionStorage.setItem('refreshToken', token);
  else sessionStorage.removeItem('refreshToken');
};

export async function refreshAccessToken(username) {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = sessionStorage.getItem('refreshToken');
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...(refreshToken ? {
        body: JSON.stringify({ username: username || '', refreshToken }),
      } : {}),
    });

    if (!response.ok) throw new Error(`Refresh failed (${response.status})`);
    const data = await response.json();
    const nextAccessToken = data.accessToken || data.token;
    if (!nextAccessToken || data.success === false) throw new Error(data.message || 'Refresh failed');

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
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...options, headers, credentials: options.credentials || 'include' });
  };

  let response = await request(accessToken);
  if (response.status !== 401 || options.skipRefresh) return response;

  try {
    const token = await refreshAccessToken(localStorage.getItem('username') || '');
    response = await request(token);
    if (response.status !== 401) return response;
  } catch {
    // Handled below as an expired session.
  }

  clearAuthState();
  emitAuthToast('Your session expired. Please log in again.');
  if (typeof unauthorizedHandler === 'function') unauthorizedHandler();
  return response;
}

export async function logoutRequest() {
  const refreshToken = sessionStorage.getItem('refreshToken');
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
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
