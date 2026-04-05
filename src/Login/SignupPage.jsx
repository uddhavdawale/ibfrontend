import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './SignupPage.css';

const SignupPage = () => {
  const navigate = useNavigate();
  
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
      const payload = {
        role,
        ...formData,
        passwordHash: btoa(formData.password)  // Frontend prep
      };
      //http://localhost:8080/api/signup
      //  
      const response = await fetch('https://ibbackend-production.up.railway.app/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`${role.toUpperCase()} Account Created!`);
        navigate('/login');
      } else {
        setError(data.message || 'Signup failed');
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
    <div className="signup-container">
      <div className="signup-card">
        {/* Header */}
        <div className="auth-logo">
          <span className="logo-icon">📦</span>
          <span className="logo-text">IB Platform</span>
        </div>
        
        <h1>Create Account</h1>
        <p>Join as Retailer or CA Partner</p>

        {/* Role Dropdown */}
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

        {/* Error */}
        {error && (
          <div className="error-message">
            <span>⚠️</span> {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="signup-form">
          {/* Common Fields */}
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

          {/* Role-Specific Fields */}
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

          {/* Password */}
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

          {/* Address */}
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