import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./SellPage.css";

// ✅ PDF with SPLIT HEADER DESIGN (SHOP | CUSTOMER)
// ✅ CLEAN DESIGN - NO HEADER BOXES & NO LINE BELOW HEADER
// ✅ UPDATED HEADER - SHOP LEFT ALIGN | CUSTOMER RIGHT ALIGN
// ✅ PROFESSIONAL TITLE LINE - Invoice# + Date SAME ROW
// ✅ CUSTOMER DETAILS LEFT ALIGNED (like totals at x=140)
const useShopConfig = () => {
  const [shopConfig, setShopConfig] = useState({
    name: "IB ENTERPRISES",
    gstin: "27ABCDE1234F1Z5",
    address: "Aurangabad, MH 431001",
    phone: "+91 98765 43210",
    email: "sales@ibenterprises.com",
  });

  useEffect(() => {
    fetch("/config.json")
      .then((response) => response.json())
      .then((data) => {
        console.log("✅ Shop Config Loaded:", data);
        setShopConfig({
          name: data.shop?.name || "IB ENTERPRISES",
          gstin: data.shop?.gstin || "27ABCDE1234F1Z5",
          address: data.shop?.address || "Aurangabad, MH 431001",
          phone: data.shop?.phone || "+91 98765 43210",
          email: data.shop?.email || "sales@ibenterprises.com",
        });
      })
      .catch((error) => {
        console.warn("⚠️ config.json not found, using defaults");
      });
  }, []);

  return shopConfig;
};

// ✅ UPDATED generatePDF - Uses dynamic shop details
const generatePDF = async (order, shopConfig) => {
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");

  const pdf = new jsPDF("p", "mm", "a4");

  // 1. DYNAMIC TITLE
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.text(shopConfig?.name || "IB ENTERPRISES", 105, 25, { align: "center" });

  // 2. DYNAMIC SHOP DETAILS LEFT | CUSTOMER RIGHT
  pdf.setFont("helvetica", "normal");
  pdf.text(`GSTIN: ${shopConfig?.gstin || "27ABCDE1234F1Z5"}`, 20, 32);
  pdf.text(shopConfig?.address || "Aurangabad, MH 431001", 20, 36);
  pdf.text(shopConfig?.phone || "+91 98765 43210", 20, 40);

  // CUSTOMER at x=125
  pdf.text(`${order?.customerName || "Customer"}`, 125, 32);
  pdf.text(`Phone: +91${order?.customerPhone || "██████████"}`, 125, 36);
  pdf.text(`Payment: ${order?.paymentMethod || "CASH"}`, 125, 40);

  // 3. TITLE ROW
  pdf.setFont("helvetica", "bold");
  pdf.text("GST TAX INVOICE", 20, 50);
  pdf.text(`#${order?.invoiceNo || "0000"}`, 60, 50);
  pdf.text(`Date: ${order?.date || "01/01/2026"}`, 150, 50, { align: "right" });

  // 4. TABLE
  const columns = [
    { header: "S.No", dataKey: "sno" },
    { header: "Description", dataKey: "item" },
    { header: "HSN", dataKey: "hsn" },
    { header: "Qty", dataKey: "qty" },
    { header: "Rate ", dataKey: "rate" },
    { header: "GST%", dataKey: "gst" },
    { header: "Total ", dataKey: "total" },
  ];

  const tableData = (order?.items || []).map((item, index) => ({
    sno: index + 1,
    item: item?.name || "Unknown item",
    hsn: item?.hsn || "9999",
    qty: item?.qty,
    rate: `${parseFloat(item?.price || 0).toFixed(2)}`,
    gst: `${item?.gstRate || 18}%`,
    total: `${parseFloat(item?.itemTotal || 0).toLocaleString()}`,
  }));

  autoTable(pdf, {
    columns: columns,
    body: tableData,
    startY: 58,
    theme: "plain",
    styles: {
      fontSize: 10,
      cellPadding: 4,
      halign: "left",
      valign: "middle",
      lineColor: [0, 0, 0],
      lineWidth: 0.1,
    },
    headStyles: {
      fontSize: 10,
      fontStyle: "bold",
      fillColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 52 },
      2: { cellWidth: 18, halign: "center" },
      3: { cellWidth: 12, halign: "center" },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 16, halign: "center" },
      6: { cellWidth: 28, halign: "right" },
    },
    margin: { left: 12, right: 12 },
  });

  // 5. TOTALS
  const finalY = pdf.lastAutoTable.finalY + 12;
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");
  pdf.text(
    `Total Items: ${order?.items?.length || 0}`,
    125,
    finalY
  );

  pdf.setFont("helvetica", "normal");
  pdf.text(
    `Subtotal: ${parseFloat(order?.subtotal || 0).toLocaleString()}`,
    125,
    finalY + 6
  );
  pdf.text(
    `GST: ${parseFloat(order?.totalGst || 0).toLocaleString()}`,
    125,
    finalY + 12
  );

  pdf.setFont("helvetica", "bold");
  pdf.text(
    `Grand Total: ${parseFloat(order?.grandTotal || 0).toLocaleString()}`,
    125,
    finalY + 20
  );

  pdf.line(12, finalY + 28, 198, finalY + 28);
  pdf.setFont("helvetica", "italic");
  pdf.text(
    "Thank you for your business!",
    105,
    finalY + 38,
    { align: "center" }
  );
  pdf.text(
    `${shopConfig?.name || "IB ENTERPRISES"} - Computer Generated`,
    105,
    finalY + 44,
    { align: "center" }
  );

  return pdf;
};

