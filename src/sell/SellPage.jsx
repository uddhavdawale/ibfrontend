import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import "./SellPage.css";
import { API_ENDPOINTS, apiFetch } from "../Config/api";
import { buildInvoicePdf } from "../utils/invoicePdf";
import { openWhatsAppChat } from "../utils/whatsapp";
import createSecureIdempotencyKey from "../utils/createSecureIdempotencyKey";
import { getCurrentShopProfile, getShopDisplayName, readStoredShopProfile } from "../modules/shopProfile/shopProfileService";
import { canWriteBilling, getCurrentUserRole } from "../Security/storeRoles";
import { normalizeWhatsAppPhone } from "../utils/whatsappCommerce";

const exportSellOrdersData = (orders, format = "csv") => {
  const rows = orders.map((order) => ({
    Invoice_No: order.invoiceNo,
    Date: order.date,
    Customer: order.customer?.name || "Walk-in Customer",
    Phone: order.customer?.phone || "",
    Email: order.customer?.email || "",
    Payment_Method: order.paymentMethod,
    Status: order.status,
    Subtotal: Number(order.subtotal || 0),
    GST: Number(order.totalGst || 0),
    Grand_Total: Number(order.grandTotal || 0),
    Item_Count: Array.isArray(order.items) ? order.items.length : 0,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "SellOrders");

  const fileExtension = format === "excel" ? "xlsx" : "csv";
  XLSX.writeFile(workbook, `sell-orders-export.${fileExtension}`);
};

const MAX_EXPORT_ROWS = 500;
const EXPORT_COOLDOWN_MS = 60 * 1000;

const generatePDF = async (order, shopProfile = readStoredShopProfile()) => {
  const currentShopProfile = await getCurrentShopProfile(true);
  return buildInvoicePdf({ ...order, shopProfile: currentShopProfile || shopProfile });
};

const sendWhatsAppPDF = async (order, shopProfile = readStoredShopProfile()) => {
  const message = `🧾 Invoice ${order.invoiceNo} - Receipt Downloaded! 💰 ₹${order.grandTotal.toLocaleString()}`;
  const filename = `invoice_${order.invoiceNo}.pdf`;
  openWhatsAppChat(order.customer.phone, message);

  const pdf = await generatePDF(order, shopProfile);
  const pdfBlob = pdf.output("blob");

  const url = URL.createObjectURL(pdfBlob);
  const downloadLink = document.createElement("a");
  downloadLink.href = url;
  downloadLink.download = filename;
  downloadLink.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  alert(
    `✅ PDF Downloaded!\n\n📎 Attach the invoice from Downloads in the open WhatsApp chat to send it.`
  );
};

const sendEmailPDF = async (order, shopProfile = readStoredShopProfile()) => {
  const pdf = await generatePDF(order, shopProfile);
  const pdfBlob = pdf.output("blob");

  const subject = `Invoice ${order.invoiceNo} - Receipt`;
  const body = `Dear ${order.customer.name},

Receipt for Invoice ${order.invoiceNo} attached.

Grand Total: ₹${order.grandTotal.toLocaleString()}
Date: ${order.date}`;

  const emailUrl = `mailto:${order.customer.email}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  const link = document.createElement("a");
  link.href = URL.createObjectURL(pdfBlob);
  link.download = `invoice_${order.invoiceNo}.pdf`;
  link.click();

  window.location.href = emailUrl;
};

const printReceipt = async (order, shopProfile = readStoredShopProfile()) => {
  if (!order) return;
  const pdf = await generatePDF(order, shopProfile);
  const pdfBlob = pdf.output("blob");
  const url = URL.createObjectURL(pdfBlob);
  const printWindow = window.open(url, "_blank");
  if (printWindow) {
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  } else {
    pdf.save(`receipt_${order.invoiceNo}.pdf`);
  }
};

const fallbackSellOrders = [
  {
    id: 1,
    invoiceNo: "INV-2026/001",
    date: "07-Apr-2026",
    customer: {
      name: "Uddhav Dawale",
      phone: "+919595934249",
      email: "uddhavdawale2@gmail.com",
    },
    paymentMethod: "UPI (PhonePe)",
    subtotal: 2597.0,
    totalGst: 73.5,
    grandTotal: 2670.5,
    status: "paid",
    soldBy: "Store Admin",
    dueCollection: 0,
    items: [
      {
        sn: 1,
        item: "Basmati Rice 5KG",
        hsn: "1006",
        qty: 4,
        rate: 250.0,
        gst: 5,
        total: 1050.0,
      },
      {
        sn: 2,
        item: "Aashirvaad Atta 10KG",
        hsn: "1101",
        qty: 2,
        rate: 450.0,
        gst: 5,
        total: 945.0,
      },
      {
        sn: 3,
        item: "Fortune Soya Oil 5L",
        hsn: "1512",
        qty: 3,
        rate: 220.0,
        gst: 18,
        total: 602.0,
      },
    ],
  },
  {
    id: 2,
    invoiceNo: "INV-2026/002",
    date: "06-Apr-2026",
    customer: {
      name: "Rajesh Patil",
      phone: "+919595934249",
      email: "uddhavdawale2@gmail.com",
    },
    paymentMethod: "Cash",
    subtotal: 1845.0,
    totalGst: 55.35,
    grandTotal: 1900.35,
    status: "paid",
    soldBy: "Store Admin",
    dueCollection: 0,
    items: [
      {
        sn: 1,
        item: "Maida 5KG",
        hsn: "1101",
        qty: 3,
        rate: 180.0,
        gst: 5,
        total: 567.0,
      },
      {
        sn: 2,
        item: "Sugar 10KG",
        hsn: "1701",
        qty: 2,
        rate: 640.0,
        gst: 5,
        total: 1344.0,
      },
    ],
  },
  {
    id: 3,
    invoiceNo: "INV-2026/003",
    date: "05-Apr-2026",
    customer: {
      name: "Priya Sharma",
      phone: "+911234567890",
      email: "priya@sharma.com",
    },
    paymentMethod: "Card",
    subtotal: 1250.0,
    totalGst: 112.5,
    grandTotal: 1362.5,
    status: "pending",
    soldBy: "Store Admin",
    dueCollection: 1362.5,
    items: [
      {
        sn: 1,
        item: "Detergent 1KG",
        hsn: "3402",
        qty: 5,
        rate: 250.0,
        gst: 18,
        total: 1250.0,
      },
    ],
  },
];

const getLoggedInSellerName = () => {
  if (typeof window === "undefined") return "Current User";

  try {
    const user = JSON.parse(window.localStorage.getItem("user") || "{}");
    return user.name || user.ownerName || user.username || user.userName || "Current User";
  } catch {
    return "Current User";
  }
};

const resolvePaymentStatus = (invoice, grandTotal) => {
  const rawPaymentStatus = String(
    invoice.paymentStatus ??
    invoice.payment_status ??
    invoice.status ??
    "pending"
  ).trim().toLowerCase();

  const paidAmount = Number(
    invoice.paidAmount ??
    invoice.amountPaid ??
    invoice.totalPaid ??
    invoice.receivedAmount ??
    0
  );

  const totalAmount = Number(
    invoice.totalAmount ??
    invoice.grandTotal ??
    invoice.total ??
    grandTotal ??
    0
  );

  if (["cancelled", "canceled", "void", "voided"].includes(rawPaymentStatus)) return "cancelled";
  if (["paid", "complete", "completed", "settled"].includes(rawPaymentStatus)) return "paid";
  if (paidAmount >= totalAmount) return "paid";
  if (paidAmount > 0) return "partial";
  return "pending";
};

const normalizeInvoiceToOrder = (invoice, index = 0, fallbackSoldBy = "Current User") => {
  const rawItems = Array.isArray(invoice.items)
    ? invoice.items
    : Array.isArray(invoice.lineItems)
      ? invoice.lineItems
      : Array.isArray(invoice.invoiceItems)
        ? invoice.invoiceItems
        : Array.isArray(invoice.products)
          ? invoice.products
          : Array.isArray(invoice.orderItems)
            ? invoice.orderItems
            : [];

  const normalizedItems = rawItems.map((item, itemIndex) => {
    const quantity = Number(item.quantity ?? item.qty ?? item.count ?? 0);
    const unitPrice = Number(item.price ?? item.unitPrice ?? item.rate ?? 0);
    const gstRate = Number(item.gstRate ?? item.gst ?? item.taxRate ?? 0);
    const lineTotal = Number(item.total ?? item.amount ?? item.lineTotal ?? (unitPrice * quantity));

    return {
      sn: item.sn ?? itemIndex + 1,
      item: item.name ?? item.item ?? item.productName ?? `Item ${itemIndex + 1}`,
      hsn: item.hsn ?? item.hsnCode ?? "9999",
      qty: quantity,
      rate: unitPrice,
      gst: gstRate,
      total: lineTotal,
    };
  });

  const subtotal = Number(
    invoice.subtotal ??
    invoice.totalAmount ??
    invoice.amount ??
    normalizedItems.reduce((sum, item) => sum + item.rate * item.qty, 0)
  );
  const totalGst = Number(
    invoice.totalGst ??
    invoice.gstAmount ??
    invoice.tax ??
    normalizedItems.reduce((sum, item) => sum + (item.rate * item.qty * item.gst) / 100, 0)
  );
  const grandTotal = Number(
    invoice.grandTotal ??
    invoice.total ??
    invoice.amount ??
    subtotal + totalGst
  );

  const resolvedStatus = resolvePaymentStatus(invoice, grandTotal);
  const paidAmount = Number(
    invoice.paidAmount ??
    invoice.amountPaid ??
    invoice.totalPaid ??
    invoice.receivedAmount ??
    0
  );
  const dueCollection = Math.max(grandTotal - paidAmount, 0);

  return {
    id: invoice.id ?? invoice.invoiceId ?? `${invoice.invoiceNo ?? "INV"}-${index}`,
    invoiceNo: invoice.invoiceNo ?? invoice.invoice_number ?? `INV-${index + 1}`,
    date: invoice.date ?? invoice.createdAt ?? invoice.invoiceDate ?? "N/A",
    customer: {
      name: invoice.customerName ?? invoice.customer?.name ?? invoice.customerName ?? "Walk-in Customer",
      phone: invoice.customerPhone ?? invoice.customer?.phone ?? "",
      email: invoice.customerEmail ?? invoice.customer?.email ?? "",
    },
    paymentMethod: invoice.paymentMethod ?? "Cash",
    subtotal,
    totalGst,
    grandTotal,
    soldBy: invoice.soldBy
      ?? invoice.soldByName
      ?? invoice.createdByName
      ?? invoice.createdBy
      ?? invoice.userName
      ?? invoice.username
      ?? fallbackSoldBy,
    dueCollection,
    paidAmount,
    status: resolvedStatus,
    billType: invoice.billType || (invoice.isGstInvoice === false ? 'non-gst' : 'gst'),
    items: normalizedItems,
    notes: invoice.notes ?? "",
    dueInDays: invoice.dueInDays ?? 7,
  };
};

const fetchInvoiceDetail = async (invoiceSummary, fallbackSoldBy = "Current User") => {
  const invoiceId = invoiceSummary?.id ?? invoiceSummary?.invoiceId;
  if (!invoiceId) return invoiceSummary;

  const candidateUrls = [
    API_ENDPOINTS.invoiceById(invoiceId),
    API_ENDPOINTS.invoiceDetailsById(invoiceId),
    API_ENDPOINTS.invoiceItemsById(invoiceId),
    API_ENDPOINTS.invoiceLegacyById(invoiceId),
    API_ENDPOINTS.invoiceLegacyDetailById(invoiceId)
  ];

  for (const url of candidateUrls) {
    try {
      const response = await apiFetch(url);
      if (!response.ok) continue;
      const detailData = await response.json();
      if (!detailData) continue;
      return normalizeInvoiceToOrder({ ...invoiceSummary, ...detailData }, 0, fallbackSoldBy);
    } catch (error) {
      console.warn("Invoice detail lookup failed for:", url, error);
    }
  }

  return invoiceSummary;
};

const SellPage = ({ onOpenPaymentReport }) => {
  const navigate = useNavigate();
  const [activeOrder, setActiveOrder] = useState(null);
  const [sellOrders, setSellOrders] = useState(fallbackSellOrders);
  const [shopProfile, setShopProfile] = useState(() => readStoredShopProfile());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [exportFormat, setExportFormat] = useState('csv');
  const [openActionMenuFor, setOpenActionMenuFor] = useState(null);
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  const [lastExportAt, setLastExportAt] = useState(0);
  const [role, setRole] = useState(() => getCurrentUserRole());
  const [loggedInSeller, setLoggedInSeller] = useState(() => getLoggedInSellerName());
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentResult, setPaymentResult] = useState(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [whatsappOrderOpen, setWhatsappOrderOpen] = useState(false);
  const [whatsappOrderDraft, setWhatsappOrderDraft] = useState({
    customerName: '',
    phone: '',
    requestText: '',
    recurring: false,
  });
  const [whatsappOrderError, setWhatsappOrderError] = useState('');
  const [whatsappDrafts, setWhatsappDrafts] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('ib-whatsapp-order-drafts') || '[]');
      return Array.isArray(stored) ? stored.slice(0, 25) : [];
    } catch {
      return [];
    }
  });
  const pageSize = 5;
  const canManageSellOrders = canWriteBilling(role);

  const cycleStatusFilter = () => {
    setStatusFilter((current) => {
      if (current === 'all') return 'paid';
      if (current === 'paid') return 'partial';
      if (current === 'partial') return 'pending';
      if (current === 'pending') return 'cancelled';
      if (current === 'cancelled') return 'return';
      return 'all';
    });
    setCurrentPage(1);
  };

  const saveWhatsappOrderDraft = () => {
    const customerName = whatsappOrderDraft.customerName.trim();
    const phone = normalizeWhatsAppPhone(whatsappOrderDraft.phone);
    const requestText = whatsappOrderDraft.requestText.trim();
    if (!customerName || !phone || !requestText) {
      setWhatsappOrderError('Enter customer name, a valid phone number, and the requested products.');
      return;
    }

    const draft = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      customerName,
      phone,
      requestText,
      recurring: whatsappOrderDraft.recurring,
      createdAt: new Date().toISOString(),
    };
    const nextDrafts = [draft, ...whatsappDrafts].slice(0, 25);
    setWhatsappDrafts(nextDrafts);
    try {
      localStorage.setItem('ib-whatsapp-order-drafts', JSON.stringify(nextDrafts));
    } catch {
      setWhatsappOrderError('The order draft could not be stored in this browser.');
      return false;
    }
    setWhatsappOrderError('');
    return true;
  };

  const createBillingDraftFromWhatsapp = () => {
    const customerName = whatsappOrderDraft.customerName.trim();
    const phone = normalizeWhatsAppPhone(whatsappOrderDraft.phone);
    const requestText = whatsappOrderDraft.requestText.trim();
    if (!customerName || !phone || !requestText) {
      setWhatsappOrderError('Enter customer name, a valid phone number, and the requested products.');
      return;
    }

    if (!saveWhatsappOrderDraft()) return;
    navigate('/billing', {
      state: {
        whatsappOrder: {
          customer: { name: customerName, phone, email: '' },
          requestText,
        },
      },
    });
  };

  const repeatOrderInBilling = (order) => {
    if (!order) return;
    setOpenActionMenuFor(null);
    navigate('/billing', {
      state: {
        repeatedOrder: {
          customer: {
            name: order.customer?.name || '',
            phone: order.customer?.phone || '',
            email: order.customer?.email || '',
          },
          items: (Array.isArray(order.items) ? order.items : []).map((item) => ({
            name: item.item || item.name || item.productName || '',
            qty: Number(item.qty || item.quantity || 1) || 1,
            sku: item.sku || item.code || '',
          })),
        },
      },
    });
  };

  const openPaymentCollection = (order) => {
    setPaymentTarget(order);
    setPaymentAmount(Number(order.dueCollection || 0).toFixed(2));
    setPaymentMethod('CASH');
    setPaymentReference('');
    setPaymentError('');
    setPaymentResult(null);
  };

  const submitCollectedPayment = async (event) => {
    event.preventDefault();
    if (!paymentTarget || paymentSaving || paymentResult) return;
    const amount = Number(paymentAmount);
    const balanceDue = Number(paymentTarget.dueCollection || 0);
    if (!Number.isFinite(amount) || amount <= 0 || amount > balanceDue || !Number.isInteger(amount * 100)) {
      setPaymentError(`Enter an amount up to the balance due of ₹${balanceDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`);
      return;
    }

    setPaymentSaving(true);
    setPaymentError('');
    try {
      const requestUrl = String(paymentTarget.billType).toLowerCase().includes('non')
        ? API_ENDPOINTS.nonGstInvoicePaymentsById(paymentTarget.id)
        : API_ENDPOINTS.invoicePaymentsById(paymentTarget.id);
      const response = await apiFetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          method: paymentMethod,
          referenceNo: paymentReference.trim() || null,
          idempotencyKey: createSecureIdempotencyKey(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.message || payload.error || `Payment could not be recorded (${response.status}).`);
      }

      const updatedPaid = Number(paymentTarget.paidAmount || 0) + amount;
      const updatedDue = Math.max(Number(paymentTarget.grandTotal || 0) - updatedPaid, 0);
      const updatedOrder = {
        ...paymentTarget,
        paidAmount: updatedPaid,
        dueCollection: updatedDue,
        status: updatedDue === 0 ? 'paid' : 'partial',
        paymentMethod,
      };
      setSellOrders((orders) => orders.map((order) => (
        String(order.id) === String(updatedOrder.id)
          && order.billType === updatedOrder.billType
          ? updatedOrder
          : order
      )));
      setActiveOrder((current) => (
        current && String(current.id) === String(updatedOrder.id)
          && current.billType === updatedOrder.billType
          ? updatedOrder
          : current
      ));
      setPaymentTarget(updatedOrder);
      setPaymentResult(payload);
    } catch (submitError) {
      setPaymentError(submitError.message || 'Payment could not be recorded. Please retry.');
    } finally {
      setPaymentSaving(false);
    }
  };

  const handleThreeDotMenuAction = async (order, action) => {
    if (!order || cancellingOrderId) return;
    setOpenActionMenuFor(null);

    if (action === 'repeat') {
      repeatOrderInBilling(order);
      return;
    }

    if (action === 'sell') {
      setCancellingOrderId(order.id);
      try {
        await selectOrder(order);
      } finally {
        setCancellingOrderId(null);
      }
      return;
    }

    if (action === 'cancelled') {
      await cancelOrder(order);
      return;
    }

    if (action === 'return') {
      await returnOrder(order);
    }
  };

  useEffect(() => {
    setRole(getCurrentUserRole());
    setLoggedInSeller(getLoggedInSellerName());

    let active = true;
    getCurrentShopProfile(true)
      .then((profile) => {
        if (active) setShopProfile(profile);
      })
      .catch(() => {
        if (active) setShopProfile(readStoredShopProfile());
      });

    return () => {
      active = false;
    };
  }, []);

  const selectOrder = async (order) => {
    if (!order) {
      setActiveOrder(null);
      return;
    }

    if (Array.isArray(order.items) && order.items.length > 0) {
      setActiveOrder((current) => (current && current.id === order.id ? null : order));
      return;
    }

    const refreshedOrder = await fetchInvoiceDetail(order, loggedInSeller);
    setActiveOrder((current) => (current && current.id === order.id ? null : refreshedOrder));
  };

  useEffect(() => {
    const fetchSellOrders = async () => {
      try {
        const orderEndpoints = [
          API_ENDPOINTS.invoicesPage(0, 200),
          API_ENDPOINTS.nonGstInvoicesPage(0, 200)
        ];

        const allInvoiceResponses = await Promise.all(
          orderEndpoints.map(async (url) => {
            try {
              const response = await apiFetch(url);
              if (!response.ok) return [];
              const data = await response.json();
              return Array.isArray(data)
                ? data
                : data.content || data.invoices || data.data || [];
            } catch {
              return [];
            }
          })
        );

        const mergedInvoices = allInvoiceResponses
          .flat()
          .reduce((unique, invoice) => {
            const key = invoice?.id ?? invoice?.invoiceId ?? invoice?.invoiceNo ?? invoice?.invoice_number ?? JSON.stringify(invoice);
            if (!unique.has(key)) unique.set(key, invoice);
            return unique;
          }, new Map());

        let normalizedOrders = Array.from(mergedInvoices.values()).map((invoice, index) => normalizeInvoiceToOrder(invoice, index, loggedInSeller));

        normalizedOrders = await Promise.all(
          normalizedOrders.map(async (order) => {
            if (Array.isArray(order.items) && order.items.length > 0) return order;
            return fetchInvoiceDetail(order, loggedInSeller);
          })
        );

        if (normalizedOrders.length > 0) {
          normalizedOrders.sort((a, b) => new Date(b.date) - new Date(a.date));
          setSellOrders(normalizedOrders);
        } else {
          setSellOrders(fallbackSellOrders);
        }
      } catch (fetchError) {
        console.error("Sell orders fetch failed:", fetchError);
        setError("Unable to load live orders. Showing saved fallback data.");
        setSellOrders(fallbackSellOrders);
      } finally {
        setLoading(false);
      }
    };

    fetchSellOrders();
  }, [loggedInSeller]);

const OrderDetail = ({ order, onCollectPayment }) => {
  const totalQty = Array.isArray(order?.items)
    ? order.items.reduce((sum, i) => sum + Number(i.qty || 0), 0)
    : 0;

  return (
    <div className="order-detail">
      {/* Keep your header exactly as‑is */}
      <div className="detail-header">
        <div className="invoice-shop-info">
          <h2>{getShopDisplayName(shopProfile)}</h2>
          <p>GSTIN: {shopProfile.gstin || shopProfile.gstNumber || ''}</p>
          <p>{shopProfile.address || ''}</p>
          <p>📞 {shopProfile.phone || shopProfile.contactNumber || '+91 98765 43210'}</p>
          <p>✉️ {shopProfile.email || shopProfile.supportEmail || 'sales@ibenterprises.com'}</p>
          <p>
            <strong>Invoice:</strong> {order.invoiceNo} |{" "}
            <strong>Date:</strong> {order.date}
          </p>
        </div>

        <div className="invoice-customer-info">
          <div>
            <strong>Customer:</strong> {order.customer.name}
          </div>
          {order.customer.phone && (
            <div>
              <strong>Phone:</strong> {order.customer.phone}
            </div>
          )}
          {order.customer.email && (
            <div>
              <strong>Email:</strong> {order.customer.email}
            </div>
          )}
          <div>
            <strong>Payment Method:</strong> {order.paymentMethod}
          </div>
          <div><strong>Paid:</strong> ₹{Number(order.paidAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          <div><strong>Balance due:</strong> ₹{Number(order.dueCollection || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          <div>
            <strong>Status:</strong>{" "}
            <span className={`status-badge ${order.status}`}>
              {order.status}
            </span>
          </div>
        </div>
      </div>

      {/* Updated invoice table – no border lines, just grid */}
      {order.items.length > 0 ? (
        <div className="items-list">
          <table>
            <thead>
              <tr>
                <th>S.No</th>
                <th>Item</th>
                <th>HSN</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Amount (₹)</th>
                <th>GST (%)</th>
                <th>GST (₹)</th>
                <th>Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => {
                const amount = item.rate * item.qty;
                const gstValue = item.total - amount;
                return (
                  <tr key={item.sn}>
                    <td>{item.sn}</td>
                    <td>{item.item}</td>
                    <td>{item.hsn}</td>
                    <td>{item.qty}</td>
                    <td>₹{item.rate.toFixed(2)}</td>
                    <td>₹{amount.toFixed(2)}</td>
                    <td>{item.gst}%</td>
                    <td>₹{gstValue.toFixed(2)}</td>
                    <td>₹{item.total.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-order-state">
          <p>No item details are available for this invoice. This backend response appears to be a summary-only invoice record.</p>
        </div>
      )}

      {/* Totals + GST summary */}
      <div className="order-totals">
        <div className="totals-grid">
          <div>Total Qty:</div>
          <div>{totalQty}</div>

          <div>Subtotal (₹):</div>
          <div>₹{order.subtotal.toLocaleString()}</div>

          <div>GST Total (₹):</div>
          <div>₹{order.totalGst.toLocaleString()}</div>

          <div className="grand-total-row">
            <strong>Grand Total (₹):</strong>
            <div>₹{order.grandTotal.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Simple footer – no signature line */}
      <div className="invoice-footer">
        <div className="footer-notes">
          <strong>Notes:</strong>{" "}
          {order.notes ||
            "Goods sold are non‑returnable unless defective or as per shop policy."}
        </div>
        <div className="footer-terms">
          <strong>Terms:</strong>{" "}
          Payment due within {order.dueInDays || 7} days. Late payments may
          attract interest as per government guidelines.
        </div>
      </div>

      {/* Action buttons – unchanged */}
      <div className="action-buttons">
        {canManageSellOrders && order.dueCollection > 0 && !['cancelled', 'return'].includes(order.status) && (
          <button
            type="button"
            className="btn-collect-payment"
            onClick={() => onCollectPayment(order)}
          >
            Record payment
          </button>
        )}
        <button
          className="btn-share-whatsapp"
          onClick={() => activeOrder && sendWhatsAppPDF(activeOrder, shopProfile)}
        >
          📱 WhatsApp PDF
        </button>
        <button
          className="btn-share-email"
          onClick={() => activeOrder && sendEmailPDF(activeOrder, shopProfile)}
        >
          ✉️ Email PDF
        </button>
        <button
          className="btn-print"
          onClick={() => printReceipt(activeOrder, shopProfile)}
        >
          💾 Download PDF
        </button>
      </div>
    </div>
  );
};

  const filteredOrders = statusFilter === 'all'
    ? sellOrders
    : statusFilter === 'return'
      ? sellOrders.filter((order) => String(order.status || '').toLowerCase() === 'return')
      : sellOrders.filter((order) => order.status === statusFilter);

  const revenueSummary = filteredOrders.reduce(
    (totals, order) => {
      totals.revenue += Number(order.grandTotal || 0);
      totals.paid += order.status === "paid" ? 1 : 0;
      totals.pending += ['pending', 'partial'].includes(order.status) ? 1 : 0;
      return totals;
    },
    { revenue: 0, paid: 0, pending: 0 }
  );

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const visibleOrders = filteredOrders.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);

  const handleSellOrderExport = () => {
    const now = Date.now();
    if (now - lastExportAt < EXPORT_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((EXPORT_COOLDOWN_MS - (now - lastExportAt)) / 1000);
      alert(`Please wait ${waitSeconds}s before exporting again.`);
      return;
    }

    if (filteredOrders.length > MAX_EXPORT_ROWS) {
      alert(`Export is limited to ${MAX_EXPORT_ROWS} rows. Please narrow your filters.`);
      return;
    }

    exportSellOrdersData(filteredOrders, exportFormat);
    setLastExportAt(now);
  };

  const markOrderCancelled = (orderId) => {
    setSellOrders((orders) =>
      orders.map((order) =>
        String(order.id) === String(orderId)
          ? { ...order, status: 'cancelled' }
          : order
      )
    );

    setActiveOrder((current) => (
      current && String(current.id) === String(orderId)
        ? { ...current, status: 'cancelled' }
        : current
    ));
  };

  const markOrderReturned = (orderId) => {
    setSellOrders((orders) =>
      orders.map((order) =>
        String(order.id) === String(orderId)
          ? { ...order, status: 'return' }
          : order
      )
    );

    setActiveOrder((current) => (
      current && String(current.id) === String(orderId)
        ? { ...current, status: 'return' }
        : current
    ));
  };

  const executeOrderRequests = async (requests = []) => {
    for (const request of requests) {
      try {
        const options = {
          method: request.method,
          headers: request.body ? { 'Content-Type': 'application/json' } : {},
          ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        };

        const response = await apiFetch(request.url, options);
        if (response.ok) return true;
      } catch (requestError) {
        console.warn('Order action attempt failed:', requestError);
      }
    }

    return false;
  };

  const cancelOrder = async (order) => {
    if (!canManageSellOrders) {
      alert('Your role has read-only sell order access.');
      return;
    }

    if (!order || !order.id) return;
    if (String(order.status || '').toLowerCase() === 'cancelled') {
      alert('This order is already cancelled.');
      return;
    }

    const allowCancel = window.confirm(`Cancel order ${order.invoiceNo}?`);
    if (!allowCancel) return;

    setOpenActionMenuFor(null);
    setCancellingOrderId(order.id);

    const invoiceUrl = API_ENDPOINTS.invoiceById(order.id);
    const invoiceLegacyUrl = API_ENDPOINTS.invoiceLegacyById(order.id);
    const cancelPayload = {
      status: 'cancelled',
      paymentStatus: 'cancelled',
      cancelled: true,
      cancelReason: 'Cancelled from sell page',
    };

    const requests = [
      { url: `${invoiceUrl}/cancel`, method: 'POST' },
      { url: `${invoiceLegacyUrl}/cancel`, method: 'POST' },
      { url: invoiceUrl, method: 'PATCH', body: cancelPayload },
      { url: invoiceLegacyUrl, method: 'PATCH', body: cancelPayload },
      { url: invoiceUrl, method: 'PUT', body: cancelPayload },
      { url: invoiceLegacyUrl, method: 'PUT', body: cancelPayload },
      { url: invoiceUrl, method: 'DELETE' },
      { url: invoiceLegacyUrl, method: 'DELETE' },
    ];

    try {
      const cancelled = await executeOrderRequests(requests);

      if (cancelled) {
        markOrderCancelled(order.id);
        alert('Order cancelled successfully.');
      } else {
        alert('Unable to cancel this order from server. Please try again.');
      }
    } finally {
      setCancellingOrderId(null);
    }
  };

  const returnOrder = async (order) => {
    if (!canManageSellOrders) {
      alert('Your role has read-only sell order access.');
      return;
    }

    if (!order || !order.id) return;
    if (String(order.status || '').toLowerCase() === 'return') {
      alert('This order is already marked as return.');
      return;
    }

    const allowReturn = window.confirm(`Mark order ${order.invoiceNo} as return?`);
    if (!allowReturn) return;

    setCancellingOrderId(order.id);

    const invoiceUrl = API_ENDPOINTS.invoiceById(order.id);
    const invoiceLegacyUrl = API_ENDPOINTS.invoiceLegacyById(order.id);
    const normalizedInvoiceIdentifier = order.invoiceNo || order.id;
    const returnByInvoiceUrl = API_ENDPOINTS.returnByInvoice(normalizedInvoiceIdentifier);
    const returnByInvoiceFallbackUrl = API_ENDPOINTS.returnByInvoice(order.id);
    const returnItems = (Array.isArray(order.items) ? order.items : []).map((item, index) => ({
      productId: Number(item.productId ?? item.id ?? item.product_id ?? index + 1) || index + 1,
      productName: String(item.productName ?? item.item ?? item.name ?? `Item ${index + 1}`).trim(),
      quantity: Number(item.quantity ?? item.qty ?? 0) || 0,
      unitPrice: Number(item.unitPrice ?? item.rate ?? item.price ?? 0) || 0,
    })).filter((item) => Number(item.quantity) > 0);

    const returnPayload = {
      invoiceId: Number(order.id),
      reason: 'Damaged item',
      returnItems,
    };

    const requests = [
      {
        url: API_ENDPOINTS.returns,
        method: 'POST',
        body: returnPayload,
      },
      {
        url: returnByInvoiceUrl,
        method: 'POST',
        body: returnPayload,
      },
      {
        url: returnByInvoiceFallbackUrl,
        method: 'POST',
        body: returnPayload,
      },
      { url: `${invoiceUrl}/return`, method: 'POST', body: returnPayload },
      { url: `${invoiceLegacyUrl}/return`, method: 'POST', body: returnPayload },
      { url: invoiceUrl, method: 'PATCH', body: { ...returnPayload, status: 'return', paymentStatus: 'return', returned: true } },
      { url: invoiceLegacyUrl, method: 'PATCH', body: { ...returnPayload, status: 'return', paymentStatus: 'return', returned: true } },
      { url: invoiceUrl, method: 'PUT', body: { ...returnPayload, status: 'return', paymentStatus: 'return', returned: true } },
      { url: invoiceLegacyUrl, method: 'PUT', body: { ...returnPayload, status: 'return', paymentStatus: 'return', returned: true } },
    ];

    try {
      const markedReturned = await executeOrderRequests(requests);

      if (markedReturned) {
        markOrderReturned(order.id);
        alert('Order marked as return successfully.');
      } else {
        alert('Unable to mark this order as return from server. Please try again.');
      }
    } finally {
      setCancellingOrderId(null);
    }
  };

  return (
    <div className="sell-dashboard">
      <div className="page-header">
        <h1>📋 Sell Orders ({sellOrders.length})</h1>
        {error && <p className="error-text">{error}</p>}
        {loading && <p className="loading-text">🔄 Loading live sell orders...</p>}
        {!canManageSellOrders && <p className="error-text">Read-only mode: billing viewer access.</p>}
        <div className="sell-page-actions">
          <button
            type="button"
            className="btn-payment-report"
            disabled={!canManageSellOrders}
            onClick={() => setWhatsappOrderOpen(true)}
          >
            📱 WhatsApp Order
          </button>
          <button type="button" className="btn-payment-report" onClick={() => {
            if (onOpenPaymentReport) onOpenPaymentReport();
            else navigate('/payments');
          }}>
            Payment report
          </button>
          <div className="export-controls">
            <select
              className="export-select"
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value)}
              aria-label="Choose sell export format"
            >
              <option value="csv">CSV</option>
              <option value="excel">Excel</option>
            </select>
            <button className="btn-export" type="button" onClick={handleSellOrderExport}>
              ⬇️ Export
            </button>
          </div>
          <button
            className="btn-new-order"
            disabled={!canManageSellOrders}
            onClick={() => navigate("/billing")}
          >
            ➕ New Order
          </button>
        </div>
      </div>

      <div className="sell-kpi-row">
        <div className="sell-kpi-card primary">
          <span className="kpi-label">Total revenue</span>
          <strong>₹{revenueSummary.revenue.toLocaleString('en-IN')}</strong>
          <small>Across recent sales</small>
        </div>
        <div className="sell-kpi-card success">
          <span className="kpi-label">Paid orders</span>
          <strong>{revenueSummary.paid}</strong>
          <small>Collected successfully</small>
        </div>
        <div className="sell-kpi-card warning">
          <span className="kpi-label">Pending</span>
          <strong>{revenueSummary.pending}</strong>
          <small>Awaiting payment</small>
        </div>
      </div>

      <div className="orders-list" onClick={() => setOpenActionMenuFor(null)}>
        <div className="list-header">
          <span>Recent Orders</span>
          <span>Customer</span>
          <span>Amount</span>
          <span>Date</span>
          <span>Sold By</span>
          <span>Due Collection</span>
          <span className="status-header-cell">
            <span>Status</span>
            <button
              type="button"
              className={`status-filter-mini ${statusFilter}`}
              onClick={cycleStatusFilter}
              aria-label={`Filter status: ${statusFilter}`}
              title={
                statusFilter === 'all'
                  ? 'Show all bills'
                  : statusFilter === 'paid'
                    ? 'Show paid bills only'
                    : statusFilter === 'partial'
                      ? 'Show partially paid bills only'
                      : statusFilter === 'pending'
                        ? 'Show pending bills only'
                      : statusFilter === 'cancelled'
                        ? 'Show cancelled bills only'
                        : 'Show returned bills only'
              }
            >
              {statusFilter === 'all' ? '≣' : statusFilter === 'paid' ? '✓' : statusFilter === 'partial' ? '½' : statusFilter === 'pending' ? '≠' : '⨯'}
            </button>
          </span>
          <span>Actions</span>
        </div>

        {visibleOrders.map((order) => (
          (() => {
            const isRowActionBusy = String(cancellingOrderId) === String(order.id);
            return (
          <div
            key={order.id}
            className="order-row"
            onClick={() => selectOrder(order)}
          >
            <span>#{order.invoiceNo}</span>
            <span>{order.customer.name}</span>
            <span>₹{order.grandTotal.toLocaleString()}</span>
            <span>{order.date}</span>
            <span>{order.soldBy || loggedInSeller}</span>
            <span>₹{Number(order.dueCollection || 0).toLocaleString('en-IN')}</span>
            <span>
              <span className={`status-badge ${order.status}`}>
                {order.status}
              </span>
            </span>
            <span className="order-actions" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="order-action-btn"
                onClick={() => selectOrder(order)}
                disabled={isRowActionBusy}
                aria-label={`View ${order.invoiceNo}`}
                title="View order"
              >
                👁️
              </button>
              <button
                type="button"
                className="order-action-btn order-action-menu-btn"
                onClick={() => setOpenActionMenuFor((current) => current === order.id ? null : order.id)}
                disabled={isRowActionBusy}
                aria-label={`Open actions for ${order.invoiceNo}`}
                title="More actions"
              >
                ⋮
              </button>
              {openActionMenuFor === order.id && (
                <div className="order-action-menu" onClick={(event) => event.stopPropagation()}>
                  <button
                    type="button"
                    className="order-action-menu-item"
                    onClick={() => handleThreeDotMenuAction(order, 'repeat')}
                    disabled={isRowActionBusy}
                  >
                    Repeat Order
                  </button>
                  <button
                    type="button"
                    className="order-action-menu-item"
                    onClick={() => handleThreeDotMenuAction(order, 'sell')}
                    disabled={isRowActionBusy}
                  >
                    {isRowActionBusy ? 'Processing...' : 'Sell Order'}
                  </button>
                  <button
                    type="button"
                    className="order-action-menu-item"
                    onClick={() => handleThreeDotMenuAction(order, 'cancelled')}
                    disabled={isRowActionBusy}
                  >
                    Cancelled Order
                  </button>
                  <button
                    type="button"
                    className="order-action-menu-item"
                    onClick={() => handleThreeDotMenuAction(order, 'return')}
                    disabled={isRowActionBusy}
                  >
                    Return Order
                  </button>
                </div>
              )}
            </span>
          </div>
            );
          })()
        ))}
      </div>

      <div className="sell-pagination">
        <button
          type="button"
          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          disabled={safeCurrentPage <= 1}
        >
          ← Previous
        </button>
        <span>Page {safeCurrentPage} of {totalPages}</span>
        <button
          type="button"
          onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          disabled={safeCurrentPage >= totalPages}
        >
          Next →
        </button>
      </div>

      {activeOrder && (
        <div className="detail-container">
          <button
            type="button"
            className="invoice-close-button"
            onClick={() => setActiveOrder(null)}
            aria-label="Close invoice"
            title="Close invoice"
          >
            ×
          </button>
          <button
            className="back-to-list"
            onClick={() => setActiveOrder(null)}
          >
            ← Back to List
          </button>
          <OrderDetail order={activeOrder} onCollectPayment={openPaymentCollection} />
        </div>
      )}

      {whatsappOrderOpen && (
        <div className="payment-dialog-backdrop" role="presentation" onClick={() => setWhatsappOrderOpen(false)}>
          <section
            className="payment-dialog whatsapp-order-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="whatsapp-order-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="payment-dialog-close" onClick={() => setWhatsappOrderOpen(false)} aria-label="Close WhatsApp order">×</button>
            <h2 id="whatsapp-order-title">Create WhatsApp order</h2>
            <p>Convert a customer's WhatsApp request into a bill draft. No WhatsApp API or cloud messaging cost is required.</p>
            <form className="payment-dialog-form" onSubmit={(event) => { event.preventDefault(); createBillingDraftFromWhatsapp(); }}>
              <label>Customer name
                <input
                  required
                  maxLength="100"
                  value={whatsappOrderDraft.customerName}
                  onChange={(event) => setWhatsappOrderDraft((current) => ({ ...current, customerName: event.target.value }))}
                />
              </label>
              <label>WhatsApp phone
                <input
                  required
                  inputMode="tel"
                  maxLength="20"
                  value={whatsappOrderDraft.phone}
                  onChange={(event) => setWhatsappOrderDraft((current) => ({ ...current, phone: event.target.value }))}
                />
              </label>
              <label>Products requested
                <textarea
                  required
                  maxLength="1000"
                  rows="4"
                  placeholder="Example: 2 kg sugar, 1 litre oil"
                  value={whatsappOrderDraft.requestText}
                  onChange={(event) => setWhatsappOrderDraft((current) => ({ ...current, requestText: event.target.value }))}
                />
              </label>
              <label className="whatsapp-recurring-option">
                <input
                  type="checkbox"
                  checked={whatsappOrderDraft.recurring}
                  onChange={(event) => setWhatsappOrderDraft((current) => ({ ...current, recurring: event.target.checked }))}
                />
                Save as recurring/repeat purchase
              </label>
              {whatsappOrderError && <p className="payment-dialog-error" role="alert">{whatsappOrderError}</p>}
              <div className="payment-dialog-actions">
                <button type="button" className="payment-dialog-cancel" onClick={() => setWhatsappOrderOpen(false)}>Cancel</button>
                <button type="button" className="payment-dialog-cancel" onClick={saveWhatsappOrderDraft}>Save Draft</button>
                <button type="submit" className="btn-collect-payment">Create Billing Draft</button>
              </div>
            </form>

            {whatsappDrafts.length > 0 && (
              <div className="whatsapp-draft-list">
                <h3>Recent WhatsApp drafts</h3>
                {whatsappDrafts.slice(0, 5).map((draft) => (
                  <button
                    type="button"
                    key={draft.id}
                    onClick={() => setWhatsappOrderDraft({
                      customerName: draft.customerName,
                      phone: draft.phone,
                      requestText: draft.requestText,
                      recurring: Boolean(draft.recurring),
                    })}
                  >
                    <strong>{draft.customerName}</strong>
                    <span>{draft.requestText}</span>
                    {draft.recurring && <em>Recurring</em>}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {paymentTarget && (
        <div className="payment-dialog-backdrop" role="presentation" onClick={() => !paymentSaving && setPaymentTarget(null)}>
          <section
            className="payment-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="collect-payment-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="payment-dialog-close" onClick={() => !paymentSaving && setPaymentTarget(null)} aria-label="Close payment dialog">×</button>
            <h2 id="collect-payment-title">{paymentResult ? 'Payment recorded' : 'Collect payment'}</h2>
            <p><strong>{paymentTarget.invoiceNo}</strong> · {paymentTarget.customer.name}</p>
            <p>Balance due: ₹{Number(paymentTarget.dueCollection || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            {paymentResult ? (
              <div className="payment-result" role="status">
                <strong>Receipt: {paymentResult.receiptNo}</strong>
                <span>Collected: ₹{Number(paymentResult.amount || paymentAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} by {paymentResult.collectorName || loggedInSeller}</span>
                <button type="button" className="btn-collect-payment" onClick={() => {
                  setPaymentTarget(null);
                  if (onOpenPaymentReport) onOpenPaymentReport();
                  else navigate('/payments');
                }}>
                  View collection report
                </button>
                <button type="button" className="payment-dialog-cancel" onClick={() => setPaymentTarget(null)}>Done</button>
              </div>
            ) : (
              <form className="payment-dialog-form" onSubmit={submitCollectedPayment}>
                <label>Amount received (₹)
                  <input
                    type="number"
                    min="0.01"
                    max={paymentTarget.dueCollection}
                    step="0.01"
                    required
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                  />
                </label>
                <label>Payment method
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                    <option value="BANK">Bank transfer</option>
                    <option value="WALLET">Wallet</option>
                  </select>
                </label>
                <label>Reference (optional)
                  <input maxLength="255" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
                </label>
                {paymentError && <p className="payment-dialog-error" role="alert">{paymentError}</p>}
                <div className="payment-dialog-actions">
                  <button type="button" className="payment-dialog-cancel" onClick={() => setPaymentTarget(null)} disabled={paymentSaving}>Cancel</button>
                  <button type="submit" className="btn-collect-payment" disabled={paymentSaving}>
                    {paymentSaving ? 'Recording…' : 'Record payment'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default SellPage;