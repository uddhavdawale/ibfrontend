import React, { useState, useEffect, useCallback, useRef } from "react";
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

const parseExchangeRecords = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.exchanges)) return payload.exchanges;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data?.exchanges)) return payload.data.exchanges;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const SELL_ORDER_PAGE_SIZE = 200;

const extractInvoiceRecords = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  if (payload.id !== undefined || payload.invoiceId !== undefined || payload.invoiceNo || payload.invoiceNumber) {
    return [payload];
  }
  for (const key of ['content', 'items', 'invoices', 'results', 'records']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  if (payload.data !== undefined) return extractInvoiceRecords(payload.data);
  return null;
};

const fetchInvoicePages = async (endpointForPage) => {
  const fetchPage = async (page) => {
    const response = await apiFetch(endpointForPage(page));
    if (!response.ok) throw new Error(`Invoice request failed (${response.status}).`);
    const payload = await response.json();
    const records = extractInvoiceRecords(payload);
    if (!records) throw new Error('Invoice API returned an unsupported response format.');
    return { payload, records };
  };

  const firstPage = await fetchPage(0);
  const pageInfo = [
    firstPage.payload?.page,
    firstPage.payload?.pageable,
    firstPage.payload?.pagination,
    firstPage.payload?.meta,
    firstPage.payload?.data?.page,
    firstPage.payload?.data?.pageable,
    firstPage.payload?.data?.pagination,
    firstPage.payload?.data?.meta,
    firstPage.payload?.data,
    firstPage.payload,
  ].find((candidate) => candidate && (
    candidate.totalPages !== undefined
    || candidate.totalElements !== undefined
    || candidate.last !== undefined
  ));
  const pageSize = Number(pageInfo?.size || SELL_ORDER_PAGE_SIZE);
  const totalPages = Number(
    pageInfo?.totalPages
      ?? (pageInfo?.totalElements !== undefined
        ? Math.ceil(Number(pageInfo.totalElements) / pageSize)
        : undefined)
      ?? 1
  );
  if (!Number.isFinite(totalPages) || totalPages < 0 || totalPages > 100) {
    throw new Error('Invoice API returned invalid pagination details.');
  }

  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(totalPages - 1, 0) }, (_, index) => fetchPage(index + 1))
  );
  return [
    ...firstPage.records,
    ...remainingPages.flatMap((page) => page.records),
  ];
};

const fetchGstInvoices = async () => {
  try {
    return await fetchInvoicePages((page) => API_ENDPOINTS.invoicesPage(page, SELL_ORDER_PAGE_SIZE));
  } catch (primaryError) {
    try {
      return await fetchInvoicePages((page) => API_ENDPOINTS.invoiceLegacyPage(page, SELL_ORDER_PAGE_SIZE));
    } catch (legacyError) {
      throw new Error(`Unable to load GST invoices: ${legacyError.message || primaryError.message}`);
    }
  }
};

const formatExchangeAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';
};

const parseCurrencyCents = (value) => {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(String(value ?? '').trim().replace(/,/g, ''));
  if (!match) return null;

  const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0') || 0);
  return Number.isSafeInteger(cents) ? cents : null;
};

const toCurrencyCents = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? Math.round((amount + Math.sign(amount) * Number.EPSILON * Math.max(1, Math.abs(amount))) * 100)
    : null;
};

const formatCurrencyCents = (cents) => (cents / 100).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatExchangeDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-IN');
};

const generatePDF = async (order, shopProfile = readStoredShopProfile()) => {
  const currentShopProfile = await getCurrentShopProfile(true);
  return buildInvoicePdf({ ...order, shopProfile: currentShopProfile || shopProfile });
};

