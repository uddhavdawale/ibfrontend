import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Dashboard from './Dashboard/DashboardEntry.jsx';
import ProfilePage from './Profile/ProfilePage.jsx';
import Login from './Login/Login.jsx';
import App from './App.jsx';
import { useNavigate } from 'react-router-dom';
import InventoryPage from './Inventory/Inventory.jsx';
import BillingPage from './Billing/BillingPage.jsx';
const AppRoutes = () => {
    //navigate hook for programmatic navigation
    const navigate = useNavigate();
  // Proper Auth State (NOT hardcoded true)
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  // Check localStorage on load
  useEffect(() => {

  // localStorage.removeItem('isAuthenticated');
  //  localStorage.removeItem('user');
    
    // Production: Check valid auth
    const auth = localStorage.getItem('isAuthenticated');
    const storedUser = localStorage.getItem('user');
    if (auth === 'true' && storedUser) {
      setIsAuthenticated(true);
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  // Block browser back (professional UX)
  useEffect(() => {
    if (isAuthenticated && (location.pathname === '/dashboard' || location.pathname === '/profile')) {
      window.history.pushState(null, null, location.pathname);
    }
  }, [isAuthenticated, location]);

  // Login success handler
  const loginUser = (userData) => {
    setIsAuthenticated(true);
    setUser(userData);
    localStorage.setItem('isAuthenticated', 'true');
    localStorage.setItem('user', JSON.stringify(userData));
     navigate('/dashboard', { replace: true }); 
  };

  // Logout handler
  const logoutUser = () => {
    setIsAuthenticated(false);
    setUser(null);
    localStorage.clear();
    navigate('/login', { replace: true });
  };

  // Loading screen
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        fontSize: '18px',
        fontFamily: 'Segoe UI, Roboto, sans-serif'
      }}>
        Loading...
      </div>
    );
  }

  return (
    <Routes>
      {/* LOGIN ALWAYS FIRST */}
      <Route 
        path="/login" 
        element={<Login onLogin={loginUser} />}
      />

      {/* Loan App - Public only */}
      <Route 
        path="/" 
        element={
          !isAuthenticated 
            ? <App />
            : <Navigate to="/dashboard" replace />
        }
      />

      {/* PROTECTED ROUTES - Login REQUIRED */}
      <Route 
        path="/dashboard" 
        element={
          isAuthenticated 
            ? <Dashboard username={user?.name || 'Uddhav'} onLogout={logoutUser} />
            : <Navigate to="/login" replace />
        }
      />
      
      <Route 
        path="/profile" 
        element={
          isAuthenticated 
            ? <ProfilePage username={user?.name || 'Uddhav Dawale'} onLogout={logoutUser} />
            : <Navigate to="/login" replace />
        }
      />

      {/* CATCH-ALL → LOGIN */}
      <Route path="*" element={<Navigate to="/login" replace />} />
      <Route path="/billing" element={<BillingPage />} />
      <Route path="/inventory" element={<BillingPage />} />
    </Routes>
  );
};

export default AppRoutes;