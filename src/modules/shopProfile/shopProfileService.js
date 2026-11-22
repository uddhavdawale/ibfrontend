import { API_ENDPOINTS, apiFetch } from '../../Config/api';
import { INDIAN_GST_STATES, normalizeIndianGstState } from '../tax/gstConfig';

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

export const isValidIndianGstin = (value) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
  String(value || '').trim().toUpperCase()
);

export const resolveIssuerStateCode = (profile = {}) => {
  const records = [
    profile,
    profile.assignedOrganization,
    profile.assignedOrganization?.address,
    profile.assignedOrganization?.businessAddress,
    profile.shop,
    profile.shop?.address,
    profile.tenant,
    profile.tenant?.address,
    profile.organization,
    profile.organization?.address,
    profile.shop?.organization,
    profile.shop?.organization?.address,
    profile.tenant?.organization,
    profile.tenant?.organization?.address,
    profile.businessAddress,
    profile.registeredAddress,
    profile.taxRegistration,
    profile.gstRegistration,
    profile.address,
    profile.location,
  ].filter((value) => value && typeof value === 'object' && !Array.isArray(value));
  const gstin = records
    .flatMap((record) => [
      record.gstin,
      record.gstNumber,
      record.gstinNumber,
      record.gstRegistrationNumber,
    ])
    .map((value) => String(value || '').trim().toUpperCase())
    .find((value) => value !== '27ABCDE1234F1Z5' && isValidIndianGstin(value));
  if (gstin) {
    const stateFromGstin = normalizeIndianGstState(gstin.slice(0, 2));
    if (stateFromGstin) return stateFromGstin;
  }

  const stateFields = [
    'issuerStateCode',
    'issuerState',
    'stateCode',
    'state_code',
    'gstStateCode',
    'gst_state_code',
    'state',
    'stateName',
    'state_name',
    'registeredState',
    'placeOfBusinessState',
    'province',
  ];
  const stateFromProfile = records
    .flatMap((record) => stateFields.map((field) => record[field]))
    .map((value) => (
      value && typeof value === 'object'
        ? value.code || value.stateCode || value.name || value.label
        : value
    ))
    .map(normalizeIndianGstState)
    .find(Boolean);
  if (stateFromProfile) return stateFromProfile;

  const addressFields = [
    'address',
    'addressLine1',
    'addressLine2',
    'street',
    'city',
    'location',
    'businessAddress',
    'registeredAddress',
  ];
  const addressText = records
    .flatMap((record) => addressFields.map((field) => record[field]))
    .map((value) => (
      value && typeof value === 'object'
        ? Object.values(value).filter((part) => typeof part === 'string').join(' ')
        : String(value || '')
    ))
    .map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
  const paddedAddress = ` ${addressText} `;
  const matchingStateCodes = INDIAN_GST_STATES
    .filter(({ name }) => {
      const stateName = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      return paddedAddress.includes(` ${stateName} `);
    })
    .map(({ code }) => code);
  const uniqueStateCodes = [...new Set(matchingStateCodes)];
  return uniqueStateCodes.length === 1 ? uniqueStateCodes[0] : '';
};

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
  const nestedAddress = profile.address && typeof profile.address === 'object'
    ? profile.address
    : {};
  const gstin = String(
    profile.gstin
    || profile.gstNumber
    || profile.gstinNumber
    || profile.gstRegistrationNumber
    || profile.taxRegistration?.gstin
    || ''
  ).trim();
  const resolvedGstin = gstin.toUpperCase() === '27ABCDE1234F1Z5' ? '' : gstin;
  const profileAddress = String(
    typeof profile.address === 'string'
      ? profile.address
      : profile.tenantAddress || profile.fullAddress || ''
  ).trim();
  const composedAddress = [
      nestedAddress.addressLine1 || nestedAddress.line1,
      nestedAddress.addressLine2 || nestedAddress.line2,
      nestedAddress.street,
      nestedAddress.city,
      nestedAddress.state || nestedAddress.stateName,
      nestedAddress.pincode || nestedAddress.postalCode || nestedAddress.zipCode,
      profile.addressLine1,
      profile.addressLine2,
      profile.city,
      profile.state?.name || profile.stateName || profile.state_name || profile.state,
      profile.pincode || profile.postalCode || profile.zipCode,
    ].filter(Boolean).join(', ');
  const resolvedAddress = profileAddress && profileAddress.toLowerCase() !== 'aurangabad, maharashtra 431001'
    ? profileAddress
    : composedAddress;
  const address = ['aurangabad, maharashtra 431001', 'aurangabad, maharashtra, 431001']
    .includes(resolvedAddress.trim().toLowerCase())
    ? ''
    : resolvedAddress;
  const state = profile.state?.name
    || profile.stateName
    || profile.state_name
    || (typeof profile.state === 'string' ? profile.state : '')
    || nestedAddress.state?.name
    || nestedAddress.stateName
    || nestedAddress.state_name
    || (typeof nestedAddress.state === 'string' ? nestedAddress.state : '');
  const stateCode = profile.stateCode
    || profile.state_code
    || profile.gstStateCode
    || nestedAddress.stateCode
    || nestedAddress.state_code
    || '';

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
    state,
    stateCode,
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

export const resolveInvoiceIssuerProfile = (invoice = {}, fallbackProfile = readStoredShopProfile()) => {
  const snapshot = invoice.issuerSnapshot || invoice;
  const issuerName = String(snapshot.issuerName || snapshot.name || '').trim();
  if (!issuerName) return normalizeShopProfile(fallbackProfile);

  const normalized = normalizeShopProfile({
    businessName: issuerName,
    shopName: issuerName,
    displayName: issuerName,
    tenantName: issuerName,
    ownerName: issuerName,
    gstin: snapshot.issuerGstin ?? snapshot.gstin ?? '',
    address: snapshot.issuerAddress ?? snapshot.address ?? '',
    phone: snapshot.issuerPhone ?? snapshot.phone ?? '',
    email: snapshot.issuerEmail ?? snapshot.email ?? '',
  });
  return {
    ...normalized,
    gstin: String(snapshot.issuerGstin ?? snapshot.gstin ?? '').trim(),
    gstNumber: String(snapshot.issuerGstin ?? snapshot.gstin ?? '').trim(),
    address: String(snapshot.issuerAddress ?? snapshot.address ?? '').trim(),
    phone: String(snapshot.issuerPhone ?? snapshot.phone ?? '').trim(),
    contactNumber: String(snapshot.issuerPhone ?? snapshot.phone ?? '').trim(),
    email: String(snapshot.issuerEmail ?? snapshot.email ?? '').trim(),
    supportEmail: String(snapshot.issuerEmail ?? snapshot.email ?? '').trim(),
  };
};

export const getCurrentShopProfile = async (forceRefresh = false, fallbackOnError = true) => {
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
    const shop = payload.shop || payload.data?.shop || payload.data || payload || {};
    return saveShopProfile(shop);
  } catch (error) {
    if (!fallbackOnError) throw error;
    return readStoredShopProfile();
  }
};

export default normalizeShopProfile;
