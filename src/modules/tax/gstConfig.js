export const BILL_TYPES = Object.freeze({
  GST: 'gst',
  NON_GST: 'non-gst',
});

export const TAX_PRICE_MODES = Object.freeze({
  EXCLUSIVE: 'exclusive',
  INCLUSIVE: 'inclusive',
});

export const INDIAN_GST_STATES = Object.freeze([
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
]);

const firstNonEmptyValue = (values) => values.find(
  (value) => value !== null && value !== undefined && String(value).trim() !== ''
);

export const getProductHsnCode = (product = {}) => String(
  firstNonEmptyValue([product.hsn, product.hsnCode, product.hsnSac, product['hsn/sac']]) ?? ''
).trim();

export const isValidHsnCode = (hsn) => /^\d{4}(?:\d{2}){0,2}$/.test(String(hsn ?? '').trim());

export const normalizeIndianGstState = (value) => {
  const normalizedValue = String(value ?? '').trim().toLowerCase();
  if (!normalizedValue) return '';

  const state = INDIAN_GST_STATES.find(({ code, name }) => (
    code === normalizedValue.padStart(2, '0')
    || name.toLowerCase() === normalizedValue
  ));
  return state?.code || '';
};

export const getIndianGstStateName = (stateCode) => (
  INDIAN_GST_STATES.find(({ code }) => code === normalizeIndianGstState(stateCode))?.name || ''
);

export const getProductGstRate = (product = {}) => {
  const rawRate = firstNonEmptyValue([product.gstRate, product.gst, product.taxRate]);
  if (rawRate === undefined) return null;

  const rate = Number(rawRate);
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null;
};

export const getProductGstRateStatus = (product = {}) => String(
  product.gstRateStatus ?? ''
).trim().toUpperCase();

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

export const roundCurrency = (value) => Number((Number(value) || 0).toFixed(2));

export const calculateItemTax = ({
  amount = 0,
  category = '',
  gstRate,
  billType = BILL_TYPES.GST,
  taxPriceMode = TAX_PRICE_MODES.EXCLUSIVE,
  supplyType = 'intra-state',
}) => {
  const safeAmount = Number(amount) || 0;
  const hasExplicitRate = gstRate !== null && gstRate !== undefined && String(gstRate).trim() !== '';
  const explicitRate = hasExplicitRate ? Number(gstRate) : null;
  const resolvedTax = resolveCategoryTax(category, hasExplicitRate ? explicitRate : 0);
  const effectiveTotal = billType === BILL_TYPES.NON_GST
    ? 0
    : hasExplicitRate
      ? explicitRate
      : resolvedTax.total;
  const isInterState = supplyType === 'inter-state' && billType !== BILL_TYPES.NON_GST;
  const cgst = billType === BILL_TYPES.NON_GST || isInterState ? 0 : hasExplicitRate ? effectiveTotal / 2 : resolvedTax.cgst;
  const sgst = billType === BILL_TYPES.NON_GST || isInterState ? 0 : hasExplicitRate ? effectiveTotal / 2 : resolvedTax.sgst;
  const igst = billType === BILL_TYPES.NON_GST ? 0 : isInterState || hasExplicitRate ? effectiveTotal : resolvedTax.igst;
  const isInclusive = taxPriceMode === TAX_PRICE_MODES.INCLUSIVE && billType !== BILL_TYPES.NON_GST;
  const taxableAmount = roundCurrency(
    isInclusive ? safeAmount / (1 + effectiveTotal / 100) : safeAmount
  );
  const taxAmount = roundCurrency(
    isInclusive ? safeAmount - taxableAmount : taxableAmount * (effectiveTotal / 100)
  );
  const componentRateTotal = cgst + sgst;
  const cgstAmount = componentRateTotal > 0
    ? roundCurrency(taxAmount * (cgst / componentRateTotal))
    : 0;
  const sgstAmount = isInterState ? 0 : roundCurrency(taxAmount - cgstAmount);
  const igstAmount = isInterState ? taxAmount : 0;

  return {
    billType,
    gstRate: effectiveTotal,
    cgst,
    sgst,
    igst,
    cgstAmount,
    sgstAmount,
    igstAmount,
    taxComponentType: isInterState ? 'IGST' : 'CGST_SGST',
    taxableAmount,
    taxAmount,
    itemTotal: roundCurrency(taxableAmount + taxAmount),
  };
};

export const buildTaxProfileForItem = (
  item = {},
  billType = BILL_TYPES.GST,
  taxPriceMode = TAX_PRICE_MODES.EXCLUSIVE,
  supplyType = 'intra-state'
) => {
  const price = Number(item.price ?? item.unitPrice ?? 0) || 0;
  const category = item.category || item.categoryName || item.group || 'default';
  const gstRate = getProductGstRate(item) ?? 0;
  return calculateItemTax({ amount: price, category, gstRate, billType, taxPriceMode, supplyType });
};
