const PRODUCT_CODE_FIELDS = [
  'barcode',
  'barCode',
  'barcodeValue',
  'ean',
  'ean8',
  'ean13',
  'upc',
  'upcA',
  'upcE',
  'gtin',
  'productCode',
  'itemCode',
  'sku',
  'code',
];

export const normalizeBarcode = (value) => String(value ?? '').trim().toUpperCase();

export const getProductCodes = (product = {}) => (
  [...new Set(PRODUCT_CODE_FIELDS
    .map((field) => normalizeBarcode(product[field]))
    .filter(Boolean))]
);

export const findProductsByScannedCode = (products, scannedCode) => {
  const normalizedCode = normalizeBarcode(scannedCode);
  if (!normalizedCode || !Array.isArray(products)) return [];

  const matchedProducts = products.filter((product) => (
    getProductCodes(product).includes(normalizedCode)
  ));
  const seenIds = new Set();

  return matchedProducts.filter((product) => {
    if (product.id === undefined || product.id === null) return true;
    const id = String(product.id);
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });
};
