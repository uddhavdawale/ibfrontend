import { normalizeInvoiceData } from './invoiceData';
import { getShopDisplayName, readStoredShopProfile } from '../modules/shopProfile/shopProfileService';

export const buildInvoicePdf = async (invoiceData = {}) => {
  const { jsPDF } = await import('jspdf');
  const { autoTable } = await import('jspdf-autotable');

  const normalized = normalizeInvoiceData(invoiceData);
  const activeShopProfile = invoiceData.shopProfile || readStoredShopProfile();
  const shopDisplayName = getShopDisplayName(activeShopProfile);
  const { rows, subtotal, gstTotal, grandTotal, receivedAmount, previousBalance, balanceAmount, currentBalance, customerName, customerPhone, paymentMethod, paymentStatus, invoiceNumber, issueDate } = normalized;
  const isNonGstInvoice = String(invoiceData.billType ?? '').toLowerCase() === 'non-gst' || String(invoiceData.billType ?? '').toLowerCase() === 'non gst';

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
  const statusLower = String(paymentStatus || 'pending').toLowerCase();
  const invoiceStatus = statusLower === 'paid' ? 'PAID' : statusLower === 'partial' ? 'PARTIALLY PAID' : 'PENDING';
  const statusColor = statusLower === 'paid' ? [22, 163, 74] : statusLower === 'partial' ? [217, 119, 6] : [220, 38, 38];

  const pdf = new jsPDF('p', 'mm', 'a4');
  const left = 16;
  const right = 194;
  const pageWidth = 210;

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageWidth, 297, 'F');

  // Header band
  pdf.setFillColor(27, 141, 84);
  pdf.rect(0, 0, pageWidth, 38, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text(shopDisplayName, left, 17);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.text(`GSTIN: ${activeShopProfile.gstin || activeShopProfile.gstNumber || ''}`, left, 24);
  pdf.text(activeShopProfile.address || '', left, 29.5);
  pdf.text(`${activeShopProfile.phone || activeShopProfile.contactNumber || '+91 98765 43210'}  |  ${activeShopProfile.email || activeShopProfile.supportEmail || 'sales@ibenterprises.com'}`, left, 35);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(isNonGstInvoice ? 'INVOICE' : 'TAX INVOICE', right, 15, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`No: ${safeInvoiceNumber}`, right, 22, { align: 'right' });
  pdf.text(`Date: ${issueDate}`, right, 27.5, { align: 'right' });

  pdf.setFillColor(...statusColor);
  const statusLabelWidth = pdf.getTextWidth(invoiceStatus) + 8;
  pdf.roundedRect(right - statusLabelWidth, 30, statusLabelWidth, 6.5, 1.5, 1.5, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.text(invoiceStatus, right - statusLabelWidth / 2, 34.5, { align: 'center' });

  pdf.setTextColor(15, 23, 42);

  // Bill-to panel
  const billToY = 45;
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(left, billToY, right - left, 22, 2, 2, 'F');
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(left, billToY, right - left, 22, 2, 2, 'S');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text('BILL TO', left + 5, billToY + 6);
  pdf.text('PAYMENT DETAILS', 120, billToY + 6);

  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text(customerName, left + 5, billToY + 13);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.8);
  pdf.text(`Phone: ${customerPhone}`, left + 5, billToY + 19);

  pdf.text(`Method: ${paymentMethod}`, 120, billToY + 13);
  pdf.text(`Status: ${invoiceStatus}`, 120, billToY + 19);

  // Same 9-column table shape for GST and Non-GST invoices so the layout is
  // always consistent; Non-GST rows simply show 0% / Rs.0.00 in the GST columns.
  // Column widths are sized to sum exactly to the printable width (right - left)
  // so the table never overflows the page margins.
  const tableHead = [['S.No', 'Item', 'HSN', 'Qty', 'Rate', 'Amount', 'GST%', 'GST', 'Total']];
  const columnStyles = {
    0: { cellWidth: 11 },
    1: { cellWidth: 39 },
    2: { cellWidth: 16 },
    3: { cellWidth: 11 },
    4: { cellWidth: 19, halign: 'right' },
    5: { cellWidth: 21, halign: 'right' },
    6: { cellWidth: 14, halign: 'center' },
    7: { cellWidth: 20, halign: 'right' },
    8: { cellWidth: 27, halign: 'right' },
  };

  autoTable(pdf, {
    head: tableHead,
    body: rows,
    startY: 73,
    theme: 'grid',
    tableWidth: right - left,
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
      fillColor: [27, 141, 84],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles,
    margin: { left, right: left },
  });

  // ---- Bottom section: amount-in-words + terms (left) and payment summary (right) ----
  const sectionTop = pdf.lastAutoTable.finalY + 8;
  const leftWidth = 94;
  const rightX = 116;
  const rightWidth = right - rightX;

  const wordsLines = pdf.splitTextToSize(`${addWords(grandTotal)} only`, leftWidth - 10);
  const termsLines = ['Goods once sold will not be taken back or exchanged.', 'No warranty / guarantee unless specified.', 'Subject to local jurisdiction only.'];

  const leftLines = pdf.splitTextToSize(termsLines.join(' '), leftWidth - 10);
  const leftHeight = 10 + wordsLines.length * 4.6 + 8 + 10 + leftLines.length * 4.4 + 6;

  // Right panel rows: [label, value, isBold, isHighlight]
  const dueColor = currentBalance > 0 ? [220, 38, 38] : [22, 163, 74];
  const rightRows = [];
  rightRows.push(['Subtotal', formatCurrency(subtotal)]);
  if (!isNonGstInvoice) rightRows.push(['GST Total', formatCurrency(gstTotal)]);
  rightRows.push(['GRAND TOTAL', formatCurrency(grandTotal), true]);
  rightRows.push(['divider']);
  rightRows.push(['Received Amount', formatCurrency(receivedAmount)]);
  rightRows.push(['Previous Balance', formatCurrency(previousBalance)]);
  rightRows.push(['Balance', formatCurrency(currentBalance), true, true]);
  rightRows.push(['Payment Mode', String(paymentMethod || 'Cash')]);

  const measureRightHeight = () => {
    let cursor = 16;
    rightRows.forEach((row) => {
      if (row[0] === 'divider') {
        cursor += 5;
      } else {
        cursor += row[2] ? 9 : 7;
      }
    });
    return cursor + 6;
  };
  const rightHeight = measureRightHeight();

  // Left panel: amount in words + terms
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(left, sectionTop, leftWidth, leftHeight, 2, 2, 'F');
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(left, sectionTop, leftWidth, leftHeight, 2, 2, 'S');

  let leftCursor = sectionTop + 7;
  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.3);
  pdf.text('AMOUNT IN WORDS', left + 5, leftCursor);
  leftCursor += 5.5;
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.6);
  pdf.text(wordsLines, left + 5, leftCursor);
  leftCursor += wordsLines.length * 4.6 + 5;

  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.3);
  pdf.text('TERMS & CONDITIONS', left + 5, leftCursor);
  leftCursor += 5.5;
  pdf.setTextColor(71, 85, 105);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.6);
  pdf.text(leftLines, left + 5, leftCursor);

  // Right panel: payment summary
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(rightX, sectionTop, rightWidth, rightHeight, 2, 2, 'F');
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(rightX, sectionTop, rightWidth, rightHeight, 2, 2, 'S');

  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.3);
  pdf.text('PAYMENT SUMMARY', rightX + 5, sectionTop + 8);

  let rightCursor = sectionTop + 16;
  rightRows.forEach(([label, value, isBold, isHighlight]) => {
    if (label === 'divider') {
      pdf.setDrawColor(226, 232, 240);
      pdf.line(rightX + 5, rightCursor - 3, right - 5, rightCursor - 3);
      rightCursor += 5;
      return;
    }

    if (isHighlight) {
      pdf.setTextColor(...dueColor);
    } else {
      pdf.setTextColor(15, 23, 42);
    }
    pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
    pdf.setFontSize(isBold ? 9.6 : 8.6);
    pdf.text(label, rightX + 5, rightCursor);
    pdf.text(value, right - 5, rightCursor, { align: 'right' });
    rightCursor += isBold ? 9 : 7;
  });

  pdf.setTextColor(15, 23, 42);

  // ---- Footer: signature + thank-you note ----
  const footerTop = sectionTop + Math.max(leftHeight, rightHeight) + 14;
  pdf.setDrawColor(148, 163, 184);
  pdf.line(140, footerTop, right, footerTop);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(`For ${shopDisplayName}`, 140, footerTop - 4);
  pdf.text('Authorized Signatory', 140, footerTop + 5);

  pdf.setDrawColor(226, 232, 240);
  pdf.line(left, footerTop + 12, right, footerTop + 12);

  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(8.5);
  pdf.setTextColor(27, 141, 84);
  pdf.text('Thank you for your business!', pageWidth / 2, footerTop + 19, { align: 'center' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(148, 163, 184);
  pdf.text('This is a computer-generated invoice and does not require a physical signature.', pageWidth / 2, footerTop + 25, { align: 'center' });

  pdf.setTextColor(15, 23, 42);

  return pdf;
};

export default buildInvoicePdf;
