import { normalizeInvoiceData } from './invoiceData';
import { getShopDisplayName, readStoredShopProfile } from '../modules/shopProfile/shopProfileService';

export const buildInvoicePdf = async (invoiceData = {}) => {
  const { jsPDF } = await import('jspdf');
  const { autoTable } = await import('jspdf-autotable');

  const normalized = normalizeInvoiceData(invoiceData);
  const activeShopProfile = invoiceData.shopProfile || readStoredShopProfile();
  const shopDisplayName = getShopDisplayName(activeShopProfile);
  const { rows, subtotal, gstTotal, grandTotal, totalQty, customerName, customerPhone, paymentMethod, paymentStatus, invoiceNumber, issueDate } = normalized;

  const rupeeSymbol = 'Rs.';
  const formatCurrency = (value) => `${rupeeSymbol} ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const addWords = (value) => {
    const ones = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

    const convertBelowHundred = (num) => {
      if (num < 10) return ones[num];
      if (num < 20) return teens[num - 10];
      const rem = num % 10;
      return rem ? `${tens[Math.floor(num / 10)]} ${ones[rem]}` : tens[Math.floor(num / 10)];
    };

    const convertBelowThousand = (num) => {
      if (num < 100) return convertBelowHundred(num);
      const hundred = Math.floor(num / 100);
      const rem = num % 100;
      return rem ? `${ones[hundred]} hundred ${convertBelowHundred(rem)}` : `${ones[hundred]} hundred`;
    };

    const convert = (num) => {
      if (num === 0) return 'zero';
      const lakh = Math.floor(num / 100000);
      const remainingAfterLakh = num % 100000;
      const thousand = Math.floor(remainingAfterLakh / 1000);
      const remaining = remainingAfterLakh % 1000;

      let result = '';
      if (lakh > 0) result += `${convertBelowThousand(lakh)} lakh`;
      if (thousand > 0) result += `${result ? ' ' : ''}${convertBelowThousand(thousand)} thousand`;
      if (remaining > 0) result += `${result ? ' ' : ''}${convertBelowThousand(remaining)}`;
      return result;
    };

    const valueNum = Number(value || 0);
    const integerPart = Math.floor(valueNum);
    const decimalPart = Math.round((valueNum - integerPart) * 100);
    const amountInWords = convert(integerPart);
    const amountText = decimalPart > 0 ? `${amountInWords} and ${decimalPart}/100` : `${amountInWords}`;
    return `${amountText} rupees`;
  };
  const safeInvoiceNumber = String(invoiceNumber || '0000').startsWith('INV') ? String(invoiceNumber) : `INV-${invoiceNumber || '0000'}`;
  const invoiceLine = `Invoice: ${safeInvoiceNumber} | Date: ${issueDate}`;
  const invoiceStatus = String(paymentStatus || 'pending').toLowerCase() === 'paid' ? 'Paid' : 'Pending';

  const pdf = new jsPDF('p', 'mm', 'a4');
  const left = 16;

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, 210, 297, 'F');

  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'extraBold');
  pdf.setFontSize(24);
  pdf.text(shopDisplayName, left, 25);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.8);
  pdf.text(`GSTIN: ${activeShopProfile.gstin || activeShopProfile.gstNumber || '27ABCDE1234F1Z5'}`, left, 36);
  pdf.text(activeShopProfile.address || 'Aurangabad, Maharashtra 431001', left, 42);
  pdf.text(`Contact: ${activeShopProfile.phone || activeShopProfile.contactNumber || '+91 98765 43210'}`, left, 50);
  pdf.text(`Mail: ${activeShopProfile.email || activeShopProfile.supportEmail || 'sales@ibenterprises.com'}`, left, 56);

  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.text(invoiceLine, left, 63);

  pdf.setDrawColor(220, 223, 228);
  pdf.line(left, 72, 194, 72);

  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.8);
  const customerX = 122;
  pdf.text(`Customer: ${customerName}`, customerX, 25);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.6);
  pdf.text(`Phone: ${customerPhone}`, customerX, 34);
  pdf.text(`Payment Method: ${paymentMethod}`, customerX, 43);
  pdf.text(`Status: ${invoiceStatus}`, customerX, 52);
  pdf.setTextColor(15, 23, 42);

  autoTable(pdf, {
    head: [['S.No', 'Item', 'HSN', 'Qty', 'Rate', 'Amount', 'GST', 'GST', 'Total']],
    body: rows,
    startY: 82,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 3,
      overflow: 'linebreak',
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [15, 23, 42],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: 13 },
      1: { cellWidth: 42 },
      2: { cellWidth: 18 },
      3: { cellWidth: 12 },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 23, halign: 'right' },
      6: { cellWidth: 18, halign: 'center' },
      7: { cellWidth: 20, halign: 'right' },
      8: { cellWidth: 22, halign: 'right' },
    },
    margin: { left, right: left },
  });

  const summaryY = pdf.lastAutoTable.finalY + 8;
  const summaryHeight = 39;
  pdf.setFillColor(242, 244, 247);
  pdf.roundedRect(12, summaryY, 186, summaryHeight, 2, 2, 'F');
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(12, summaryY, 186, summaryHeight, 2, 2, 'S');

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.text('Total Qty:', 18, summaryY + 8);
  pdf.text(String(totalQty), 185, summaryY + 8, { align: 'right' });
  pdf.text('Subtotal:', 18, summaryY + 16);
  pdf.text(formatCurrency(subtotal), 185, summaryY + 16, { align: 'right' });
  pdf.text('GST Total:', 18, summaryY + 24);
  pdf.text(formatCurrency(gstTotal), 185, summaryY + 24, { align: 'right' });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Grand Total:', 18, summaryY + 34);
  pdf.text(formatCurrency(grandTotal), 185, summaryY + 34, { align: 'right' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.2);
  pdf.text(`${addWords(grandTotal)}`, 18, summaryY + 47);

  pdf.setTextColor(15, 23, 42);

  return pdf;
};

export default buildInvoicePdf;
