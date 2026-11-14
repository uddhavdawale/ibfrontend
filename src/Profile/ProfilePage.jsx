import React, { useState, useEffect } from 'react';
import './ProfilePage.css';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINTS, apiFetch, getCurrentUserProfile } from '../Config/api';

const DOCUMENT_FIELDS = [
  { key: 'logo', label: 'Shop logo', accept: 'image/png,image/jpeg,image/webp', types: ['image/png', 'image/jpeg', 'image/webp'] },
  { key: 'gstCertificate', label: 'GST certificate', accept: 'application/pdf,image/png,image/jpeg,image/webp', types: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] },
  { key: 'panCard', label: 'PAN card', accept: 'application/pdf,image/png,image/jpeg,image/webp', types: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] },
  { key: 'aadhaarCard', label: 'Aadhaar card', accept: 'application/pdf,image/png,image/jpeg,image/webp', types: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] },
];

const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024;

const parseResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const hasDocument = (profile, key) => {
  const fields = {
    logo: ['logo', 'logoUrl', 'logoPath'],
    gstCertificate: ['gstCertificate', 'gstCertificateUrl', 'gstCertificatePath'],
    panCard: ['panCard', 'panCardUrl', 'panCardPath'],
    aadhaarCard: ['aadhaarCard', 'aadhaarCardUrl', 'aadhaarCardPath', 'aadharCard', 'aadharCardUrl'],
  };
  const values = fields[key].map((field) => profile?.[field] ?? profile?.documents?.[field]);
  const documentTypes = {
    logo: ['logo', 'shop_logo'],
    gstCertificate: ['gst_certificate', 'gstcertificate'],
    panCard: ['pan_card', 'pancard'],
    aadhaarCard: ['aadhaar_card', 'aadhar_card', 'aadhaar', 'aadhar'],
  };
  const listedDocument = Array.isArray(profile?.documents) && profile.documents.some((document) =>
    documentTypes[key].includes(String(document?.type || document?.documentType || '').toLowerCase())
  );

  return listedDocument || values.some((value) => (
    typeof value === 'string' ? Boolean(value.trim()) : Boolean(value?.url || value?.fileName || value?.id)
  ));
};

