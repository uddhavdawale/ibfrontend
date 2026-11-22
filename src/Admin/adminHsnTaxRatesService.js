import * as XLSX from 'xlsx';
import { API_ENDPOINTS, apiFetch } from '../Config/api';

export const MAX_HSN_RATE_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_HSN_RATE_UPLOAD_ROWS = 5000;

const CODE_HEADERS = new Set(['hsncode', 'hsn', 'hsnsac', 'sac']);
const RATE_HEADERS = new Set(['gstrate', 'gst', 'rate', 'taxrate']);

const normalizeHeader = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

export const inspectHsnTaxRateCsv = async (file) => {
  if (!file) throw new Error('Choose a CSV file first.');
  if (!String(file.name || '').toLowerCase().endsWith('.csv')) {
    throw new Error('Only CSV files are supported.');
  }
  if (file.size > MAX_HSN_RATE_UPLOAD_BYTES) {
    throw new Error('The CSV file exceeds the 5 MB upload limit.');
  }

  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('The selected CSV file is empty.');

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  });
  const headers = Array.isArray(rows[0]) ? rows[0].map(normalizeHeader) : [];
  const codeColumns = headers.reduce(
    (matches, header, index) => (CODE_HEADERS.has(header) ? [...matches, index] : matches),
    []
  );
  const rateColumns = headers.reduce(
    (matches, header, index) => (RATE_HEADERS.has(header) ? [...matches, index] : matches),
    []
  );

  if (codeColumns.length !== 1 || rateColumns.length !== 1) {
    throw new Error('Include exactly one HSN/SAC column (hsnCode, hsn, hsnSac, or sac) and one rate column (gstRate, gst, rate, or taxRate).');
  }

  const records = rows.slice(1).filter((row) => (
    Array.isArray(row) && row.some((value) => String(value ?? '').trim() !== '')
  ));
  if (records.length === 0) throw new Error('The CSV contains no rate rows.');
  if (records.length > MAX_HSN_RATE_UPLOAD_ROWS) {
    throw new Error(`The CSV exceeds the ${MAX_HSN_RATE_UPLOAD_ROWS.toLocaleString('en-IN')} row limit.`);
  }

  const rowErrors = [];
  records.forEach((row, index) => {
    const code = String(row[codeColumns[0]] ?? '').trim();
    const rawRate = String(row[rateColumns[0]] ?? '').trim();
    const rate = Number(rawRate);
    if (!code) rowErrors.push(`Row ${index + 2}: HSN/SAC is required.`);
    if (!rawRate || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      rowErrors.push(`Row ${index + 2}: GST rate must be a number from 0 to 100.`);
    }
  });
  if (rowErrors.length > 0) {
    throw new Error(`CSV validation failed:\n${rowErrors.slice(0, 25).join('\n')}`);
  }

  return { rowCount: records.length };
};

export const uploadHsnTaxRatesCsv = async (file) => {
  if (!file) throw new Error('Choose a CSV file first.');
  if (!String(file.name || '').toLowerCase().endsWith('.csv')) {
    throw new Error('Only CSV files are supported.');
  }
  if (file.size > MAX_HSN_RATE_UPLOAD_BYTES) {
    throw new Error('The CSV file exceeds the 5 MB upload limit.');
  }

  const formData = new FormData();
  formData.append('file', file, file.name);
  const response = await apiFetch(API_ENDPOINTS.adminHsnTaxRatesUpload, {
    method: 'POST',
    body: formData,
    retryOn429: false,
  });
  const responseText = await response.text();
  const contentType = response.headers.get('content-type') || '';
  const trimmedResponseText = responseText.trim();
  let result = responseText;
  if (
    contentType.includes('json')
    || trimmedResponseText.startsWith('{')
    || trimmedResponseText.startsWith('[')
  ) {
    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      if (contentType.includes('json')) {
        throw new Error('The server returned an invalid JSON response for the HSN/SAC upload.');
      }
    }
  }

  const serverMessage = typeof result === 'string'
    ? result
    : result?.message
      || result?.error
      || (Array.isArray(result?.errors) ? result.errors.join('\n') : '')
      || result?.data?.message;
  if (!response.ok) {
    throw new Error(serverMessage || `HSN/SAC rate upload failed (${response.status}).`);
  }
  const importedCount = Number(result?.importedCount);
  if (
    result?.success !== true
    || result.importedCount == null
    || String(result.importedCount).trim() === ''
    || !Number.isInteger(importedCount)
    || importedCount < 0
  ) {
    throw new Error(serverMessage || 'The server did not confirm the HSN/SAC rate import.');
  }

  return { importedCount };
};
