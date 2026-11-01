import * as XLSX from 'xlsx';
import { API_ENDPOINTS, apiFetch, getAccessToken, refreshAccessToken } from '../../Config/api';

export const REQUIRED_INVENTORY_COLUMNS = [
  'Item',
  'HSN/SAC',
  'MRP/ Item',
  'QTY',
  'Set',
  'Price/QTY',
  'PO Number',
  'Min Stock',
  'Category',
];

const REQUIRED_COLUMN_ALIASES = {
  item: ['Item', 'Product', 'Name'],
  hsnSac: ['HSN/SAC', 'HSN', 'HSN SAC'],
  mrp: ['MRP/ Item', 'MRP/Item', 'MRP', 'MRP Item'],
  qty: ['QTY', 'Qty', 'Quantity'],
  minStock: ['Min Stock', 'MinStock'],
};

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_UPLOAD_ROWS = 5000;

const normalizeHeader = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const readValue = (row = {}, ...keys) => {
  const normalizedKeys = new Set(keys.map((key) => normalizeHeader(key)));

  for (const key of keys) {
    const value = row[key] ?? row[normalizeHeader(key)];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  for (const key of Object.keys(row)) {
    if (normalizedKeys.has(normalizeHeader(key))) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
  }

  return undefined;
};

const canonicalizeRow = (row = {}) => {
  const itemName = readValue(row, 'Item', 'item', 'Product', 'product', 'Name', 'name');
  const sku = readValue(row, 'SKU', 'sku', 'Product SKU', 'product sku');
  const hsnSac = readValue(
    row,
    'HSN/SAC',
    'HSN',
    'HSN SAC',
    'hsn sac',
    'hsnSac',
    'hsn'
  );
  const qty = readValue(row, 'QTY', 'qty', 'Qty', 'Quantity', 'quantity');
  const setValue = readValue(row, 'Set', 'set', 'Set Qty', 'set qty', 'setQty') ?? 1;
  const mrp = readValue(
    row,
    'MRP/ Item',
    'MRP/Item',
    'MRP Item',
    'mrp item',
    'MRP',
    'mrp',
  );
  const price = readValue(
    row,
    'Price',
    'price',
    'Unit Price',
    'unit price',
    'unitPrice',
    'Price/QTY',
    'price qty'
  );
  const pricePerQty = readValue(
    row,
    'Price/QTY',
    'price qty',
    'Price per Qty',
    'price per qty',
    'Price per Quantity',
    'price per quantity',
    'priceQty'
  ) ?? 0;
  const poNumber = readValue(row, 'PO Number', 'po number', 'PO', 'po', 'poNumber') ?? '';
  const minStock = readValue(row, 'Min Stock', 'min stock', 'MinStock', 'minStock', 'minstock');
  const category = readValue(row, 'Category', 'category', 'Categories', 'categories') ?? 'General';

  return {
    product: String(itemName || '').trim(),
    // The backend requires both SKU and HSN/SAC. The supported legacy template
    // has no SKU column, so use its HSN/SAC value when no explicit SKU is given.
    sku: String(sku || hsnSac || '').trim(),
    qty: Number(qty || 0),
    minStock: Number(minStock || 0),
    price: Number(price || mrp || pricePerQty || 0),
    category: String(category || 'General').trim() || 'General',
    set: Number(setValue || 1),
    poNumber: String(poNumber || '').trim(),
    hsnSac: String(hsnSac || '').trim(),
    mrp: Number(mrp || 0),
    pricePerQty: Number(pricePerQty || price || 0),
  };
};

const isPositiveNumber = (value) => Number.isFinite(value) && value > 0;
const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

const validateRecord = (record, rowNumber) => {
  const errors = [];

  if (!record.product) errors.push(`Row ${rowNumber}: Product is required`);
  if (record.product.length > 200) errors.push(`Row ${rowNumber}: Product must be <= 200 characters`);

  if (!record.hsnSac) errors.push(`Row ${rowNumber}: HSN/SAC is required`);
  if (record.hsnSac.length > 100) errors.push(`Row ${rowNumber}: HSN/SAC must be <= 100 characters`);

  if (!record.sku) errors.push(`Row ${rowNumber}: SKU or HSN/SAC is required`);
  if (record.sku.length > 100) errors.push(`Row ${rowNumber}: SKU must be <= 100 characters`);

  if (!isNonNegativeInteger(record.qty)) errors.push(`Row ${rowNumber}: Qty must be a non-negative integer`);
  if (!isNonNegativeInteger(record.minStock)) errors.push(`Row ${rowNumber}: Min Stock must be a non-negative integer`);

  if (!isPositiveNumber(record.mrp)) errors.push(`Row ${rowNumber}: MRP/ Item must be a positive number`);
  if (!isPositiveNumber(record.price)) errors.push(`Row ${rowNumber}: Price must be a positive number`);
  if (!isPositiveNumber(record.pricePerQty)) errors.push(`Row ${rowNumber}: Price/QTY must be a positive number`);
  if (!isPositiveInteger(record.set)) errors.push(`Row ${rowNumber}: Set must be a positive integer`);

  return errors;
};

export const parseInventorySheet = async (file) => {
  if (!file) {
    throw new Error('Please choose a CSV or Excel file.');
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('File size exceeds 5 MB limit.');
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  const allowedExtensions = ['csv', 'xls', 'xlsx'];
  if (!allowedExtensions.includes(extension || '')) {
    throw new Error('Only CSV, XLS, and XLSX files are supported.');
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    throw new Error('The selected sheet is empty.');
  }

  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (!rawRows.length) {
    throw new Error('No rows were found in the selected file.');
  }

  if (rawRows.length > MAX_UPLOAD_ROWS) {
    throw new Error(`Maximum ${MAX_UPLOAD_ROWS} rows are allowed per upload.`);
  }

  const firstRow = rawRows[0];
  const availableColumns = Object.keys(firstRow || {});
  const availableNormalized = new Set(availableColumns.map((column) => normalizeHeader(column)));
  const missingLogicalColumns = Object.entries(REQUIRED_COLUMN_ALIASES)
    .filter(([, aliases]) => !aliases.some((alias) => availableNormalized.has(normalizeHeader(alias))))
    .map(([column]) => column);

  if (missingLogicalColumns.length > 0) {
    const headerLabels = {
      item: 'Item',
      hsnSac: 'HSN/SAC',
      mrp: 'MRP/ Item',
      qty: 'QTY',
      minStock: 'Min Stock',
    };

    throw new Error(
      `Missing required columns: ${missingLogicalColumns.map((col) => headerLabels[col] || col).join(', ')}.`
    );
  }

  const rowErrors = [];
  const duplicateSkus = new Set();
  const seenSkus = new Set();

  const normalizedRecords = rawRows
    .map((row, index) => {
      const item = {};
      Object.entries(row).forEach(([key, value]) => {
        item[normalizeHeader(key)] = value;
      });
      const record = canonicalizeRow(item);
      const errors = validateRecord(record, index + 2);
      rowErrors.push(...errors);
      return record;
    })
    .filter((item) => {
      if (!item.sku) return true;
      const skuKey = item.sku.toLowerCase();
      if (seenSkus.has(skuKey)) {
        duplicateSkus.add(item.sku);
        return false;
      }
      seenSkus.add(skuKey);
      return true;
    });

  if (rowErrors.length > 0) {
    throw new Error(`Inventory upload validation failed:\n${rowErrors.slice(0, 25).join('\n')}`);
  }

  if (normalizedRecords.length === 0) {
    throw new Error('No valid item rows were found in the uploaded file.');
  }

  if (duplicateSkus.size > 0) {
    // Mirror backend behavior by skipping duplicates in the same payload.
    console.warn('Skipping duplicate SKUs in upload payload:', Array.from(duplicateSkus));
  }

  return normalizedRecords;
};

export const uploadInventorySheet = async (file) => {
  if (!file) {
    throw new Error('No inventory file selected.');
  }

  const parsedRecords = await parseInventorySheet(file);
  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('source', 'inventory-upload');
  formData.append('records', JSON.stringify(parsedRecords));

  // Session restoration can leave the UI available after refresh failed. Do not
  // send this protected request without an access token in that case.
  if (!getAccessToken()) {
    try {
      await refreshAccessToken(localStorage.getItem('username') || '');
    } catch (refreshError) {
      const reason = refreshError instanceof Error ? refreshError.message : String(refreshError);
      throw new Error(`Your session could not be refreshed (${reason}). Please sign in again, then retry the upload.`);
    }
  }

  const response = await apiFetch(API_ENDPOINTS.inventoryBulkUpload, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    let payload = null;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      // Some Spring Security failures return a plain-text or HTML error body.
    }
    const joinedErrors = Array.isArray(payload?.errors) ? payload.errors.join('\n') : '';
    const serverMessage = [payload?.message, payload?.error, joinedErrors]
      .filter(Boolean)
      .join('\n');
    const detail = serverMessage || responseText || response.statusText || 'No error details returned by the server.';
    const accessHint = response.status === 403
      ? ' The server denied access; verify the authenticated user’s tenant/role and Spring Security CSRF configuration.'
      : '';
    throw new Error(`Upload failed (${response.status}): ${detail}${accessHint}`);
  }

  const payload = await response.json().catch(() => ({}));
  return {
    records: parsedRecords,
    response: payload,
  };
};
