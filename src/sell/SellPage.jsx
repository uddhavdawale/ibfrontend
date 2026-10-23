import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./SellPage.css";
import { API_BASE_URL, apiFetch } from "../Config/api";

// ✅ Dynamic PDF libs (no require, Vite‑safe)
const generatePDF = async (order) => {
  {/* comment added 4* */}
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");

  const pdf = new jsPDF("p", "mm", "a4"); 

  // Shop header
  pdf.setFontSize(20);
  pdf.setFont("helvetica", "bold");
  pdf.text("IB ENTERPRISES", 20, 25);

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.text("GSTIN: 27ABCDE1234F1Z5", 20, 33);
  pdf.text("Aurangabad, Maharashtra 431001", 20, 39);
  pdf.text("📞 +91 98765 43210", 20, 45);
  pdf.text("✉️ sales@ibenterprises.com", 20, 51);

  // Invoice details
  pdf.setFontSize(16);
  pdf.setFont("helvetica", "bold");
  pdf.text(`INVOICE #${order.invoiceNo}`, 20, 65);

  pdf.setFontSize(11);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Date: ${order.date}`, 20, 75);

  pdf.text(`Customer: ${order.customer.name}`, 20, 85);
  pdf.text(`Phone: ${order.customer.phone}`, 20, 92);
  pdf.text(`Payment: ${order.paymentMethod}`, 20, 99);

  // Items table
  const columns = [["S.No", "Description", "HSN", "Qty", "Rate", "GST%", "Amount"]];
  const rows = order.items.map((item) => [
    item.sn.toString(),
    item.item,
    item.hsn,
    item.qty.toString(),
    `₹${item.rate.toFixed(2)}`,
    `${item.gst}%`,
    `₹${item.total.toFixed(2)}`,
  ]);

  autoTable(pdf, {
    head: columns,
    body: rows,
    startY: 110,
    theme: "grid",
    styles: {
      fontSize: 9,
      cellPadding: 4,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [76, 175, 80],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 45 },
      6: { halign: "right" },
    },
  });

  const finalY = pdf.lastAutoTable.finalY + 15;
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.text(
    `Grand Total: ₹${order.grandTotal.toLocaleString()}`,
    140,
    finalY,
    { align: "right" }
  );

  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  pdf.text("Thank you for your business!", 20, 270);
  pdf.text("IB ENTERPRISES - Computer Generated Invoice", 20, 285);

  return pdf;
};

const sendWhatsAppPDF = async (order) => {
  const pdf = await generatePDF(order);
  const pdfBlob = pdf.output("blob");

  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `invoice_${order.invoiceNo}.pdf`;
  a.click();

  alert(
    `✅ PDF Downloaded!\n\n📱 Open WhatsApp → Attach → Select Downloads folder → Send!`
  );
  const whatsappUrl = `https://wa.me/${order.customer.phone}?text=🧾 Invoice ${order.invoiceNo} - Receipt Downloaded! 💰 ₹${order.grandTotal.toLocaleString()}`;
  window.open(whatsappUrl, "_blank");
};

