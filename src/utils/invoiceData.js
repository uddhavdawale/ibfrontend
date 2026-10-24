export const normalizeInvoiceData = (invoiceData = {}) => {
  const items = Array.isArray(invoiceData.items) ? invoiceData.items : [];
  const rupee = 'Rs.';

  const subtotal = Number(
    invoiceData.subtotal ??
      items.reduce(
        (sum, item) => sum + Number(item.price ?? item.rate ?? 0) * Number(item.qty ?? 0),
        0
      )
  );

  const gstTotal = Number(
    invoiceData.gstTotal ??
      invoiceData.totalGst ??
      items.reduce((sum, item) => {
        const amount = Number(item.price ?? item.rate ?? 0) * Number(item.qty ?? 0);
        const gstPercent = Number(item.gst ?? 0);
        return sum + (amount * gstPercent) / 100;
      }, 0)
  );

  const grandTotal = Number(invoiceData.grandTotal ?? subtotal + gstTotal);
  const totalQty = items.reduce((sum, item) => sum + Number(item.qty ?? 0), 0);

  const customerName = invoiceData.customer?.name ?? invoiceData.customerName ?? 'Walk-in Customer';
  const customerPhone = invoiceData.customer?.phone ?? invoiceData.customerPhone ?? '0000000000';
  const paymentMethod = invoiceData.paymentMethod ?? invoiceData.payment ?? 'UPI';
  const paymentStatus = invoiceData.paymentStatus ?? invoiceData.status ?? 'pending';
  const invoiceNumber = invoiceData.invoiceNo ?? 'INV-0000';
  const issueDate = invoiceData.date ?? new Date().toLocaleDateString('en-IN');

  const rows = items.map((item, index) => {
    const rate = Number(item.rate ?? item.price ?? 0);
    const qty = Number(item.qty ?? 0);
    const gstPercent = Number(item.gst ?? 0);
    const amount = Number((rate * qty).toFixed(2));
    const gstValue = Number(((amount * gstPercent) / 100).toFixed(2));
    const total = Number((amount + gstValue).toFixed(2));

    return [
      String(index + 1),
      item.item || item.name || '-',
      item.hsn || '9999',
      String(qty),
      `${rupee}${rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `${rupee}${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `${gstPercent}%`,
      `${rupee}${gstValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `${rupee}${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ];
  });

  return {
    items,
    subtotal,
    gstTotal,
    grandTotal,
    totalQty,
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
