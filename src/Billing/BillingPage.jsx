import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './BillingPage.css';
import logger from '../utils/logger';
import { API_ENDPOINTS, apiFetch, getCurrentUserProfile } from '../Config/api';
import { buildInvoicePdf } from '../utils/invoicePdf';
import { openWhatsAppChat } from '../utils/whatsapp';
import createSecureIdempotencyKey from '../utils/createSecureIdempotencyKey';
import {
  getCurrentShopProfile,
  getShopDisplayName,
  isValidIndianGstin,
  readStoredShopProfile,
  resolveIssuerStateCode,
  resolveInvoiceIssuerProfile,
} from '../modules/shopProfile/shopProfileService';
import {
  BILL_TYPES,
  INDIAN_GST_STATES,
  TAX_PRICE_MODES,
  buildTaxProfileForItem,
  getProductGstRate,
  getProductGstRateStatus,
  getProductHsnCode,
  isValidHsnCode,
  normalizeIndianGstState,
  roundCurrency,
} from '../modules/tax/gstConfig';
import { canWriteBilling, getCurrentUserRole } from '../Security/storeRoles';

const PAYMENT_SCREENSHOT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PAYMENT_SCREENSHOT_SIZE = 5 * 1024 * 1024;
const ISSUER_STATE_CONFIGURATION_ERROR = 'Set the selected issuer’s state or configure a valid GSTIN before creating a GST invoice.';
const GSTIN_PLACEHOLDER = '27ABCDE1234F1Z5';
const getValidProfileGstin = (profile = {}) => {
  const records = [
    profile,
    profile.shop,
    profile.business,
    profile.taxRegistration,
    profile.gstRegistration,
    profile.data,
    profile.data?.shop,
    profile.data?.business,
  ].filter((record) => record && typeof record === 'object');
  return records
    .flatMap((record) => [
      record.gstin,
      record.gstNumber,
      record.gstinNumber,
      record.gstRegistrationNumber,
      record.taxRegistration?.gstin,
      record.gstRegistration?.gstin,
    ])
    .map((value) => String(value || '').trim().toUpperCase())
    .find((value) => value !== GSTIN_PLACEHOLDER && isValidIndianGstin(value)) || '';
};
const getInvoiceRecoveryStorageKey = () => {
  try {
    const user = JSON.parse(window.localStorage.getItem('user') || '{}');
    const tenantKey = user.tenantId
      ?? user.organizationId
      ?? user.tenant?.id
      ?? user.storeId
      ?? user.username
      ?? 'current';
    return `billing:invoice-recovery:${String(tenantKey).toLowerCase()}`;
  } catch {
    return 'billing:invoice-recovery:current';
  }
};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));
const getAssignedOrganization = (profile = {}) => (
  profile.assignedOrganization
  || profile.organization
  || profile.tenant?.organization
  || profile.shop?.organization
  || profile.data?.organization
  || null
);
const getOrganizationAddress = (organization = {}) => String(
  (typeof organization.address === 'string' ? organization.address : [
    organization.address?.addressLine1,
    organization.address?.addressLine2,
    organization.address?.city,
    organization.address?.state,
    organization.address?.pincode || organization.address?.postalCode,
  ].filter(Boolean).join(', '))
  || [
    organization.addressLine1,
    organization.addressLine2,
    organization.city,
    organization.state,
    organization.pincode || organization.postalCode,
  ].filter(Boolean).join(', ')
).trim();
const getInvoiceIssuerProfile = (issuerType, profile = {}) => {
  if (issuerType !== 'ORGANIZATION') return profile;
  const organization = getAssignedOrganization(profile) || {};
  const name = String(organization.name || organization.organizationName || '').trim();
  const gstin = String(organization.gstin || organization.gstNumber || '').trim().toUpperCase();
  const address = getOrganizationAddress(organization);
  const state = String(organization.state || organization.stateName || organization.state_name || '').trim();
  const stateCode = String(organization.stateCode || organization.state_code || organization.gstStateCode || '').trim();
  const phone = String(organization.phone || organization.contactNumber || '').trim();
  const email = String(organization.email || organization.supportEmail || '').trim();
  return {
    ...profile,
    businessName: name,
    shopName: name,
    displayName: name,
    tenantName: name,
    gstin,
    gstNumber: gstin,
    state: state || stateCode,
    stateCode,
    address,
    phone,
    contactNumber: phone,
    email,
    supportEmail: email,
  };
};
const getGstConfigurationMessage = (product = {}) => {
  const status = getProductGstRateStatus(product);
  if (status === 'HSN_MISSING') return 'Add an HSN/SAC to this product';
  if (status === 'HSN_INVALID') return 'Correct this product HSN/SAC';
  if (status === 'RATE_NOT_FOUND') return 'No GST rate is mapped to this HSN/SAC';
  if (!isValidHsnCode(product.hsn)) return 'A valid HSN/SAC is required';
  if (getProductGstRate(product) === null) return 'A valid GST rate is required';
  return 'HSN-based GST rate is not resolved';
};
const normalizePaymentMethod = (method) => {
  const normalizedMethod = String(method || '').trim().toUpperCase();
  if (normalizedMethod.startsWith('UPI')) return 'UPI';
  if (normalizedMethod.includes('CARD')) return 'CARD';
  if (normalizedMethod.includes('CASH')) return 'CASH';
  if (normalizedMethod.includes('WALLET')) return 'WALLET';
  return 'OTHER';
};

