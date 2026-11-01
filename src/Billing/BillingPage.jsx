import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './BillingPage.css';
import logger from '../utils/logger';
import { API_ENDPOINTS, apiFetch } from '../Config/api';
import { buildInvoicePdf } from '../utils/invoicePdf';
import { getCurrentShopProfile, getShopDisplayName, readStoredShopProfile } from '../modules/shopProfile/shopProfileService';
import { BILL_TYPES, buildTaxProfileForItem, getLegacyGstSlab, resolveCategoryTax } from '../modules/tax/gstConfig';
import { canWriteBilling, getCurrentUserRole } from '../Security/storeRoles';

const BillingPage = () => {
  const navigate = useNavigate();
  
  // POS State
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  const [searchProduct, setSearchProduct] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('INV-001');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [billType, setBillType] = useState(BILL_TYPES.GST);
  const [editingPriceId, setEditingPriceId] = useState(null);
  const [paymentDialog, setPaymentDialog] = useState({ open: false, step: 'payment-check' });
  const [partialPaymentAmount, setPartialPaymentAmount] = useState('');
  const [showPartialInvoiceAction, setShowPartialInvoiceAction] = useState(false);
  
  // Dynamic Products
  const [products, setProducts] = useState([]);
  const [shopProfile, setShopProfile] = useState(() => readStoredShopProfile());
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(() => getCurrentUserRole());
  const shopDisplayName = getShopDisplayName(shopProfile);
  const isBillingWritable = canWriteBilling(role);
  
  // ✅ Centralized GST logic lives in src/modules/tax/gstConfig.js
  const getGstSlab = (price, category = '') => {
    const configuredRate = resolveCategoryTax(category, 0).total;
    if (configuredRate > 0) return configuredRate;
    return getLegacyGstSlab(price);
  };
  
  // Fetch products
  useEffect(() => {
    setRole(getCurrentUserRole());

    let active = true;

    getCurrentShopProfile()
      .then((profile) => {
        if (active) setShopProfile(profile);
      })
      .catch(() => {
        if (active) setShopProfile(readStoredShopProfile());
      });

    const fetchProducts = async () => {
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
        // Fallback data
        setProducts([
          { id: 1, name: 'Shirt', hsn: '6109', price: 299, mrp: 349, gst: 5, stock: 12 },
          { id: 2, name: 'Jeans', hsn: '6203', price: 799, mrp: 999, gst: 12, stock: 8 },
          { id: 3, name: 'Laptop', hsn: '8471', price: 45999, mrp: 48999, gst: 18, stock: 5 }
        ]);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchProducts();
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
  
  // Cart totals
  const getItemTaxSummary = (item) => buildTaxProfileForItem({ ...item, category: item.category || 'default', gst: Number(item.gst ?? 0) || 0 }, billType);
  const isGstBill = billType === BILL_TYPES.GST;
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const gstAmount = cart.reduce((sum, item) => sum + getItemTaxSummary(item).taxAmount, 0);
  const grandTotal = billType === BILL_TYPES.NON_GST ? subtotal : subtotal + gstAmount;
  const gstSummaryLabel = billType === BILL_TYPES.NON_GST
    ? 'GST (0%)'
    : `GST (${cart.length > 0 ? `${((gstAmount / Math.max(subtotal, 1)) * 100).toFixed(1)}%` : '0%'})`;
  
  // ✅ FIXED: Update price
  const updatePrice = (id, newPrice) => {
    if (!isBillingWritable) return;
    setCart(cart.map(item => 
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
      setCart(cart.map(item => 
        item.id === product.id ? { ...item, qty: item.qty + 1 } : item
      ));
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
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
    setCart(cart.map(item => 
      item.id === id ? { ...item, qty } : item
    ));
  };
  
  const removeFromCart = (id) => {
    if (!isBillingWritable) return;
    setCart(cart.filter(item => item.id !== id));
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

  const calculateInvoiceTotals = (items) => {
    const subtotal = items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 0)), 0);
    const gst = items.reduce((sum, item) => {
      const amount = Number(item.price || 0) * Number(item.qty || 0);
      return sum + (amount * Number(item.gst || 0)) / 100;
    }, 0);
    const grandTotal = subtotal + gst;

    return { subtotal, gst, grandTotal };
  };

  const generateInvoicePdf = async (invoiceData) => buildInvoicePdf({ ...invoiceData, shopProfile });

  const shareInvoiceViaWhatsApp = async (invoiceData) => {
    const pdf = await generateInvoicePdf(invoiceData);
    const pdfBlob = pdf.output('blob');
    const url = URL.createObjectURL(pdfBlob);

    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `invoice_${invoiceData.invoiceNo}.pdf`;
    downloadLink.click();

    const whatsappUrl = `https://wa.me/${(invoiceData.customerPhone || '').replace(/\D/g, '') || '919999999999'}?text=${encodeURIComponent(`🧾 Invoice ${invoiceData.invoiceNo}\nCustomer: ${invoiceData.customerName}\nTotal: ₹${invoiceData.grandTotal.toLocaleString('en-IN')}`)}`;
    window.open(whatsappUrl, '_blank');
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
    const previewWindow = window.open('', '_blank', 'width=980,height=1200');
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
    const balanceAmount = Number(invoiceData.balanceAmount ?? Math.max(Number(invoiceData.grandTotal || 0) - receivedAmount, 0));
    const currentBalance = Number(invoiceData.currentBalance ?? previousBalance + balanceAmount);

    previewWindow.document.write(`
      <!doctype html>
      <html>
        <head>
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

            @media (max-width: 700px) {
              .invoice-shell {
                width: min(100%, 100vw);
                margin: 0;
                border-radius: 0;
                box-shadow: none;
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
                display: block;
                overflow-x: auto;
                white-space: nowrap;
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
                  <div class="brand-meta">GSTIN: ${invoiceShopProfile.gstin || invoiceShopProfile.gstNumber || '27ABCDE1234F1Z5'}<br> ${invoiceShopProfile.address || 'Aurangabad, Maharashtra 431001'}<br> ${invoiceShopProfile.phone || invoiceShopProfile.contactNumber || '+91 98765 43210'}<br> ${invoiceShopProfile.email || invoiceShopProfile.supportEmail || 'sales@ibenterprises.com'}</div>
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
                  <div class="summary-row"><span>Received</span><span>₹${receivedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                  <div class="summary-row"><span>Balance</span><span>₹${balanceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                  <div class="summary-row"><span>Payment mode</span><span>${invoiceData.paymentMethod || 'Cash'}</span></div>
                  <div class="summary-row"><span>Previous Balance</span><span>₹${previousBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                  <div class="summary-row total"><span>Current Balance</span><span>₹${currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
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
      setPaymentStatus(normalizedStatus);

      const payload = {
        customerName: customer.name || 'Walk-in Customer',
        customerPhone: customer.phone || '0000000000',
        paymentMethod,
        paymentStatus: normalizedStatus,
        status: normalizedStatus,
        paidAmount: paidAmount,
        amountPaid: paidAmount,
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
      const previewInvoice = {
        invoiceNo: generatedInvoiceNo,
        customerName: customer.name || 'Walk-in Customer',
        customerPhone: customer.phone || '0000000000',
        customerEmail: customer.email || '',
        paymentMethod,
        paymentStatus: normalizedStatus,
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

      openInvoiceWindow(previewInvoice);

      setCart([]);
      setCustomer({ name: '', phone: '', email: '' });
      setInvoiceNo(generatedInvoiceNo);
    } catch (error) {
      logger.error('Invoice generation failed', error);
      alert(`❌ ${error.message || 'Failed to generate invoice. Please try again.'}`);
    }
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

    setPaymentDialog({ open: true, step: 'payment-check' });
  };

  const handlePaymentDialogChoice = (paymentCollected) => {
    if (paymentCollected) {
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
      setPartialPaymentAmount('');
      setShowPartialInvoiceAction(false);
      setPaymentDialog({ open: false, step: 'payment-check' });
      submitInvoice('partial', amount);
      return;
    }

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
            Invoice #{invoiceNo} | Cart: {cart.reduce((sum, i) => sum + i.qty, 0)} items
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
                <p>Payment has not been collected yet. Enter a partial amount, or proceed without payment.</p>

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

                <div className="payment-dialog-actions secondary-actions">
                  <button type="button" className="dialog-btn dialog-btn-ghost" onClick={() => handlePendingInvoiceDecision('proceed-without-payment')}>
                    Proceed anyway
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="billing-layout">
        {/* Left: Customer + Products */}
        <div className="billing-left">
          <div className="customer-section">
            <h3>👤 Customer Details</h3>
            <input 
              placeholder="Customer Name" 
              value={customer.name}
              onChange={e => setCustomer({...customer, name: e.target.value})}
              className="input-field"
              disabled={!isBillingWritable}
            />
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
            <h3>🛒 Cart ({cart.reduce((sum, i) => sum + i.qty, 0)} items)</h3>
            <div className="cart-items">
              {cart.map(item => {
                const taxSummary = getItemTaxSummary(item);
                const itemGstAmount = billType === BILL_TYPES.NON_GST ? 0 : taxSummary.taxAmount;
                const itemTotalWithGst = (item.price * item.qty) + itemGstAmount;
                
                return (
                  <div key={item.id} className="cart-item">
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
                        <span>{item.qty}</span>
                        <button onClick={() => updateQty(item.id, item.qty + 1)} disabled={!isBillingWritable}>+</button>
                        <button className="remove" onClick={() => removeFromCart(item.id)} disabled={!isBillingWritable}>✕</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="totals">
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
              <button className="pay-btn primary" onClick={generateInvoice} disabled={!isBillingWritable}>
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
