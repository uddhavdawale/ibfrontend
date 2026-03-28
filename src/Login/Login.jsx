import React, { useState } from 'react';
import './Login.css';
import { useNavigate } from 'react-router-dom';

const Login = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    rememberMe: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);
  setError('');

  try {
    console.log('🔄 Calling backend...');
    const response = await fetch('http://localhost:8080/api/login', {  // or localhost:8080
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: formData.username,
        password: formData.password
      }),
    });

    const data = await response.json();
    console.log('📥 Backend response:', data);

    if (data.success === true) {
      console.log('✅ SUCCESS - Redirecting...');
      
      const userData = {
        name: data.username || formData.username,
        email: data.email || `${formData.username}@example.com`
      };
      
      // FORCE REDIRECT (temporary)
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('user', JSON.stringify(userData));
      //window.location.href = '/dashboard';
      onLogin(userData);
      return;
      
    } else {
      setError(data.message || 'Invalid credentials');
    }
  } catch (error) {
    console.error('❌ Error:', error);
    setError('Backend error. Check console.');
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Logo & Title */}
        <div className="login-header">
          <div className="logo">
            <span className="logo-icon">📦</span>
            <span className="logo-text">IB Platform</span>
          </div>
          <h1>Welcome Back</h1>
          <p>Sign in to your inventory & billing dashboard</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <span>⚠️</span> {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label>Username</label>
            <div className="input-wrapper">
              <span className="input-icon">👤</span>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Enter username"
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label>Password</label>
            <div className="input-wrapper">
              <span className="input-icon">🔒</span>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter password"
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="form-options">
            <label className="checkbox-container">
              <input
                type="checkbox"
                name="rememberMe"
                checked={formData.rememberMe}
                onChange={handleChange}
              />
              <span className="checkmark"></span>
              Remember me
            </label>
            <a href="#" className="forgot-password">Forgot Password?</a>
          </div>

          <button 
            type="submit" 
            className={`login-btn ${loading ? 'loading' : ''}`}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Signing In...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Demo Credentials */}
        <div className="demo-info">
          <p><strong>Demo:</strong> admin / admin123</p>
        </div>

        {/* Footer */}
        <div className="login-footer">
          <p>© 2026 Inventory & Billing Platform. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;