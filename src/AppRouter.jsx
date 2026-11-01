import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Dashboard from './Dashboard/DashboardEntry.jsx';
import ProfilePage from './Profile/ProfilePage.jsx';
import Login from './Login/Login.jsx';
import App from './App.jsx';
import InventoryPage from './Inventory/Inventory.jsx';
import BillingPage from './Billing/BillingPage.jsx';
import SignupPage from './Login/SignupPage.jsx';
import SellPage from './sell/SellPage.jsx';
import MfaScreen from './auth/mfa/MfaScreen.jsx';
import AccessDenied from './Security/AccessDenied.jsx';
import UsersRolesPage from './Security/UsersRolesPage.jsx';
import StoreUsersPage from './Security/StoreUsersPage.jsx';
import CustomerPage from './Customers/CustomerPage.jsx';
import { resolveMfaContext } from './auth/mfa/mfaService.js';
import AuditPage from './Audit/AuditPage.jsx';
import { API_ENDPOINTS, refreshAccessToken, setAccessToken, setUnauthorizedHandler, logoutRequest, clearAuthState, emitAuthLogout, emitAuthToast, getCurrentUserProfile } from './Config/api.js';
import { normalizeStoreRole, canAccessBilling, canAccessInventory, canAccessSellOrders, isStoreAdmin, canAccessAudit } from './Security/storeRoles.js';

const readPendingMfaUser = () => {
  const stored = localStorage.getItem('pendingMfaUser');
  if (!stored) return null;

  try {
    return JSON.parse(stored);
  } catch {
    localStorage.removeItem('pendingMfaUser');
    return null;
  }
};

const clearAuthStorage = () => {
  clearAuthState();
  setAccessToken(null);
  localStorage.removeItem('pendingMfaUser');
  localStorage.removeItem('shopProfile');
  sessionStorage.removeItem('mfaVerified');
};

const clearScopedShopProfiles = () => {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('shopProfile:'))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Ignore storage access errors.
  }
};

const SESSION_VALIDATION_INTERVAL_MS = 2 * 60 * 1000;
const SESSION_VALIDATION_MIN_GAP_MS = 30 * 1000;

