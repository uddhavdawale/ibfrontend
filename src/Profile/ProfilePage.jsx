import React, { useState, useEffect } from 'react';
import './ProfilePage.css';
import { useNavigate } from 'react-router-dom';
import { getCurrentUserProfile } from '../Config/api';

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

  const handleEditToggle = () => {
    setIsEditing(!isEditing);
  };

  const handleSave = (e) => {
    e.preventDefault();
    setIsEditing(false);
    // Profile update should be sent to a backend update endpoint in a future API version.
  };

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