const SellPage = ({setActiveTab }) => {
  const navigate = useNavigate();
  const [activeOrder, setActiveOrder] = useState(null);
  const [sellOrders, setSellOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  

  // ✅ Use the hook inside SellPage
  const shopConfig = useShopConfig();

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        "http://localhost:8080/api/invoices?page=0&size=50"
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      console.log("API Response:", data);

      const apiOrders = (data.content || []).map((order) => ({
        id: order.id,
        invoiceNo: order.invoiceNo,
        date: new Date(order.date).toLocaleDateString("en-IN"),
        customerName: order.customerName,
        customerPhone: order.customerPhone?.replace(/[^0-9]/g, "") || "",
        paymentMethod: order.paymentMethod,
        subtotal: parseFloat(order.subtotal || 0),
        totalGst: parseFloat(order.gstAmount || 0),
        grandTotal: parseFloat(order.grandTotal || 0),
        status: "paid",
        customer: {
          name: order.customerName,
          phone: order.customerPhone,
        },
        items: (order.items || []).map((item) => ({
          name: item.name,
          hsn: item.hsn || "9999",
          qty: parseInt(item.qty || 1),
          price: parseFloat(item.price || 0),
          gstRate: parseInt(item.gstRate || 18),
          itemTotal: parseFloat(item.itemTotal || 0),
        })),
      }));

      console.log("Mapped Orders:", apiOrders);
      setSellOrders(apiOrders);
    } catch (error) {
      console.error("Fetch failed:", error);
      setSellOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  if (loading) {
    return (
      <div className="sell-dashboard">
        <div className="page-header">
          <h1>📋 Sell Orders</h1>
        </div>
        <div className="loading">🔄 Loading invoices...</div>
      </div>
    );
  }

  // ✅ Moved helpers inside SellPage and pass shopConfig
  const sendWhatsAppPDF = async (order) => {
    const pdf = await generatePDF(order, shopConfig);
    const pdfBlob = pdf.output("blob");

    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice_${order.invoiceNo}.pdf`;
    a.click();

    const whatsappUrl = `https://wa.me/91${
      order.customerPhone || ""
    }?text=🧾%20Invoice%20${order.invoiceNo}%20-%20₹${parseFloat(
      order.grandTotal || 0
    ).toLocaleString()}`;
    window.open(whatsappUrl, "_blank");
  };

  const sendEmailPDF = async (order) => {
    const pdf = await generatePDF(order, shopConfig);
    const pdfBlob = pdf.output("blob");

    const subject = `Invoice ${order.invoiceNo} - Receipt`;
    const body = `Dear ${order.customerName || "Customer"},\n\nReceipt for Invoice ${order.invoiceNo} attached.\n\nGrand Total: ₹${parseFloat(order.grandTotal || 0).toLocaleString()}\nDate: ${order.date}`;

    const emailUrl = `mailto:test@example.com?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(pdfBlob);
    link.download = `invoice_${order.invoiceNo}.pdf`;
    link.click();
    window.location.href = emailUrl;
  };

  const printReceipt = async (order) => {
    const pdf = await generatePDF(order, shopConfig);
    pdf.save(`receipt_${order.invoiceNo}.pdf`);
  };
 const handleNewOrder = () => {
    // Switch to Billing tab from Sell
    if (setActiveTab) {
      setActiveTab("billing");
    }
  };
  return (
    <div className="sell-dashboard">
      <div className="page-header">
        <h1>📋 Sell Orders ({sellOrders.length})</h1>
        
        <button className="btn-new-order" onClick={handleNewOrder}>
          ➕ New Order
        </button>

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

        {sellOrders.map((order) => 
          (
          <div
            key={order.id}
            className="order-row"
            onClick={() => setActiveOrder(order)}
          >
            <span>#{order.invoiceNo}</span>
            <span>{order.customerName}</span>
            <span>{order.grandTotal.toLocaleString()}</span>
            <span>{order.date}</span>
            <span>
              <span className="status-badge paid">paid</span>
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
          <OrderDetail
            order={activeOrder}
            onWhatsAppPDF={sendWhatsAppPDF}
            onEmailPDF={sendEmailPDF}
            onPrintPDF={printReceipt}
          />
        </div>
      )}
    </div>
  );
};

const OrderDetail = ({ order, onWhatsAppPDF, onEmailPDF, onPrintPDF }) => {
  return (
    <div className="order-detail">
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
            <strong>Customer:</strong> {order.customerName}
          </div>
          <div>
            <strong>Phone:</strong> +91 {order.customerPhone}
          </div>
          <div>
            <strong>Payment:</strong> {order.paymentMethod}
          </div>
          <div>
            <strong>Status:</strong>{" "}
            <span className="status-badge paid">paid</span>
          </div>
        </div>
      </div>

      <div className="items-list">
        <table>
          <thead>
            <tr>
              <th>S.No</th>
              <th>Item</th>
              <th>HSN</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>GST%</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, index) => (
              <tr key={index}>
                <td>{index + 1}</td>
                <td>{item.name}</td>
                <td>{item.hsn}</td>
                <td>{item.qty}</td>
                <td>{item.price.toFixed(2)}</td>
                <td>{item.gstRate}%</td>
                <td>{item.itemTotal.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="order-totals">
        <div className="totals-grid">
          <div>Total Items:</div>
          <div>{order.items.length}</div>
          <div>Subtotal:</div>
          <div>{order.subtotal.toLocaleString()}</div>
          <div>GST:</div>
          <div>{order.totalGst.toLocaleString()}</div>
          <div className="grand-total-row">
            <strong>Grand Total:</strong>
            <div>{order.grandTotal.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="action-buttons">
        <button
          className="btn-share-whatsapp"
          onClick={() => onWhatsAppPDF(order)}
        >
          📱 WhatsApp PDF
        </button>
        <button
          className="btn-share-email"
          onClick={() => onEmailPDF(order)}
        >
          ✉️ Email PDF
        </button>
        <button
          className="btn-print"
          onClick={() => onPrintPDF(order)}
        >
          💾 Download PDF
        </button>
      </div>
    </div>
  );
};

export default SellPage;