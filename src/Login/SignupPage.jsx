import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './SignupPage.css';
import { API_BASE_URL } from '../Config/api';
import { APP_CONFIG } from '../Config/appConfig';

const themeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'aurora', label: 'Aurora' }
];

const MIN_PASSWORD_LENGTH = 12;

const SignupPage = () => {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('ib-theme') || 'light');
  
  const [role, setRole] = useState('retailer');
  const [formData, setFormData] = useState({
    // Common fields
    businessName: '', ownerName: '', username: '', email: '', phone: '', password: '',
    confirmPassword: '', address: '', city: 'Pune', pincode: '',
    
    // Retailer fields
    gstin: '', shopType: '',
    
    // Partner/CA fields
    caCertificate: '', pan: '', practiceArea: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const isPasswordLengthValid = formData.password.length >= MIN_PASSWORD_LENGTH;
  const isPasswordMatch = formData.password.length > 0 && formData.password === formData.confirmPassword;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ib-theme', theme);
  }, [theme]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    setError('');
    if (fieldErrors[name]) {
      setFieldErrors({ ...fieldErrors, [name]: '' });
    }
  };

  const mapSignupErrorToFields = (message = '') => {
    const normalized = String(message || '').toLowerCase();
    const nextFieldErrors = { username: '', email: '', password: '', confirmPassword: '' };

    if (normalized.includes('username')) {
      nextFieldErrors.username = message || 'Username is already taken';
    }

    if (normalized.includes('at least 12 characters') || normalized.includes('password')) {
      nextFieldErrors.password = message || 'Password must be at least 12 characters long';
    }

    if (normalized.includes('email already exists') || normalized.includes('email')) {
      nextFieldErrors.email = message || 'Email already exists';
    }

    return nextFieldErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const normalizedUsername = formData.username.trim();
    if (!normalizedUsername) {
      setFieldErrors({
        username: 'Username is required',
        email: '',
        password: '',
        confirmPassword: ''
      });
      setError('Username is required');
      return;
    }
    
    if (formData.password !== formData.confirmPassword) {
      setFieldErrors({
        username: '',
        email: '',
        password: '',
        confirmPassword: 'Passwords do not match'
      });
      setError('Passwords do not match');
      return;
    }
    
    if (!isPasswordLengthValid) {
      setFieldErrors({
        username: '',
        email: '',
        password: 'Password must be at least 12 characters long',
        confirmPassword: ''
      });
      setError('Password must be at least 12 characters long');
      return;
    }

    setLoading(true);
    setFieldErrors({ username: '', email: '', password: '', confirmPassword: '' });
    try {
      const signupFields = { ...formData, username: normalizedUsername };
      delete signupFields.confirmPassword;
      delete signupFields.password;
      const payload = {
        role,
        ...signupFields,
        // Backend expects this field name and now performs secure hashing server-side.
        passwordHash: formData.password,
      };

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
        const backendMessage = data.message || data.error || data.details || '';
        if (response.status === 400) {
          setFieldErrors(mapSignupErrorToFields(backendMessage));
          setError(backendMessage || 'Invalid signup request. Please review your inputs.');
        } else {
          setFieldErrors({ email: '', password: '', confirmPassword: '' });
          setError(backendMessage || `Signup failed (${response.status}).`);
        }
      }
    } catch (err) {
      setFieldErrors({ email: '', password: '', confirmPassword: '' });
      setError('Unable to sign up right now. Please try again.');
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
            <span className="logo-text">{APP_CONFIG.appName}</span>
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
          <h1>Join {APP_CONFIG.appName}</h1>
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
                <input name="ownerName" placeholder="Uddhav Dawale" value={formData.ownerName} onChange={handleChange} required />
              </div>
            </div>
            <div className="input-group">
              <label>Username *</label>
              <div className="input-wrapper">
                <span className="input-icon">@</span>
                <input
                  name="username"
                  placeholder="choose-login-name"
                  value={formData.username}
                  onChange={handleChange}
                  className={fieldErrors.username ? 'input-invalid' : ''}
                  required
                />
              </div>
              {fieldErrors.username && <div className="field-error">{fieldErrors.username}</div>}
            </div>
            <div className="input-group">
              <label>Phone *</label>
              <div className="input-wrapper">
                <span className="input-icon">📱</span>
                <input name="phone" type="tel" placeholder="9876543210" value={formData.phone} onChange={handleChange} required />
              </div>
            </div>
          </div>

          <div className="input-group">
            <label>Email *</label>
            <div className="input-wrapper">
              <span className="input-icon">✉️</span>
              <input
                name="email"
                type="email"
                placeholder="name@domain.com"
                value={formData.email}
                onChange={handleChange}
                className={fieldErrors.email ? 'input-invalid' : ''}
                required
              />
            </div>
            {fieldErrors.email && <div className="field-error">{fieldErrors.email}</div>}
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
              <input
                name="password"
                type="password"
                placeholder="Minimum 12 characters"
                value={formData.password}
                onChange={handleChange}
                className={fieldErrors.password ? 'input-invalid' : ''}
                required
              />
            </div>
            {formData.password.length > 0 && !isPasswordLengthValid && (
              <div className="field-error">Password must be at least 12 characters long</div>
            )}
            {fieldErrors.password && fieldErrors.password !== 'Password must be at least 12 characters long' && (
              <div className="field-error">{fieldErrors.password}</div>
            )}
            <div className="password-checklist" aria-live="polite">
              <div className={`password-rule ${isPasswordLengthValid ? 'pass' : 'pending'}`}>
                <span>{isPasswordLengthValid ? '✓' : '•'}</span>
                Password must be at least 12 characters long
              </div>
              <div className={`password-rule ${isPasswordMatch ? 'pass' : 'pending'}`}>
                <span>{isPasswordMatch ? '✓' : '•'}</span>
                Password and confirm password must match
              </div>
            </div>
          </div>

          <div className="input-group">
            <label>Confirm Password *</label>
            <div className="input-wrapper">
              <span className="input-icon">🔒</span>
              <input
                name="confirmPassword"
                type="password"
                placeholder="Retype password"
                value={formData.confirmPassword}
                onChange={handleChange}
                className={fieldErrors.confirmPassword ? 'input-invalid' : ''}
                required
              />
            </div>
            {fieldErrors.confirmPassword && <div className="field-error">{fieldErrors.confirmPassword}</div>}
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

          <button type="submit" className="signup-btn" disabled={loading || !isPasswordLengthValid}>
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
