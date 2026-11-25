  import { API_ENDPOINTS, apiFetch } from '../../Config/api';

const isFiniteNumber = (value) => (
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
);

const buildLedgerQuery = ({ search, customerKey, from, to }) => {
  const params = new URLSearchParams();
  const normalizedSearch = String(search || '').trim();
  if (normalizedSearch) params.set('search', normalizedSearch);
  if (customerKey && customerKey !== 'all') params.set('customerKey', customerKey);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return params;
};

export const fetchCustomerLedgerPage = async ({
  page,
  size,
  search,
  customerKey,
  from,
  to,
}, signal) => {
  const params = buildLedgerQuery({ search, customerKey, from, to });
  params.set('page', String(page));
  params.set('size', String(size));

  const response = await apiFetch(`${API_ENDPOINTS.customerLedger}?${params}`, { signal });
  if (!response.ok) {
    throw new Error(`Customer ledger request failed (${response.status}).`);
  }

  const payload = await response.json();
  const pageInfo = payload?.page;
  const rows = payload?.content;
  if (!Array.isArray(rows) || !pageInfo || !payload.summary) {
    throw new Error('Customer ledger API returned an unsupported response format.');
  }

  const pageNumber = Number(pageInfo.number);
  const pageSize = Number(pageInfo.size);
  const totalElements = Number(pageInfo.totalElements);
  const totalPages = Number(pageInfo.totalPages);
  const expectedTotalPages = totalElements > 0 ? Math.ceil(totalElements / size) : 0;
  if (pageNumber !== page || pageSize !== size
    || !Number.isInteger(totalElements) || totalElements < 0
    || !Number.isInteger(totalPages) || totalPages !== expectedTotalPages
    || rows.length > size) {
    throw new Error('Customer ledger API returned invalid pagination details.');
  }

  const numericSummaryFields = ['billed', 'received', 'customerDue', 'customerCount'];
  if (numericSummaryFields.some((field) => !isFiniteNumber(payload.summary[field]))
    || !Number.isInteger(Number(payload.summary.customerCount))) {
    throw new Error('Customer ledger API returned invalid report totals.');
  }

  const numericRowFields = ['total', 'paid', 'invoiceDue', 'openingBalance', 'closingBalance'];
  const textRowFields = ['billType', 'invoiceNo', 'customerName', 'paymentStatus'];
  if (rows.some((row) => (
    !row || row.id === undefined || row.id === null
    || textRowFields.some((field) => typeof row[field] !== 'string')
    || numericRowFields.some((field) => !isFiniteNumber(row[field]))
  ))) {
    throw new Error('Customer ledger API returned an invalid ledger row.');
  }

  if (page === 0 && (!Array.isArray(payload.customerOptions)
    || payload.customerOptions.some((customer) => (
      !customer || typeof customer.key !== 'string' || typeof customer.name !== 'string'
    )))) {
    throw new Error('Customer ledger API did not return customer filter options.');
  }

  return {
    rows,
    page: { number: pageNumber, size: pageSize, totalElements, totalPages },
    summary: {
      billed: Number(payload.summary.billed),
      received: Number(payload.summary.received),
      customerDue: Number(payload.summary.customerDue),
      customerCount: Number(payload.summary.customerCount),
    },
    customerOptions: payload.customerOptions,
  };
};

export const downloadCustomerLedgerCsv = async (filters, signal) => {
  const params = buildLedgerQuery(filters);
  const query = params.toString();
  const endpoint = query
    ? `${API_ENDPOINTS.customerLedgerExport}?${query}`
    : API_ENDPOINTS.customerLedgerExport;
  const response = await apiFetch(endpoint, { signal });
  if (!response.ok) {
    const payloadText = await response.text().catch(() => '');
    let message = '';
    try {
      const payload = payloadText ? JSON.parse(payloadText) : {};
      message = payload.message || payload.error || '';
    } catch {
      message = payloadText.trim();
    }
    throw new Error(message || `Customer ledger export failed (${response.status}).`);
  }

  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('text/csv')) {
    throw new Error('Customer ledger export returned an unsupported file format.');
  }

  const blob = await response.blob();
  if (blob.size === 0) throw new Error('Customer ledger export returned an empty file.');

  const url = URL.createObjectURL(blob);
  const disposition = response.headers.get('Content-Disposition') || '';
  const utf8Filename = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quotedFilename = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  let downloadName = `customer-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  try {
    if (utf8Filename) downloadName = decodeURIComponent(utf8Filename);
    else if (quotedFilename) downloadName = quotedFilename;
  } catch {
    downloadName = `customer-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  }
  const link = document.createElement('a');
  link.href = url;
  link.download = downloadName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
