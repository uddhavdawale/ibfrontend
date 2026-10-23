import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Dashboard from './Dashboard/DashboardEntry.jsx';
import ProfilePage from './Profile/ProfilePage.jsx';
import Login from './Login/Login.jsx';
import App from './App.jsx';
import InventoryPage from './Inventory/Inventory.jsx';
import BillingPage from './Billing/BillingPage.jsx';
import SignupPage from './Login/SignupPage.jsx';
import SellPage from './sell/SellPage.jsx';
import { refreshAccessToken, setAccessToken, setUnauthorizedHandler, logoutRequest, clearAuthState, emitAuthLogout, emitAuthToast } from './Config/api.js';

const clearAuthStorage = () => {
  clearAuthState();
  setAccessToken(null);
};

const AppRoutes = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

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
    setUnauthorizedHandler(() => logoutUser(false));
    return () => setUnauthorizedHandler(null);
  }, [logoutUser]);

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

    window.addEventListener('storage', onStorage);
    window.addEventListener('auth:toast', onToast);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('auth:toast', onToast);
    };
  }, [navigate]);

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      try {
        const storedUser = localStorage.getItem('user');
        const parsedUser = storedUser ? JSON.parse(storedUser) : null;
        if (!parsedUser) return;
        await refreshAccessToken(localStorage.getItem('username') || parsedUser.name || '');
        if (active) {
          setUser(parsedUser);
          setIsAuthenticated(true);
        }
      } catch {
        clearAuthStorage();
      } finally {
        if (active) setLoading(false);
      }
    };
    restoreSession();
    return () => { active = false; };
  }, []);

  const loginUser = (userData) => {
    setIsAuthenticated(true);
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
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

  return (
    <>
      {toast && (
        <div className="session-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      <Routes>
      <Route path="/login" element={<Login onLogin={loginUser} />} />
      <Route path="/" element={!isAuthenticated ? <App /> : <Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={isAuthenticated ? <Dashboard username={user?.name || ''} onLogout={logoutUser} /> : <Navigate to="/login" replace />} />
      <Route path="/profile" element={isAuthenticated ? <ProfilePage username={user?.name || ''} onLogout={logoutUser} /> : <Navigate to="/login" replace />} />
      <Route path="/billing" element={isAuthenticated ? <BillingPage /> : <Navigate to="/login" replace />} />
      <Route path="/inventory" element={isAuthenticated ? <InventoryPage /> : <Navigate to="/login" replace />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/sell" element={isAuthenticated ? <SellPage /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </>
  );
};

export default AppRoutes;
