import { API_ENDPOINTS, apiFetch } from '../../Config/api';

const fallbackShopProfile = Object.freeze({
  businessName: 'IB ENTERPRISES',
  shopName: 'IB ENTERPRISES',
  displayName: 'IB ENTERPRISES',
  tenantName: 'IB ENTERPRISES',
  name: 'IB ENTERPRISES',
  ownerName: 'IB Enterprises',
  gstin: '27ABCDE1234F1Z5',
  gstNumber: '27ABCDE1234F1Z5',
  address: 'Aurangabad, Maharashtra 431001',
  city: 'Aurangabad',
  state: 'Maharashtra',
  pincode: '431001',
  phone: '+91 98765 43210',
  contactNumber: '+91 98765 43210',
  email: 'sales@ibenterprises.com',
  supportEmail: 'sales@ibenterprises.com',
});

export const normalizeShopProfile = (profile = {}) => {
  const rawBusinessName = [
    profile.businessName,
    profile.shopName,
    profile.displayName,
    profile.tenantName,
    profile.name,
    profile.ownerName,
    profile.companyName,
  ].find((value) => typeof value === 'string' && value.trim());

  const businessName = (rawBusinessName || fallbackShopProfile.businessName).trim();

  return {
    ...fallbackShopProfile,
    ...profile,
    businessName,
    shopName: profile.shopName || businessName,
    displayName: profile.displayName || businessName,
    tenantName: profile.tenantName || businessName,
    name: profile.name || businessName,
    ownerName: profile.ownerName || businessName,
    gstin: profile.gstin || profile.gstNumber || fallbackShopProfile.gstin,
    address: profile.address || `${profile.city || 'Aurangabad'}, ${profile.state || 'Maharashtra'} ${profile.pincode || '431001'}`,
    phone: profile.phone || profile.contactNumber || fallbackShopProfile.phone,
    email: profile.email || profile.supportEmail || fallbackShopProfile.email,
  };
};

export const readStoredShopProfile = () => {
  if (typeof window === 'undefined') return normalizeShopProfile();

  try {
    const stored = window.localStorage.getItem('shopProfile');
    if (!stored) return normalizeShopProfile();
    return normalizeShopProfile(JSON.parse(stored));
  } catch {
    return normalizeShopProfile();
  }
};

export const saveShopProfile = (profile = {}) => {
  const normalized = normalizeShopProfile(profile);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem('shopProfile', JSON.stringify(normalized));
  }

  return normalized;
};

export const getShopDisplayName = (profile = {}) => {
  const normalized = normalizeShopProfile(profile);
  return normalized.businessName || normalized.shopName || normalized.displayName || 'IB ENTERPRISES';
};

export const getCurrentShopProfile = async (forceRefresh = false) => {
  if (!forceRefresh) {
    const stored = readStoredShopProfile();
    if (stored && stored.businessName && stored.businessName !== 'IB ENTERPRISES') {
      return stored;
    }
  }

  try {
    const response = await apiFetch(API_ENDPOINTS.shopProfile, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) throw new Error(`Unable to load shop profile (${response.status})`);

    const payload = await response.json().catch(() => ({}));
    const shop = payload.shop || payload.data || payload || {};
    return saveShopProfile(shop);
  } catch {
    return readStoredShopProfile();
  }
};

export default normalizeShopProfile;
