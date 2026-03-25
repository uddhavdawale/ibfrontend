import React, { useState, useEffect } from 'react';
import './Login.css';
import Dashboard from '../Dashboard/DashboardEntry';

function Login() {
  const [step, setStep] = useState(1);
  const [loginData, setLoginData] = useState({});
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const savedUser = localStorage.getItem('inventoryUser');
    if (savedUser) {
      setLoginData(JSON.parse(savedUser));
      setIsLoggedIn(true);
      setStep(4);
    }
  }, []);

  // **NEW: API call to Java backend**
  const callLoginAPI = async (username, password) => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('https://ibbackend-production.up.railway.app/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          password: password
        })
      });

      const data = await response.json();
      
      if (response.ok && data.success === true) {
        // Login successful - proceed to OTP
        return true;
      } else {
        setError(data.message || 'Invalid credentials');
        return false;
      }
    } catch (err) {
      setError('Backend not reachable. Is Java server running on port 8080?');
      console.error('Login API error:', err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('inventoryUser');
    localStorage.removeItem('loginToken');
    sessionStorage.clear();
    setLoginData({});
    setIsLoggedIn(false);
    setStep(1);
  };

  const nextStep = () => setStep(step + 1);
  const prevStep = () => setStep(step - 1);

  // **UPDATED: Login Form with Backend API**
  const LoginForm = () => {
    const [formData, setFormData] = useState({ username: '', password: '' });

    const handleChange = (e) => {
      setFormData({ ...formData, [e.target.name]: e.target.value });
      setError(''); // Clear error on input
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      
      // Call Java backend API
      const isValid = await callLoginAPI(formData.username, formData.password);
      
      if (isValid) {
        // Store username for OTP screen
        setLoginData({ username: formData.username });
        localStorage.setItem('inventoryUser', JSON.stringify({ username: formData.username }));
        nextStep(); // Go to OTP screen
      }
    };

    return (
      <div className="login-container">
        <h2>Welcome Back</h2>
        <p>Sign in to your Inventory & Billing account</p>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <input 
              name="username" 
              type="text"
              placeholder="Username" 
              value={formData.username}
              onChange={handleChange} 
              required 
              className="form-input"
              disabled={loading}
            />
          </div>
          <div className="input-group">
            <input 
              name="password" 
              type="password"
              placeholder="Password" 
              value={formData.password}
              onChange={handleChange} 
              required 
              className="form-input"
              disabled={loading}
            />
          </div>
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Checking...' : 'Login'}
          </button>
        </form>
        <p className="api-info">
          Connected to: <strong>http://localhost:8080/login</strong>
        </p>
      </div>
    );
  };

  // **UPDATED: OTP Screen**
  const VerificationStep = () => {
    const [otp, setOtp] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);

    const handleVerify = async (e) => {
      e.preventDefault();
      setIsVerifying(true);
      
      // Simulate OTP verification (replace with your OTP API later)
      setTimeout(() => {
        setIsVerifying(false);
        localStorage.setItem('loginToken', 'mock-jwt-token');
        setIsLoggedIn(true);
        nextStep(); // Go to dashboard
      }, 1500);
    };

    return (
      <div className="verification-container">
        <h2>Verify Login</h2>
        <p>Enter OTP sent to registered mobile of <strong>{loginData.username}</strong></p>
        
        <form onSubmit={handleVerify} className="otp-form">
          <input 
            type="text" 
            placeholder="Enter 6-digit OTP" 
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            maxLength={6}
            required 
            className="otp-input"
          />
          <button type="submit" disabled={isVerifying} className="verify-btn">
            {isVerifying ? 'Verifying...' : 'Verify OTP'}
          </button>
        </form>
        <button onClick={prevStep} className="back-btn">Back to Login</button>
      </div>
    );
  };

  // SecurityCheck and DashboardEntry remain same...
  const SecurityCheck = () => {
    return (
      <div className="security-container">
        <h2>Security Check</h2>
        <p>Device verified for <strong>{loginData.username}</strong></p>
        <div className="security-actions">
          <button onClick={nextStep} className="primary-btn">Enable Biometrics</button>
          <button onClick={nextStep} className="secondary-btn">Skip</button>
        </div>
        <button onClick={prevStep} className="back-btn">Back</button>
      </div>
    );
  };

  const DashboardEntry = () => {
    return (
      <div className="dashboard-container">
        <h2>Welcome Back, {loginData.username}!</h2>
        <div className="dashboard-stats">
          <div className="stat-card"><h3>Low Stock Items</h3><p className="stat-number">12</p></div>
          <div className="stat-card"><h3>Today's Sales</h3><p className="stat-number">₹45,230</p></div>
          <div className="stat-card"><h3>Total Products</h3><p className="stat-number">156</p></div>
        </div>
        <div className="dashboard-actions">
          <button className="primary-btn">Manage Inventory</button>
          <button className="primary-btn">Create Bill</button>
          <button className="primary-btn">View Reports</button>
        </div>
      </div>
    );
  };

  const renderStep = () => {
    switch(step) {
      case 1: return <LoginForm />;
      case 2: return <VerificationStep />;
      case 3: return <SecurityCheck />;
      case 4: return <DashboardEntry />;
      default: return <LoginForm />;
    }
  };

  return (
    <div className="login-app">
      <header className="app-header">
        <div className="header-content">
          <div className="branding">
            <h1>Inventory & <br />Billing Platform</h1>
            <p>Stock Management | Billing | Reports</p>
          </div>
          {step === 4 && isLoggedIn && (
            <div className="header-actions">
              <span className="user-email">Hi, {loginData.username}</span>
              <button onClick={handleLogout} className="header-logout-btn">🚪 Logout</button>
            </div>
          )}
        </div>
      </header>
      
      <main className="login-main">
        <div className="login-wrapper">{renderStep()}</div>
      </main>
    </div>
  );
}

export default Login;
