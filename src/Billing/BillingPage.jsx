import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './BillingPage.css';
import logger from '../utils/logger';
import { API_BASE_URL, API_ENDPOINTS, apiFetch } from '../Config/api';

const BillingPage = () => {
  const navigate = useNavigate();
  
  // POS State
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  const [searchProduct, setSearchProduct] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('INV-001');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [editingPriceId, setEditingPriceId] = useState(null);
  const [paymentDialog, setPaymentDialog] = useState({ open: false, step: 'payment-check' });
  
  // Dynamic Products
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // ✅ FIXED: GST SLAB FUNCTION
  const getGstSlab = (price) => {
    if (price < 500) return 5;
    if (price < 1500) return 12;
    return 18;
  };
  
  // Fetch products
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await apiFetch(`${API_BASE_URL}/api/products?size=1000`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
          const productList = Array.isArray(data?.content) ? data.content : Array.isArray(data) ? data : [];
        const productsWithGst = productList.map(product => ({
          id: product.id ?? product.productId,
          name: product.name,
          sku: product.sku || product.code || '',
          price: Number(product.price ?? product.unitPrice ?? 0) || 0,
          hsn: product.hsn || '9999',
          gst: getGstSlab(Number(product.price ?? product.unitPrice ?? 0) || 0),
          stock: Number(product.quantity ?? product.stock ?? product.ItemQty ?? product.qty ?? 0) || 0,
          salesCount: Number(product.salesCount ?? product.soldQty ?? product.purchaseCount ?? product.popularity ?? 0) || 0,
        }));
        setProducts(productsWithGst);
      } catch (error) {
        logger.error('Billing product fetch failed', error);
        // Fallback data
        setProducts([
          { id: 1, name: 'Shirt', hsn: '6109', price: 299, gst: 5, stock: 12 },
          { id: 2, name: 'Jeans', hsn: '6203', price: 799, gst: 12, stock: 8 },
          { id: 3, name: 'Laptop', hsn: '8471', price: 45999, gst: 18, stock: 5 }
        ]);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
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
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const gstAmount = cart.reduce((sum, item) => sum + (item.price * item.qty * item.gst / 100), 0);
  const grandTotal = subtotal + gstAmount;
  
  // ✅ FIXED: Update price
  const updatePrice = (id, newPrice) => {
    setCart(cart.map(item => 
      item.id === id ? { ...item, price: parseFloat(newPrice) || item.price } : item
    ));
  };
  
  // Add to cart
  const addToCart = (product) => {
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
    setCart(cart.filter(item => item.id !== id));
  };
  
  // ✅ FIXED: Invoice number generation
  const generateInvoiceNo = () => {
    const num = parseInt(invoiceNo.split('-')[1]) || 1;
    return `INV-${(num + 1).toString().padStart(3, '0')}`;
  };
  
  const generateInvoicePdf = async (invoiceData) => {
    const { jsPDF } = await import('jspdf');
    const { autoTable } = await import('jspdf-autotable');

    const pdf = new jsPDF('p', 'mm', 'a4');

    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text('IB ENTERPRISES', 20, 25);

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text('GSTIN: 27ABCDE1234F1Z5', 20, 33);
    pdf.text('Aurangabad, Maharashtra 431001', 20, 39);
    pdf.text('📞 +91 98765 43210', 20, 45);
    pdf.text('✉️ sales@ibenterprises.com', 20, 51);

    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`INVOICE #${invoiceData.invoiceNo}`, 20, 65);

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 20, 75);
    pdf.text(`Customer: ${invoiceData.customerName}`, 20, 85);
    pdf.text(`Phone: ${invoiceData.customerPhone}`, 20, 92);
    pdf.text(`Payment: ${invoiceData.paymentMethod}`, 20, 99);

    const rows = invoiceData.items.map((item, index) => {
      const amount = Number(item.price) * Number(item.qty);
      const gstValue = (amount * Number(item.gst || 0)) / 100;
      return [
        String(index + 1),
        item.name,
        item.hsn || '9999',
        String(item.qty),
        `₹${Number(item.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        `${item.gst || 0}%`,
        `₹${gstValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
        `₹${(amount + gstValue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      ];
    });

    autoTable(pdf, {
      head: [['S.No', 'Description', 'HSN', 'Qty', 'Rate', 'GST%', 'GST', 'Amount']],
      body: rows,
      startY: 110,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: [76, 175, 80], textColor: 255, fontStyle: 'bold', fontSize: 10 },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 45 }, 7: { halign: 'right' } },
    });

    const finalY = pdf.lastAutoTable.finalY + 15;
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Grand Total: ₹${invoiceData.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 140, finalY, { align: 'right' });

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Thank you for your business!', 20, 270);
    pdf.text('IB ENTERPRISES - Computer Generated Invoice', 20, 285);

    return pdf;
  };

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

    const invoiceRows = invoiceData.items.map((item) => {
      const amount = Number(item.price) * Number(item.qty);
      const gstValue = (amount * Number(item.gst || 0)) / 100;
      const total = amount + gstValue;
      return `
        <tr>
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

    previewWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Invoice ${invoiceData.invoiceNo}</title>
          <style>
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              margin: 0;
              background: #f5f7fb;
              color: #111827;
            }
            .invoice-shell {
              max-width: 980px;
              margin: 24px auto;
              background: #ffffff;
              padding: 20px 22px 18px;
              border-radius: 12px;
              box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
            }
            .header {
              display: grid;
              grid-template-columns: 1.2fr 0.8fr;
              gap: 20px;
              padding-bottom: 16px;
              border-bottom: 2px solid #111827;
            }
            h1 {
              margin: 0 0 8px;
              font-size: 28px;
              font-weight: 700;
              letter-spacing: -0.04em;
            }
            .small {
              color: #374151;
              font-size: 12px;
              line-height: 1.6;
            }
            .meta {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 10px 18px;
              margin: 18px 0;
              font-size: 14px;
            }
            .meta strong {
              display: inline-block;
              min-width: 90px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 4px;
            }
            th, td {
              padding: 10px 8px;
              border-bottom: 1px solid #eef2f7;
              text-align: left;
              font-size: 12px;
            }
            th {
              background: #f9fafb;
              color: #374151;
              font-weight: 700;
            }
            .totals {
              margin-top: 18px;
              margin-left: auto;
              width: 320px;
              background: #f9fafb;
              padding: 16px 18px;
              border-radius: 8px;
            }
            .totals-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              font-size: 14px;
              border-bottom: 1px solid #e5e7eb;
            }
            .grand {
              padding-top: 12px;
              border-top: 2px solid #e5e7eb;
              font-size: 18px;
              font-weight: 700;
              border-bottom: none;
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
            .notes-wrap {
              margin-top: 18px;
              font-size: 13px;
              color: #374151;
              line-height: 1.7;
            }
            .notes-wrap strong {
              font-weight: 700;
            }
            .toolbar {
              display: flex;
              justify-content: flex-end;
              gap: 12px;
              flex-wrap: wrap;
              margin-top: 18px;
            }
            .share-btn {
              border: none;
              border-radius: 10px;
              color: white;
              font-weight: 700;
              font-size: 15px;
              padding: 12px 18px;
              cursor: pointer;
              min-width: 170px;
              box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
            }
            .whatsapp { background: linear-gradient(135deg, #22c55e, #16a34a); }
            .email { background: linear-gradient(135deg, #3b82f6, #2563eb); }
            .download { background: linear-gradient(135deg, #6b7280, #4b5563); }
          </style>
        </head>
        <body>
          <div class="invoice-shell">
            <div class="header">
              <div>
                <h1>IB ENTERPRISES</h1>
                <div class="small">GSTIN: 27ABCDE1234F1Z5<br> Aurangabad, Maharashtra 431001<br> 📞 +91 98765 43210<br> ✉️ sales@ibenterprises.com</div>
              </div>
              <div>
                <div class="small"><strong>Invoice:</strong> ${invoiceData.invoiceNo}</div>
                <div class="small"><strong>Date:</strong> ${new Date().toLocaleDateString('en-IN')}</div>
                <div class="small"><strong>Status:</strong> <span class="status-pill ${invoiceData.paymentStatus === 'paid' ? 'status-paid' : 'status-pending'}">${invoiceData.paymentStatus}</span></div>
              </div>
            </div>

            <div class="meta">
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
                  <th>GST%</th>
                  <th>GST</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${invoiceData.items.map((item, index) => {
                  const amount = Number(item.price) * Number(item.qty);
                  const gstValue = (amount * Number(item.gst || 0)) / 100;
                  const total = amount + gstValue;
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
                }).join('')}
              </tbody>
            </table>

            <div class="totals">
              <div class="totals-row"><span>Total Qty</span><span>${invoiceData.items.reduce((sum, item) => sum + Number(item.qty || 0), 0)}</span></div>
              <div class="totals-row"><span>Subtotal</span><span>₹${invoiceData.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div class="totals-row"><span>GST Total</span><span>₹${invoiceData.gst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div class="totals-row grand"><span>Grand Total</span><span>₹${invoiceData.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
            </div>

            <div class="notes-wrap">
              <div><strong>Notes:</strong> Goods sold are non-returnable unless defective or as per shop policy.</div>
              <div><strong>Terms:</strong> Payment due within 7 days. Late payments may attract interest as per government guidelines.</div>
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
  const submitInvoice = async (status) => {
    try {
      const normalizedStatus = status === 'paid' ? 'paid' : 'pending';
      setPaymentStatus(normalizedStatus);

      const payload = {
        customerName: customer.name || 'Walk-in Customer',
        customerPhone: customer.phone || '0000000000',
        paymentMethod,
        paymentStatus: normalizedStatus,
        status: normalizedStatus,
        items: cart.map((item) => ({
          productId: item.id,
          name: item.name,
          sku: item.sku || '',
          hsn: item.hsn || '9999',
          gstRate: Number(item.gst) || 0,
          price: Number(item.price) || 0,
          qty: Number(item.qty) || 0,
        }))
      };

      logger.info('Submitting invoice to backend', payload);
      const response = await apiFetch(API_ENDPOINTS.invoices, {
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
        subtotal: subtotal,
        gst: gstAmount,
        grandTotal: grandTotal,
        items: cart.map((item) => ({
          name: item.name,
          hsn: item.hsn || '9999',
          qty: Number(item.qty) || 0,
          price: Number(item.price) || 0,
          gst: Number(item.gst) || 0,
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
    if (cart.length === 0) {
      alert('Add items to cart first!');
      return;
    }

    setPaymentDialog({ open: true, step: 'payment-check' });
  };

  const handlePaymentDialogChoice = (paymentCollected) => {
    if (paymentCollected) {
      setPaymentDialog({ open: false, step: 'payment-check' });
      submitInvoice('paid');
      return;
    }

    setPaymentDialog({ open: true, step: 'pending-confirmation' });
  };

  const handlePendingInvoiceDecision = (proceedWithoutPayment) => {
    setPaymentDialog({ open: false, step: 'payment-check' });
    if (proceedWithoutPayment) {
      submitInvoice('pending');
    }
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
        <div>
          <h1>🛒 POS Billing</h1>
          <p>Invoice #{invoiceNo} | Cart: {cart.reduce((sum, i) => sum + i.qty, 0)} items</p>
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
                <p>Payment has not been collected yet. Do you want to proceed to generate the invoice without payment right now?</p>
                <div className="payment-dialog-actions">
                  <button type="button" className="dialog-btn dialog-btn-secondary" onClick={() => handlePendingInvoiceDecision(false)}>
                    Cancel
                  </button>
                  <button type="button" className="dialog-btn dialog-btn-primary" onClick={() => handlePendingInvoiceDecision(true)}>
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
            />
            <input 
              placeholder="📱 Phone" 
              value={customer.phone}
              onChange={e => setCustomer({...customer, phone: e.target.value})}
              className="input-field"
            />
            <input 
              placeholder="✉️ Email (optional)" 
              value={customer.email}
              onChange={e => setCustomer({...customer, email: e.target.value})}
              className="input-field"
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
                  <div key={product.id} className="product-card" onClick={() => addToCart(product)}>
                    <div className="product-info">
                      <div className="product-card-topline">
                        <h4>{product.name}</h4>
                        {Number(product.salesCount ?? 0) > 0 && (
                          <span className="product-popular-tag">Popular</span>
                        )}
                      </div>
                      <p className="price-gst">₹{product.price.toLocaleString()} + {product.gst}% GST</p>
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
                const itemGstAmount = (item.price * item.qty * item.gst / 100);
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
                            onClick={() => setEditingPriceId(item.id)}
                          >
                            ₹{item.price.toLocaleString('en-IN', {minimumFractionDigits: 2})}
                          </span>
                        )}
                        <span className="gst-equation">+ {item.gst}% GST</span>
                        <span className="item-total-equation">
                          = ₹{itemTotalWithGst.toLocaleString('en-IN', {minimumFractionDigits: 2})}
                        </span>
                      </div>
                      <p className="qty-text">Qty: {item.qty} | Stock: {item.stock}</p>
                    </div>
                    <div className="cart-item-right">
                      <div className="qty-controls">
                        <button onClick={() => updateQty(item.id, item.qty - 1)}>-</button>
                        <span>{item.qty}</span>
                        <button onClick={() => updateQty(item.id, item.qty + 1)}>+</button>
                        <button className="remove" onClick={() => removeFromCart(item.id)}>✕</button>
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
              <div className="total-row gst-row">
                <span>GST ({cart.length > 0 ? `${((gstAmount/subtotal)*100).toFixed(1)}%` : '0%'}):</span>
                <span>₹{gstAmount.toLocaleString()}</span>
              </div>
              <div className="grand-total">
                <span>Grand Total:</span>
                <span>₹{grandTotal.toLocaleString()}</span>
              </div>
            </div>

            <div className="payment-section">
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="payment-select">
                <option>UPI (PhonePe/GPay)</option>
                <option>Card</option>
                <option>Cash</option>
                <option>Wallet</option>
              </select>
              <div className={`payment-status-pill ${paymentStatus === 'paid' ? 'paid' : 'pending'}`}>
                {paymentStatus === 'paid' ? 'Payment: Paid' : 'Payment: Pending'}
              </div>
              <button className="pay-btn primary" onClick={generateInvoice}>
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
