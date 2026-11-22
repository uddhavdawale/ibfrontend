export const normalizeInvoiceData = (invoiceData = {}) => {
  const items = Array.isArray(invoiceData.items) ? invoiceData.items : [];
  const rupee = 'Rs.';
  const isNonGstInvoice = String(invoiceData.billType ?? '').toLowerCase() === 'non-gst' || String(invoiceData.billType ?? '').toLowerCase() === 'non gst';
  const taxPricingMode = String(invoiceData.taxPricingMode ?? '').toLowerCase() === 'inclusive'
    || invoiceData.taxInclusive
    ? 'inclusive'
    : 'exclusive';
  const taxComponentType = !isNonGstInvoice && (
    invoiceData.taxComponentType === 'IGST'
    || items.some((item) => Number(item.igstAmount ?? 0) > 0)
  )
    ? 'IGST'
    : 'CGST_SGST';
  const itemTaxDetails = items.map((item) => {
    const unitPrice = Number(item.price ?? item.rate ?? 0);
    const quantity = Number(item.qty ?? 0);
    const taxablePriceAmount = unitPrice * quantity;
    const hasEnteredPrice = item.enteredPrice != null;
    const enteredAmount = Number(item.enteredPrice ?? unitPrice) * quantity;
    const gstPercent = Number(item.gst ?? item.gstRate ?? 0);
    const extractedTaxableAmount = taxPricingMode === 'inclusive' && hasEnteredPrice
      ? Number((enteredAmount / (1 + gstPercent / 100)).toFixed(2))
      : taxablePriceAmount;
    const taxableAmount = Number(item.taxableAmount ?? extractedTaxableAmount);
    const gstValue = isNonGstInvoice
      ? 0
      : Number(item.taxAmount ?? (
        taxPricingMode === 'inclusive' && hasEnteredPrice
          ? enteredAmount - taxableAmount
          : (taxableAmount * gstPercent) / 100
      ));
    const cgstValue = isNonGstInvoice || taxComponentType === 'IGST'
      ? 0
      : Number(item.cgstAmount ?? Number((gstValue / 2).toFixed(2)));
    const sgstValue = isNonGstInvoice || taxComponentType === 'IGST'
      ? 0
      : Number(item.sgstAmount ?? (gstValue - cgstValue));
    const igstValue = isNonGstInvoice
      ? 0
      : Number(item.igstAmount ?? (taxComponentType === 'IGST' ? item.igst ?? gstValue : 0));
    return {
      taxableAmount,
      gstValue,
      cgstValue,
      sgstValue,
      igstValue,
      total: Number((taxableAmount + gstValue).toFixed(2)),
    };
  });

  const subtotal = Number(
    invoiceData.subtotal ??
      itemTaxDetails.reduce((sum, item) => sum + item.taxableAmount, 0)
  );

  const gstTotal = Number(
    isNonGstInvoice ? 0 : (
      invoiceData.gstTotal ??
      invoiceData.totalGst ??
      invoiceData.gstAmount ??
      invoiceData.gst ??
      itemTaxDetails.reduce((sum, item) => sum + item.gstValue, 0)
    )
  );

  const grandTotal = Number(invoiceData.grandTotal ?? subtotal + gstTotal);
  const totalQty = items.reduce((sum, item) => sum + Number(item.qty ?? 0), 0);
  const reportedReceivedAmount = invoiceData.receivedAmount
    ?? invoiceData.paidAmount
    ?? invoiceData.amountPaid
    ?? invoiceData.amountReceived;
  const reportedInvoiceDue = invoiceData.outstandingAmount
    ?? invoiceData.invoiceDueAmount
    ?? invoiceData.dueCollection
    ?? invoiceData.dueAmount
    ?? invoiceData.balanceDue;
  const receivedAmount = Number(
    reportedReceivedAmount
      ?? (reportedInvoiceDue != null ? Math.max(grandTotal - Number(reportedInvoiceDue), 0) : 0)
  );
  const previousBalance = Number(invoiceData.previousBalance ?? 0);
  const invoiceDueAmount = Math.max(
    Number(reportedInvoiceDue ?? grandTotal - receivedAmount),
    0
  );
  const balanceAmount = Number(invoiceData.balanceAmount ?? previousBalance + invoiceDueAmount);
  const currentBalance = Number(invoiceData.currentBalance ?? balanceAmount);

  const customerName = invoiceData.customer?.name ?? invoiceData.customerName ?? 'Walk-in Customer';
  const customerPhone = invoiceData.customer?.phone ?? invoiceData.customerPhone ?? '0000000000';
  const paymentMethod = invoiceData.paymentMethod ?? invoiceData.payment ?? 'UPI';
  const paymentStatus = invoiceData.paymentStatus ?? invoiceData.status ?? 'pending';
  const invoiceNumber = invoiceData.invoiceNo ?? 'INV-0000';
  const issueDate = invoiceData.date ?? new Date().toLocaleDateString('en-IN');

  const rows = items.map((item, index) => {
    const rate = Number(item.enteredPrice ?? item.rate ?? item.price ?? 0);
    const qty = Number(item.qty ?? 0);
    const gstPercent = Number(item.gst ?? item.gstRate ?? 0);
    const { taxableAmount, cgstValue, sgstValue, igstValue, total } = itemTaxDetails[index];

    const row = [
      String(index + 1),
      item.item || item.name || '-',
      item.hsn || '9999',
      String(qty),
      `${rupee}${rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `${rupee}${taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `${isNonGstInvoice ? 0 : gstPercent}%`,
    ];
    if (taxComponentType === 'IGST' && !isNonGstInvoice) {
      row.push(`${rupee}${igstValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    } else {
      row.push(
        `${rupee}${cgstValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `${rupee}${sgstValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      );
    }
    row.push(`${rupee}${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    return row;
  });

  return {
    items,
    subtotal,
    gstTotal,
    grandTotal,
    taxPricingMode,
    taxComponentType,
    placeOfSupplyState: invoiceData.placeOfSupplyState ?? '',
    customerState: invoiceData.customerState ?? invoiceData.placeOfSupplyState ?? '',
    totalQty,
    receivedAmount,
    previousBalance,
    balanceAmount,
    currentBalance,
    customerName,
    customerPhone,
    paymentMethod,
    paymentStatus,
    invoiceNumber,
    issueDate,
    rows,
  };
};

export default normalizeInvoiceData;