const sendWhatsAppPDF = async (order, shopProfile = readStoredShopProfile()) => {
  const paidAmount = Number(order.paidAmount ?? order.receivedAmount ?? 0);
  const dueAmount = Number(order.dueCollection ?? order.outstandingAmount ?? Math.max(Number(order.grandTotal || 0) - paidAmount, 0));
  const message = `Invoice ${order.invoiceNo}\nTotal: ₹${Number(order.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}\nPaid: ₹${paidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\nBalance: ₹${dueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const safeInvoiceNo = String(order.invoiceNo || order.id || 'invoice').replace(/[^a-zA-Z0-9_-]/g, '_');
  const pdf = await generatePDF(order, shopProfile);
  const pdfBlob = pdf.output("blob");

  const url = URL.createObjectURL(pdfBlob);
  const downloadLink = document.createElement("a");
  downloadLink.href = url;
  downloadLink.download = `invoice_${safeInvoiceNo}.pdf`;
  downloadLink.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  openWhatsAppChat(order.customer.phone, message);
  alert(
    `✅ PDF Downloaded!\n\n📎 Attach the invoice from Downloads in the open WhatsApp chat to send it.`
  );
};

const sendEmailPDF = async (order, shopProfile = readStoredShopProfile()) => {
  const pdf = await generatePDF(order, shopProfile);
  const pdfBlob = pdf.output("blob");
  const safeInvoiceNo = String(order.invoiceNo || order.id || 'invoice').replace(/[^a-zA-Z0-9_-]/g, '_');

  const subject = `Invoice ${order.invoiceNo} - Receipt`;
  const body = `Dear ${order.customer.name},

Invoice ${order.invoiceNo}.

Grand Total: ₹${order.grandTotal.toLocaleString()}
Paid: ₹${Number(order.paidAmount ?? order.receivedAmount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
Balance: ₹${Number(order.dueCollection ?? order.outstandingAmount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
Date: ${order.date}

The invoice PDF has been downloaded. Please attach it to this email.`;

  const emailUrl = `mailto:${order.customer.email}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  const link = document.createElement("a");
  const url = URL.createObjectURL(pdfBlob);
  link.href = url;
  link.download = `invoice_${safeInvoiceNo}.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

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

  const totalAmount = Number(
    invoice.grandTotal ??
    invoice.invoiceTotal ??
    invoice.totalAmount ??
    invoice.total ??
    grandTotal ??
    0
  );
  const reportedPaidAmount =
    invoice.paidAmount ??
    invoice.amountPaid ??
    invoice.totalPaid ??
    invoice.receivedAmount ??
    invoice.amountReceived;
  const reportedDueAmount =
    invoice.outstandingAmount ??
    invoice.invoiceDueAmount ??
    invoice.dueCollection ??
    invoice.dueAmount ??
    invoice.balanceDue ??
    invoice.pendingAmount;
  const paidAmount = Number(
    reportedPaidAmount ?? (
      reportedDueAmount != null
        ? Math.max(totalAmount - Number(reportedDueAmount), 0)
        : 0
    )
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
    const rawUnitPrice = item.price ?? item.unitPrice ?? item.rate;
    const unitPrice = Number(rawUnitPrice ?? 0);
    const gstRate = Number(item.gstRate ?? item.gst ?? item.taxRate ?? 0);
    const lineTotal = Number(item.total ?? item.amount ?? item.lineTotal ?? (unitPrice * quantity));

    return {
      sn: item.sn ?? itemIndex + 1,
      productId: item.productId ?? item.product_id ?? item.product?.id ?? item.productID ?? null,
      unitPriceAvailable: rawUnitPrice !== undefined && rawUnitPrice !== null && rawUnitPrice !== '',
      item: item.name ?? item.item ?? item.productName ?? `Item ${itemIndex + 1}`,
      hsn: item.hsn ?? item.hsnCode ?? "9999",
      qty: quantity,
      rate: unitPrice,
      gst: gstRate,
      total: lineTotal,
    };
  });

  const reportedGst = Number(
    invoice.totalGst ??
    invoice.gstAmount ??
    invoice.tax
  );
  const totalGst = Number.isFinite(reportedGst)
    ? Math.max(reportedGst, 0)
    : normalizedItems.reduce((sum, item) => sum + (item.rate * item.qty * item.gst) / 100, 0);
  const reportedGrandTotal = Number(
    invoice.grandTotal ??
    invoice.invoiceTotal ??
    invoice.totalAmount ??
    invoice.total ??
    invoice.amount ??
    Number.NaN
  );
  const itemSubtotal = normalizedItems.reduce((sum, item) => sum + item.rate * item.qty, 0);
  const subtotal = Number(invoice.subtotal ?? invoice.subTotal ?? (
    Number.isFinite(reportedGrandTotal)
      ? Math.max(reportedGrandTotal - totalGst, 0)
      : itemSubtotal
  ));
  const rawGrandTotal = Number.isFinite(reportedGrandTotal)
    ? Math.max(reportedGrandTotal, 0)
    : subtotal + totalGst;
  const grandTotalCents = Math.max(toCurrencyCents(rawGrandTotal) ?? 0, 0);
  const grandTotal = grandTotalCents / 100;

  const reportedPaidAmount =
    invoice.paidAmount ??
    invoice.amountPaid ??
    invoice.totalPaid ??
    invoice.receivedAmount ??
    invoice.amountReceived ??
    invoice.totalReceived ??
    invoice.totalPaidAmount;
  const reportedDueAmount =
    invoice.outstandingAmount ??
    invoice.invoiceDueAmount ??
    invoice.dueCollection ??
    invoice.dueAmount ??
    invoice.balanceDue ??
    invoice.pendingAmount ??
    invoice.pendingBalance;
  const paidValue = Number(reportedPaidAmount);
  const dueValue = Number(reportedDueAmount);
  const rawPaidAmount = Number.isFinite(paidValue)
    ? paidValue
    : Number.isFinite(dueValue)
      ? grandTotal - dueValue
      : String(invoice.paymentStatus || invoice.status || '').toLowerCase() === 'paid'
        ? grandTotal
        : 0;
  const paidAmountCents = Math.min(Math.max(toCurrencyCents(rawPaidAmount) ?? 0, 0), grandTotalCents);
  const paidAmount = paidAmountCents / 100;
  const dueCollection = (grandTotalCents - paidAmountCents) / 100;
  const resolvedStatus = resolvePaymentStatus({ ...invoice, paidAmount }, grandTotal);
  const previousBalance = Number(invoice.previousBalance ?? 0);
  const balanceAmount = Number(invoice.balanceAmount ?? invoice.currentBalance ?? previousBalance + dueCollection);
  const currentBalance = Number(invoice.currentBalance ?? balanceAmount);

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
    previousBalance,
    balanceAmount,
    currentBalance,
    soldBy: invoice.soldBy
      ?? invoice.soldByName
      ?? invoice.createdByName
      ?? invoice.createdBy
      ?? invoice.userName
      ?? invoice.username
      ?? fallbackSoldBy,
    dueCollection,
    paidAmount,
    receivedAmount: paidAmount,
    outstandingAmount: dueCollection,
    paymentStatus: resolvedStatus,
    status: resolvedStatus,
    billType: invoice.billType || (invoice.isGstInvoice === false ? 'non-gst' : 'gst'),
    items: normalizedItems,
    notes: invoice.notes ?? "",
    dueInDays: invoice.dueInDays ?? 7,
  };
};

const hasInvoicePaymentSnapshot = (invoice) => {
  const fields = [
    'paidAmount',
    'amountPaid',
    'totalPaid',
    'receivedAmount',
    'amountReceived',
    'outstandingAmount',
    'invoiceDueAmount',
    'dueCollection',
    'dueAmount',
    'balanceDue',
    'pendingAmount',
  ];
  return fields.some((field) => invoice?.[field] != null && Number.isFinite(Number(invoice[field])));
};

const fetchLatestInvoicePaymentState = async (order, fallbackSoldBy) => {
  const isNonGst = String(order.billType || '').toLowerCase().includes('non');
  const candidateUrls = [
    ...(isNonGst ? [API_ENDPOINTS.nonGstInvoiceById(order.id)] : [API_ENDPOINTS.invoiceById(order.id)]),
    API_ENDPOINTS.invoiceDetailsById(order.id),
    API_ENDPOINTS.invoiceItemsById(order.id),
    API_ENDPOINTS.invoiceLegacyById(order.id),
    API_ENDPOINTS.invoiceLegacyDetailById(order.id),
  ];
  let lastError = null;

  for (const url of candidateUrls) {
    try {
      const response = await apiFetch(url);
      if (response.status === 401) {
        const authError = new Error('Your session expired. Sign in again to refresh the invoice.');
        authError.status = 401;
        throw authError;
      }
      if (!response.ok) continue;

      const payload = await response.json();
      const invoice = payload?.invoice ?? payload?.data?.invoice ?? payload?.data ?? payload;
      if (!hasInvoicePaymentSnapshot(invoice)) continue;

      return normalizeInvoiceToOrder({ ...order, ...invoice }, 0, fallbackSoldBy);
    } catch (error) {
      if (error.status === 401) throw error;
      lastError = error;
    }
  }

  throw new Error(
    lastError?.message
      ? `Payment was recorded, but the latest invoice balance could not be confirmed: ${lastError.message}`
      : 'Payment was recorded, but the latest invoice balance could not be confirmed. Refresh the invoice before sharing it.'
  );
};

const getExchangeableItems = (order) => {
  const groupedItems = new Map();
  let unavailableItemCount = 0;

  (Array.isArray(order?.items) ? order.items : []).forEach((item) => {
    const productId = Number(item.productId);
    const quantity = Number(item.qty ?? item.quantity ?? 0);
    const rawUnitPrice = item.rate ?? item.unitPrice ?? item.price;
    const unitPrice = Number(rawUnitPrice ?? 0);
    const hasUnitPrice = item.unitPriceAvailable
      ?? (rawUnitPrice !== undefined && rawUnitPrice !== null && rawUnitPrice !== '');

    if (!Number.isSafeInteger(productId) || productId <= 0
      || !Number.isFinite(quantity) || quantity <= 0
      || !hasUnitPrice || !Number.isFinite(unitPrice) || unitPrice < 0) {
      unavailableItemCount += 1;
      return;
    }

    const key = String(productId);
    const existing = groupedItems.get(key);
    const returnedValue = quantity * unitPrice;

    if (existing) {
      existing.soldQuantity += quantity;
      existing.returnedValue += returnedValue;
    } else {
      groupedItems.set(key, {
        productId,
        productName: String(item.item ?? item.name ?? item.productName ?? `Product ${productId}`),
        soldQuantity: quantity,
        returnedValue,
      });
    }
  });

  return {
    items: Array.from(groupedItems.values()).map((item) => ({
      ...item,
      unitPrice: item.returnedValue / item.soldQuantity,
    })),
    unavailableItemCount,
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
  const [sellOrders, setSellOrders] = useState([]);
  const [shopProfile, setShopProfile] = useState(() => readStoredShopProfile());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sellOrdersRefreshKey, setSellOrdersRefreshKey] = useState(0);
  const [isSellOrdersRefreshing, setIsSellOrdersRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [exportFormat, setExportFormat] = useState('csv');
  const [openActionMenuFor, setOpenActionMenuFor] = useState(null);
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  const [exchangeTarget, setExchangeTarget] = useState(null);
  const [exchangeReason, setExchangeReason] = useState('');
  const [exchangeNewInvoiceAmount, setExchangeNewInvoiceAmount] = useState('');
  const [exchangeQuantities, setExchangeQuantities] = useState({});
  const [exchangeError, setExchangeError] = useState('');
  const [exchangeSaving, setExchangeSaving] = useState(false);
  const [exchangeMessage, setExchangeMessage] = useState('');
  const [exchangeRecords, setExchangeRecords] = useState([]);
  const [exchangeHistoryLoading, setExchangeHistoryLoading] = useState(true);
  const [exchangeHistoryError, setExchangeHistoryError] = useState('');
  const [exchangeHistoryRefreshing, setExchangeHistoryRefreshing] = useState(false);
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
  const [paymentInvoiceRefreshing, setPaymentInvoiceRefreshing] = useState(false);
  const [paymentInvoiceRefreshError, setPaymentInvoiceRefreshError] = useState('');
  const [paymentInvoiceAction, setPaymentInvoiceAction] = useState('');
  const [paymentInvoiceActionError, setPaymentInvoiceActionError] = useState('');
  const [paymentRefreshRequired, setPaymentRefreshRequired] = useState([]);
  const paymentSubmissionRef = useRef(false);
  const paymentAttemptRef = useRef(null);
  const [whatsappOrderOpen, setWhatsappOrderOpen] = useState(false);
  const [whatsappOrderDraft, setWhatsappOrderDraft] = useState({
    customerName: '',
    phone: '',
    requestText: '',
    recurring: false,
    frequency: 'weekly',
    nextPurchaseDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  });
  const [whatsappOrderError, setWhatsappOrderError] = useState('');
  const [whatsappDrafts, setWhatsappDrafts] = useState(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem('ib-whatsapp-order-drafts') || '[]');
      return Array.isArray(stored) ? stored.slice(0, 25) : [];
    } catch {
      return [];
    }
  });
  const pageSize = 5;
  const canManageSellOrders = canWriteBilling(role);
  const paymentReceiptIdentifier = paymentResult?.receiptNo
    || paymentResult?.receiptNumber
    || paymentResult?.receipt_no
    || paymentResult?.receipt_number
    || paymentResult?.paymentId
    || paymentResult?.payment_id
    || paymentResult?.id;

  const loadExchangeHistory = useCallback(async (silent = false) => {
    if (silent) setExchangeHistoryRefreshing(true);
    else setExchangeHistoryLoading(true);
    setExchangeHistoryError('');

    try {
      const response = await apiFetch(API_ENDPOINTS.exchanges, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (response.status === 403) {
        setExchangeHistoryError('You do not have permission to view exchange history.');
        return;
      }
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || `Unable to load exchange history (${response.status}).`);
      }

      setExchangeRecords(parseExchangeRecords(payload));
    } catch (loadError) {
      setExchangeHistoryError(loadError.message || 'Unable to load exchange history.');
    } finally {
      setExchangeHistoryLoading(false);
      setExchangeHistoryRefreshing(false);
    }
  }, [navigate]);

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
      frequency: whatsappOrderDraft.frequency,
      nextPurchaseDate: whatsappOrderDraft.nextPurchaseDate,
      createdAt: new Date().toISOString(),
    };
    const nextDrafts = [draft, ...whatsappDrafts].slice(0, 25);
    setWhatsappDrafts(nextDrafts);
    try {
      sessionStorage.setItem('ib-whatsapp-order-drafts', JSON.stringify(nextDrafts));
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

  const openExchangeOrder = async (order) => {
    if (!canManageSellOrders) {
      setError('Your role has read-only sell order access.');
      return;
    }

    if (!order || ['cancelled', 'return'].includes(String(order.status || '').toLowerCase())) {
      setError('Cancelled or fully returned orders cannot be exchanged.');
      return;
    }

    setExchangeMessage('');
    setExchangeError('');
    let orderWithItems = order;
    if (!Array.isArray(orderWithItems.items) || orderWithItems.items.length === 0) {
      setCancellingOrderId(order.id);
      try {
        orderWithItems = await fetchInvoiceDetail(order, loggedInSeller);
      } finally {
        setCancellingOrderId(null);
      }
    }

    const { items } = getExchangeableItems(orderWithItems);
    setExchangeTarget(orderWithItems);
    setExchangeReason('');
    setExchangeNewInvoiceAmount('');
    setExchangeQuantities(Object.fromEntries(items.map((item) => [String(item.productId), '0'])));
    setOpenActionMenuFor(null);
  };

  const submitExchange = async (event) => {
    event.preventDefault();
    if (!exchangeTarget || exchangeSaving) return;

    const invoiceId = Number(exchangeTarget.id);
    const newInvoiceAmount = Number(exchangeNewInvoiceAmount);
    if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) {
      setExchangeError('This order does not have a valid invoice ID and cannot be exchanged.');
      return;
    }

    if (!exchangeReason.trim()) {
      setExchangeError('Enter a reason for the exchange.');
      return;
    }

    if (!Number.isFinite(newInvoiceAmount) || newInvoiceAmount < 0
      || !Number.isInteger(newInvoiceAmount * 100)) {
      setExchangeError('Enter a valid new invoice amount with up to two decimal places.');
      return;
    }

    const { items: exchangeableItems } = getExchangeableItems(exchangeTarget);
    const hasInvalidQuantity = exchangeableItems.some((item) => {
      const quantity = Number(exchangeQuantities[String(item.productId)] || 0);
      return !Number.isFinite(quantity) || quantity < 0 || quantity > item.soldQuantity;
    });
    if (hasInvalidQuantity) {
      setExchangeError('Return quantities must be between zero and the quantity sold.');
      return;
    }

    const items = exchangeableItems.flatMap((item) => {
      const quantity = Number(exchangeQuantities[String(item.productId)] || 0);
      if (quantity === 0) return [];

      return [{
        productId: item.productId,
        productName: item.productName,
        quantity,
        unitPrice: item.unitPrice,
      }];
    });

    if (items.length === 0) {
      setExchangeError('Select at least one valid quantity to exchange.');
      return;
    }

    setExchangeSaving(true);
    setExchangeError('');
    try {
      const response = await apiFetch(API_ENDPOINTS.exchanges, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          reason: exchangeReason.trim(),
          newInvoiceAmount,
          items,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (response.status === 403) {
        setExchangeError('You do not have permission to exchange this order.');
        return;
      }
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || `Exchange could not be recorded (${response.status}).`);
      }

      setExchangeMessage(`Exchange recorded for ${exchangeTarget.invoiceNo}. Create any replacement bill separately from Billing.`);
      setExchangeTarget(null);
      await loadExchangeHistory(true);
    } catch (submitError) {
      setExchangeError(submitError.message || 'Exchange could not be recorded. Please retry.');
    } finally {
      setExchangeSaving(false);
    }
  };

  const getNextRecurringDate = (dateString, frequency) => {
    const date = new Date(`${dateString}T12:00:00`);
    if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
    if (frequency === 'monthly') date.setMonth(date.getMonth() + 1);
    else if (frequency === 'quarterly') date.setMonth(date.getMonth() + 3);
    else date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 10);
  };

  const createRecurringBillingDraft = (draft) => {
    if (!draft) return;
    navigate('/billing', {
      state: {
        whatsappOrder: {
          customer: { name: draft.customerName, phone: draft.phone, email: '' },
          requestText: draft.requestText,
        },
      },
    });

    if (draft.recurring) {
      const updatedDrafts = whatsappDrafts.map((item) => item.id === draft.id
        ? { ...item, nextPurchaseDate: getNextRecurringDate(item.nextPurchaseDate, item.frequency) }
        : item);
      setWhatsappDrafts(updatedDrafts);
      try {
        sessionStorage.setItem('ib-whatsapp-order-drafts', JSON.stringify(updatedDrafts));
      } catch {
        // Navigation can continue; the in-memory schedule remains available for this session.
      }
    }
  };

  const openPaymentCollection = (order) => {
    const previousAttempt = paymentAttemptRef.current;
    const sameInvoice = previousAttempt
      && String(previousAttempt.invoiceId) === String(order.id)
      && previousAttempt.billType === order.billType;
    setPaymentTarget(order);
    const balanceCents = toCurrencyCents(order.dueCollection || 0) || 0;
    setPaymentAmount(sameInvoice
      ? (previousAttempt.amountCents / 100).toFixed(2)
      : (balanceCents / 100).toFixed(2));
    setPaymentMethod(sameInvoice ? previousAttempt.method : 'CASH');
    setPaymentReference(sameInvoice ? previousAttempt.referenceNo : '');
    setPaymentError('');
    setPaymentResult(null);
    setPaymentInvoiceRefreshing(false);
    setPaymentInvoiceRefreshError('');
    setPaymentInvoiceAction('');
    setPaymentInvoiceActionError('');
    if (!sameInvoice) paymentAttemptRef.current = null;
  };

  const updatePaymentOrder = (updatedOrder) => {
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
    setPaymentTarget((current) => (
      current && String(current.id) === String(updatedOrder.id)
        && current.billType === updatedOrder.billType
        ? updatedOrder
        : current
    ));
  };

  const refreshPaymentInvoice = async (order = paymentTarget) => {
    if (!order || paymentInvoiceRefreshing) return;
    setPaymentInvoiceRefreshing(true);
    setPaymentInvoiceRefreshError('');
    try {
      const updatedOrder = await fetchLatestInvoicePaymentState(order, loggedInSeller);
      updatePaymentOrder(updatedOrder);
      const invoiceKey = `${updatedOrder.billType}:${updatedOrder.id}`;
      setPaymentRefreshRequired((keys) => keys.filter((key) => key !== invoiceKey));
    } catch (refreshError) {
      if (refreshError.status === 401) navigate('/login');
      setPaymentInvoiceRefreshError(refreshError.message || 'The latest invoice balance could not be confirmed.');
    } finally {
      setPaymentInvoiceRefreshing(false);
    }
  };

  const handlePaymentInvoiceAction = async (action) => {
    if (!paymentTarget || paymentInvoiceRefreshing || paymentInvoiceRefreshError || paymentInvoiceAction) return;
    setPaymentInvoiceAction(action);
    setPaymentInvoiceActionError('');
    try {
      if (action === 'download') {
        const pdf = await generatePDF(paymentTarget, shopProfile);
        const safeInvoiceNo = String(paymentTarget.invoiceNo || paymentTarget.id || 'invoice')
          .replace(/[^a-zA-Z0-9_-]/g, '_');
        pdf.save(`invoice_${safeInvoiceNo}.pdf`);
      } else if (action === 'whatsapp') {
        await sendWhatsAppPDF(paymentTarget, shopProfile);
      } else if (action === 'email') {
        await sendEmailPDF(paymentTarget, shopProfile);
      }
    } catch (actionError) {
      setPaymentInvoiceActionError(actionError.message || 'The updated invoice could not be prepared.');
    } finally {
      setPaymentInvoiceAction('');
    }
  };

  const submitCollectedPayment = async (event) => {
    event.preventDefault();
    if (!paymentTarget || paymentSaving || paymentSubmissionRef.current || paymentResult) return;
    const amountCents = parseCurrencyCents(paymentAmount);
    const balanceCents = toCurrencyCents(paymentTarget.dueCollection || 0);
    if (amountCents === null || amountCents <= 0
      || balanceCents === null || amountCents > balanceCents) {
      const balanceDue = balanceCents === null ? 'unavailable' : `₹${formatCurrencyCents(balanceCents)}`;
      setPaymentError(`Enter an amount up to the balance due of ${balanceDue}.`);
      return;
    }

    const referenceNo = paymentReference.trim();
    const previousAttempt = paymentAttemptRef.current;
    const sameInvoice = previousAttempt
      && String(previousAttempt.invoiceId) === String(paymentTarget.id)
      && previousAttempt.billType === paymentTarget.billType;
    const sameAttempt = sameInvoice
      && previousAttempt.amountCents === amountCents
      && previousAttempt.method === paymentMethod
      && previousAttempt.referenceNo === referenceNo;
    if (sameInvoice && previousAttempt.uncertain && !sameAttempt) {
      setPaymentError('A previous payment attempt may have reached the server. Retry it with the same details or verify its status in the collection report before changing the payment.');
      return;
    }

    let idempotencyKey;
    try {
      idempotencyKey = sameAttempt
        ? previousAttempt.idempotencyKey
        : createSecureIdempotencyKey();
    } catch (keyError) {
      setPaymentError(keyError.message || 'A secure payment reference could not be created.');
      return;
    }
    paymentAttemptRef.current = {
      invoiceId: paymentTarget.id,
      billType: paymentTarget.billType,
      amountCents,
      method: paymentMethod,
      referenceNo,
      idempotencyKey,
      uncertain: false,
    };
    paymentSubmissionRef.current = true;
    setPaymentSaving(true);
    setPaymentError('');
    try {
      const requestUrl = String(paymentTarget.billType).toLowerCase().includes('non')
        ? API_ENDPOINTS.nonGstInvoicePaymentsById(paymentTarget.id)
        : API_ENDPOINTS.invoicePaymentsById(paymentTarget.id);
      paymentAttemptRef.current.uncertain = true;
      const response = await apiFetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountCents / 100,
          method: paymentMethod,
          referenceNo: referenceNo || null,
          idempotencyKey,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        paymentAttemptRef.current.uncertain = response.status >= 500;
        if (response.status === 401) navigate('/login');
        throw new Error(payload.message || payload.error || `Payment could not be recorded (${response.status}).`);
      }

      const paymentRecord = payload?.payment ?? payload?.data?.payment ?? payload;
      paymentAttemptRef.current = null;
      const updatedPaidCents = (toCurrencyCents(paymentTarget.paidAmount || 0) || 0) + amountCents;
      const updatedDueCents = Math.max(
        (toCurrencyCents(paymentTarget.grandTotal || 0) || 0) - updatedPaidCents,
        0
      );
      const updatedPaid = updatedPaidCents / 100;
      const updatedDue = updatedDueCents / 100;
      const invoiceKey = `${paymentTarget.billType}:${paymentTarget.id}`;
      const estimatedOrder = normalizeInvoiceToOrder({
        ...paymentTarget,
        paidAmount: updatedPaid,
        receivedAmount: updatedPaid,
        dueCollection: updatedDue,
        outstandingAmount: updatedDue,
        paymentMethod,
        status: updatedDue === 0 ? 'paid' : 'partial',
      }, 0, loggedInSeller);
      updatePaymentOrder(estimatedOrder);
      setPaymentRefreshRequired((keys) => (keys.includes(invoiceKey) ? keys : [...keys, invoiceKey]));
      setPaymentResult(paymentRecord);
      setPaymentInvoiceRefreshing(true);
      setPaymentInvoiceRefreshError('');
      setPaymentInvoiceActionError('');
      setPaymentSaving(false);
      try {
        const updatedOrder = await fetchLatestInvoicePaymentState(paymentTarget, loggedInSeller);
        updatePaymentOrder(updatedOrder);
        setPaymentRefreshRequired((keys) => keys.filter((key) => key !== invoiceKey));
      } catch (refreshError) {
        if (refreshError.status === 401) navigate('/login');
        setPaymentInvoiceRefreshError(refreshError.message || 'Payment was recorded, but the latest invoice balance could not be confirmed.');
      } finally {
        setPaymentInvoiceRefreshing(false);
      }
    } catch (submitError) {
      setPaymentError(paymentAttemptRef.current?.uncertain
        ? `Payment status could not be confirmed. Retry with the same details to avoid recording it twice. ${submitError.message || ''}`.trim()
        : submitError.message || 'Payment could not be recorded. Please retry.');
    } finally {
      setPaymentSaving(false);
      paymentSubmissionRef.current = false;
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
      return;
    }

    if (action === 'exchange') {
      await openExchangeOrder(order);
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

  useEffect(() => {
    loadExchangeHistory();
  }, [loadExchangeHistory]);

  const selectOrder = async (order) => {
    if (!order) {
      setActiveOrder(null);
      return;
    }

    if (Array.isArray(order.items) && order.items.length > 0) {
      setActiveOrder((current) => (
        current && current.id === order.id && current.billType === order.billType ? null : order
      ));
      return;
    }

    const refreshedOrder = await fetchInvoiceDetail(order, loggedInSeller);
    setActiveOrder((current) => (
      current && current.id === order.id && current.billType === order.billType ? null : refreshedOrder
    ));
  };

  useEffect(() => {
    let active = true;

    const fetchSellOrders = async () => {
      setLoading(true);
      setError("");
      try {
        const results = await Promise.allSettled([
          fetchGstInvoices(),
          fetchInvoicePages((page) => API_ENDPOINTS.nonGstInvoicesPage(page, SELL_ORDER_PAGE_SIZE)),
        ]);
        const sources = [
          { billType: 'gst', label: 'GST', result: results[0] },
          { billType: 'non-gst', label: 'non-GST', result: results[1] },
        ];
        const failedSources = sources.filter(({ result }) => result.status === 'rejected');
        if (failedSources.length === sources.length) {
          throw new Error(failedSources
            .map(({ label, result }) => `${label}: ${result.reason.message}`)
            .join(' '));
        }

        const invoicesByKey = new Map();
        sources.forEach(({ billType, result }) => {
          if (result.status !== 'fulfilled') return;
          result.value.forEach((invoice) => {
            const invoiceId = invoice?.id
              ?? invoice?.invoiceId
              ?? invoice?.invoiceNo
              ?? invoice?.invoiceNumber
              ?? invoice?.invoice_number
              ?? JSON.stringify(invoice);
            const key = `${billType}:${invoiceId}`;
            if (!invoicesByKey.has(key)) {
              invoicesByKey.set(key, { ...invoice, billType });
            }
          });
        });

        const normalizedOrders = Array.from(invoicesByKey.values()).map((invoice, index) => (
          normalizeInvoiceToOrder(invoice, index, loggedInSeller)
        ));

        if (!active) return;
        normalizedOrders.sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          return (Number.isFinite(dateB) ? dateB : 0) - (Number.isFinite(dateA) ? dateA : 0);
        });
        setSellOrders(normalizedOrders);
        if (failedSources.length) {
          setError(`Some orders could not be loaded (${failedSources
            .map(({ label, result }) => `${label}: ${result.reason.message}`)
            .join(' ')}).`);
        }
      } catch (fetchError) {
        if (!active) return;
        console.error("Sell orders fetch failed:", fetchError);
        setError(`Unable to load sell orders: ${fetchError.message || 'Please try again.'}`);
      } finally {
        if (active) {
          setLoading(false);
          setIsSellOrdersRefreshing(false);
        }
      }
    };

    fetchSellOrders();
    return () => { active = false; };
  }, [loggedInSeller, sellOrdersRefreshKey]);

const OrderDetail = ({
  order,
  onCollectPayment,
  onRefreshPaymentInvoice,
  paymentRefreshRequired,
  paymentInvoiceRefreshing,
  paymentInvoiceRefreshError,
}) => {
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
        {canManageSellOrders && paymentRefreshRequired && !['cancelled', 'return'].includes(order.status) ? (
          <div className="payment-refresh-required" role="status">
            <span>Payment was recorded. Refresh the invoice balance before collecting again.</span>
            {paymentInvoiceRefreshError && <span className="payment-dialog-error" role="alert">{paymentInvoiceRefreshError}</span>}
            <button
              type="button"
              className="btn-collect-payment"
              onClick={() => onRefreshPaymentInvoice(order)}
              disabled={paymentInvoiceRefreshing}
            >
              {paymentInvoiceRefreshing ? 'Refreshing…' : 'Refresh invoice balance'}
            </button>
          </div>
        ) : canManageSellOrders && order.dueCollection > 0 && !['cancelled', 'return'].includes(order.status) && (
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
          disabled={paymentRefreshRequired}
          title={paymentRefreshRequired ? 'Refresh the invoice balance before sharing it' : undefined}
        >
          📱 WhatsApp PDF
        </button>
        <button
          className="btn-share-email"
          onClick={() => activeOrder && sendEmailPDF(activeOrder, shopProfile)}
          disabled={paymentRefreshRequired}
          title={paymentRefreshRequired ? 'Refresh the invoice balance before sharing it' : undefined}
        >
          ✉️ Email PDF
        </button>
        <button
          className="btn-print"
          onClick={() => printReceipt(activeOrder, shopProfile)}
          disabled={paymentRefreshRequired}
          title={paymentRefreshRequired ? 'Refresh the invoice balance before downloading it' : undefined}
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
  const exchangeData = exchangeTarget
    ? getExchangeableItems(exchangeTarget)
    : { items: [], unavailableItemCount: 0 };

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
        {exchangeMessage && <p className="sell-success-message" role="status">{exchangeMessage}</p>}
        {loading && <p className="loading-text">🔄 Loading live sell orders...</p>}
        {!canManageSellOrders && <p className="error-text">Read-only mode: billing viewer access.</p>}
        <div className="sell-page-actions">
          <button
            type="button"
            className={`tiny-refresh-btn ${isSellOrdersRefreshing ? 'is-loading' : ''}`}
            onClick={() => {
              setIsSellOrdersRefreshing(true);
              setSellOrdersRefreshKey((key) => key + 1);
            }}
            disabled={loading}
            aria-label="Refresh sell orders"
            title="Refresh sell orders"
          >
            ↻
          </button>
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
            const orderKey = `${order.billType}:${order.id}`;
            const isRowActionBusy = String(cancellingOrderId) === String(order.id);
            return (
          <div
            key={orderKey}
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
                onClick={() => setOpenActionMenuFor((current) => current === orderKey ? null : orderKey)}
                disabled={isRowActionBusy}
                aria-label={`Open actions for ${order.invoiceNo}`}
                title="More actions"
              >
                ⋮
              </button>
              {openActionMenuFor === orderKey && (
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
                  <button
                    type="button"
                    className="order-action-menu-item"
                    onClick={() => handleThreeDotMenuAction(order, 'exchange')}
                    disabled={isRowActionBusy || !canManageSellOrders || ['cancelled', 'return'].includes(String(order.status || '').toLowerCase())}
                  >
                    Exchange Order
                  </button>
                </div>
              )}
            </span>
          </div>
            );
          })()
        ))}
        {!loading && visibleOrders.length === 0 && (
          <div className="sell-empty-orders" role="status">
            {error ? 'Orders could not be loaded.' : 'No sell orders found.'}
          </div>
        )}
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

      <section className="exchange-history" aria-labelledby="exchange-history-title">
        <div className="exchange-history-header">
          <div>
            <h2 id="exchange-history-title">Exchange history ({exchangeRecords.length})</h2>
            <p>Recorded exchanges, returned quantities, stock credit, and invoice details.</p>
          </div>
          <button
            type="button"
            className="exchange-history-refresh"
            onClick={() => loadExchangeHistory(true)}
            disabled={exchangeHistoryLoading || exchangeHistoryRefreshing}
          >
            {exchangeHistoryRefreshing ? 'Refreshing…' : 'Refresh history'}
          </button>
        </div>

        {exchangeHistoryLoading ? (
          <p className="exchange-history-message">Loading exchange history…</p>
        ) : exchangeHistoryError ? (
          <p className="exchange-history-error" role="alert">{exchangeHistoryError}</p>
        ) : exchangeRecords.length === 0 ? (
          <p className="exchange-history-message">No exchanges recorded yet.</p>
        ) : (
          <div className="exchange-record-list">
            {exchangeRecords.map((record, index) => {
              const returnedItems = Array.isArray(record.items) ? record.items : [];
              const tenant = record.tenant && typeof record.tenant === 'object' ? record.tenant : {};
              const exchangeKey = record.id ?? `${record.invoiceId || 'invoice'}-${record.exchangeDate || index}`;
              const statusClass = String(record.status || 'recorded').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
              const tenantDetails = [
                tenant.name,
                tenant.code,
                tenant.address,
                tenant.city,
                tenant.pincode,
              ].filter(Boolean).join(' · ') || (record.tenant ? String(record.tenant) : '—');

              return (
                <details className="exchange-record" key={exchangeKey} open={index === 0}>
                  <summary>
                    <span className="exchange-record-primary">
                      <strong>{record.invoiceNo || `Invoice #${record.invoiceId ?? '—'}`}</strong>
                      <span>{record.customerName || 'Walk-in customer'} · {formatExchangeDate(record.exchangeDate)}</span>
                    </span>
                    <span className="exchange-record-summary">
                      <span className={`exchange-status ${statusClass}`}>{record.status || 'Recorded'}</span>
                      <strong>Credit {formatExchangeAmount(record.creditAmount)}</strong>
                    </span>
                  </summary>

                  <div className="exchange-record-details">
                    <dl className="exchange-record-metadata">
                      <div><dt>Exchange ID</dt><dd>{record.id ?? '—'}</dd></div>
                      <div><dt>Invoice ID</dt><dd>{record.invoiceId ?? '—'}</dd></div>
                      <div><dt>Customer</dt><dd>{record.customerName || '—'}</dd></div>
                      <div><dt>Phone</dt><dd>{record.customerPhone || '—'}</dd></div>
                      <div><dt>Exchange date</dt><dd>{formatExchangeDate(record.exchangeDate)}</dd></div>
                      <div><dt>Status</dt><dd>{record.status || 'Recorded'}</dd></div>
                      <div><dt>Reason</dt><dd>{record.reason || '—'}</dd></div>
                      <div><dt>Exchange credit</dt><dd>{formatExchangeAmount(record.creditAmount)}</dd></div>
                      <div><dt>New invoice amount</dt><dd>{formatExchangeAmount(record.newInvoiceAmount)}</dd></div>
                      <div><dt>Tenant</dt><dd>{tenantDetails}</dd></div>
                    </dl>

                    <h3>Returned items</h3>
                    {returnedItems.length === 0 ? (
                      <p className="exchange-history-message">No returned item details were included.</p>
                    ) : (
                      <div className="exchange-history-table-wrap">
                        <table className="exchange-history-table">
                          <thead>
                            <tr>
                              <th>Item ID</th>
                              <th>Product ID</th>
                              <th>Product</th>
                              <th>Quantity</th>
                              <th>Unit price</th>
                              <th>Credit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {returnedItems.map((item, itemIndex) => (
                              <tr key={item.id ?? `${item.productId ?? 'product'}-${itemIndex}`}>
                                <td>{item.id ?? '—'}</td>
                                <td>{item.productId ?? '—'}</td>
                                <td>{item.productName || '—'}</td>
                                <td>{item.quantity ?? '—'}</td>
                                <td>{formatExchangeAmount(item.unitPrice)}</td>
                                <td>{formatExchangeAmount(item.lineTotal ?? Number(item.quantity || 0) * Number(item.unitPrice || 0))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

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
          <OrderDetail
            order={activeOrder}
            onCollectPayment={openPaymentCollection}
            onRefreshPaymentInvoice={refreshPaymentInvoice}
            paymentRefreshRequired={paymentRefreshRequired.includes(`${activeOrder.billType}:${activeOrder.id}`)}
            paymentInvoiceRefreshing={paymentInvoiceRefreshing}
            paymentInvoiceRefreshError={paymentInvoiceRefreshError}
          />
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
              {whatsappOrderDraft.recurring && (
                <div className="whatsapp-recurring-fields">
                  <label>Frequency
                    <select
                      value={whatsappOrderDraft.frequency}
                      onChange={(event) => setWhatsappOrderDraft((current) => ({ ...current, frequency: event.target.value }))}
                    >
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                    </select>
                  </label>
                  <label>Next purchase date
                    <input
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      value={whatsappOrderDraft.nextPurchaseDate}
                      onChange={(event) => setWhatsappOrderDraft((current) => ({ ...current, nextPurchaseDate: event.target.value }))}
                    />
                  </label>
                </div>
              )}
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
                      frequency: draft.frequency || 'weekly',
                      nextPurchaseDate: draft.nextPurchaseDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                    })}
                  >
                    <strong>{draft.customerName}</strong>
                    <span>{draft.requestText}</span>
                    {draft.recurring && <em>Recurring</em>}
                  </button>
                ))}
              </div>
            )}

            {whatsappDrafts.some((draft) => draft.recurring) && (
              <div className="whatsapp-draft-list whatsapp-recurring-list">
                <h3>Recurring purchases</h3>
                {whatsappDrafts.filter((draft) => draft.recurring).slice(0, 5).map((draft) => {
                  const due = draft.nextPurchaseDate && draft.nextPurchaseDate <= new Date().toISOString().slice(0, 10);
                  return (
                    <div className="whatsapp-recurring-row" key={draft.id}>
                      <div>
                        <strong>{draft.customerName}</strong>
                        <span>{draft.frequency} · {draft.nextPurchaseDate}</span>
                      </div>
                      {due && <em>Due today</em>}
                      <button type="button" onClick={() => createRecurringBillingDraft(draft)}>
                        Create order
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {paymentTarget && (
        <div className="payment-dialog-backdrop" role="presentation" onClick={() => !paymentSaving && !paymentInvoiceRefreshing && setPaymentTarget(null)}>
          <section
            className="payment-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="collect-payment-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="payment-dialog-close" onClick={() => !paymentSaving && !paymentInvoiceRefreshing && setPaymentTarget(null)} aria-label="Close payment dialog">×</button>
            <h2 id="collect-payment-title">{paymentResult ? 'Payment recorded' : 'Collect payment'}</h2>
            <p><strong>{paymentTarget.invoiceNo}</strong> · {paymentTarget.customer.name}</p>
            <p>{paymentResult
              ? paymentRefreshRequired.includes(`${paymentTarget.billType}:${paymentTarget.id}`)
                ? 'Estimated balance (refresh required):'
                : 'Balance after collection:'
              : 'Balance due:'} ₹{formatCurrencyCents(toCurrencyCents(paymentTarget.dueCollection || 0) || 0)}</p>
            {paymentResult ? (
              <div className="payment-result" role="status">
                <strong>{paymentReceiptIdentifier
                  ? `Receipt: ${paymentReceiptIdentifier}`
                  : 'Payment successfully recorded'}</strong>
                <span>Collected: ₹{Number(paymentResult.amount ?? paymentResult.amountReceived ?? paymentAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} by {paymentResult.collectorName || paymentResult.collectedByName || paymentResult.collected_by_name || loggedInSeller}</span>
                {paymentInvoiceRefreshing && <span role="status">Refreshing the invoice balance…</span>}
                {paymentInvoiceRefreshError ? (
                  <>
                    <p className="payment-dialog-error" role="alert">{paymentInvoiceRefreshError} The payment was saved; do not record it again.</p>
                    <button
                      type="button"
                      className="btn-collect-payment"
                      onClick={() => refreshPaymentInvoice(paymentTarget)}
                      disabled={paymentInvoiceRefreshing}
                    >
                      {paymentInvoiceRefreshing ? 'Refreshing…' : 'Retry invoice refresh'}
                    </button>
                  </>
                ) : !paymentInvoiceRefreshing && (
                  <>
                    <span>Paid to date: ₹{Number(paymentTarget.paidAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    <span>Remaining balance: ₹{Number(paymentTarget.dueCollection || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    <div className="payment-invoice-actions">
                      <button
                        type="button"
                        className="btn-collect-payment"
                        onClick={() => handlePaymentInvoiceAction('download')}
                        disabled={Boolean(paymentInvoiceAction)}
                      >
                        {paymentInvoiceAction === 'download' ? 'Preparing…' : 'Download updated invoice'}
                      </button>
                      {paymentTarget.customer.phone && (
                        <button
                          type="button"
                          className="btn-share-whatsapp"
                          onClick={() => handlePaymentInvoiceAction('whatsapp')}
                          disabled={Boolean(paymentInvoiceAction)}
                        >
                          {paymentInvoiceAction === 'whatsapp' ? 'Preparing…' : 'WhatsApp invoice'}
                        </button>
                      )}
                      {paymentTarget.customer.email && (
                        <button
                          type="button"
                          className="btn-share-email"
                          onClick={() => handlePaymentInvoiceAction('email')}
                          disabled={Boolean(paymentInvoiceAction)}
                        >
                          {paymentInvoiceAction === 'email' ? 'Preparing…' : 'Prepare email'}
                        </button>
                      )}
                    </div>
                  </>
                )}
                {paymentInvoiceActionError && <p className="payment-dialog-error" role="alert">{paymentInvoiceActionError}</p>}
                <button type="button" className="btn-collect-payment" onClick={() => {
                  setPaymentTarget(null);
                  if (onOpenPaymentReport) onOpenPaymentReport();
                  else navigate('/payments');
                }} disabled={paymentInvoiceRefreshing || paymentSaving}>
                  View collection report
                </button>
                <button type="button" className="payment-dialog-cancel" onClick={() => setPaymentTarget(null)} disabled={paymentInvoiceRefreshing || paymentSaving}>Done</button>
              </div>
            ) : (
              <form className="payment-dialog-form" onSubmit={submitCollectedPayment}>
                <label>Amount received (₹)
                  <input
                    type="number"
                    min="0.01"
                    max={(toCurrencyCents(paymentTarget.dueCollection || 0) || 0) / 100}
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

      {exchangeTarget && (
        <div
          className="payment-dialog-backdrop"
          role="presentation"
          onClick={() => !exchangeSaving && setExchangeTarget(null)}
        >
          <section
            className="payment-dialog exchange-order-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exchange-order-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="payment-dialog-close"
              onClick={() => !exchangeSaving && setExchangeTarget(null)}
              aria-label="Close exchange order"
            >
              ×
            </button>
            <h2 id="exchange-order-title">Exchange order {exchangeTarget.invoiceNo}</h2>
            <p>Select quantities being returned. Returned stock and exchange credit are calculated by the backend.</p>
            <p className="exchange-order-note">Replacement items or invoices are not created here. Create any replacement bill separately from Billing.</p>

            {exchangeData.unavailableItemCount > 0 && (
              <p className="exchange-order-warning" role="status">
                {exchangeData.unavailableItemCount} invoice item(s) do not include a valid product ID or unit price and cannot be returned here.
              </p>
            )}

            {exchangeData.items.length > 0 ? (
              <div className="exchange-items-table-wrap">
                <table className="exchange-items-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Sold</th>
                      <th>Unit price</th>
                      <th>Return qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exchangeData.items.map((item) => (
                      <tr key={item.productId}>
                        <td>{item.productName}</td>
                        <td>{item.soldQuantity}</td>
                        <td>₹{item.unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max={item.soldQuantity}
                            step="any"
                            value={exchangeQuantities[String(item.productId)] || '0'}
                            onChange={(event) => {
                              setExchangeQuantities((current) => ({
                                ...current,
                                [String(item.productId)]: event.target.value,
                              }));
                              setExchangeError('');
                            }}
                            aria-label={`Return quantity for ${item.productName}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="exchange-order-warning" role="alert">
                No invoice items with valid product IDs are available to exchange.
              </p>
            )}

            <form className="payment-dialog-form" onSubmit={submitExchange}>
              <label>Reason for exchange
                <textarea
                  required
                  maxLength="500"
                  rows="3"
                  value={exchangeReason}
                  onChange={(event) => {
                    setExchangeReason(event.target.value);
                    setExchangeError('');
                  }}
                />
              </label>
              <label>New invoice amount (₹)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={exchangeNewInvoiceAmount}
                  onChange={(event) => {
                    setExchangeNewInvoiceAmount(event.target.value);
                    setExchangeError('');
                  }}
                />
              </label>
              <p className="exchange-order-note">This amount is stored with the exchange record; it does not create a replacement invoice.</p>
              {exchangeError && <p className="payment-dialog-error" role="alert">{exchangeError}</p>}
              <div className="payment-dialog-actions">
                <button
                  type="button"
                  className="payment-dialog-cancel"
                  onClick={() => setExchangeTarget(null)}
                  disabled={exchangeSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-collect-payment"
                  disabled={exchangeSaving || exchangeData.items.length === 0}
                >
                  {exchangeSaving ? 'Recording exchange…' : 'Record exchange'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};

export default SellPage;