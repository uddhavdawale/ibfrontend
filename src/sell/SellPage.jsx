import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './SellPage.css';
import jsPDF from 'jspdf';

import html2canvas from 'html2canvas';

const SellPage = () => {
  const navigate = useNavigate();
  const [activeOrder, setActiveOrder] = useState(null);
  const [printMode, setPrintMode] = useState(false);

  // Multiple Sell Orders Data
  const sellOrders = [
    {
      id: 1,
      invoiceNo: "INV-2026/001",
      date: "07-Apr-2026",
      customer: { name: "Uddhav Dawale", phone: "+919595934249", email: "uddhavdawale2@gmail.com" },
      paymentMethod: "UPI (PhonePe)",
      subtotal: 2597.00,
      totalGst: 73.50,
      grandTotal: 2670.50,
      status: "paid",
      items: [
        { sn: 1, item: "Basmati Rice 5KG", hsn: "1006", qty: 4, rate: 250.00, gst: 5, total: 1050.00 },
        { sn: 2, item: "Aashirvaad Atta 10KG", hsn: "1101", qty: 2, rate: 450.00, gst: 5, total: 945.00 },
        { sn: 3, item: "Fortune Soya Oil 5L", hsn: "1512", qty: 3, rate: 220.00, gst: 18, total: 602.00 }
      ]
    },
    {
      id: 2,
      invoiceNo: "INV-2026/002",
      date: "06-Apr-2026",
      customer: { name: "Rajesh Patil", phone: "+919595934249", email: "uddhavdawale2@gmail.com" },
      paymentMethod: "Cash",
      subtotal: 1845.00,
      totalGst: 55.35,
      grandTotal: 1900.35,
      status: "paid",
      items: [
        { sn: 1, item: "Maida 5KG", hsn: "1101", qty: 3, rate: 180.00, gst: 5, total: 567.00 },
        { sn: 2, item: "Sugar 10KG", hsn: "1701", qty: 2, rate: 640.00, gst: 5, total: 1344.00 }
      ]
    },
    {
      id: 3,
      invoiceNo: "INV-2026/003",
      date: "05-Apr-2026",
      customer: { name: "Priya Sharma", phone: "+", email: "priya@sharma.com" },
      paymentMethod: "Card",
      subtotal: 1250.00,
      totalGst: 112.50,
      grandTotal: 1362.50,
      status: "pending",
      items: [
        { sn: 1, item: "Detergent 1KG", hsn: "3402", qty: 5, rate: 250.00, gst: 18, total: 1250.00 }
      ]
    }
  ];

const generatePDF = async (order) => {
  // 👈 FIX: Import INSIDE function
  const { autoTable } = await import('jspdf-autotable');
  
  const pdf = new jsPDF('p', 'mm', 'a4');
  
  // Header
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text('IB ENTERPRISES', 20, 25);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('GSTIN: 27ABCDE1234F1Z5', 20, 33);
  pdf.text('Aurangabad, Maharashtra 431001', 20, 39);
  pdf.text('📞 +91 98765 43210', 20, 45);
  
  // Invoice Details
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`INVOICE #${order.invoiceNo}`, 20, 65);
  
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Date: ${order.date}`, 20, 75);
  pdf.text(`Customer: ${order.customer.name}`, 20, 85);
  pdf.text(`Phone: ${order.customer.phone}`, 20, 92);
  pdf.text(`Payment: ${order.paymentMethod}`, 20, 99);
  
  // Items Table
  const columns = [['S.No', 'Description', 'HSN', 'Qty', 'Rate', 'GST%', 'Amount']];
  const rows = order.items.map(item => [
    item.sn.toString(),
    item.item,
    item.hsn,
    item.qty.toString(),
    `₹${item.rate.toFixed(2)}`,
    `${item.gst}%`,
    `₹${item.total.toFixed(2)}`
  ]);
  
  autoTable(pdf, {
    head: columns,
    body: rows,
    startY: 110,
    theme: 'grid',
    styles: { 
      fontSize: 9, 
      cellPadding: 4,
      overflow: 'linebreak'
    },
    headStyles: { 
      fillColor: [76, 175, 80],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 10
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 45 },
      6: { halign: 'right' }
    }
  });
  
  // Totals
  const finalY = pdf.lastAutoTable.finalY + 15;
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Grand Total: ₹${order.grandTotal.toLocaleString()}`, 140, finalY, { align: 'right' });
  
  // Footer
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Thank you for your business!', 20, 270);
  pdf.text('IB ENTERPRISES - Computer Generated Invoice', 20, 285);
  
  return pdf;
};

