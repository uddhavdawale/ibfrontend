import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './BillingPage.css';
import logger from '../utils/logger';
import { API_ENDPOINTS, apiFetch } from '../Config/api';
import { buildInvoicePdf } from '../utils/invoicePdf';
import createSecureIdempotencyKey from '../utils/createSecureIdempotencyKey';
import { getCurrentShopProfile, getShopDisplayName, readStoredShopProfile } from '../modules/shopProfile/shopProfileService';
import { BILL_TYPES, buildTaxProfileForItem, getLegacyGstSlab, resolveCategoryTax } from '../modules/tax/gstConfig';
import { canWriteBilling, getCurrentUserRole } from '../Security/storeRoles';

const PAYMENT_SCREENSHOT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PAYMENT_SCREENSHOT_SIZE = 5 * 1024 * 1024;
const normalizePaymentMethod = (method) => {
  const normalizedMethod = String(method || '').trim().toUpperCase();
  if (normalizedMethod.startsWith('UPI')) return 'UPI';
  if (normalizedMethod.includes('CARD')) return 'CARD';
  if (normalizedMethod.includes('CASH')) return 'CASH';
  if (normalizedMethod.includes('WALLET')) return 'WALLET';
  return 'OTHER';
};

const BillingPage = () => {
  const navigate = useNavigate();
  
  // POS State
  const [cart, setCart] = useState([]);
  const [quantityDrafts, setQuantityDrafts] = useState({});
  const [cartNotice, setCartNotice] = useState('');
  const [latestAddedProductId, setLatestAddedProductId] = useState(null);
  const cartItemsRef = useRef(null);
  const cartItemRefs = useRef(new Map());
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [customerSelectionLocked, setCustomerSelectionLocked] = useState(false);
  const [searchProduct, setSearchProduct] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('INV-001');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [billType, setBillType] = useState(BILL_TYPES.GST);
  const [editingPriceId, setEditingPriceId] = useState(null);
  const [paymentDialog, setPaymentDialog] = useState({ open: false, step: 'payment-check' });
  const [partialPaymentAmount, setPartialPaymentAmount] = useState('');
  const [showPartialInvoiceAction, setShowPartialInvoiceAction] = useState(false);
  const [paymentScreenshot, setPaymentScreenshot] = useState(null);
  const [paymentScreenshotPreview, setPaymentScreenshotPreview] = useState('');
  const [paymentScreenshotError, setPaymentScreenshotError] = useState('');
  const paymentScreenshotInputRef = useRef(null);
  
  // Dynamic Products
  const [products, setProducts] = useState([]);
  const [shopProfile, setShopProfile] = useState(() => readStoredShopProfile());
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(() => getCurrentUserRole());
  const shopDisplayName = getShopDisplayName(shopProfile);
  const isBillingWritable = canWriteBilling(role);

  useEffect(() => {
    if (!paymentScreenshot) {
      setPaymentScreenshotPreview('');
      return undefined;
    }

    const previewUrl = URL.createObjectURL(paymentScreenshot);
    setPaymentScreenshotPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [paymentScreenshot]);
  
  // ✅ Centralized GST logic lives in src/modules/tax/gstConfig.js
  const getGstSlab = (price, category = '') => {
    const configuredRate = resolveCategoryTax(category, 0).total;
    if (configuredRate > 0) return configuredRate;
    return getLegacyGstSlab(price);
  };
  
  const refreshProducts = async () => {
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
        const categoryTax = resolveCategoryTax(category, Number(product.gst ?? product.taxRate ?? 0) || getGstSlab(sellingPrice, category));

        return {
          id: product.id ?? product.productId,
          name: product.name || product.itemName || product.productName,
          sku: product.sku || product.code || '',
          category,
          price: sellingPrice,
          mrp: mrpValue,
          hsn: product.hsn || product.hsnCode || '9999',
          gst: categoryTax.total,
          cgst: categoryTax.cgst,
          sgst: categoryTax.sgst,
          igst: categoryTax.igst,
          stock: Number(product.quantity ?? product.stock ?? product.ItemQty ?? product.qty ?? 0) || 0,
          salesCount: Number(product.salesCount ?? product.soldQty ?? product.purchaseCount ?? product.popularity ?? 0) || 0,
        };
      });
      setProducts(productsWithGst);
    } catch (error) {
      logger.error('Billing product fetch failed', error);
      setProducts([
        { id: 1, name: 'Shirt', hsn: '6109', price: 299, mrp: 349, gst: 5, stock: 12 },
        { id: 2, name: 'Jeans', hsn: '6203', price: 799, mrp: 999, gst: 12, stock: 8 },
        { id: 3, name: 'Laptop', hsn: '8471', price: 45999, mrp: 48999, gst: 18, stock: 5 }
      ]);
    }
  };

  // Fetch products
  useEffect(() => {
    setRole(getCurrentUserRole());

    let active = true;

    getCurrentShopProfile(true)
      .then((profile) => {
        if (active) setShopProfile(profile);
      })
      .catch(() => {
        if (active) setShopProfile(readStoredShopProfile());
      });

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
          if (!matchName && !matchPhone) return acc;
          const key = `${matchName || 'Unknown'}|${matchPhone || ''}`;
          if (acc.some((item) => item.key === key)) return acc;
          acc.push({
            key,
            name: matchName || 'Unknown customer',
            phone: matchPhone,
            email: matchEmail,
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
  const getItemTaxSummary = (item) => buildTaxProfileForItem({ ...item, category: item.category || 'default', gst: Number(item.gst ?? 0) || 0 }, billType);
  const isGstBill = billType === BILL_TYPES.GST;
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const gstAmount = cart.reduce((sum, item) => sum + getItemTaxSummary(item).taxAmount, 0);
  const grandTotal = billType === BILL_TYPES.NON_GST ? subtotal : subtotal + gstAmount;
  const cartQuantity = cart.reduce((sum, item) => sum + item.qty, 0);
  const gstSummaryLabel = billType === BILL_TYPES.NON_GST
    ? 'GST (0%)'
    : `GST (${cart.length > 0 ? `${((gstAmount / Math.max(subtotal, 1)) * 100).toFixed(1)}%` : '0%'})`;

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
  
  // ✅ FIXED: Update price
  const updatePrice = (id, newPrice) => {
    if (!isBillingWritable) return;
    setCart(currentCart => currentCart.map(item =>
      item.id === id ? { ...item, price: parseFloat(newPrice) || item.price } : item
    ));
  };
  
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
    }
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
    const customerPhoneRaw = String(customer.phone || '').trim();
    const customerPhoneDigits = normalizeDigits(customer.phone);
    const customerName = String(customer.name || '').trim().toLowerCase();

    if (!customerPhoneDigits && !customerName) return 0;

    const fetchDueFromEndpoint = async (endpoint) => {
      try {
        const response = await apiFetch(endpoint);
        if (!response.ok) return null;
        const data = await response.json();
        const customers = toCustomerArray(data);
        if (!customers.length) return 0;

        const matchedByPhone = customerPhoneDigits
          ? customers.find((entry) => normalizeDigits(entry?.phone || entry?.mobile || entry?.contactNumber) === customerPhoneDigits)
          : null;

        const matchedByName = customerName
          ? customers.find((entry) => {
            const entryName = String(entry?.customerName || entry?.name || entry?.customer || '').trim().toLowerCase();
            return entryName === customerName;
          })
          : null;

        const selected = matchedByPhone || matchedByName || customers[0];
        return readCustomerDueBalance(selected);
      } catch {
        return null;
      }
    };

    if (customerPhoneDigits) {
      const phoneInputs = [...new Set([customerPhoneRaw, customerPhoneDigits].filter(Boolean))];
      const phoneEndpoints = phoneInputs.flatMap((phoneValue) => ([
        API_ENDPOINTS.customerByPhone(phoneValue),
        API_ENDPOINTS.customerProfileByPhone(phoneValue),
      ]));

      for (const endpoint of phoneEndpoints) {
        const amount = await fetchDueFromEndpoint(endpoint);
        if (amount !== null) return amount;
      }
    }

    if (customerName) {
      const nameEndpoints = [
        API_ENDPOINTS.customerSearch(customer.name),
        API_ENDPOINTS.customerProfilesSearch(customer.name),
      ];

      for (const endpoint of nameEndpoints) {
        const amount = await fetchDueFromEndpoint(endpoint);
        if (amount !== null) return amount;
      }
    }

    return 0;
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

  const generateInvoicePdf = async (invoiceData) => {
    const currentShopProfile = await getCurrentShopProfile(true);
    setShopProfile(currentShopProfile);
    return buildInvoicePdf({ ...invoiceData, shopProfile: currentShopProfile });
  };

  const resolveCustomerDueState = (previousBalanceValue, totalAmountValue, receivedAmountValue) => {
    const safePreviousBalance = Number(previousBalanceValue || 0);
    const safeTotalAmount = Number(totalAmountValue || 0);
    const safeReceivedAmount = Number(receivedAmountValue || 0);
    const invoiceDueAmount = Math.max(safeTotalAmount - safeReceivedAmount, 0);
    const totalDueAmount = Math.max(safePreviousBalance + invoiceDueAmount, 0);
    return { invoiceDueAmount, totalDueAmount };
  };

  const syncCustomerProfileDueBalance = async (balanceToStore) => {
    const cashCustomerName = String(customer?.name || '').trim();
    const cashCustomerPhone = normalizeDigits(customer?.phone || '');
    const amount = Math.max(Number(balanceToStore || 0), 0);

    if ((!cashCustomerPhone && !cashCustomerName) || !Number.isFinite(amount)) {
      return;
    }

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

    const candidateEndpoints = [];
    if (cashCustomerPhone) {
      candidateEndpoints.push(
        API_ENDPOINTS.customerProfileByPhone(cashCustomerPhone),
        API_ENDPOINTS.customerByPhone(cashCustomerPhone),
      );
    }
    if (cashCustomerName) {
      candidateEndpoints.push(
        API_ENDPOINTS.customerProfilesSearch(cashCustomerName),
        API_ENDPOINTS.customerSearch(cashCustomerName),
      );
    }

    const uniqueEndpoints = [...new Set(candidateEndpoints.filter(Boolean))];

    const tryUpdateProfile = async (url, method = 'PATCH') => {
      try {
        const response = await apiFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profileUpdatePayload),
        });

        if (response.ok) return true;

        if (response.status === 404) return false;

        const payload = await response.clone().json().catch(() => ({}));
        logger.warn('Customer profile due sync failed', { url, status: response.status, payload });
        return false;
      } catch (error) {
        logger.warn('Customer profile due sync exception', { url, error: error.message || String(error) });
        return false;
      }
    };

    const seenIds = new Set();
    for (const endpoint of uniqueEndpoints) {
      if (seenIds.has(endpoint)) continue;
      seenIds.add(endpoint);

      try {
        const response = await apiFetch(endpoint, { method: 'GET' });
        if (!response.ok) continue;

        const payload = await response.json().catch(() => null);
        const profileList = Array.isArray(payload) ? payload : (payload && typeof payload === 'object' ? toCustomerArray(payload) : []);
        const matchedProfile = profileList.find((entry) => {
          if (!cashCustomerPhone) return true;
          const phoneValue = normalizeDigits(String(entry?.phone || entry?.mobile || entry?.contactNumber || ''));
          return phoneValue === cashCustomerPhone;
        }) || profileList[0];

        if (matchedProfile?.id) {
          const profileEndpoint = API_ENDPOINTS.customerProfileById(matchedProfile.id);
          const updated = await tryUpdateProfile(profileEndpoint, 'PUT');
          if (updated) return;
        }

        const fallbackUpdated = await tryUpdateProfile(endpoint, 'PATCH');
        if (fallbackUpdated) return;
      } catch (error) {
        logger.warn('Customer profile lookup failed during due sync', { endpoint, error: error.message || String(error) });
      }
    }
  };

  const shareInvoiceViaWhatsApp = async (invoiceData) => {
    const customerPhone = String(invoiceData.customerPhone || '').replace(/\D/g, '');
    const whatsappPhone = customerPhone.length === 10 ? `91${customerPhone}` : customerPhone;
    const customerName = invoiceData.customerName || 'there';
    const invoiceShopName = getShopDisplayName(invoiceData.shopProfile || shopProfile);
    const whatsappMessage = `Hi ${customerName}! 😊\n\nThank you for shopping with ${invoiceShopName}. We truly appreciate your support and hope you enjoy your purchase.\n\nYour invoice ${invoiceData.invoiceNo} is ready. Total: ₹${invoiceData.grandTotal.toLocaleString('en-IN')}.\n\nIf you have any questions or need help, we're happy to assist. Have a wonderful day!\n\nWarm regards,\n${invoiceShopName}`;
    const whatsappUrl = `https://wa.me/${whatsappPhone || '919999999999'}?text=${encodeURIComponent(whatsappMessage)}`;
    window.open(whatsappUrl, '_blank');

    const pdf = await generateInvoicePdf(invoiceData);
    const pdfBlob = pdf.output('blob');
    const url = URL.createObjectURL(pdfBlob);

    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `invoice_${invoiceData.invoiceNo}.pdf`;
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

  const downloadInvoicePdf = async (invoiceData) => {
    const pdf = await generateInvoicePdf(invoiceData);
    pdf.save(`invoice_${invoiceData.invoiceNo}.pdf`);
  };

  const openInvoiceWindow = (invoiceData) => {
    const previewWindow = window.open('', '_blank');
    if (!previewWindow) {
      alert('Please allow pop-ups to view the generated invoice preview.');
      return;
    }

    const invoiceShopProfile = invoiceData.shopProfile || shopProfile;
    const isNonGst = invoiceData.billType === BILL_TYPES.NON_GST;
    const invoiceRows = invoiceData.items.map((item, index) => {
      const amount = Number(item.price) * Number(item.qty);
      const gstValue = isNonGst ? 0 : (amount * Number(item.gst || 0)) / 100;
      const total = amount + gstValue;
      if (isNonGst) {
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${item.name}</td>
            <td>${item.hsn || '9999'}</td>
            <td>${item.qty}</td>
            <td>₹${Number(item.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td>₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td>₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          </tr>
        `;
      }

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${item.name}</td>
          <td>${item.hsn || '9999'}</td>
          <td>${item.qty}</td>
          <td>₹${Number(item.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td>₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td>${item.gst || 0}%</td>
          <td>₹${gstValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td>₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
      `;
    }).join('');

    previewWindow.shareInvoiceViaWhatsApp = async () => shareInvoiceViaWhatsApp(invoiceData);
    previewWindow.shareInvoiceViaEmail = async () => shareInvoiceViaEmail(invoiceData);
    previewWindow.downloadInvoicePdf = async () => downloadInvoicePdf(invoiceData);

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
          <title>Invoice ${invoiceData.invoiceNo}</title>
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
                  <h1>${getShopDisplayName(invoiceShopProfile)}</h1>
                  <div class="brand-meta">GSTIN: ${invoiceShopProfile.gstin || invoiceShopProfile.gstNumber || ''}<br> ${invoiceShopProfile.address || ''}<br> ${invoiceShopProfile.phone || invoiceShopProfile.contactNumber || '+91 98765 43210'}<br> ${invoiceShopProfile.email || invoiceShopProfile.supportEmail || 'sales@ibenterprises.com'}</div>
                </div>
                <div class="invoice-summary">
                  <div><strong>Invoice:</strong> ${invoiceData.invoiceNo}</div>
                  <div><strong>Date:</strong> ${new Date().toLocaleDateString('en-IN')}</div>
                  <div><strong>Type:</strong> ${invoiceData.billType === BILL_TYPES.NON_GST ? 'Non-GST Bill' : 'GST Bill'}</div>
                  <div><strong>Status:</strong> <span class="status-pill ${invoiceData.paymentStatus === 'paid' ? 'status-paid' : 'status-pending'}">${invoiceData.paymentStatus}</span></div>
                </div>
              </div>
            </div>

            <div class="invoice-body">
              <div class="customer-grid">
                <div><strong>Customer:</strong> ${invoiceData.customerName}</div>
                <div><strong>Phone:</strong> ${invoiceData.customerPhone}</div>
                <div><strong>Email:</strong> ${invoiceData.customerEmail || 'N/A'}</div>
                <div><strong>Payment:</strong> ${invoiceData.paymentMethod}</div>
              </div>

              <div class="invoice-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Item</th>
                      <th>HSN</th>
                      <th>Qty</th>
                      <th>Rate</th>
                      <th>Amount</th>
                      ${invoiceData.billType === BILL_TYPES.NON_GST ? '' : '<th>GST%</th><th>GST</th>'}
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
                <div class="totals-row"><span>Subtotal</span><span>₹${invoiceData.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                ${invoiceData.billType === BILL_TYPES.NON_GST ? '' : `<div class="totals-row"><span>GST Total</span><span>₹${invoiceData.gst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>`}
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
                  <div class="summary-row"><span>Payment mode</span><span>${invoiceData.paymentMethod || 'Cash'}</span></div>
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
    if (!isBillingWritable) return;
    try {
      const normalizedStatus = status === 'paid' ? 'paid' : status === 'partial' ? 'partial' : 'pending';
      const paidAmount = Number(amountReceived) || 0;
      const receivedAmount = normalizedStatus === 'paid' ? grandTotal : Math.max(Math.min(paidAmount, grandTotal), 0);
      const previousBalance = await resolveCustomerPreviousBalance();
      const shouldRecordPayment = receivedAmount > 0;
      const initialPaymentStatus = shouldRecordPayment ? 'pending' : normalizedStatus;
      const initialPaidAmount = shouldRecordPayment ? 0 : receivedAmount;
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
        totalAmount: grandTotal,
        billType,
        isGstInvoice: billType === BILL_TYPES.GST,
        items: cart.map((item) => {
          const taxSummary = getItemTaxSummary(item);
          return {
            productId: item.id,
            name: item.name,
            sku: item.sku || '',
            hsn: item.hsn || '9999',
            gstRate: Number(taxSummary.gstRate) || 0,
            cgst: Number(taxSummary.cgst) || 0,
            sgst: Number(taxSummary.sgst) || 0,
            igst: Number(taxSummary.igst) || 0,
            price: Number(item.price) || 0,
            qty: Number(item.qty) || 0,
            category: item.category || 'default',
            taxAmount: Number(taxSummary.taxAmount) || 0,
          };
        })
      };

      logger.info('Submitting invoice to backend', payload);
      const invoiceEndpoint = billType === BILL_TYPES.NON_GST ? API_ENDPOINTS.nonGstInvoices : API_ENDPOINTS.invoices;
      const response = await apiFetch(invoiceEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      let result;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        result = await response.json();
      } else {
        result = await response.text();
      }

      if (!response.ok) {
        throw new Error(typeof result === 'string' ? result : (result?.message || 'Invoice save failed'));
      }

      const generatedInvoiceNo = result?.invoiceNo || invoiceNo;
      logger.info('Invoice generated and saved', result);

      let paymentRecorded = !shouldRecordPayment;
      let paymentWarning = '';
      if (shouldRecordPayment) {
        const invoiceId = result?.id ?? result?.invoiceId;
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
        ? receivedAmount >= grandTotal ? 'paid' : normalizedStatus
        : 'pending';
      const recordedBalance = resolveCustomerDueState(previousBalance, grandTotal, recordedAmount).totalDueAmount;
      setPaymentStatus(recordedStatus);

      try {
        await syncCustomerProfileDueBalance(recordedBalance);
      } catch (error) {
        logger.warn('Customer profile sync skipped after invoice save', error);
      }

      const previewInvoice = {
        invoiceNo: generatedInvoiceNo,
        customerName: customer.name || 'Walk-in Customer',
        customerPhone: customer.phone || '0000000000',
        customerEmail: customer.email || '',
        paymentMethod,
        paymentStatus: recordedStatus,
        paidAmount: recordedAmount,
        amountPaid: recordedAmount,
        receivedAmount: recordedAmount,
        previousBalance,
        balanceAmount: recordedBalance,
        currentBalance: recordedBalance,
        billType,
        subtotal: subtotal,
        gst: gstAmount,
        grandTotal: grandTotal,
        items: cart.map((item) => ({
          name: item.name,
          hsn: item.hsn || '9999',
          qty: Number(item.qty) || 0,
          price: Number(item.price) || 0,
          gst: Number(getItemTaxSummary(item).gstRate) || 0,
        }))
      };

      if (paymentWarning) {
        alert(`Invoice ${generatedInvoiceNo} was saved, but its payment could not be confirmed. Check the Payment report or Sales page before recording it again. ${paymentWarning}`);
      }
      openInvoiceWindow(previewInvoice);

      await refreshProducts();
      setCart([]);
      setCustomer({ name: '', phone: '', email: '' });
      setInvoiceNo(generatedInvoiceNo);
    } catch (error) {
      logger.error('Invoice generation failed', error);
      alert(`❌ ${error.message || 'Failed to generate invoice. Please try again.'}`);
    }
  };

  const clearPaymentScreenshot = () => {
    setPaymentScreenshot(null);
    setPaymentScreenshotError('');
    if (paymentScreenshotInputRef.current) paymentScreenshotInputRef.current.value = '';
  };

  const generateInvoice = () => {
    if (!isBillingWritable) {
      alert('Your role has read-only billing access.');
      return;
    }

    if (cart.length === 0) {
      alert('Add items to cart first!');
      return;
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
              {filteredProducts.length > 0 ? (
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
                          <>
                            {' + '}{product.gst}% GST
                          </>
                        )}
                        {Number(product.mrp ?? 0) > 0 && (
                          <span className="mrp-tag"> | MRP ₹{Number(product.mrp).toLocaleString()}</span>
                        )}
                      </p>
                      <small>
                        HSN: {product.hsn} | Stock: {product.stock}
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
                const itemGstAmount = billType === BILL_TYPES.NON_GST ? 0 : taxSummary.taxAmount;
                const itemTotalWithGst = (item.price * item.qty) + itemGstAmount;
                
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
                        {editingPriceId === item.id ? (
                          <input 
                            type="number" 
                            step="0.01"
                            value={item.price} 
                            onChange={(e) => updatePrice(item.id, e.target.value)}
                            onBlur={() => setEditingPriceId(null)}
                            autoFocus
                            className="price-input"
                          />
                        ) : (
                          <span 
                            className="price-display"
                            onClick={() => isBillingWritable && setEditingPriceId(item.id)}
                          >
                            ₹{item.price.toLocaleString('en-IN', {minimumFractionDigits: 2})}
                          </span>
                        )}
                        {isGstBill ? (
                          <span className="gst-equation">+ {taxSummary.gstRate}% GST</span>
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
              <div className="total-row">
                <span>Subtotal:</span>
                <span>₹{subtotal.toLocaleString()}</span>
              </div>
              {isGstBill && (
                <div className="total-row gst-row">
                  <span>{gstSummaryLabel}:</span>
                  <span>₹{gstAmount.toLocaleString()}</span>
                </div>
              )}
              <div className="grand-total">
                <span>Grand Total:</span>
                <span>₹{grandTotal.toLocaleString()}</span>
              </div>
            </div>

            <button
              type="button"
              className={`bill-type-toggle ${isGstBill ? 'gst' : 'non-gst'}`}
              onClick={() => isBillingWritable && setBillType(isGstBill ? BILL_TYPES.NON_GST : BILL_TYPES.GST)}
              aria-label={`Switch to ${isGstBill ? 'Non-GST' : 'GST'} billing`}
              aria-pressed={isGstBill}
              disabled={!isBillingWritable}
            >
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
              <span className="toggle-label">{isGstBill ? 'GST' : 'Non-GST'}</span>
            </button>

            <div className="payment-section">
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="payment-select" disabled={!isBillingWritable}>
                <option>UPI (PhonePe/GPay)</option>
                <option>Card</option>
                <option>Cash</option>
                <option>Wallet</option>
              </select>
              <div className={`payment-status-pill ${paymentStatus === 'paid' ? 'paid' : paymentStatus === 'partial' ? 'partial' : 'pending'}`}>
                {paymentStatus === 'paid' ? 'Payment: Paid' : paymentStatus === 'partial' ? 'Payment: Partial' : 'Payment: Pending'}
              </div>
              <button className="pay-btn primary" onClick={generateInvoice} disabled={!isBillingWritable || cart.length === 0}>
                💳 Pay ₹{grandTotal.toLocaleString()}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingPage;