const sendEmailPDF = async (order) => {
  const pdf = await generatePDF(order);
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

const printReceipt = async (order) => {
  const pdf = await generatePDF(order);
  pdf.save(`receipt_${order.invoiceNo}.pdf`);
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

const normalizeInvoiceToOrder = (invoice, index = 0) => {
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
    status: String(invoice.status ?? "paid").toLowerCase(),
    items: normalizedItems,
    notes: invoice.notes ?? "",
    dueInDays: invoice.dueInDays ?? 7,
  };
};

const fetchInvoiceDetail = async (invoiceSummary) => {
  const invoiceId = invoiceSummary?.id ?? invoiceSummary?.invoiceId;
  if (!invoiceId) return invoiceSummary;

  const candidateUrls = [
    `${API_BASE_URL}/api/invoices/${invoiceId}`,
    `${API_BASE_URL}/api/invoices/${invoiceId}/details`,
    `${API_BASE_URL}/api/invoices/${invoiceId}/items`,
    `${API_BASE_URL}/api/invoice/${invoiceId}`,
    `${API_BASE_URL}/api/invoice-detail/${invoiceId}`
  ];

  for (const url of candidateUrls) {
    try {
      const response = await apiFetch(url);
      if (!response.ok) continue;
      const detailData = await response.json();
      if (!detailData) continue;
      return normalizeInvoiceToOrder({ ...invoiceSummary, ...detailData }, 0);
    } catch (error) {
      console.warn("Invoice detail lookup failed for:", url, error);
    }
  }

  return invoiceSummary;
};

const SellPage = () => {
  const navigate = useNavigate();
  const [activeOrder, setActiveOrder] = useState(null);
  const [sellOrders, setSellOrders] = useState(fallbackSellOrders);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const selectOrder = async (order) => {
    if (!order) {
      setActiveOrder(null);
      return;
    }

    if (Array.isArray(order.items) && order.items.length > 0) {
      setActiveOrder((current) => (current && current.id === order.id ? null : order));
      return;
    }

    const refreshedOrder = await fetchInvoiceDetail(order);
    setActiveOrder((current) => (current && current.id === order.id ? null : refreshedOrder));
  };

  useEffect(() => {
    const fetchSellOrders = async () => {
      try {
        const response = await apiFetch(`${API_BASE_URL}/api/invoices?page=0&size=50`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const invoices = Array.isArray(data) ? data : data.content || data.invoices || data.data || [];
        let normalizedOrders = invoices.map((invoice, index) => normalizeInvoiceToOrder(invoice, index));

        normalizedOrders = await Promise.all(
          normalizedOrders.map(async (order) => {
            if (Array.isArray(order.items) && order.items.length > 0) return order;
            return fetchInvoiceDetail(order);
          })
        );

        if (normalizedOrders.length > 0) {
          normalizedOrders.sort((a, b) => new Date(b.date) - new Date(a.date));
          setSellOrders(normalizedOrders);
          setActiveOrder((current) => current ?? normalizedOrders[0]);
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
  }, []);

const OrderDetail = ({ order }) => {
  const totalQty = Array.isArray(order?.items)
    ? order.items.reduce((sum, i) => sum + Number(i.qty || 0), 0)
    : 0;

  return (
    <div className="order-detail">
      {/* Keep your header exactly as‑is */}
      <div className="detail-header">
        <div className="invoice-shop-info">
          <h2>IB ENTERPRISES</h2>
          <p>GSTIN: 27ABCDE1234F1Z5</p>
          <p>Aurangabad, Maharashtra 431001</p>
          <p>📞 +91 98765 43210</p>
          <p>✉️ sales@ibenterprises.com</p>
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
        <button
          className="btn-share-whatsapp"
          onClick={() => activeOrder && sendWhatsAppPDF(activeOrder)}
        >
          📱 WhatsApp PDF
        </button>
        <button
          className="btn-share-email"
          onClick={() => activeOrder && sendEmailPDF(activeOrder)}
        >
          ✉️ Email PDF
        </button>
        <button
          className="btn-print"
          onClick={() => printReceipt(activeOrder)}
        >
          💾 Download PDF
        </button>
      </div>
    </div>
  );
};

  const revenueSummary = sellOrders.reduce(
    (totals, order) => {
      totals.revenue += Number(order.grandTotal || 0);
      totals.paid += order.status === "paid" ? 1 : 0;
      totals.pending += order.status === "pending" ? 1 : 0;
      return totals;
    },
    { revenue: 0, paid: 0, pending: 0 }
  );

  return (
    <div className="sell-dashboard">
      <div className="page-header">
        <h1>📋 Sell Orders ({sellOrders.length})</h1>
        {error && <p className="error-text">{error}</p>}
        {loading && <p className="loading-text">🔄 Loading live sell orders...</p>}
        <button
          className="btn-new-order"
          onClick={() => navigate("/billing")}
        >
          ➕ New Order
        </button>
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

      <div className="orders-list">
        <div className="list-header">
          <span>Recent Orders</span>
          <span>Customer</span>
          <span>Amount</span>
          <span>Date</span>
          <span>Status</span>
          <span>Actions</span>
        </div>

        {sellOrders.map((order) => (
          <div
            key={order.id}
            className="order-row"
            onClick={() => selectOrder(order)}
          >
            <span>#{order.invoiceNo}</span>
            <span>{order.customer.name}</span>
            <span>₹{order.grandTotal.toLocaleString()}</span>
            <span>{order.date}</span>
            <span>
              <span className={`status-badge ${order.status}`}>
                {order.status}
              </span>
            </span>
            <span>👁️</span>
          </div>
        ))}
      </div>

      {activeOrder && (
        <div className="detail-container">
          <button
            className="back-to-list"
            onClick={() => setActiveOrder(null)}
          >
            ← Back to List
          </button>
          <OrderDetail order={activeOrder} />
        </div>
      )}
    </div>
  );
};

export default SellPage;