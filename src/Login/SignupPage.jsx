import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './SignupPage.css';
import { API_BASE_URL } from '../Config/api';

const themeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'aurora', label: 'Aurora' }
];

const SignupPage = () => {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('ib-theme') || 'light');
  
  const [role, setRole] = useState('retailer');
  const [formData, setFormData] = useState({
    // Common fields
    businessName: '', ownerName: '', email: '', phone: '', password: '',
    confirmPassword: '', address: '', city: 'Pune', pincode: '',
    
    // Retailer fields
    gstin: '', shopType: '',
    
    // Partner/CA fields
    caCertificate: '', pan: '', practiceArea: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ib-theme', theme);
  }, [theme]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (formData.password.length < 8) {
      setError('Password must be 8+ characters');
      return;
    }

    setLoading(true);
    try {
      // 👈 ENCRYPTION READY
      const signupFields = { ...formData };
      delete signupFields.confirmPassword;
      const payload = {
        role,
        ...signupFields,
        // Preserve the backend's existing passwordHash request field.
        // This is Base64 encoding, not BCrypt; the backend must BCrypt-hash it.
        passwordHash: btoa(formData.password),
      };
      //http://localhost:8080/api/signup
      //  https://ibbackend-production.up.railway.app/api/signup
      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      let data = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = { message: responseText };
      }
      
      if (response.ok && data.success !== false) {
        alert(`${role.toUpperCase()} Account Created!`);
        navigate('/login');
      } else {
        setError(data.message || `Signup failed (${response.status}). Check the backend logs.`);
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const isRetailer = role === 'retailer';
  const isPartner = role === 'partner';

  return (
    <div className={`signup-page theme-${theme}`}>
      <div className="signup-visual">
        <div className="brand-row">
          <div className="auth-logo">
            <span className="logo-icon">📦</span>
            <span className="logo-text">Veyra</span>
          </div>

          <div className="signup-theme-switcher" aria-label="Theme selector">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={theme === option.value ? 'theme-option active' : 'theme-option'}
                onClick={() => setTheme(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <h1>Launch smarter operations from day one.</h1>
        <p>
          Build your retail or advisory practice with one dashboard for inventory, billing,
          collections, and GST-ready reporting.
        </p>

        <div className="visual-stats">
          <div className="mini-stat">
            <strong>18k+</strong>
            <span>Accounts onboarded</span>
          </div>
          <div className="mini-stat">
            <strong>99.2%</strong>
            <span>Data accuracy</span>
          </div>
          <div className="mini-stat">
            <strong>24/7</strong>
            <span>Monitoring</span>
          </div>
        </div>

        <div className="feature-list">
          <div>Fast onboarding</div>
          <div>GST ready</div>
          <div>Inventory aware</div>
          <div>Partner friendly</div>
        </div>
      </div>

      <div className="signup-card">
        <div className="login-header">
          <div className="logo">
            <span className="logo-icon">📦</span>
            <span className="logo-text">Create Account</span>
          </div>
          <h1>Join Veyra</h1>
          <p>Set up your retailer or CA partner profile.</p>
        </div>

        <div className="input-group">
          <label>Account Type *</label>
          <div className="select-wrapper">
            <select 
              name="role" 
              value={role} 
              onChange={(e) => setRole(e.target.value)}
              className="role-select"
            >
              <option value="retailer">🏪 Retailer (Shop Owner)</option>
              <option value="partner">🤝 Partner (CA Professional)</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="error-message">
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="signup-form">
          <div className="input-group">
            <label>{isRetailer ? 'Shop Name' : 'Practice Name'} *</label>
            <div className="input-wrapper">
              <span className="input-icon">{isRetailer ? '🏪' : '🏛️'}</span>
              <input 
                name="businessName" 
                placeholder={isRetailer ? 'Dawale Kirana Store' : 'Dawale CA Services'}
                value={formData.businessName}
                onChange={handleChange}
                required 
              />
            </div>
          </div>

          <div className="form-row">
            <div className="input-group">
              <label>Owner/CA Name *</label>
              <div className="input-wrapper">
                <span className="input-icon">👤</span>
                <input name="ownerName" placeholder="Uddhav Dawale" onChange={handleChange} required />
              </div>
            </div>
            <div className="input-group">
              <label>Phone *</label>
              <div className="input-wrapper">
                <span className="input-icon">📱</span>
                <input name="phone" type="tel" placeholder="9876543210" onChange={handleChange} required />
              </div>
            </div>
          </div>

          <div className="input-group">
            <label>Email *</label>
            <div className="input-wrapper">
              <span className="input-icon">✉️</span>
              <input name="email" type="email" placeholder="name@domain.com" onChange={handleChange} required />
            </div>
          </div>

          {isRetailer && (
            <>
              <div className="input-group">
                <label>GSTIN</label>
                <div className="input-wrapper">
                  <span className="input-icon">🆔</span>
                  <input name="gstin" placeholder="27ABCDE1234F1Z5" onChange={handleChange} />
                </div>
              </div>
              <div className="input-group">
                <label>Shop Type</label>
                <div className="select-wrapper">
                  <select name="shopType" onChange={handleChange}>
                    <option value="">Select Shop Type</option>
                    <option value="kirana">Kirana/Grocery</option>
                    <option value="electronics">Electronics</option>
                    <option value="pharma">Pharmacy</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {isPartner && (
            <>
              <div className="input-group">
                <label>PAN *</label>
                <div className="input-wrapper">
                  <span className="input-icon">🆔</span>
                  <input name="pan" placeholder="ABCDE1234F" maxLength="10" onChange={handleChange} required />
                </div>
              </div>
              <div className="input-group">
                <label>CA Certificate No.</label>
                <div className="input-wrapper">
                  <span className="input-icon">📜</span>
                  <input name="caCertificate" placeholder="ICAI-123456" onChange={handleChange} />
                </div>
              </div>
              <div className="input-group">
                <label>Practice Area</label>
                <div className="select-wrapper">
                  <select name="practiceArea" onChange={handleChange}>
                    <option value="">Select Area</option>
                    <option value="gst">GST Filing</option>
                    <option value="audit">Audit & Compliance</option>
                    <option value="tax">Income Tax</option>
                    <option value="all">All Services</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="input-group">
            <label>Password *</label>
            <div className="input-wrapper">
              <span className="input-icon">🔒</span>
              <input name="password" type="password" placeholder="Minimum 8 characters" onChange={handleChange} required />
            </div>
          </div>

          <div className="input-group">
            <label>Confirm Password *</label>
            <div className="input-wrapper">
              <span className="input-icon">🔒</span>
              <input name="confirmPassword" type="password" placeholder="Retype password" onChange={handleChange} required />
            </div>
          </div>

          <div className="input-group">
            <label>Address</label>
            <div className="input-wrapper">
              <span className="input-icon">📍</span>
              <input name="address" placeholder="Shop/Office Address" onChange={handleChange} />
            </div>
          </div>

          <div className="form-row">
            <div className="input-group">
              <label>City</label>
              <input name="city" defaultValue="Pune" onChange={handleChange} />
            </div>
            <div className="input-group">
              <label>PIN</label>
              <input name="pincode" type="number" placeholder="411001" onChange={handleChange} />
            </div>
          </div>

          <button type="submit" className="signup-btn" disabled={loading}>
            {loading ? 'Creating Account...' : `Create ${role === 'retailer' ? 'Retailer' : 'CA Partner'} Account`}
          </button>
        </form>

        <div className="auth-footer">
          <button className="link-btn" type="button" onClick={() => navigate('/login')}>
            Already have account? Sign In
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