const sendWhatsAppPDF = async (order) => {
  const pdf = await generatePDF(order);
  const pdfBlob = pdf.output('blob');
  
  // 👈 STEP 1: AUTO DOWNLOAD PDF
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice_${order.invoiceNo}.pdf`;
  a.click();
  
  // 👈 STEP 2: Open WhatsApp (user attaches PDF manually)
  alert(`✅ PDF Downloaded!\n\n📱 Open WhatsApp → Attach → Select Downloads folder → Send!`);
  const whatsappUrl = `https://wa.me/${order.customer.phone.slice(1)}?text=🧾 Invoice ${order.invoiceNo} - Receipt Downloaded! 💰 ₹${order.grandTotal.toLocaleString()}`;
  window.open(whatsappUrl, '_blank');
};
const sendEmailPDF = async (order) => {
  const pdf = await generatePDF(order);
  const pdfBlob = pdf.output('blob');
  
  const subject = `Invoice ${order.invoiceNo} - Receipt`;
  const body = `Dear ${order.customer.name},

Receipt for Invoice ${order.invoiceNo} attached.

Grand Total: ₹${order.grandTotal.toLocaleString()}
Date: ${order.date}`;

  const emailUrl = `mailto:${order.customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  
  // Download PDF first
  const link = document.createElement('a');
  link.href = URL.createObjectURL(pdfBlob);
  link.download = `invoice_${order.invoiceNo}.pdf`;
  link.click();
  
  // Open email client
  window.location.href = emailUrl;
};

const printReceipt = async (order) => {
  const pdf = await generatePDF(order);
  pdf.save(`receipt_${order.invoiceNo}.pdf`);
};

  const OrderDetail = ({ order }) => (
    <div className="order-detail">
      <div className="detail-header">
        <div className="invoice-meta">
          <h2>Invoice #{order.invoiceNo}</h2>
          <div className="meta-row">
            <span>Date: {order.date}</span>
            <span>Status: <span className={`status ${order.status}`}>{order.status.toUpperCase()}</span></span>
          </div>
        </div>
        <div className="customer-info">
          <h3>{order.customer.name}</h3>
          <div className="contact-details">
            📞 {order.customer.phone} | ✉️ {order.customer.email}
          </div>
          <div>Payment: {order.paymentMethod}</div>
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
              <th>GST</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map(item => (
              <tr key={item.sn}>
                <td>{item.sn}</td>
                <td>{item.item}</td>
                <td>{item.hsn}</td>
                <td>{item.qty}</td>
                <td>₹{item.rate.toFixed(2)}</td>
                <td>{item.gst}%</td>
                <td>₹{item.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="order-totals">
        <div className="totals-grid">
          <div>Subtotal:</div>
          <div>₹{order.subtotal.toLocaleString()}</div>
          <div>GST Total:</div>
          <div>₹{order.totalGst.toLocaleString()}</div>
          <div className="grand-total-row">
            <strong>Grand Total:</strong>
            <div>₹{order.grandTotal.toLocaleString()}</div>
          </div>
        </div>
      </div>

     <div className="action-buttons">
  <button className="btn-share-whatsapp" onClick={() => sendWhatsAppPDF(activeOrder)}>
    📱 WhatsApp PDF
  </button>
  <button className="btn-share-email" onClick={() => sendEmailPDF(activeOrder)}>
    ✉️ Email PDF
  </button>
  <button className="btn-print" onClick={() => printReceipt(activeOrder)}>
    💾 Download PDF
  </button>
</div>
    </div>
  );

  const printInvoice = (order) => {
    setPrintMode(true);
    window.print();
    setPrintMode(false);
  };

  return (
    <div className={`sell-dashboard ${printMode ? 'print-mode' : ''}`}>
      <div className="page-header">
        <h1>📋 Sell Orders ({sellOrders.length})</h1>
        <button className="btn-new-order" onClick={() => navigate('/billing')}>
          ➕ New Order
        </button>
      </div>

      {!printMode && (
        <div className="orders-list">
          <div className="list-header">
            <span>Recent Orders</span>
            <span>Customer</span>
            <span>Amount</span>
            <span>Date</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {sellOrders.map(order => (
            <div key={order.id} className="order-row" onClick={() => setActiveOrder(order)}>
              <span>#{order.invoiceNo}</span>
              <span>{order.customer.name}</span>
              <span>₹{order.grandTotal.toLocaleString()}</span>
              <span>{order.date}</span>
              <span><span className={`status-badge ${order.status}`}>{order.status}</span></span>
              <span>👁️</span>
            </div>
          ))}
        </div>
      )}

      {activeOrder && !printMode && (
        <div className="detail-container">
          <button className="back-to-list" onClick={() => setActiveOrder(null)}>← Back to List</button>
          <OrderDetail order={activeOrder} />
        </div>
      )}

      {printMode && activeOrder && <OrderDetail order={activeOrder} />}
    </div>
  );
};

export default SellPage;