const ProfilePage = ({ username = "User", onLogout }) => {
  const [isEditing, setIsEditing] = useState(false);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [profileData, setProfileData] = useState({
    name: username,
    email: '',
    phone: '',
    business: '',
    location: '',
    joined: 'Recent'
  });
  const [shopAddress, setShopAddress] = useState('');
  const [savedShopAddress, setSavedShopAddress] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState({});
  const [uploadedDocuments, setUploadedDocuments] = useState({});
  const [shopProfileLoading, setShopProfileLoading] = useState(true);
  const [savingShopProfile, setSavingShopProfile] = useState(false);
  const [shopProfileError, setShopProfileError] = useState('');
  const [shopProfileMessage, setShopProfileMessage] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    let active = true;

    const loadUserProfile = async () => {
      try {
        const profile = await getCurrentUserProfile();
        if (!active) return;

        const locationParts = [profile.city, profile.address].filter(Boolean);
        setProfileData({
          name: profile.ownerName || profile.name || profile.businessName || username,
          email: profile.email || '',
          phone: profile.phone || '',
          business: profile.businessName || profile.business || '',
          location: locationParts.join(', ') || 'N/A',
          joined: profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : 'Recent'
        });
      } catch (error) {
        if (!active) return;
        setProfileError(error.message || 'Unable to load profile');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadUserProfile();
    return () => { active = false; };
  }, [username]);

  useEffect(() => {
    let active = true;

    const loadShopProfile = async () => {
      try {
        const response = await apiFetch(API_ENDPOINTS.shopProfile, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const payload = await parseResponse(response);
        if (!response.ok) {
          throw new Error(payload.message || `Unable to load shop details (${response.status})`);
        }

        const shop = payload?.shop || payload?.data || payload || {};
        const address = String(shop.address || shop.tenantAddress || '').trim();
        if (!active) return;
        setShopAddress(address);
        setSavedShopAddress(address);
        setUploadedDocuments(Object.fromEntries(
          DOCUMENT_FIELDS.map(({ key }) => [key, hasDocument(shop, key)])
        ));
      } catch (error) {
        if (active) setShopProfileError(error.message || 'Unable to load shop details');
      } finally {
        if (active) setShopProfileLoading(false);
      }
    };

    loadShopProfile();
    return () => { active = false; };
  }, []);

  const handleEditToggle = () => {
    setIsEditing(!isEditing);
  };

  const handleSave = (e) => {
    e.preventDefault();
    setIsEditing(false);
    // Profile update should be sent to a backend update endpoint in a future API version.
  };

  const handleDocumentChange = (key, file) => {
    setShopProfileError('');
    setShopProfileMessage('');
    if (!file) return;
    const field = DOCUMENT_FIELDS.find((item) => item.key === key);
    if (!field.types.includes(file.type)) {
      setShopProfileError(`Choose a supported file type for ${field.label.toLowerCase()}.`);
      setFileInputKey((current) => current + 1);
      return;
    }
    if (file.size > MAX_DOCUMENT_SIZE) {
      setShopProfileError(`${field.label} must be 5 MB or smaller.`);
      setFileInputKey((current) => current + 1);
      return;
    }
    setSelectedDocuments((current) => ({ ...current, [key]: file }));
  };

  const handleShopProfileSubmit = async (event) => {
    event.preventDefault();
    setShopProfileError('');
    setShopProfileMessage('');
    setSavingShopProfile(true);

    const formData = new FormData();
    formData.append('address', shopAddress.trim());
    Object.entries(selectedDocuments).forEach(([key, file]) => {
      if (file) formData.append(key, file, file.name);
    });

    try {
      const response = await apiFetch(API_ENDPOINTS.shopProfile, {
        method: 'PATCH',
        body: formData,
      });
      const payload = await parseResponse(response);
      if (!response.ok) {
        throw new Error(payload.message || `Unable to save shop details (${response.status})`);
      }

      setSavedShopAddress(shopAddress.trim());
      setUploadedDocuments((current) => ({
        ...current,
        ...Object.fromEntries(Object.keys(selectedDocuments).map((key) => [key, true])),
      }));
      setSelectedDocuments({});
      setFileInputKey((current) => current + 1);
      setShopProfileMessage('Shop details saved.');
    } catch (error) {
      setShopProfileError(error.message || 'Unable to save shop details. Please try again.');
    } finally {
      setSavingShopProfile(false);
    }
  };

  const hasShopProfileChanges = shopAddress.trim() !== savedShopAddress
    || Object.values(selectedDocuments).some(Boolean);

  return (
    <div className="profile-page">
      {/* HEADER */}
      <div className="profile-header">
        <div className="profile-back">
          <button className="back-btn" onClick={() => window.history.back()}>
            ← Back
          </button>
        </div>
        <div className="profile-avatar-section">
          <div className="avatar-large">
            <img 
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(profileData.name)}&background=1976d2&color=fff&size=80&bold=true`} 
              alt="Profile" 
            />
          </div>
          <div className="profile-info">
            <h1>{profileData.name}</h1>
            <p className="business-name">{profileData.business}</p>
            <button 
              className={`edit-btn ${isEditing ? 'save-btn' : ''}`}
              onClick={isEditing ? handleSave : handleEditToggle}
            >
              {isEditing ? '💾 Save Changes' : '✏️ Edit Profile'}
            </button>
          </div>
        </div>
      </div>

      {/* PROFILE CONTENT */}
      <div className="profile-content">
        {profileError && (
          <div className="profile-error">{profileError}</div>
        )}

        {loading ? (
          <div className="profile-card loading-state">Loading profile...</div>
        ) : (
        <div className="profile-card">
          <h2>Account Details</h2>
          <div className="profile-field">
            <label>Full Name</label>
            <input 
              type="text" 
              value={profileData.name}
              onChange={(e) => setProfileData({...profileData, name: e.target.value})}
              disabled={!isEditing}
              className={isEditing ? 'editable' : ''}
            />
          </div>
          
          <div className="profile-field">
            <label>Email</label>
            <input 
              type="email" 
              value={profileData.email}
              onChange={(e) => setProfileData({...profileData, email: e.target.value})}
              disabled={!isEditing}
              className={isEditing ? 'editable' : ''}
            />
          </div>

          <div className="profile-field">
            <label>Phone</label>
            <input 
              type="tel" 
              value={profileData.phone}
              onChange={(e) => setProfileData({...profileData, phone: e.target.value})}
              disabled={!isEditing}
              className={isEditing ? 'editable' : ''}
            />
          </div>

          <div className="profile-field">
            <label>Business</label>
            <input 
              type="text" 
              value={profileData.business}
              onChange={(e) => setProfileData({...profileData, business: e.target.value})}
              disabled={!isEditing}
              className={isEditing ? 'editable' : ''}
            />
          </div>

          <div className="profile-field">
            <label>Location</label>
            <input 
              type="text" 
              value={profileData.location}
              onChange={(e) => setProfileData({...profileData, location: e.target.value})}
              disabled={!isEditing}
              className={isEditing ? 'editable' : ''}
            />
          </div>

          <div className="profile-field read-only">
            <label>Member Since</label>
            <span>{profileData.joined}</span>
          </div>
        </div>
        )}

        <section className="profile-card shop-profile-card" aria-labelledby="shop-profile-title">
          <div className="shop-profile-heading">
            <div>
              <h2 id="shop-profile-title">Shop identity &amp; documents</h2>
              <p>Complete or update your shop details after onboarding. Every field is optional.</p>
            </div>
            <span className="optional-badge">Optional</span>
          </div>

          {shopProfileError && <div className="profile-feedback profile-feedback-error" role="alert">{shopProfileError}</div>}
          {shopProfileMessage && <div className="profile-feedback profile-feedback-success" role="status">{shopProfileMessage}</div>}

          {shopProfileLoading ? (
            <div className="shop-profile-loading" role="status">Loading shop details...</div>
          ) : (
            <form onSubmit={handleShopProfileSubmit}>
              <div className="shop-address-field">
                <label htmlFor="tenant-address">Shop / tenant address <span>Optional</span></label>
                <textarea
                  id="tenant-address"
                  name="address"
                  rows="3"
                  maxLength="500"
                  value={shopAddress}
                  onChange={(event) => {
                    setShopAddress(event.target.value);
                    setShopProfileMessage('');
                  }}
                  placeholder="Street, area, city, state and PIN code"
                />
              </div>

              <div className="shop-documents-grid">
                {DOCUMENT_FIELDS.map(({ key, label, accept }) => (
                  <div className="shop-document-field" key={key}>
                    <label htmlFor={`shop-document-${key}`}>{label} <span>Optional</span></label>
                    <input
                      key={fileInputKey}
                      id={`shop-document-${key}`}
                      type="file"
                      accept={accept}
                      onChange={(event) => handleDocumentChange(key, event.target.files?.[0])}
                    />
                    <div className="shop-document-status" aria-live="polite">
                      {selectedDocuments[key]?.name
                        ? `Selected: ${selectedDocuments[key].name}`
                        : uploadedDocuments[key] ? 'Previously uploaded' : 'No file uploaded'}
                    </div>
                    <small>Maximum 5 MB</small>
                  </div>
                ))}
              </div>

              <div className="shop-profile-footer">
                <p>Documents are sent to the backend and are not saved in browser storage.</p>
                <button
                  className="shop-profile-save"
                  type="submit"
                  disabled={savingShopProfile || !hasShopProfileChanges}
                >
                  {savingShopProfile ? 'Saving...' : 'Save shop details'}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* ACTIONS */}
        <div className="profile-actions">
          <button className="action-btn logout-btn" onClick={onLogout}>
            🚪 Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;