import * as XLSX from 'xlsx';
import { API_ENDPOINTS, apiFetch } from '../../Config/api';

export const REQUIRED_INVENTORY_COLUMNS = [
  'Product',
  'SKU',
  'Qty',
  'Min Stock',
  'Price',
  'Category',
];

const normalizeHeader = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const canonicalizeRow = (row = {}) => {
  const productName = row.Product ?? row.product ?? row.Name ?? row.name ?? '';
  const sku = row.SKU ?? row.sku ?? row['Product SKU'] ?? '';
  const qty = row.Qty ?? row.qty ?? row.Quantity ?? row.quantity ?? 0;
  const minStock = row['Min Stock'] ?? row.minStock ?? row['MinStock'] ?? 0;
  const price = row.Price ?? row.price ?? row['Unit Price'] ?? row.unitPrice ?? 0;
  const category = row.Category ?? row.category ?? row['Categories'] ?? row.categories ?? 'General';

  return {
    product: String(productName || '').trim(),
    sku: String(sku || '').trim(),
    qty: Number(qty || 0),
    minStock: Number(minStock || 0),
    price: Number(price || 0),
    category: String(category || 'General').trim() || 'General',
  };
};

export const parseInventorySheet = async (file) => {
  if (!file) {
    throw new Error('Please choose a CSV or Excel file.');
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

  const firstRow = rawRows[0];
  const availableColumns = Object.keys(firstRow || {});
  const mappedHeaders = Object.fromEntries(
    availableColumns.map((column) => [normalizeHeader(column), column])
  );

  const requiredKeys = REQUIRED_INVENTORY_COLUMNS.map((column) => normalizeHeader(column));
  const missingHeaders = requiredKeys.filter((key) => !(key in mappedHeaders));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required columns: ${REQUIRED_INVENTORY_COLUMNS.join(', ')}`);
  }

  const normalizedRecords = rawRows
    .map((row) => {
      const item = {};
      Object.entries(row).forEach(([key, value]) => {
        item[normalizeHeader(key)] = value;
      });
      return canonicalizeRow(item);
    })
    .filter((item) => item.product && item.sku);

  if (normalizedRecords.length === 0) {
    throw new Error('No valid product rows were found. Ensure each row includes Product and SKU values.');
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

  const response = await apiFetch(API_ENDPOINTS.inventoryBulkUpload, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const serverMessage = await response.text().catch(() => '');
    throw new Error(serverMessage || `Upload failed with status ${response.status}.`);
  }

  const payload = await response.json().catch(() => ({}));
  return {
    records: parsedRecords,
    response: payload,
  };
};