const AppRoutes = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const lastSessionValidationAtRef = useRef(0);
  const sessionValidationInFlightRef = useRef(false);

  const logoutUser = useCallback(async (callBackend = true) => {
    try {
      if (callBackend) await logoutRequest().catch(() => {});
    } finally {
      clearAuthStorage();
      emitAuthLogout();
      setIsAuthenticated(false);
      setUser(null);
      if (window.location.pathname !== '/login') {
        navigate('/login', { replace: true });
      }
    }
  }, [navigate]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (loading) return;
      logoutUser(false);
    });
    return () => setUnauthorizedHandler(null);
  }, [logoutUser, loading]);

  const validateServerSession = useCallback(async (reason = 'periodic') => {
    if (!isAuthenticated || loading) return;
    if (sessionValidationInFlightRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const now = Date.now();
    if (now - lastSessionValidationAtRef.current < SESSION_VALIDATION_MIN_GAP_MS) return;

    sessionValidationInFlightRef.current = true;
    try {
      await getCurrentUserProfile();
      lastSessionValidationAtRef.current = now;
    } catch (error) {
      // apiFetch already handles unauthorized response by clearing auth state and invoking the unauthorized handler.
      if (reason !== 'periodic') {
        console.warn(`Session validation failed during ${reason}:`, error);
      }
    } finally {
      sessionValidationInFlightRef.current = false;
    }
  }, [isAuthenticated, loading]);

  // Do not call backend logout on beforeunload/pagehide.
  // Browser refresh also triggers these events and would invalidate refresh tokens.

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === 'auth_logout') {
        clearAuthStorage();
        emitAuthToast('Your session expired. Please log in again.');
        setIsAuthenticated(false);
        setUser(null);
        navigate('/login', { replace: true });
      }
    };

    const onToast = (event) => {
      const message = event?.detail?.message || 'Your session expired. Please log in again.';
      setToast(message);
      window.setTimeout(() => setToast(null), 3200);
    };

    const onApiToast = (event) => {
      const message = event?.detail?.message || 'Request failed. Please try again.';
      setToast(message);
      window.setTimeout(() => setToast(null), 3200);
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('auth:toast', onToast);
    window.addEventListener('api:toast', onApiToast);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('auth:toast', onToast);
      window.removeEventListener('api:toast', onApiToast);
    };
  }, [navigate]);

  useEffect(() => {
    if (!isAuthenticated || loading) return undefined;

    const onFocus = () => {
      validateServerSession('focus');
    };

    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        validateServerSession('visibility');
      }
    };

    const timer = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        validateServerSession('periodic');
      }
    }, SESSION_VALIDATION_INTERVAL_MS);

    window.addEventListener('focus', onFocus);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    // Validate immediately after auth state is restored to catch server-side revoked sessions.
    validateServerSession('startup');

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [isAuthenticated, loading, validateServerSession]);

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      try {
        const storedUser = localStorage.getItem('user');
        const parsedUser = storedUser ? JSON.parse(storedUser) : null;
        if (!parsedUser) {
          if (active) setLoading(false);
          return;
        }

        const storedRefreshToken = sessionStorage.getItem('refreshToken');
        const storedAccessToken = sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken');

        if (storedAccessToken) {
          setAccessToken(storedAccessToken);
        }

        if (active) {
          setUser(parsedUser);
          setIsAuthenticated(true);
        }

        if (!storedRefreshToken && storedAccessToken) {
          if (active) {
            localStorage.setItem('user', JSON.stringify(parsedUser));
          }
          return;
        }

        if (!storedRefreshToken) {
          if (active) {
            localStorage.setItem('user', JSON.stringify(parsedUser));
          }
          return;
        }

        try {
          await refreshAccessToken(localStorage.getItem('username') || parsedUser.username || parsedUser.userName || parsedUser.name || '');
        } catch (error) {
          console.warn('Session refresh failed during app startup; keeping the saved session available.', error);
          if (active) {
            setUser(parsedUser);
            setIsAuthenticated(true);
          }
          return;
        }

        let nextUser = parsedUser;
        try {
          const profile = await getCurrentUserProfile();
          nextUser = {
            ...parsedUser,
            ...profile,
            id: profile.id ?? parsedUser.id ?? null,
            username: profile.username || profile.userName || parsedUser.username || parsedUser.userName || profile.email || parsedUser.email || 'user',
            name: profile.ownerName || profile.name || profile.businessName || parsedUser.name || parsedUser.ownerName || 'User',
            email: profile.email || parsedUser.email || '',
            role: normalizeStoreRole(profile.role || parsedUser.role),
          };
        } catch {
          // Fall back to the stored session user if the profile endpoint is unavailable.
          nextUser = {
            ...parsedUser,
            role: normalizeStoreRole(parsedUser.role),
          };
        }

        if (active) {
          setUser(nextUser);
          setIsAuthenticated(true);
          localStorage.setItem('user', JSON.stringify(nextUser));
        }
      } catch {
        // Keep the existing app state if the saved session is malformed or temporarily unavailable.
        if (active) {
          setUser(null);
          setIsAuthenticated(false);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    restoreSession();
    return () => { active = false; };
  }, []);

  const loginUser = (userData) => {
    const normalizedUser = {
      ...userData,
      username: userData?.username || userData?.userName || userData?.email || 'user',
      name: userData?.name || userData?.ownerName || userData?.businessName || userData?.username || 'User',
      role: normalizeStoreRole(userData?.role),
    };

    const backendConfig = userData?.config || {};
    const mfaEnabled = resolveMfaContext(backendConfig, userData).enabled;

    clearScopedShopProfiles();

    if (mfaEnabled) {
      const pendingUser = { ...normalizedUser, mfaRequired: true, config: backendConfig };
      setIsAuthenticated(false);
      setUser(pendingUser);
      localStorage.setItem('pendingMfaUser', JSON.stringify(pendingUser));
      navigate('/mfa', { replace: true });
      return;
    }

    setIsAuthenticated(true);
    setUser(normalizedUser);
    localStorage.setItem('user', JSON.stringify(normalizedUser));
    localStorage.removeItem('pendingMfaUser');
    localStorage.removeItem('shopProfile');
    navigate('/dashboard', { replace: true });
  };

  const handleMfaVerified = (verifiedUser) => {
    const nextAccessToken = verifiedUser?.accessToken || verifiedUser?.token || verifiedUser?.firebaseIdToken || null;

    const normalizedUser = {
      ...verifiedUser,
      username: verifiedUser?.username || verifiedUser?.userName || verifiedUser?.email || 'user',
      name: verifiedUser?.name || verifiedUser?.ownerName || verifiedUser?.businessName || verifiedUser?.username || 'User',
      role: normalizeStoreRole(verifiedUser?.role),
    };

    if (nextAccessToken) {
      setAccessToken(nextAccessToken);
    }

    clearScopedShopProfiles();

    setIsAuthenticated(true);
    setUser(normalizedUser);
    localStorage.setItem('user', JSON.stringify(normalizedUser));
    localStorage.removeItem('pendingMfaUser');
    sessionStorage.setItem('mfaVerified', 'true');
    navigate('/dashboard', { replace: true });
  };

  useEffect(() => {
    if (isAuthenticated && ['/dashboard', '/profile'].includes(location.pathname)) {
      window.history.pushState(null, null, location.pathname);
    }
  }, [isAuthenticated, location]);

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  const pendingMfaUser = readPendingMfaUser();
  const role = normalizeStoreRole(user?.role);
  const canOpenBilling = canAccessBilling(role);
  const canOpenInventory = canAccessInventory(role);
  const canOpenSellOrders = canAccessSellOrders(role);
  const canOpenAudit = canAccessAudit(role);
  const canManageUsers = isStoreAdmin(role);

  return (
    <>
      {toast && (
        <div className="session-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      <Routes>
      <Route path="/login" element={<Login onLogin={loginUser} />} />
      <Route path="/mfa" element={user?.mfaRequired || pendingMfaUser ? <MfaScreen user={user || pendingMfaUser} onVerified={handleMfaVerified} onCancel={logoutUser} /> : <Navigate to="/login" replace />} />
      <Route path="/" element={!isAuthenticated ? <App /> : <Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={isAuthenticated ? <Dashboard username={user?.name || ''} onLogout={logoutUser} /> : <Navigate to="/login" replace />} />
      <Route path="/profile" element={isAuthenticated ? <ProfilePage username={user?.name || ''} onLogout={logoutUser} /> : <Navigate to="/login" replace />} />
      <Route path="/billing" element={isAuthenticated ? (canOpenBilling ? <BillingPage /> : <Navigate to="/access-denied" state={{ from: '/billing', role }} replace />) : <Navigate to="/login" replace />} />
      <Route path="/inventory" element={isAuthenticated ? (canOpenInventory ? <InventoryPage /> : <Navigate to="/access-denied" state={{ from: '/inventory', role }} replace />) : <Navigate to="/login" replace />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/customer" element={isAuthenticated ? <CustomerPage /> : <Navigate to="/login" replace />} />
      <Route path="/customers" element={isAuthenticated ? <CustomerPage /> : <Navigate to="/login" replace />} />
      <Route path="/sell" element={isAuthenticated ? (canOpenSellOrders ? <SellPage /> : <Navigate to="/access-denied" state={{ from: '/sell', role }} replace />) : <Navigate to="/login" replace />} />
      <Route path="/audit" element={isAuthenticated ? (canOpenAudit ? <AuditPage /> : <Navigate to="/access-denied" state={{ from: '/audit', role }} replace />) : <Navigate to="/login" replace />} />
      <Route path="/users-roles" element={isAuthenticated ? (canManageUsers ? <UsersRolesPage /> : <Navigate to="/access-denied" state={{ from: '/users-roles', role }} replace />) : <Navigate to="/login" replace />} />
      <Route path="/store-users" element={isAuthenticated ? (canManageUsers ? <StoreUsersPage /> : <Navigate to="/access-denied" state={{ from: '/store-users', role }} replace />) : <Navigate to="/login" replace />} />
      <Route path="/access-denied" element={isAuthenticated ? <AccessDenied /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </>
  );
};

export default AppRoutes;
