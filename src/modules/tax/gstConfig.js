export const BILL_TYPES = Object.freeze({
  GST: 'gst',
  NON_GST: 'non-gst',
});

export const GST_CATEGORY_RULES = Object.freeze({
  electronics: { cgst: 9, sgst: 9, igst: 18, total: 18 },
  electrical: { cgst: 9, sgst: 9, igst: 18, total: 18 },
  mobile: { cgst: 9, sgst: 9, igst: 18, total: 18 },
  groceries: { cgst: 2.5, sgst: 2.5, igst: 5, total: 5 },
  dairy: { cgst: 2.5, sgst: 2.5, igst: 5, total: 5 },
  beverages: { cgst: 2.5, sgst: 2.5, igst: 5, total: 5 },
  stationery: { cgst: 2.5, sgst: 2.5, igst: 5, total: 5 },
  personalcare: { cgst: 2.5, sgst: 2.5, igst: 5, total: 5 },
  default: { cgst: 0, sgst: 0, igst: 0, total: 0 },
});

export const normalizeCategoryName = (category = '') =>
  String(category || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();

export const getLegacyGstSlab = (price = 0) => {
  const safePrice = Number(price) || 0;
  if (safePrice < 500) return 5;
  if (safePrice < 1500) return 12;
  return 18;
};

export const resolveCategoryTax = (category = '', fallbackRate = 0) => {
  const normalizedKey = normalizeCategoryName(category);
  const config = GST_CATEGORY_RULES[normalizedKey] || GST_CATEGORY_RULES.default;
  const resolvedTotal = Number(fallbackRate) > 0 ? Number(fallbackRate) : Number(config.total || 0);
  const cgstRate = Number(config.cgst ?? (resolvedTotal ? resolvedTotal / 2 : 0));
  const sgstRate = Number(config.sgst ?? (resolvedTotal ? resolvedTotal / 2 : 0));
  const igstRate = Number(config.igst ?? 0);

  return {
    category: normalizedKey || 'default',
    total: resolvedTotal,
    cgst: cgstRate,
    sgst: sgstRate,
    igst: igstRate,
  };
};

export const calculateItemTax = ({ amount = 0, category = '', gstRate, billType = BILL_TYPES.GST }) => {
  const safeAmount = Number(amount) || 0;
  const resolvedTax = resolveCategoryTax(category, Number(gstRate) || 0);
  const effectiveTotal = billType === BILL_TYPES.NON_GST ? 0 : resolvedTax.total || Number(gstRate) || 0;
  const cgst = billType === BILL_TYPES.NON_GST ? 0 : resolvedTax.cgst || effectiveTotal / 2;
  const sgst = billType === BILL_TYPES.NON_GST ? 0 : resolvedTax.sgst || effectiveTotal / 2;
  const igst = billType === BILL_TYPES.NON_GST ? 0 : resolvedTax.igst || 0;
  const taxAmount = safeAmount * ((effectiveTotal || 0) / 100);

  return {
    billType,
    gstRate: effectiveTotal,
    cgst,
    sgst,
    igst,
    taxAmount,
    itemTotal: safeAmount + taxAmount,
  };
};

export const buildTaxProfileForItem = (item = {}, billType = BILL_TYPES.GST) => {
  const price = Number(item.price ?? item.unitPrice ?? 0) || 0;
  const category = item.category || item.categoryName || item.group || 'default';
  const legacyRate = Number(item.gst ?? getLegacyGstSlab(price));
  return calculateItemTax({ amount: price, category, gstRate: legacyRate, billType });
};
