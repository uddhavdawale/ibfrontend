import { API_ENDPOINTS, apiFetch } from '../../Config/api';

const fallbackShopProfile = Object.freeze({
  businessName: 'IB ENTERPRISES',
  shopName: 'IB ENTERPRISES',
  displayName: 'IB ENTERPRISES',
  tenantName: 'IB ENTERPRISES',
  name: 'IB ENTERPRISES',
  ownerName: 'IB Enterprises',
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
  const gstin = String(profile.gstin || profile.gstNumber || '').trim();
  const resolvedGstin = gstin.toUpperCase() === '27ABCDE1234F1Z5' ? '' : gstin;
  const profileAddress = String(profile.address || '').trim();
  const composedAddress = [
      profile.addressLine1,
      profile.addressLine2,
      profile.city,
      profile.state,
      profile.pincode || profile.postalCode || profile.zipCode,
    ].filter(Boolean).join(', ');
  const resolvedAddress = profileAddress && profileAddress.toLowerCase() !== 'aurangabad, maharashtra 431001'
    ? profileAddress
    : composedAddress;
  const address = ['aurangabad, maharashtra 431001', 'aurangabad, maharashtra, 431001']
    .includes(resolvedAddress.trim().toLowerCase())
    ? ''
    : resolvedAddress;

  return {
    ...fallbackShopProfile,
    ...profile,
    businessName,
    shopName: profile.shopName || businessName,
    displayName: profile.displayName || businessName,
    tenantName: profile.tenantName || businessName,
    name: profile.name || businessName,
    ownerName: profile.ownerName || businessName,
    gstin: resolvedGstin,
    gstNumber: resolvedGstin,
    address,
    phone: profile.phone || profile.contactNumber || fallbackShopProfile.phone,
    email: profile.email || profile.supportEmail || fallbackShopProfile.email,
  };
};

export const readStoredShopProfile = () => {
  if (typeof window === 'undefined') return normalizeShopProfile();

  try {
    const user = JSON.parse(window.localStorage.getItem('user') || '{}');
    const scopedKey = user?.username ? `shopProfile:${String(user.username).toLowerCase()}` : null;
    const stored = scopedKey
      ? window.localStorage.getItem(scopedKey)
      : window.localStorage.getItem('shopProfile');
    if (!stored) return normalizeShopProfile();
    return normalizeShopProfile(JSON.parse(stored));
  } catch {
    return normalizeShopProfile();
  }
};

export const saveShopProfile = (profile = {}) => {
  const normalized = normalizeShopProfile(profile);

  if (typeof window !== 'undefined') {
    try {
      const user = JSON.parse(window.localStorage.getItem('user') || '{}');
      if (user?.username) {
        window.localStorage.setItem(`shopProfile:${String(user.username).toLowerCase()}`, JSON.stringify(normalized));
      }
    } catch {
      // Ignore parse/storage errors and keep legacy key for compatibility.
    }
    window.localStorage.setItem('shopProfile', JSON.stringify(normalized));
  }

  return normalized;
};

export const getShopDisplayName = (profile = {}) => {
  const normalized = normalizeShopProfile(profile);
  return normalized.businessName || normalized.shopName || normalized.displayName || 'IB ENTERPRISES';
};

export const getShopLogoUrl = (profile = {}) => {
  const documentLogo = Array.isArray(profile.documents)
    ? profile.documents.find((document) => ['logo', 'shop_logo'].includes(
      String(document?.type || document?.documentType || '').toLowerCase()
    ))
    : profile.documents?.logo || profile.documents?.logoUrl || profile.documents?.logoPath;
  const logoUrl = [
    profile.logo,
    profile.shopLogo,
    profile.logoUrl,
    profile.logoPath,
    documentLogo,
  ].map((logo) => (
    typeof logo === 'string' ? logo : logo?.url || logo?.src || logo?.path
  )).find((url) => typeof url === 'string' && url.trim());

  return typeof logoUrl === 'string' ? logoUrl.trim() : '';
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