const parseWhatsAppRequestedItems = (requestText, products) => {
  const segments = String(requestText || '')
    .split(/[\n,;]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.flatMap((segment) => {
    const requestedText = segment.toLowerCase();
    const product = [...products]
      .filter((item) => item?.name)
      .sort((a, b) => b.name.length - a.name.length)
      .find((item) => requestedText.includes(String(item.name).toLowerCase()) || (
        item.sku && requestedText.includes(String(item.sku).toLowerCase())
      ));
    if (!product) return [];

    const leadingQuantity = segment.match(/^\s*(\d+(?:\.\d+)?)\s*(?:x\b|\*\s*|kg\b|ltr\b|litre\b|pcs\b|piece\b|pack\b)?/i);
    const trailingQuantity = segment.match(/(?:x|\*)\s*(\d+(?:\.\d+)?)\s*$/i);
    const quantity = Math.max(1, Math.min(
      Number(leadingQuantity?.[1] || trailingQuantity?.[1] || 1),
      Number(product.stock || 1) || 1,
    ));
    return [{ ...product, qty: quantity }];
  }).reduce((cart, item) => {
    const existing = cart.find((entry) => String(entry.id) === String(item.id));
    if (existing) existing.qty = Math.min(existing.qty + item.qty, Number(item.stock || existing.qty) || existing.qty);
    else cart.push(item);
    return cart;
  }, []);
};

const BillingPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const consumedOrderDraftRef = useRef('');
  
  // POS State
  const [cart, setCart] = useState([]);
  const [quantityDrafts, setQuantityDrafts] = useState({});
  const [cartNotice, setCartNotice] = useState('');
  const [latestAddedProductId, setLatestAddedProductId] = useState(null);
  const cartItemsRef = useRef(null);
  const cartItemRefs = useRef(new Map());
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '', state: '' });
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [customerSelectionLocked, setCustomerSelectionLocked] = useState(false);
  const [searchProduct, setSearchProduct] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('INV-001');
  const [invoiceRecoveryInvoiceNo, setInvoiceRecoveryInvoiceNo] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return window.sessionStorage.getItem(getInvoiceRecoveryStorageKey()) || '';
    } catch {
      return '';
    }
  });
  const [isSubmittingInvoice, setIsSubmittingInvoice] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [resolvingIssuerProfile, setResolvingIssuerProfile] = useState(false);
  const [billType, setBillType] = useState(() => (
    getValidProfileGstin(readStoredShopProfile()) ? BILL_TYPES.GST : BILL_TYPES.NON_GST
  ));
  const [taxPriceMode, setTaxPriceMode] = useState(TAX_PRICE_MODES.EXCLUSIVE);
  const [issuerType, setIssuerType] = useState('STORE');
  const [paymentDialog, setPaymentDialog] = useState({ open: false, step: 'payment-check' });
  const [partialPaymentAmount, setPartialPaymentAmount] = useState('');
  const [showPartialInvoiceAction, setShowPartialInvoiceAction] = useState(false);
  const [paymentScreenshot, setPaymentScreenshot] = useState(null);
  const [paymentScreenshotPreview, setPaymentScreenshotPreview] = useState('');
  const [paymentScreenshotError, setPaymentScreenshotError] = useState('');
  const paymentScreenshotInputRef = useRef(null);
  const invoiceSubmissionInProgressRef = useRef(false);
  const markInvoiceRecoveryRequired = (generatedInvoiceNumber) => {
    const recoveryNumber = String(generatedInvoiceNumber || 'unknown');
    setInvoiceRecoveryInvoiceNo(recoveryNumber);
    try {
      window.sessionStorage.setItem(getInvoiceRecoveryStorageKey(), recoveryNumber);
    } catch (error) {
      logger.warn('Invoice recovery guard could not be persisted for this tab', error);
    }
  };
  const clearInvoiceRecoveryRequired = () => {
    setInvoiceRecoveryInvoiceNo('');
    try {
      window.sessionStorage.removeItem(getInvoiceRecoveryStorageKey());
    } catch (error) {
      logger.warn('Invoice recovery guard could not be cleared for this tab', error);
    }
  };
  
  // Dynamic Products
  const [products, setProducts] = useState([]);
  const [productLoadError, setProductLoadError] = useState('');
  const [shopProfile, setShopProfile] = useState(() => readStoredShopProfile());
  const [issuerProfileReady, setIssuerProfileReady] = useState(false);
  const [gstRegistrationReady, setGstRegistrationReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(() => getCurrentUserRole());
  const shopDisplayName = getShopDisplayName(shopProfile);
  const isBillingWritable = canWriteBilling(role);
  const assignedOrganization = getAssignedOrganization(shopProfile) || {};
  const hasStoreGstRegistration = gstRegistrationReady && Boolean(getValidProfileGstin(shopProfile));
  const assignedOrganizationId = assignedOrganization.id ?? assignedOrganization.organizationId;
  const hasAssignedOrganization = Boolean(String(assignedOrganizationId ?? '').trim());
  const assignedOrganizationName = String(
    assignedOrganization.name || assignedOrganization.organizationName || ''
  ).trim();
  const assignedOrganizationGstin = String(
    assignedOrganization.gstin || assignedOrganization.gstNumber || ''
  ).trim().toUpperCase();
  const assignedOrganizationAddress = getOrganizationAddress(assignedOrganization);
  const canIssueOrganizationGstInvoice = Boolean(
    issuerProfileReady
    && hasAssignedOrganization
    && assignedOrganizationName
    && isValidIndianGstin(assignedOrganizationGstin)
    && assignedOrganizationAddress
  );
  const canIssueOrganizationInvoice = Boolean(
    issuerProfileReady && hasAssignedOrganization && assignedOrganizationName
  );
  const currentInvoiceIssuerProfile = getInvoiceIssuerProfile(issuerType, shopProfile);
  const issuerStateCode = resolveIssuerStateCode(currentInvoiceIssuerProfile);
  const placeOfSupplyState = normalizeIndianGstState(customer.state);
  const isInterStateSupply = Boolean(
    issuerStateCode && placeOfSupplyState && issuerStateCode !== placeOfSupplyState
  );
  const resolveIssuerProfileBeforeGstInvoice = async () => {
    let activeShopProfile = shopProfile;
    let selectedIssuerProfile = getInvoiceIssuerProfile(issuerType, activeShopProfile);
    let stateCode = resolveIssuerStateCode(selectedIssuerProfile);
    if (stateCode) return { issuerProfile: selectedIssuerProfile, stateCode };

    try {
      activeShopProfile = await getCurrentShopProfile(true, false);
      setShopProfile(activeShopProfile);
      setIssuerProfileReady(true);
      selectedIssuerProfile = getInvoiceIssuerProfile(issuerType, activeShopProfile);
      stateCode = resolveIssuerStateCode(selectedIssuerProfile);
    } catch (error) {
      logger.warn('Unable to refresh selected issuer profile before GST invoice', error);
    }

    if (!stateCode && issuerType === 'STORE') {
      try {
        const userProfile = await getCurrentUserProfile();
        const userGstin = getValidProfileGstin(userProfile);
        if (userGstin) {
          const resolvedGstin = getValidProfileGstin(activeShopProfile) || userGstin;
          activeShopProfile = {
            ...activeShopProfile,
            gstin: resolvedGstin,
            gstNumber: resolvedGstin,
          };
          setShopProfile(activeShopProfile);
          selectedIssuerProfile = getInvoiceIssuerProfile(issuerType, activeShopProfile);
          stateCode = resolveIssuerStateCode(selectedIssuerProfile);
        }
      } catch (error) {
        logger.warn('Unable to resolve store GSTIN from the authenticated retailer profile', error);
      }
    }

    return { issuerProfile: selectedIssuerProfile, stateCode };
  };

  useEffect(() => {
    if (!paymentScreenshot) {
      setPaymentScreenshotPreview('');
      return undefined;
    }

    const previewUrl = URL.createObjectURL(paymentScreenshot);
    setPaymentScreenshotPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [paymentScreenshot]);
  
  const refreshProducts = async () => {
    setProductLoadError('');
    try {
      const productEndpoints = [
        API_ENDPOINTS.billingProductsPage(0, 100),
        API_ENDPOINTS.productsWithSize(100),
        API_ENDPOINTS.products,
      ];

      let data = null;
      let response = null;

      for (const endpoint of productEndpoints) {
        response = await apiFetch(endpoint);
        if (!response.ok) continue;
        data = await response.json();
        break;
      }

      if (!data || !response?.ok) throw new Error(`HTTP ${response?.status || 500}`);

      const productList = Array.isArray(data?.content) ? data.content : Array.isArray(data) ? data : [];
      const productsWithGst = productList.map(product => {
        const sellingPrice = Number(product.price ?? product.sellingPrice ?? product.salePrice ?? product.unitPrice ?? 0) || 0;
        const mrpValue = Number(product.mrp ?? product.mrpAmount ?? product.maximumRetailPrice ?? product.maxRetailPrice ?? sellingPrice ?? 0) || 0;
        const category = product.category || product.categoryName || product.group || 'default';
        const gstRate = getProductGstRate(product);
        const gstRateStatus = getProductGstRateStatus(product);

        return {
          id: product.id ?? product.productId,
          name: product.name || product.itemName || product.productName,
          sku: product.sku || product.code || '',
          category,
          price: sellingPrice,
          mrp: mrpValue,
          hsn: getProductHsnCode(product),
          gst: gstRate,
          gstRate,
          gstRateStatus,
          stock: Number(product.quantity ?? product.stock ?? product.ItemQty ?? product.qty ?? 0) || 0,
          salesCount: Number(product.salesCount ?? product.soldQty ?? product.purchaseCount ?? product.popularity ?? 0) || 0,
        };
      });
      setProducts(productsWithGst);
    } catch (error) {
      logger.error('Billing product fetch failed', error);
      setProducts([]);
      setProductLoadError('Products and their HSN-based GST rates could not be loaded. Check your connection and retry.');
    }
  };

  // Fetch products
  useEffect(() => {
    setRole(getCurrentUserRole());

    let active = true;

    const loadIssuerProfile = async () => {
      let profile;
      let verifiedShopProfile = false;
      try {
        profile = await getCurrentShopProfile(true, false);
        verifiedShopProfile = true;
      } catch {
        profile = readStoredShopProfile();
      }

      let storeGstin = getValidProfileGstin(profile);
      if (!storeGstin) {
        try {
          const userProfile = await getCurrentUserProfile();
          storeGstin = getValidProfileGstin(userProfile);
        } catch (error) {
          logger.warn('Unable to verify the retailer GSTIN from the authenticated profile', error);
        }
      }

      if (storeGstin) {
        profile = { ...profile, gstin: storeGstin, gstNumber: storeGstin };
      }
      if (!active) return;

      setShopProfile(profile);
      setIssuerProfileReady(verifiedShopProfile);
      setGstRegistrationReady(true);
      setBillType(storeGstin ? BILL_TYPES.GST : BILL_TYPES.NON_GST);
    };

    loadIssuerProfile();

    const initializeBillingData = async () => {
      try {
        await refreshProducts();
      } finally {
        if (active) setLoading(false);
      }
    };

    initializeBillingData();
    return () => { active = false; };
  }, []);
  
  // Filtered products - prioritize the most active / popular items at the top of billing catalog
  const getProductPriority = (product) => {
    const salesValue = Number(product.salesCount ?? product.soldQty ?? product.purchaseCount ?? product.popularity ?? 0) || 0;
    const stockValue = Number(product.stock ?? product.quantity ?? 0) || 0;
    return Math.max(salesValue, stockValue);
  };

  const filteredProducts = [...products]
    .filter(p =>
      p.name.toLowerCase().includes(searchProduct.toLowerCase()) ||
      p.sku?.toLowerCase().includes(searchProduct.toLowerCase())
    )
    .sort((a, b) => {
      const aValue = getProductPriority(a);
      const bValue = getProductPriority(b);
      return bValue - aValue || b.price - a.price || a.name.localeCompare(b.name);
    });

  useEffect(() => {
    const query = String(customer.name || '').trim();
    if (!query) {
      setCustomerSuggestions([]);
      setCustomerSelectionLocked(false);
      return;
    }

    if (customerSelectionLocked) {
      setCustomerSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      try {
        const customerEndpoints = [
          API_ENDPOINTS.customerProfilesSearch(query),
          API_ENDPOINTS.customerSearch(query),
        ];

        const responses = await Promise.all(
          customerEndpoints.map(async (endpoint) => {
            try {
              const response = await apiFetch(endpoint, { signal: controller.signal });
              if (!response.ok) return [];
              const payload = await response.json();
              return toCustomerArray(payload);
            } catch {
              return [];
            }
          })
        );

        if (controller.signal.aborted) return;

        const matches = responses.flat().reduce((acc, entry) => {
          const matchName = String(entry?.customerName || entry?.name || entry?.customer || '').trim();
          const matchPhone = String(entry?.phone || entry?.mobile || entry?.contactNumber || '').trim();
          const matchEmail = String(entry?.email || '').trim();
          const matchState = String(entry?.placeOfSupplyState || entry?.state || entry?.stateName || '').trim();
          if (!matchName && !matchPhone) return acc;
          const key = `${matchName || 'Unknown'}|${matchPhone || ''}`;
          if (acc.some((item) => item.key === key)) return acc;
          acc.push({
            key,
            name: matchName || 'Unknown customer',
            phone: matchPhone,
            email: matchEmail,
            state: matchState,
          });
          return acc;
        }, []);

        setCustomerSuggestions(matches.slice(0, 6));
      } catch {
        setCustomerSuggestions([]);
      }
    }, 2000);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [customer.name, customer.phone, customerSelectionLocked]);
  
  // Cart totals
  const getItemTaxSummary = (item, quantity = 1) => buildTaxProfileForItem({
    ...item,
    price: Number(item.price || 0) * quantity,
    category: item.category || 'default',
    gst: getProductGstRate(item) ?? 0,
  }, billType, taxPriceMode, isInterStateSupply ? 'inter-state' : 'intra-state');
  const hasValidGstConfiguration = (item) => (
    getProductGstRateStatus(item) === 'RESOLVED'
    && isValidHsnCode(item.hsn)
    && getProductGstRate(item) !== null
  );
  const itemsMissingGstConfiguration = billType === BILL_TYPES.GST
    ? cart.filter((item) => !hasValidGstConfiguration(item))
    : [];
  const missingPlaceOfSupplyState = billType === BILL_TYPES.GST && !placeOfSupplyState;
  const missingIssuerState = billType === BILL_TYPES.GST && !issuerStateCode;
  const missingStoreGstRegistration = billType === BILL_TYPES.GST && !hasStoreGstRegistration;
  const gstInvoiceValidationErrors = billType !== BILL_TYPES.GST
    ? []
    : [
      missingStoreGstRegistration && 'GST invoices require a valid GSTIN registered to this store.',
      ...itemsMissingGstConfiguration.map((item) => `${item.name}: ${getGstConfigurationMessage(item)}.`),
      missingPlaceOfSupplyState && 'Select the buyer’s place-of-supply state.',
      missingIssuerState && ISSUER_STATE_CONFIGURATION_ERROR,
    ].filter(Boolean);
  const isGstBill = billType === BILL_TYPES.GST;
  const subtotal = roundCurrency(cart.reduce((sum, item) => sum + getItemTaxSummary(item, item.qty).taxableAmount, 0));
  const gstAmount = roundCurrency(cart.reduce((sum, item) => sum + getItemTaxSummary(item, item.qty).taxAmount, 0));
  const grandTotal = roundCurrency(cart.reduce((sum, item) => sum + getItemTaxSummary(item, item.qty).itemTotal, 0));
  const cartQuantity = cart.reduce((sum, item) => sum + item.qty, 0);
  const gstSummaryLabel = billType === BILL_TYPES.NON_GST
    ? 'GST (0%)'
    : taxPriceMode === TAX_PRICE_MODES.INCLUSIVE
      ? `${isInterStateSupply ? 'IGST' : 'GST'} included`
      : `${isInterStateSupply ? 'IGST' : 'GST'} (${cart.length > 0 ? `${((gstAmount / Math.max(subtotal, 1)) * 100).toFixed(1)}%` : '0%'})`;

  useEffect(() => {
    if (!cartNotice) return undefined;
    const timeoutId = window.setTimeout(() => setCartNotice(''), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [cartNotice]);

  useEffect(() => {
    if (latestAddedProductId === null) return;
    if (cartItemsRef.current) {
      cartItemRefs.current.get(latestAddedProductId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    setLatestAddedProductId(null);
  }, [cart, latestAddedProductId]);
  
  // Add to cart
  const addToCart = (product) => {
    if (!isBillingWritable) return;
    if (product.stock <= 0) {
      alert(`${product.name} - Out of stock!`);
      return;
    }
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      if (existing.qty >= product.stock) {
        alert('Stock limit reached!');
        return;
      }
      setCart(currentCart => currentCart.map(item =>
        item.id === product.id ? { ...item, qty: item.qty + 1 } : item
      ));
    } else {
      setCart(currentCart => [...currentCart, { ...product, qty: 1 }]);
    }
    setCartNotice(`${product.name} added to cart`);
    setLatestAddedProductId(product.id);
  };

  useEffect(() => {
    const orderDraft = location.state?.whatsappOrder || location.state?.repeatedOrder;
    if (!orderDraft || products.length === 0 || !isBillingWritable) return;

    const draftKey = JSON.stringify(orderDraft);
    if (consumedOrderDraftRef.current === draftKey) return;
    consumedOrderDraftRef.current = draftKey;

    const draftCustomer = orderDraft.customer || {};
    setCustomer({
      name: draftCustomer.name || '',
      phone: draftCustomer.phone || '',
      email: draftCustomer.email || '',
      state: normalizeIndianGstState(draftCustomer.state || draftCustomer.placeOfSupplyState),
    });

    let matchedItems = [];
    if (location.state?.repeatedOrder) {
      matchedItems = (orderDraft.items || []).flatMap((requested) => {
        const matched = products.find((product) => (
          (requested.sku && String(product.sku).toLowerCase() === String(requested.sku).toLowerCase())
          || String(product.name).toLowerCase() === String(requested.name).toLowerCase()
        ));
        if (!matched || Number(matched.stock || 0) <= 0) return [];
        return [{ ...matched, qty: Math.min(Number(requested.qty || 1), Number(matched.stock || 1)) }];
      });
    } else {
      matchedItems = parseWhatsAppRequestedItems(orderDraft.requestText, products);
    }

    setCart(matchedItems);
    setCartNotice(matchedItems.length
      ? `${matchedItems.length} WhatsApp/repeat order item${matchedItems.length === 1 ? '' : 's'} loaded`
      : 'Order loaded; select matching products from the catalog');
  }, [location.state, products, isBillingWritable]);
  
  // Update quantity
  const updateQty = (id, qty) => {
    if (!isBillingWritable) return;
    if (qty <= 0) {
      removeFromCart(id);
      return;
    }
    const productStock = products.find(p => p.id === id)?.stock || 0;
    if (qty > productStock) {
      alert('Stock exceeded!');
      return;
    }
    setCart(currentCart => currentCart.map(item =>
      item.id === id ? { ...item, qty } : item
    ));
  };

  const commitQuantity = (id, value) => {
    setQuantityDrafts(currentDrafts => {
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[id];
      return nextDrafts;
    });

    if (value.trim() === '') return;
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 0) return;
    updateQty(id, quantity);
  };
  
  const removeFromCart = (id) => {
    if (!isBillingWritable) return;
    setCart(currentCart => currentCart.filter(item => item.id !== id));
  };
  
  // ✅ FIXED: Invoice number generation
  const generateInvoiceNo = () => {
    const num = parseInt(invoiceNo.split('-')[1]) || 1;
    return `INV-${(num + 1).toString().padStart(3, '0')}`;
  };
  
  const formatMoney = (value) => {
    const numericValue = Number(value || 0);
    return numericValue.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');
  const normalizeCustomerPhone = (value) => {
    const digits = normalizeDigits(value).replace(/^0+/, '');
    return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  };

  const toCustomerArray = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    if (Array.isArray(payload.customers)) return payload.customers;
    if (Array.isArray(payload.content)) return payload.content;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && typeof payload.data === 'object') {
      if (Array.isArray(payload.data.customers)) return payload.data.customers;
      if (Array.isArray(payload.data.content)) return payload.data.content;
      if (Array.isArray(payload.data.items)) return payload.data.items;
      return toCustomerArray(payload.data);
    }
    if (payload.customer && typeof payload.customer === 'object') return toCustomerArray(payload.customer);
    return [payload];
  };

  const readCustomerDueBalance = (source) => {
    const amount = Number(
      source?.dueBalance ??
      source?.outstandingBalance ??
      source?.balanceDue ??
      source?.pendingAmount ??
      source?.pendingBalance ??
      source?.currentBalance ??
      source?.amountDue ??
      source?.totalDue ??
      source?.customerBalance ??
      source?.customerDue ??
      source?.balance ??
      source?.receivable ??
      source?.outstanding ??
      0
    );
    return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
  };

  const resolveCustomerPreviousBalance = async () => {
    const customerPhoneDigits = normalizeCustomerPhone(customer.phone);
    const customerName = String(customer.name || '').trim().toLowerCase();

    if (!customerPhoneDigits && !customerName) return { profileId: null, balance: 0 };

    const endpoint = customerPhoneDigits
      ? API_ENDPOINTS.customerProfileByPhone(String(customer.phone || '').trim())
      : API_ENDPOINTS.customerProfilesSearch(customer.name);
    try {
      const response = await apiFetch(endpoint);
      if (response.status === 404) return { profileId: null, balance: 0 };
      if (!response.ok) {
        throw new Error("Unable to verify the customer's existing balance. Please try again.");
      }
      const customers = toCustomerArray(await response.json());
      const matches = customers.filter((entry) => {
        if (customerPhoneDigits) {
          return normalizeCustomerPhone(entry?.phone || entry?.mobile || entry?.contactNumber) === customerPhoneDigits;
        }
        const entryName = String(entry?.customerName || entry?.name || entry?.customer || '').trim().toLowerCase();
        return entryName === customerName;
      });
      if (matches.length !== 1) return { profileId: null, balance: 0 };

      return {
        profileId: matches[0].id ?? matches[0].profileId ?? null,
        balance: readCustomerDueBalance(matches[0]),
      };
    } catch (error) {
      logger.warn('Customer balance lookup failed during invoice creation', {
        error: error.message || String(error),
      });
      throw new Error("Unable to verify the customer's existing balance. Please try again.");
    }
  };

  const calculateInvoiceTotals = (items) => {
    const subtotal = items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 0)), 0);
    const gst = items.reduce((sum, item) => {
      const amount = Number(item.price || 0) * Number(item.qty || 0);
      return sum + (amount * Number(item.gst || 0)) / 100;
    }, 0);
    const grandTotal = subtotal + gst;

    return { subtotal, gst, grandTotal };
  };

  const generateInvoicePdf = async (invoiceData, refreshShopProfile = true) => {
    const hasIssuerSnapshot = Boolean(
      invoiceData.issuerName || invoiceData.issuerSnapshot?.issuerName
    );
    const currentShopProfile = hasIssuerSnapshot
      ? resolveInvoiceIssuerProfile(invoiceData, invoiceData.shopProfile || shopProfile || readStoredShopProfile())
      : refreshShopProfile
        ? await getCurrentShopProfile(true)
        : invoiceData.shopProfile || shopProfile || readStoredShopProfile();
    if (refreshShopProfile && !hasIssuerSnapshot) setShopProfile(currentShopProfile);
    return buildInvoicePdf({ ...invoiceData, shopProfile: currentShopProfile });
  };

  const resolveCustomerDueState = (previousBalanceValue, totalAmountValue, receivedAmountValue) => {
    const toCents = (value) => {
      const amount = Number(value || 0);
      return Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) : 0;
    };
    const previousBalanceCents = Math.max(toCents(previousBalanceValue), 0);
    const totalAmountCents = Math.max(toCents(totalAmountValue), 0);
    const receivedAmountCents = Math.max(toCents(receivedAmountValue), 0);
    const invoiceDueCents = Math.max(totalAmountCents - receivedAmountCents, 0);
    const totalDueCents = previousBalanceCents + invoiceDueCents;
    return {
      invoiceDueAmount: invoiceDueCents / 100,
      totalDueAmount: totalDueCents / 100,
    };
  };

  const syncCustomerProfileDueBalance = async (profileId, balanceToStore) => {
    const amount = Math.max(Number(balanceToStore || 0), 0);
    if (profileId == null || !Number.isFinite(amount)) return false;

    const profileUpdatePayload = {
      dueBalance: amount,
      balanceDue: amount,
      outstandingBalance: amount,
      pendingAmount: amount,
      pendingBalance: amount,
      amountDue: amount,
      totalDue: amount,
      balance: amount,
      receivable: amount,
      outstanding: amount,
    };

    try {
      const response = await apiFetch(API_ENDPOINTS.customerProfileById(profileId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileUpdatePayload),
      });
      if (response.ok) return true;

      const payload = await response.json().catch(() => ({}));
      logger.warn('Customer profile due sync failed', { status: response.status, payload });
      return false;
    } catch (error) {
      logger.warn('Customer profile due sync exception', { error: error.message || String(error) });
      return false;
    }
  };

  const shareInvoiceViaWhatsApp = async (invoiceData, shareWindow = window) => {
    const customerName = invoiceData.customerName || 'there';
    const invoiceShopName = getShopDisplayName(invoiceData.shopProfile || shopProfile);
    const whatsappMessage = `Hi ${customerName}! 😊\n\nThank you for shopping with ${invoiceShopName}. We truly appreciate your support and hope you enjoy your purchase.\n\nYour invoice ${invoiceData.invoiceNo} is ready. Total: ₹${invoiceData.grandTotal.toLocaleString('en-IN')}.\n\nIf you have any questions or need help, we're happy to assist. Have a wonderful day!\n\nWarm regards,\n${invoiceShopName}`;
    const whatsappPhone = invoiceData.customerPhone || '919999999999';
    const filename = `invoice_${invoiceData.invoiceNo}.pdf`;
    openWhatsAppChat(whatsappPhone, whatsappMessage, shareWindow);

    let pdfBlob;
    try {
      const pdf = await generateInvoicePdf(invoiceData, false);
      pdfBlob = pdf.output('blob');
    } catch (error) {
      logger.error('Invoice PDF generation failed for WhatsApp sharing', error);
      alert('Unable to prepare the invoice PDF. Please try downloading it instead.');
      return;
    }

    const url = URL.createObjectURL(pdfBlob);

    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename;
    downloadLink.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const shareInvoiceViaEmail = async (invoiceData) => {
    const pdf = await generateInvoicePdf(invoiceData);
    const pdfBlob = pdf.output('blob');
    const url = URL.createObjectURL(pdfBlob);

    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `invoice_${invoiceData.invoiceNo}.pdf`;
    downloadLink.click();

    const recipient = invoiceData.customerEmail || 'sales@ibenterprises.com';
    const subject = `Invoice ${invoiceData.invoiceNo} - Receipt`;
    const body = `Dear ${invoiceData.customerName},\n\nReceipt for Invoice ${invoiceData.invoiceNo} attached.\n\nGrand Total: ₹${invoiceData.grandTotal.toLocaleString('en-IN')}\nDate: ${new Date().toLocaleDateString('en-IN')}`;
    window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const downloadInvoicePdf = async (invoiceData, downloadWindow = window) => {
    const pdf = await generateInvoicePdf(invoiceData);
    const url = URL.createObjectURL(pdf.output('blob'));
    const link = downloadWindow.document.createElement('a');
    const safeInvoiceNo = String(invoiceData.invoiceNo || 'invoice')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    link.href = url;
    link.download = `invoice_${safeInvoiceNo}.pdf`;
    downloadWindow.document.body.appendChild(link);
    link.click();
    link.remove();
    downloadWindow.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openInvoiceWindow = (invoiceData) => {
    const previewWindow = window.open('', '_blank');
    if (!previewWindow) {
      alert('Please allow pop-ups to view the generated invoice preview.');
      return;
    }

    const invoiceShopProfile = invoiceData.shopProfile || shopProfile;
    const isNonGst = invoiceData.billType === BILL_TYPES.NON_GST;
    const invoiceIssuerName = escapeHtml(getShopDisplayName(invoiceShopProfile));
    const invoiceIssuerGstin = escapeHtml(invoiceShopProfile.gstin || invoiceShopProfile.gstNumber || '');
    const invoiceIssuerAddress = escapeHtml(invoiceShopProfile.address || '');
    const invoiceIssuerPhone = escapeHtml(invoiceShopProfile.phone || invoiceShopProfile.contactNumber || '');
    const invoiceIssuerEmail = escapeHtml(invoiceShopProfile.email || invoiceShopProfile.supportEmail || '');
    const taxComponentType = invoiceData.taxComponentType === 'IGST' ? 'IGST' : 'CGST_SGST';
    const placeOfSupplyLabel = INDIAN_GST_STATES.find(
      ({ code }) => code === String(invoiceData.placeOfSupplyState || '')
    )?.name || invoiceData.placeOfSupplyState || '';
    const safeInvoiceNo = escapeHtml(invoiceData.invoiceNo);
    const safeCustomerName = escapeHtml(invoiceData.customerName);
    const safeCustomerPhone = escapeHtml(invoiceData.customerPhone);
    const safeCustomerEmail = escapeHtml(invoiceData.customerEmail || 'N/A');
    const safeCustomerState = escapeHtml(placeOfSupplyLabel);
    const safePaymentMethod = escapeHtml(invoiceData.paymentMethod || 'Cash');
    const safePaymentStatus = escapeHtml(invoiceData.paymentStatus);
    const invoiceRows = invoiceData.items.map((item, index) => {
      const amount = Number(item.price) * Number(item.qty);
      const enteredUnitPrice = Number(item.enteredPrice ?? item.price);
      const taxableAmount = Number(item.taxableAmount ?? amount);
      const gstValue = isNonGst ? 0 : Number(item.taxAmount ?? (taxableAmount * Number(item.gst || 0)) / 100);
      const cgstValue = isNonGst || taxComponentType === 'IGST' ? 0 : Number(item.cgstAmount ?? (gstValue / 2));
      const sgstValue = isNonGst || taxComponentType === 'IGST' ? 0 : Number(item.sgstAmount ?? (gstValue - cgstValue));
      const igstValue = isNonGst ? 0 : Number(item.igstAmount ?? item.igst ?? (taxComponentType === 'IGST' ? gstValue : 0));
      const total = taxableAmount + gstValue;
      const safeItemName = escapeHtml(item.name || '-');
      const safeHsn = escapeHtml(item.hsn || '9999');
      const safeQuantity = escapeHtml(item.qty);
      if (isNonGst) {
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${safeItemName}</td>
            <td>${safeHsn}</td>
            <td>${safeQuantity}</td>
            <td>₹${enteredUnitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td>₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td>₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          </tr>
        `;
      }

      const taxComponentCells = taxComponentType === 'IGST'
        ? `<td>₹${igstValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>`
        : `<td>₹${cgstValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td>₹${sgstValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>`;
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${safeItemName}</td>
          <td>${safeHsn}</td>
          <td>${safeQuantity}</td>
          <td>₹${enteredUnitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td>₹${taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td>${escapeHtml(item.gst ?? 0)}%</td>
          ${taxComponentCells}
          <td>₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
      `;
    }).join('');

    previewWindow.shareInvoiceViaWhatsApp = async () => shareInvoiceViaWhatsApp(invoiceData, previewWindow);
    previewWindow.shareInvoiceViaEmail = async () => shareInvoiceViaEmail(invoiceData);
    previewWindow.downloadInvoicePdf = async () => {
      try {
        await downloadInvoicePdf(invoiceData, previewWindow);
      } catch (error) {
        logger.error('Invoice PDF download failed', error);
        previewWindow.alert('Unable to download the invoice PDF. Please try again.');
      }
    };

    const receivedAmount = Number(invoiceData.receivedAmount ?? invoiceData.paidAmount ?? invoiceData.amountPaid ?? 0);
    const previousBalance = Number(invoiceData.previousBalance ?? 0);
    const invoiceDueAmount = Math.max(Number(invoiceData.grandTotal || 0) - receivedAmount, 0);
    const balanceAmount = Number(invoiceData.balanceAmount ?? previousBalance + invoiceDueAmount);
    const currentBalance = Number(invoiceData.currentBalance ?? balanceAmount);
    const dueAmount = Math.max(currentBalance, 0);

    previewWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Invoice ${safeInvoiceNo}</title>
          <style>
            :root {
              --invoice-green: #1b8d54;
              --invoice-dark: #0f172a;
              --invoice-gray: #475569;
              --invoice-border: #e2e8f0;
              --invoice-soft: #f8fafc;
              --invoice-shadow: rgba(15, 23, 42, 0.08);
            }

            @page {
              size: A4;
              margin: 12mm;
            }

            * { box-sizing: border-box; }

            html, body {
              margin: 0;
              padding: 0;
              color: var(--invoice-dark);
              background: #eef2f7;
              font-family: 'Segoe UI', Arial, sans-serif;
            }

            body {
              min-height: 100vh;
              padding: 24px;
            }

            .invoice-shell {
              max-width: 980px;
              margin: 0 auto;
              background: #ffffff;
              padding: 0 0 20px;
              border-radius: 16px;
              box-shadow: 0 20px 40px var(--invoice-shadow);
              border: 1px solid rgba(148, 163, 184, 0.2);
              overflow: hidden;
            }

            .invoice-header-band {
              background: linear-gradient(135deg, var(--invoice-green), #0f766e);
              color: #fff;
              padding: 16px 26px 14px;
            }

            .invoice-header-band h1 {
              margin: 0;
              font-size: 30px;
              font-weight: 800;
              letter-spacing: -0.04em;
            }

            .invoice-header-grid {
              display: grid;
              grid-template-columns: 1.4fr 0.6fr;
              gap: 18px;
              align-items: end;
            }

            .brand-meta {
              font-size: 12px;
              line-height: 1.7;
              opacity: 0.95;
            }

            .invoice-summary {
              background: rgba(255,255,255,0.1);
              border: 1px solid rgba(255,255,255,0.18);
              border-radius: 12px;
              padding: 12px 14px;
              font-size: 12px;
              line-height: 1.8;
            }

            .invoice-body {
              padding: 24px 26px 10px;
            }

            .customer-grid {
              display: grid;
              grid-template-columns: repeat(2, minmax(180px, 1fr));
              gap: 14px 20px;
              padding: 10px 0 18px;
              border-bottom: 2px solid var(--invoice-border);
              font-size: 14px;
              color: var(--invoice-gray);
            }

            .customer-grid strong {
              display: inline-block;
              min-width: 86px;
              color: var(--invoice-dark);
            }

            .status-pill {
              display: inline-block;
              padding: 4px 10px;
              border-radius: 999px;
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
            }
            .status-paid { background: #dcfce7; color: #166534; }
            .status-pending { background: #fef3c7; color: #92400e; }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 18px;
            }

            .invoice-table-wrap {
              width: 100%;
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
            }

            th, td {
              padding: 10px 8px;
              border-bottom: 1px solid var(--invoice-border);
              text-align: left;
              font-size: 12px;
              vertical-align: middle;
            }

            th {
              background: var(--invoice-green);
              color: white;
              font-weight: 700;
            }

            tbody tr:nth-child(even) {
              background: #f8fafc;
            }

            .totals {
              margin-top: 18px;
              margin-left: auto;
              width: min(360px, 100%);
              background: #f8fafc;
              border: 1px solid var(--invoice-border);
              border-radius: 12px;
              padding: 12px 14px;
            }

            .totals-row {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              padding: 8px 0;
              font-size: 13px;
              color: var(--invoice-gray);
              border-bottom: 1px solid var(--invoice-border);
            }

            .totals-row:last-child {
              border-bottom: none;
            }

            .grand {
              padding-top: 10px;
              font-size: 22px;
              font-weight: 800;
              letter-spacing: -0.04em;
              color: var(--invoice-dark);
            }

            .invoice-bottom {
              display: grid;
              grid-template-columns: 1.15fr 0.85fr;
              gap: 20px;
              margin-top: 22px;
              align-items: start;
            }

            .words-panel,
            .summary-panel {
              border: 1px solid var(--invoice-border);
              border-radius: 12px;
              background: #f8fafc;
              padding: 12px 14px;
            }

            .words-panel h4,
            .summary-panel h4 {
              margin: 0 0 10px;
              font-size: 13px;
              color: var(--invoice-dark);
            }

            .words-panel p {
              margin: 0;
              font-size: 12px;
              color: var(--invoice-gray);
              line-height: 1.7;
            }

            .summary-row {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              padding: 6px 0;
              font-size: 12px;
              color: var(--invoice-gray);
              border-bottom: 1px solid var(--invoice-border);
            }

            .summary-row:last-child {
              border-bottom: none;
            }

            .summary-row.total {
              margin-top: 4px;
              padding-top: 10px;
              font-size: 13px;
              font-weight: 800;
              color: var(--invoice-dark);
            }

            .notes-wrap {
              margin: 20px 0 8px;
              font-size: 12px;
              line-height: 1.7;
              color: var(--invoice-gray);
            }

            .notes-wrap strong {
              color: var(--invoice-dark);
            }

            .toolbar {
              display: flex;
              justify-content: flex-end;
              gap: 12px;
              flex-wrap: wrap;
              margin-top: 18px;
              padding: 0 26px 26px;
            }

            .share-btn {
              border: none;
              border-radius: 10px;
              color: white;
              font-weight: 700;
              font-size: 14px;
              padding: 11px 16px;
              cursor: pointer;
              min-width: 170px;
              box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
            }
            .whatsapp { background: linear-gradient(135deg, #22c55e, #16a34a); }
            .email { background: linear-gradient(135deg, #3b82f6, #2563eb); }
            .download { background: linear-gradient(135deg, #64748b, #475569); }
            .close { background: linear-gradient(135deg, #ef4444, #dc2626); }

            @media (max-width: 900px) and (min-width: 701px) {
              body {
                padding: 16px;
              }

              .invoice-header-band {
                padding: 18px 20px 14px;
              }

              .invoice-header-grid {
                grid-template-columns: minmax(0, 1fr) minmax(220px, 0.75fr);
                gap: 14px;
              }

              .brand-meta {
                overflow-wrap: anywhere;
              }

              .invoice-body {
                padding: 20px 20px 10px;
              }

              .invoice-table-wrap table {
                min-width: 760px;
              }

              .toolbar {
                padding: 0 20px 20px;
                gap: 8px;
              }

              .share-btn {
                min-width: 140px;
              }
            }

            @media (max-width: 700px) {
              .invoice-shell {
                width: 100%;
                margin: 0;
                border-radius: 0;
                box-shadow: none;
              }

              body {
                padding: 8px;
              }

              .invoice-header-band {
                padding: 18px 16px 14px;
              }

              .invoice-header-grid {
                grid-template-columns: 1fr;
                gap: 10px;
              }

              .invoice-header-grid h1 {
                font-size: 1.8rem;
              }

              .brand-meta,
              .invoice-summary {
                font-size: 11px;
              }

              .invoice-body {
                padding: 16px 14px 8px;
              }

              .customer-grid {
                grid-template-columns: 1fr;
                gap: 8px;
                font-size: 12px;
              }

              table {
                min-width: 680px;
              }

              .invoice-table-wrap {
                margin-right: -14px;
                padding-right: 14px;
              }

              th, td {
                padding: 8px 6px;
                font-size: 10.5px;
              }

              .totals {
                width: 100%;
                margin-top: 14px;
              }

              .totals-row {
                font-size: 12px;
              }

              .grand {
                font-size: 18px;
              }

              .invoice-bottom {
                grid-template-columns: 1fr;
              }

              .notes-wrap {
                font-size: 11px;
              }

              .toolbar {
                justify-content: stretch;
                padding: 0 14px 18px;
                gap: 10px;
              }

              .share-btn {
                flex: 1 1 100%;
                min-width: 0;
                width: 100%;
              }
            }

            @media print {
              html, body {
                background: #fff;
                padding: 0;
              }

              body {
                zoom: 1;
              }

              .invoice-shell {
                max-width: none;
                width: 100%;
                border: none;
                box-shadow: none;
                border-radius: 0;
              }

              .toolbar {
                display: none !important;
              }

              .invoice-table-wrap {
                overflow: visible;
              }

              .invoice-table-wrap table {
                min-width: 0;
              }

              .notes-wrap {
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="invoice-shell">
            <div class="invoice-header-band">
              <div class="invoice-header-grid">
                <div>
                  <h1>${invoiceIssuerName}</h1>
                  <div class="brand-meta">GSTIN: ${invoiceIssuerGstin}<br> ${invoiceIssuerAddress}<br> ${invoiceIssuerPhone}<br> ${invoiceIssuerEmail}</div>
                </div>
                <div class="invoice-summary">
                  <div><strong>Invoice:</strong> ${safeInvoiceNo}</div>
                  <div><strong>Date:</strong> ${new Date().toLocaleDateString('en-IN')}</div>
                  <div><strong>Type:</strong> ${invoiceData.billType === BILL_TYPES.NON_GST ? 'Non-GST Bill' : 'GST Bill'}</div>
                  <div><strong>Status:</strong> <span class="status-pill ${invoiceData.paymentStatus === 'paid' ? 'status-paid' : 'status-pending'}">${safePaymentStatus}</span></div>
                </div>
              </div>
            </div>

            <div class="invoice-body">
              <div class="customer-grid">
                <div><strong>Customer:</strong> ${safeCustomerName}</div>
                <div><strong>Phone:</strong> ${safeCustomerPhone}</div>
                <div><strong>Email:</strong> ${safeCustomerEmail}</div>
                ${safeCustomerState ? `<div><strong>Place of supply:</strong> ${safeCustomerState}</div>` : ''}
                <div><strong>Payment:</strong> ${safePaymentMethod}</div>
              </div>

              <div class="invoice-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Item</th>
                      <th>HSN</th>
                      <th>Qty</th>
                      <th>${invoiceData.taxPricingMode === TAX_PRICE_MODES.INCLUSIVE ? 'Rate incl.' : 'Rate'}</th>
                      <th>${invoiceData.taxPricingMode === TAX_PRICE_MODES.INCLUSIVE ? 'Taxable' : 'Amount'}</th>
                      ${invoiceData.billType === BILL_TYPES.NON_GST ? '' : `<th>GST%</th>${taxComponentType === 'IGST' ? '<th>IGST</th>' : '<th>CGST</th><th>SGST</th>'}`}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${invoiceRows}
                  </tbody>
                </table>
              </div>

              <div class="totals">
                <div class="totals-row"><span>Total Qty</span><span>${invoiceData.items.reduce((sum, item) => sum + Number(item.qty || 0), 0)}</span></div>
                <div class="totals-row"><span>${invoiceData.taxPricingMode === TAX_PRICE_MODES.INCLUSIVE ? 'Taxable Subtotal' : 'Subtotal'}</span><span>₹${invoiceData.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                ${invoiceData.billType === BILL_TYPES.NON_GST ? '' : `<div class="totals-row"><span>${invoiceData.taxPricingMode === TAX_PRICE_MODES.INCLUSIVE ? `${taxComponentType === 'IGST' ? 'IGST' : 'GST'} included` : `${taxComponentType === 'IGST' ? 'IGST' : 'GST'} Total`}</span><span>₹${invoiceData.gst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>`}
                <div class="totals-row grand"><span>Grand Total</span><span>₹${invoiceData.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              </div>

              <div class="invoice-bottom">
                <div class="words-panel">
                  <h4>Invoice Amount in Words</h4>
                  <p>${(invoiceData.grandTotal || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} only</p>
                </div>

                <div class="summary-panel">
                  <h4>Summary</h4>
                  <div class="summary-row"><span>Sub Total</span><span>₹${(invoiceData.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                  <div class="summary-row"><span>Total</span><span>₹${(invoiceData.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                  <div class="summary-row"><span>Received Amount</span><span>₹${receivedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                  <div class="summary-row"><span>Previous Balance</span><span>₹${previousBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                  <div class="summary-row"><span>Due Amount</span><span>₹${dueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                  <div class="summary-row total"><span>Balance</span><span>₹${currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                  <div class="summary-row"><span>Payment mode</span><span>${safePaymentMethod}</span></div>
                </div>
              </div>

              <div class="notes-wrap">
                <div><strong>Terms and Conditions</strong></div>
                <div>NO Guarantee</div>
                <div>NO Warranty</div>
                <div>NO Exchange</div>
              </div>
            </div>

            <div class="toolbar">
              <button class="share-btn whatsapp" onclick="window.shareInvoiceViaWhatsApp();">📱 WhatsApp PDF</button>
              <button class="share-btn email" onclick="window.shareInvoiceViaEmail();">✉️ Email PDF</button>
              <button class="share-btn download" onclick="window.downloadInvoicePdf();">⬇️ Download PDF</button>
              <button class="share-btn close" type="button" aria-label="Close invoice" onclick="window.close();">✕ Close</button>
            </div>
          </div>
        </body>
      </html>
    `);

    previewWindow.document.close();
    previewWindow.focus();
  };

  // Generate invoice
  const submitInvoice = async (status, amountReceived = 0) => {
    if (!isBillingWritable || invoiceSubmissionInProgressRef.current) return;
    if (invoiceRecoveryInvoiceNo) {
      alert(`Invoice ${invoiceRecoveryInvoiceNo} may already have been saved. Check the invoice history before allowing another submission.`);
      return;
    }

    invoiceSubmissionInProgressRef.current = true;
    setIsSubmittingInvoice(true);
    let invoiceRequestStarted = false;
    let invoiceResponseReceived = false;
    let invoiceOutcomeUncertain = false;
    let submittedInvoiceNumber = '';
    try {
      if (billType === BILL_TYPES.GST && gstInvoiceValidationErrors.length > 0) {
        throw new Error(gstInvoiceValidationErrors.join(' '));
      }

      if (issuerType === 'ORGANIZATION') {
        if (!issuerProfileReady || !canIssueOrganizationInvoice) {
          throw new Error('The store organization assignment could not be verified. Select the store as invoice issuer and try again.');
        }
        if (billType === BILL_TYPES.GST && !canIssueOrganizationGstInvoice) {
          throw new Error('Organization-issued GST invoices require the assigned organization’s GSTIN and address.');
        }
      }

      const selectedIssuerProfile = getInvoiceIssuerProfile(issuerType, shopProfile);
      const normalizedStatus = status === 'paid' ? 'paid' : status === 'partial' ? 'partial' : 'pending';
      const paidAmount = Number(amountReceived) || 0;
      const requestedReceivedAmount = normalizedStatus === 'paid' ? grandTotal : Math.max(Math.min(paidAmount, grandTotal), 0);
      const customerBalanceSnapshot = await resolveCustomerPreviousBalance();
      const previousBalance = customerBalanceSnapshot.balance;
      const shouldRecordPayment = requestedReceivedAmount > 0;
      const initialPaymentStatus = shouldRecordPayment ? 'pending' : normalizedStatus;
      const initialPaidAmount = shouldRecordPayment ? 0 : requestedReceivedAmount;
      const initialBalance = resolveCustomerDueState(previousBalance, grandTotal, initialPaidAmount).totalDueAmount;

      const payload = {
        customerName: customer.name || 'Walk-in Customer',
        customerPhone: customer.phone || '0000000000',
        paymentMethod,
        paymentStatus: initialPaymentStatus,
        status: initialPaymentStatus,
        paidAmount: initialPaidAmount,
        amountPaid: initialPaidAmount,
        receivedAmount: initialPaidAmount,
        previousBalance,
        balanceAmount: initialBalance,
        currentBalance: initialBalance,
        subtotal,
        gstAmount,
        grandTotal,
        totalAmount: grandTotal,
        billType,
        taxPricingMode: isGstBill ? taxPriceMode : TAX_PRICE_MODES.EXCLUSIVE,
        placeOfSupplyState: isGstBill ? placeOfSupplyState : undefined,
        issuerType,
        isGstInvoice: billType === BILL_TYPES.GST,
        items: cart.map((item) => {
          const taxSummary = getItemTaxSummary(item, item.qty);
          const inclusivePrice = isGstBill && taxPriceMode === TAX_PRICE_MODES.INCLUSIVE;
          return {
            productId: item.id,
            name: item.name,
            sku: item.sku || '',
            hsn: item.hsn,
            gstRate: Number(taxSummary.gstRate),
            cgst: taxSummary.cgstAmount,
            sgst: taxSummary.sgstAmount,
            igst: taxSummary.igstAmount,
            price: inclusivePrice
              ? Number((taxSummary.taxableAmount / Math.max(Number(item.qty) || 1, 1)).toFixed(4))
              : Number(item.price) || 0,
            enteredPrice: Number(item.price) || 0,
            qty: Number(item.qty) || 0,
            category: item.category || 'default',
            taxPricingMode: inclusivePrice ? TAX_PRICE_MODES.INCLUSIVE : TAX_PRICE_MODES.EXCLUSIVE,
            taxableAmount: taxSummary.taxableAmount,
            taxAmount: Number(taxSummary.taxAmount) || 0,
            cgstAmount: taxSummary.cgstAmount,
            sgstAmount: taxSummary.sgstAmount,
            igstAmount: taxSummary.igstAmount,
          };
        })
      };

      logger.info('Submitting invoice to backend', { billType, issuerType, itemCount: cart.length });
      const invoiceEndpoint = billType === BILL_TYPES.NON_GST ? API_ENDPOINTS.nonGstInvoices : API_ENDPOINTS.invoices;
      invoiceRequestStarted = true;
      const response = await apiFetch(invoiceEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      invoiceResponseReceived = true;
      invoiceOutcomeUncertain = response.ok || response.status >= 500;

      let result;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('json')) {
        result = await response.json();
      } else {
        result = await response.text();
      }

      if (!response.ok) {
        throw new Error(typeof result === 'string' ? result : (result?.message || result?.data?.message || 'Invoice save failed'));
      }

      const savedInvoice = result?.invoice
        ?? result?.data?.invoice
        ?? (result?.data && typeof result.data === 'object' ? result.data : result);
      const generatedInvoiceNo = savedInvoice?.invoiceNo || result?.invoiceNo || invoiceNo;
      submittedInvoiceNumber = generatedInvoiceNo;
      const serverSubtotal = Number(savedInvoice?.subtotal ?? savedInvoice?.subTotal);
      const serverGstAmount = Number(savedInvoice?.gstAmount ?? savedInvoice?.totalGst ?? savedInvoice?.gst);
      const serverGrandTotal = Number(savedInvoice?.grandTotal ?? savedInvoice?.totalAmount);
      const serverItems = Array.isArray(savedInvoice?.items)
        ? savedInvoice.items
        : Array.isArray(result?.items) ? result.items : [];
      const hasServerTaxData = Number.isFinite(serverSubtotal)
        && Number.isFinite(serverGstAmount)
        && Number.isFinite(serverGrandTotal)
        && serverItems.length === cart.length
        && serverItems.every((item) => (
          isValidHsnCode(item.hsn ?? item.hsnCode ?? item.hsnSac)
          && Number.isFinite(Number(item.enteredPrice))
          && Number.isFinite(Number(item.taxableAmount))
          && Number.isFinite(Number(item.taxAmount))
          && Number.isFinite(Number(item.gstRate ?? item.gst))
          && Number.isFinite(Number(item.cgstAmount ?? item.cgst))
          && Number.isFinite(Number(item.sgstAmount ?? item.sgst))
          && Number.isFinite(Number(item.igstAmount ?? item.igst))
        ));
      if (billType === BILL_TYPES.GST && !hasServerTaxData) {
        throw new Error(`Invoice ${generatedInvoiceNo} was saved, but the server response did not include its calculated tax totals and item breakdown. No payment was recorded; contact support before retrying.`);
      }
      const authoritativeSubtotal = hasServerTaxData ? serverSubtotal : subtotal;
      const authoritativeGstAmount = hasServerTaxData ? serverGstAmount : gstAmount;
      const authoritativeGrandTotal = hasServerTaxData ? serverGrandTotal : grandTotal;
      const authoritativeReceivedAmount = normalizedStatus === 'paid'
        ? authoritativeGrandTotal
        : Math.max(Math.min(paidAmount, authoritativeGrandTotal), 0);
      const authoritativeTaxPricingMode = String(
        savedInvoice?.taxPricingMode || (isGstBill ? taxPriceMode : TAX_PRICE_MODES.EXCLUSIVE)
      ).toLowerCase() === TAX_PRICE_MODES.INCLUSIVE
        ? TAX_PRICE_MODES.INCLUSIVE
        : TAX_PRICE_MODES.EXCLUSIVE;
      const authoritativePlaceOfSupplyState = normalizeIndianGstState(
        savedInvoice?.placeOfSupplyState ?? placeOfSupplyState
      );
      const authoritativeTaxComponentType = savedInvoice?.taxComponentType === 'IGST'
        || serverItems.some((item) => Number(item.igstAmount ?? item.igst ?? 0) > 0)
        || isInterStateSupply
        ? 'IGST'
        : 'CGST_SGST';
      const authoritativeItems = hasServerTaxData
        ? serverItems.map((item, index) => {
          const enteredPrice = Number(item.enteredPrice ?? item.price ?? cart[index].price);
          return {
            name: item.name ?? item.productName ?? cart[index].name,
            hsn: item.hsn ?? item.hsnCode ?? item.hsnSac ?? cart[index].hsn,
            qty: Number(item.qty ?? item.quantity ?? cart[index].qty),
            price: Number(item.price ?? item.enteredPrice ?? cart[index].price),
            enteredPrice,
            gst: Number(item.gstRate ?? item.gst),
            taxableAmount: Number(item.taxableAmount),
            taxAmount: Number(item.taxAmount),
            cgstAmount: Number(item.cgstAmount ?? item.cgst ?? 0),
            sgstAmount: Number(item.sgstAmount ?? item.sgst ?? 0),
            igstAmount: Number(item.igstAmount ?? item.igst ?? 0),
          };
        })
        : cart.map((item) => {
          const taxSummary = getItemTaxSummary(item, item.qty);
          return {
            name: item.name,
            hsn: item.hsn,
            qty: Number(item.qty) || 0,
            price: Number(item.price) || 0,
            enteredPrice: Number(item.price) || 0,
            gst: Number(taxSummary.gstRate) || 0,
            taxableAmount: taxSummary.taxableAmount,
            taxAmount: taxSummary.taxAmount,
            cgstAmount: taxSummary.cgstAmount,
            sgstAmount: taxSummary.sgstAmount,
            igstAmount: taxSummary.igstAmount,
          };
        });
      const receivedAmount = authoritativeReceivedAmount;
      logger.info('Invoice generated and saved', { invoiceNo: generatedInvoiceNo, billType });

      let paymentRecorded = !shouldRecordPayment;
      let paymentWarning = '';
      if (shouldRecordPayment) {
        const invoiceId = savedInvoice?.id ?? savedInvoice?.invoiceId ?? result?.id ?? result?.invoiceId;
        if (invoiceId == null) {
          paymentWarning = 'The server did not return an invoice ID for recording the payment.';
        } else {
          const paymentEndpoint = billType === BILL_TYPES.NON_GST
            ? API_ENDPOINTS.nonGstInvoicePaymentsById(invoiceId)
            : API_ENDPOINTS.invoicePaymentsById(invoiceId);
          try {
            const paymentResponse = await apiFetch(paymentEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                amount: receivedAmount,
                method: normalizePaymentMethod(paymentMethod),
                referenceNo: null,
                idempotencyKey: createSecureIdempotencyKey(),
              }),
            });
            const paymentResult = await paymentResponse.json().catch(() => ({}));
            if (!paymentResponse.ok) {
              throw new Error(paymentResult.message || paymentResult.error
                || `Payment could not be recorded (${paymentResponse.status}).`);
            }
            paymentRecorded = true;
          } catch (paymentError) {
            paymentWarning = paymentError.message || 'Payment recording could not be confirmed.';
            logger.error('Invoice saved but payment recording failed', {
              invoiceId,
              invoiceNo: generatedInvoiceNo,
              error: paymentWarning,
            });
          }
        }
      }

      const recordedAmount = paymentRecorded ? receivedAmount : 0;
      const recordedStatus = paymentRecorded
        ? receivedAmount >= authoritativeGrandTotal ? 'paid' : normalizedStatus
        : 'pending';
      const recordedBalance = resolveCustomerDueState(previousBalance, authoritativeGrandTotal, recordedAmount).totalDueAmount;
      setPaymentStatus(recordedStatus);

      let customerBalanceWarning = '';
      try {
        const customerProfileId = savedInvoice?.customerProfileId
          ?? savedInvoice?.customerProfile?.id
          ?? result?.customerProfileId
          ?? result?.customerProfile?.id
          ?? customerBalanceSnapshot.profileId;
        if (customerProfileId != null
          && !(await syncCustomerProfileDueBalance(customerProfileId, recordedBalance))) {
          customerBalanceWarning = 'The invoice was saved, but the customer profile balance could not be synchronized.';
        }
      } catch (error) {
        logger.warn('Customer profile sync skipped after invoice save', error);
        customerBalanceWarning = 'The invoice was saved, but the customer profile balance could not be synchronized.';
      }

      const returnedIssuerSnapshot = savedInvoice?.issuerSnapshot
        ?? result?.issuerSnapshot
        ?? savedInvoice
        ?? {};
      const issuerSnapshot = {
        issuerType: returnedIssuerSnapshot.issuerType || issuerType,
        issuerName: returnedIssuerSnapshot.issuerName
          || savedInvoice?.issuerName
          || result?.issuerName
          || selectedIssuerProfile.businessName,
        issuerGstin: returnedIssuerSnapshot.issuerGstin
          ?? savedInvoice?.issuerGstin
          ?? selectedIssuerProfile.gstin
          ?? '',
        issuerAddress: returnedIssuerSnapshot.issuerAddress
          ?? savedInvoice?.issuerAddress
          ?? selectedIssuerProfile.address
          ?? '',
        issuerPhone: returnedIssuerSnapshot.issuerPhone
          ?? savedInvoice?.issuerPhone
          ?? selectedIssuerProfile.phone
          ?? '',
        issuerEmail: returnedIssuerSnapshot.issuerEmail
          ?? savedInvoice?.issuerEmail
          ?? selectedIssuerProfile.email
          ?? '',
      };
      const invoiceIssuerProfile = resolveInvoiceIssuerProfile(
        { issuerSnapshot },
        selectedIssuerProfile
      );

      const previewInvoice = {
        invoiceNo: generatedInvoiceNo,
        customerName: savedInvoice?.customerName || customer.name || 'Walk-in Customer',
        customerPhone: customer.phone || '0000000000',
        customerEmail: customer.email || '',
        customerState: authoritativePlaceOfSupplyState,
        placeOfSupplyState: authoritativePlaceOfSupplyState,
        paymentMethod,
        paymentStatus: recordedStatus,
        paidAmount: recordedAmount,
        amountPaid: recordedAmount,
        receivedAmount: recordedAmount,
        previousBalance,
        balanceAmount: recordedBalance,
        currentBalance: recordedBalance,
        billType,
        taxPricingMode: authoritativeTaxPricingMode,
        taxComponentType: authoritativeTaxComponentType,
        issuerType: issuerSnapshot.issuerType,
        issuerName: issuerSnapshot.issuerName,
        issuerGstin: issuerSnapshot.issuerGstin,
        issuerAddress: issuerSnapshot.issuerAddress,
        issuerPhone: issuerSnapshot.issuerPhone,
        issuerEmail: issuerSnapshot.issuerEmail,
        issuerSnapshot,
        shopProfile: invoiceIssuerProfile,
        subtotal: authoritativeSubtotal,
        gst: authoritativeGstAmount,
        grandTotal: authoritativeGrandTotal,
        items: authoritativeItems,
      };

      if (paymentWarning || customerBalanceWarning) {
        alert([
          paymentWarning && `Invoice ${generatedInvoiceNo} was saved, but its payment could not be confirmed. Check the Payment report or Sales page before recording it again. ${paymentWarning}`,
          customerBalanceWarning,
        ].filter(Boolean).join('\n'));
      }
      openInvoiceWindow(previewInvoice);

      await refreshProducts();
      setCart([]);
      setCustomer({ name: '', phone: '', email: '', state: '' });
      setInvoiceNo(generatedInvoiceNo);
    } catch (error) {
      if (invoiceRequestStarted && (!invoiceResponseReceived || invoiceOutcomeUncertain)) {
        markInvoiceRecoveryRequired(submittedInvoiceNumber || 'unknown');
      }
      logger.error('Invoice generation failed', error);
      alert(`❌ ${error.message || 'Failed to generate invoice. Please try again.'}`);
    } finally {
      invoiceSubmissionInProgressRef.current = false;
      setIsSubmittingInvoice(false);
    }
  };

  const clearPaymentScreenshot = () => {
    setPaymentScreenshot(null);
    setPaymentScreenshotError('');
    if (paymentScreenshotInputRef.current) paymentScreenshotInputRef.current.value = '';
  };

  const generateInvoice = async () => {
    if (!isBillingWritable) {
      alert('Your role has read-only billing access.');
      return;
    }

    if (resolvingIssuerProfile) return;

    if (invoiceRecoveryInvoiceNo) {
      alert(`Invoice ${invoiceRecoveryInvoiceNo} may already have been saved. Check the invoice history before allowing another submission.`);
      return;
    }

    if (cart.length === 0) {
      alert('Add items to cart first!');
      return;
    }

    if (billType === BILL_TYPES.GST) {
      const invoiceErrors = gstInvoiceValidationErrors.filter(
        (message) => message !== ISSUER_STATE_CONFIGURATION_ERROR
      );
      if (invoiceErrors.length > 0) {
        alert(invoiceErrors.join('\n'));
        return;
      }

      if (!issuerStateCode) {
        setResolvingIssuerProfile(true);
        try {
          const issuer = await resolveIssuerProfileBeforeGstInvoice();
          if (!issuer.stateCode) {
            alert(ISSUER_STATE_CONFIGURATION_ERROR);
            return;
          }
        } finally {
          setResolvingIssuerProfile(false);
        }
      }
    }

    clearPaymentScreenshot();
    setPaymentDialog({ open: true, step: 'payment-check' });
  };

  const handlePaymentDialogChoice = (paymentCollected) => {
    if (paymentCollected) {
      clearPaymentScreenshot();
      setPartialPaymentAmount('');
      setShowPartialInvoiceAction(false);
      setPaymentDialog({ open: false, step: 'payment-check' });
      submitInvoice('paid');
      return;
    }

    setPartialPaymentAmount('');
    setShowPartialInvoiceAction(false);
    setPaymentDialog({ open: true, step: 'pending-confirmation' });
  };

  const handlePendingInvoiceDecision = (decision) => {
    if (decision === 'cancel') {
      clearPaymentScreenshot();
      setPartialPaymentAmount('');
      setShowPartialInvoiceAction(false);
      setPaymentDialog({ open: false, step: 'payment-check' });
      return;
    }

    if (decision === 'partial-select') {
      const amount = Number(partialPaymentAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        alert('Enter a valid partial payment amount before continuing.');
        return;
      }
      if (amount > grandTotal) {
        alert(`Partial payment cannot exceed the invoice total of ₹${grandTotal.toLocaleString()}.`);
        return;
      }
      setShowPartialInvoiceAction(true);
      return;
    }

    if (decision === 'partial-final') {
      const amount = Number(partialPaymentAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        alert('Enter a valid partial payment amount before creating the final invoice.');
        return;
      }
      if (amount > grandTotal) {
        alert(`Partial payment cannot exceed the invoice total of ₹${grandTotal.toLocaleString()}.`);
        return;
      }
      clearPaymentScreenshot();
      setPartialPaymentAmount('');
      setShowPartialInvoiceAction(false);
      setPaymentDialog({ open: false, step: 'payment-check' });
      submitInvoice('partial', amount);
      return;
    }

    clearPaymentScreenshot();
    setPartialPaymentAmount('');
    setShowPartialInvoiceAction(false);
    setPaymentDialog({ open: false, step: 'payment-check' });
    submitInvoice('pending');
  };
  
  if (loading) {
    return (
      <div className="billing-page">
        <div className="loading">🔄 Loading products from inventory...</div>
      </div>
    );
  }
  
  return (
    <div className="billing-page">
      <header className="page-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          ← Back to Dashboard
        </button>
        <div className="billing-header-copy">
          <h1>POS Billing</h1>
          <p>
            Invoice #{invoiceNo} | Cart: {cart.length} products · {cartQuantity} units
          </p>
          {!isBillingWritable && <p className="error-text">Read-only mode: billing viewer access.</p>}
        </div>
      </header>

      {paymentDialog.open && (
        <div className="payment-dialog-overlay" onClick={() => setPaymentDialog({ open: false, step: 'payment-check' })}>
          <div className="payment-dialog-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            {paymentDialog.step === 'payment-check' ? (
              <>
                <div className="payment-dialog-icon">💳</div>
                <h3>Confirm payment status</h3>
                <p>Has payment been collected for this sale?</p>
                <div className="payment-dialog-actions">
                  <button type="button" className="dialog-btn dialog-btn-secondary" onClick={() => handlePaymentDialogChoice(false)}>
                    No, pending
                  </button>
                  <button type="button" className="dialog-btn dialog-btn-primary" onClick={() => handlePaymentDialogChoice(true)}>
                    Yes, paid
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="payment-dialog-icon warning">⚠️</div>
                <h3>Pending payment</h3>

                <div className="partial-payment-customer-meta">
                  <div className="partial-payment-customer-name">
                    Customer: <strong>{customer?.name || 'Walk-in Customer'}</strong>
                  </div>
                  <div className="partial-payment-due-pill">
                    Due balance: ₹{readCustomerDueBalance(customer).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="partial-payment-field-wrap">
                  <label htmlFor="partial-payment-amount" className="partial-payment-label">Amount received</label>
                  <input
                    id="partial-payment-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    className="partial-payment-input"
                    value={partialPaymentAmount}
                    onChange={(event) => {
                      setPartialPaymentAmount(event.target.value);
                      setShowPartialInvoiceAction(false);
                    }}
                    placeholder={`Enter amount up to ₹${grandTotal.toLocaleString()}`}
                  />
                  <div className="partial-payment-hint">
                    {partialPaymentAmount && Number(partialPaymentAmount) > 0
                      ? `Balance due: ₹${Math.max(grandTotal - Number(partialPaymentAmount), 0).toLocaleString()}`
                      : `Total bill: ₹${grandTotal.toLocaleString()}`}
                  </div>
                </div>

                <div className="payment-dialog-actions">
                  <button type="button" className="dialog-btn dialog-btn-secondary" onClick={() => handlePendingInvoiceDecision('cancel')}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="dialog-btn dialog-btn-primary"
                    onClick={() => {
                      if (showPartialInvoiceAction) {
                        handlePendingInvoiceDecision('partial-final');
                        return;
                      }
                      handlePendingInvoiceDecision('partial-select');
                    }}
                  >
                    {showPartialInvoiceAction ? 'Create final invoice' : 'Partially paid'}
                  </button>
                </div>
              </>
            )}
            <div className="payment-screenshot-field">
              <label className="payment-screenshot-button" htmlFor="invoice-payment-screenshot">
                Upload payment screenshot
              </label>
              <input
                ref={paymentScreenshotInputRef}
                id="invoice-payment-screenshot"
                className="payment-screenshot-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-describedby="invoice-payment-screenshot-note"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  if (file && (!PAYMENT_SCREENSHOT_TYPES.includes(file.type)
                    || file.size === 0
                    || file.size > MAX_PAYMENT_SCREENSHOT_SIZE)) {
                    setPaymentScreenshot(null);
                    event.target.value = '';
                    setPaymentScreenshotError('Choose a PNG, JPEG, or WebP image up to 5 MB.');
                    return;
                  }
                  setPaymentScreenshotError('');
                  setPaymentScreenshot(file);
                }}
              />
              <span id="invoice-payment-screenshot-note" className="payment-screenshot-note">
                {paymentScreenshot
                  ? `${paymentScreenshot.name} selected. Screenshot is not saved yet.`
                  : 'Optional · PNG, JPEG, or WebP · up to 5 MB'}
              </span>
              {paymentScreenshotError && (
                <span className="payment-screenshot-error" role="alert">{paymentScreenshotError}</span>
              )}
              {paymentScreenshotPreview && (
                <div className="payment-screenshot-preview">
                  <img src={paymentScreenshotPreview} alt="Selected payment screenshot" />
                  <button type="button" className="payment-screenshot-remove" onClick={clearPaymentScreenshot}>
                    Remove screenshot
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="billing-layout">
        {/* Left: Customer + Products */}
        <div className="billing-left">
          <div className="customer-section">
            <h3>👤 Customer Details</h3>
            <div className="customer-name-field-wrap">
              <input 
                placeholder="Customer Name" 
                value={customer.name}
                onChange={e => {
                  const nextValue = e.target.value;
                  setCustomer({ ...customer, name: nextValue });
                  setCustomerSelectionLocked(false);
                  if (!nextValue.trim()) {
                    setCustomerSuggestions([]);
                  }
                }}
                className="input-field"
                disabled={!isBillingWritable}
              />
              {!customerSelectionLocked && customerSuggestions.length > 0 && (
                <div className="customer-suggestions">
                  {customerSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.key}
                      type="button"
                      className="customer-suggestion-item"
                      onClick={() => {
                        setCustomer({
                          name: suggestion.name,
                          phone: suggestion.phone || customer.phone,
                          email: suggestion.email || customer.email,
                          state: normalizeIndianGstState(suggestion.state) || customer.state,
                        });
                        setCustomerSuggestions([]);
                        setCustomerSelectionLocked(true);
                      }}
                    >
                      <span className="customer-suggestion-name">{suggestion.name}</span>
                      {suggestion.phone && <span className="customer-suggestion-meta">{suggestion.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input 
              placeholder="📱 Phone" 
              value={customer.phone}
              onChange={e => setCustomer({...customer, phone: e.target.value})}
              className="input-field"
              disabled={!isBillingWritable}
            />
            <input 
              placeholder="✉️ Email (optional)" 
              value={customer.email}
              onChange={e => setCustomer({...customer, email: e.target.value})}
              className="input-field"
              disabled={!isBillingWritable}
            />
            {isGstBill && (
              <label className="place-of-supply-control" htmlFor="place-of-supply-state">
                <span>Buyer’s place-of-supply state *</span>
                <select
                  id="place-of-supply-state"
                  value={placeOfSupplyState}
                  onChange={(event) => setCustomer({ ...customer, state: event.target.value })}
                  className="input-field"
                  required
                  disabled={!isBillingWritable}
                >
                  <option value="">Select state</option>
                  {INDIAN_GST_STATES.map(({ code, name }) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
                {issuerStateCode && (
                  <small>Invoice issuer state: {INDIAN_GST_STATES.find(({ code }) => code === issuerStateCode)?.name || issuerStateCode}</small>
                )}
              </label>
            )}
          </div>

          <div className="products-section">
            <div className="section-header">
              <h3>📦 Products ({filteredProducts.length})</h3>
              <input 
                className="search-input"
                placeholder="🔍 Search products or scan barcode..."
                value={searchProduct}
                onChange={e => setSearchProduct(e.target.value)}
              />
            </div>
            <div className="products-grid">
              {productLoadError ? (
                <div className="product-load-error" role="alert">
                  <span>{productLoadError}</span>
                  <button type="button" className="product-load-retry" onClick={refreshProducts}>
                    Retry
                  </button>
                </div>
              ) : filteredProducts.length > 0 ? (
                filteredProducts.map(product => (
                  <div key={product.id} className="product-card" onClick={() => isBillingWritable && addToCart(product)}>
                    <div className="product-info">
                      <div className="product-card-topline">
                        <h4>{product.name}</h4>
                        {Number(product.salesCount ?? 0) > 0 && (
                          <span className="product-popular-tag">Popular</span>
                        )}
                      </div>
                      <p className="price-gst">
                        ₹{product.price.toLocaleString()}
                        {isGstBill && (
                          hasValidGstConfiguration(product)
                            ? taxPriceMode === TAX_PRICE_MODES.INCLUSIVE
                              ? ` (incl. ${product.gstRate}% ${isInterStateSupply ? 'IGST' : 'GST'})`
                              : ` + ${product.gstRate}% ${isInterStateSupply ? 'IGST' : 'GST'}`
                            : ` (${getGstConfigurationMessage(product)})`
                        )}
                        {Number(product.mrp ?? 0) > 0 && (
                          <span className="mrp-tag"> | MRP ₹{Number(product.mrp).toLocaleString()}</span>
                        )}
                      </p>
                      <small>
                        HSN: {product.hsn || 'Missing'} | Stock: {product.stock}
                        {Number(product.salesCount ?? 0) > 0 ? ` | Sold: ${product.salesCount}` : ''}
                      </small>
                    </div>
                  </div>
                ))
              ) : (
                <div className="no-products">No products found</div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Cart + Payment */}
        <div className="billing-right">
          <div className="cart-section">
            <h3>🛒 Cart ({cart.length} products · {cartQuantity} units)</h3>
            <p className="cart-live-notice" aria-live="polite">{cartNotice}</p>
            <div className="cart-items" ref={cartItemsRef} aria-label="Cart items">
              {cart.length === 0 ? (
                <p className="cart-empty-state">Your cart is empty. Select a product to get started.</p>
              ) : cart.map(item => {
                const taxSummary = getItemTaxSummary(item);
                const lineTaxSummary = getItemTaxSummary(item, item.qty);
                const itemTotalWithGst = lineTaxSummary.itemTotal;
                const hasGstConfiguration = hasValidGstConfiguration(item);
                
                return (
                  <div
                    key={item.id}
                    className="cart-item"
                    ref={(element) => {
                      if (element) cartItemRefs.current.set(item.id, element);
                      else cartItemRefs.current.delete(item.id);
                    }}
                  >
                    <div className="cart-item-left">
                      <h4>{item.name}</h4>
                      <div className="cart-price-row">
                        <span className="price-display">
                          ₹{item.price.toLocaleString('en-IN', {minimumFractionDigits: 2})}
                        </span>
                        {isGstBill ? (
                          <span className="gst-equation">
                            {!hasGstConfiguration
                              ? getGstConfigurationMessage(item)
                              : taxPriceMode === TAX_PRICE_MODES.INCLUSIVE
                                ? `${taxSummary.gstRate}% ${isInterStateSupply ? 'IGST' : 'GST'} included`
                                : `+ ${taxSummary.gstRate}% ${isInterStateSupply ? 'IGST' : 'GST'}`}
                          </span>
                        ) : null}
                        <span className="item-total-equation">
                          = ₹{itemTotalWithGst.toLocaleString('en-IN', {minimumFractionDigits: 2})}
                        </span>
                      </div>
                      <p className="qty-text">Qty: {item.qty} | Stock: {item.stock}</p>
                    </div>
                    <div className="cart-item-right">
                      <div className="qty-controls">
                        <button onClick={() => updateQty(item.id, item.qty - 1)} disabled={!isBillingWritable}>-</button>
                        <input
                          className="quantity-input"
                          type="number"
                          min="0"
                          max={item.stock}
                          step="1"
                          value={quantityDrafts[item.id] ?? String(item.qty)}
                          onChange={(event) => setQuantityDrafts(currentDrafts => ({
                            ...currentDrafts,
                            [item.id]: event.target.value,
                          }))}
                          onBlur={(event) => commitQuantity(item.id, event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                          }}
                          aria-label={`Quantity of ${item.name}`}
                          disabled={!isBillingWritable}
                        />
                        <button onClick={() => updateQty(item.id, item.qty + 1)} disabled={!isBillingWritable}>+</button>
                        <button className="remove" onClick={() => removeFromCart(item.id)} disabled={!isBillingWritable}>✕</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="totals" aria-live="polite" aria-atomic="true">
              {itemsMissingGstConfiguration.length > 0 && (
                <p className="tax-setup-warning" role="alert">
                  {itemsMissingGstConfiguration.map((item) => `${item.name}: ${getGstConfigurationMessage(item)}.`).join(' ')}
                </p>
              )}
              {missingPlaceOfSupplyState && (
                <p className="tax-setup-warning" role="alert">Select the buyer’s place-of-supply state before creating a GST invoice.</p>
              )}
              {missingIssuerState && (
                <p className="tax-setup-warning" role="alert">Set the selected issuer’s state or configure a valid GSTIN before creating a GST invoice.</p>
              )}
              <div className="total-row">
                <span>{taxPriceMode === TAX_PRICE_MODES.INCLUSIVE && isGstBill ? 'Taxable subtotal:' : 'Subtotal:'}</span>
                <span>₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {isGstBill && (
                <div className="total-row gst-row">
                  <span>{gstSummaryLabel}:</span>
                  <span>₹{gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="grand-total">
                <span>Grand Total:</span>
                <span>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            {hasStoreGstRegistration ? (
              <button
                type="button"
                className={`bill-type-toggle ${isGstBill ? 'gst' : 'non-gst'}`}
                onClick={() => {
                  if (!isBillingWritable) return;
                  const nextBillType = isGstBill ? BILL_TYPES.NON_GST : BILL_TYPES.GST;
                  setBillType(nextBillType);
                  if (nextBillType === BILL_TYPES.GST && !canIssueOrganizationGstInvoice) {
                    setIssuerType('STORE');
                  }
                }}
                aria-label={`Switch to ${isGstBill ? 'Non-GST' : 'GST'} billing`}
                aria-pressed={isGstBill}
                disabled={!isBillingWritable}
              >
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
                <span className="toggle-label">{isGstBill ? 'GST' : 'Non-GST'}</span>
              </button>
            ) : (
              <p className="invoice-issuer-hint" role="status">
                {gstRegistrationReady
                  ? 'GST billing is unavailable without a valid store GSTIN. Only Non-GST bills can be created.'
                  : 'Checking the store GST registration...'}
              </p>
            )}

            {isGstBill && (
              <fieldset className="tax-price-mode-control" disabled={!isBillingWritable}>
                <legend>GST price setting</legend>
                <label>
                  <input
                    type="radio"
                    name="tax-price-mode"
                    value={TAX_PRICE_MODES.EXCLUSIVE}
                    checked={taxPriceMode === TAX_PRICE_MODES.EXCLUSIVE}
                    onChange={() => setTaxPriceMode(TAX_PRICE_MODES.EXCLUSIVE)}
                  />
                  Add GST to price
                </label>
                <label>
                  <input
                    type="radio"
                    name="tax-price-mode"
                    value={TAX_PRICE_MODES.INCLUSIVE}
                    checked={taxPriceMode === TAX_PRICE_MODES.INCLUSIVE}
                    onChange={() => setTaxPriceMode(TAX_PRICE_MODES.INCLUSIVE)}
                  />
                  Price includes GST
                </label>
              </fieldset>
            )}

            <div className="invoice-issuer-control">
              <label htmlFor="invoice-issuer">Invoice issued by</label>
              <select
                id="invoice-issuer"
                value={issuerType}
                onChange={(event) => setIssuerType(event.target.value)}
                className="payment-select"
                disabled={!isBillingWritable}
              >
                <option value="STORE">Store — {shopDisplayName}</option>
                <option
                  value="ORGANIZATION"
                  disabled={
                    isGstBill
                      ? !canIssueOrganizationGstInvoice
                      : !canIssueOrganizationInvoice
                  }
                >
                  {assignedOrganizationName
                    ? `Organization — ${assignedOrganizationName}`
                    : issuerProfileReady
                      ? 'Organization — no organization assigned'
                      : 'Organization — loading assignment'}
                </option>
              </select>
              {isGstBill && assignedOrganizationName && !canIssueOrganizationGstInvoice && (
                <small className="invoice-issuer-hint">
                  Organization-issued GST invoices require the assigned organization’s GSTIN and address.
                </small>
              )}
              {resolvingIssuerProfile && (
                <small className="invoice-issuer-hint" role="status">
                  Checking the selected issuer’s tax registration...
                </small>
              )}
              {!issuerProfileReady && (
                <small className="invoice-issuer-hint">
                  Organization invoicing is unavailable until the store assignment is verified.
                </small>
              )}
            </div>

            <div className="payment-section">
              {invoiceRecoveryInvoiceNo && (
                <div className="invoice-recovery-warning" role="alert">
                  <p>
                    Invoice {invoiceRecoveryInvoiceNo} may already be saved. Check invoice history before retrying to avoid a duplicate; confirm payment separately if the invoice was saved.
                  </p>
                  <div className="invoice-recovery-actions">
                    <button
                      type="button"
                      onClick={() => {
                        clearInvoiceRecoveryRequired();
                        setCart([]);
                        setCustomer({ name: '', phone: '', email: '', state: '' });
                      }}
                    >
                      Invoice was saved - clear cart
                    </button>
                    <button type="button" onClick={clearInvoiceRecoveryRequired}>
                      I verified no invoice was saved
                    </button>
                  </div>
                </div>
              )}
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="payment-select" disabled={!isBillingWritable}>
                <option>UPI (PhonePe/GPay)</option>
                <option>Card</option>
                <option>Cash</option>
                <option>Wallet</option>
              </select>
              <div className={`payment-status-pill ${paymentStatus === 'paid' ? 'paid' : paymentStatus === 'partial' ? 'partial' : 'pending'}`}>
                {paymentStatus === 'paid' ? 'Payment: Paid' : paymentStatus === 'partial' ? 'Payment: Partial' : 'Payment: Pending'}
              </div>
              <button className="pay-btn primary" onClick={generateInvoice} disabled={!isBillingWritable || cart.length === 0 || isSubmittingInvoice || resolvingIssuerProfile || Boolean(invoiceRecoveryInvoiceNo)}>
                {resolvingIssuerProfile ? 'Checking issuer...' : isSubmittingInvoice ? 'Saving invoice...' : `💳 Pay ₹${grandTotal.toLocaleString()}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingPage;
