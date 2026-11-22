import React, { useState } from 'react';
import AdminLayout from './AdminLayout';
import {
  inspectHsnTaxRateCsv,
  MAX_HSN_RATE_UPLOAD_BYTES,
  MAX_HSN_RATE_UPLOAD_ROWS,
  uploadHsnTaxRatesCsv,
} from './adminHsnTaxRatesService';

const AdminHsnTaxRatesPage = ({ onLogout }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [rowCount, setRowCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const resetForm = () => {
    if (busy) return;
    setSelectedFile(null);
    setRowCount(0);
    setError('');
    setSuccess('');
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    setSelectedFile(null);
    setRowCount(0);
    setError('');
    setSuccess('');
    if (!file) return;

    try {
      setBusy(true);
      const summary = await inspectHsnTaxRateCsv(file);
      setSelectedFile(file);
      setRowCount(summary.rowCount);
    } catch (uploadError) {
      setError(uploadError.message || 'Unable to validate the selected CSV.');
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await uploadHsnTaxRatesCsv(selectedFile);
      setSuccess(`Imported ${result.importedCount.toLocaleString('en-IN')} HSN/SAC rate rows.`);
      setSelectedFile(null);
      setRowCount(0);
    } catch (uploadError) {
      setError(uploadError.message || 'HSN/SAC rate upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const template = new Blob(['hsnCode,gstRate\r\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(template);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hsn-gst-rate-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout
      title="HSN/SAC GST rates"
      subtitle="Upload the centrally managed tax-rate master used by retailer catalogue and invoice APIs."
      currentUser="System Admin"
      onLogout={onLogout}
      onRefresh={resetForm}
    >
      <section className="admin-panel admin-hsn-upload-panel">
        <div className="admin-panel-header">
          <div>
            <h2>Upload rate master</h2>
            <p className="admin-hsn-upload-copy">
              This upload updates the central HSN/SAC tax master. Retailers cannot set rates through their inventory uploads.
            </p>
          </div>
        </div>

        <div className="admin-hsn-upload-copy">
          <p>
            Upload one CSV containing exactly one HSN/SAC column and one GST rate column. Supported HSN/SAC headers:
            {' '}<code>hsnCode</code>, <code>hsn</code>, <code>hsnSac</code>, or <code>sac</code>.
          </p>
          <p>
            Supported rate headers: <code>gstRate</code>, <code>gst</code>, <code>rate</code>, or <code>taxRate</code>.
            Rates must be numeric values from 0 to 100. Maximum file size is 5 MB and maximum rows is {MAX_HSN_RATE_UPLOAD_ROWS.toLocaleString('en-IN')}.
          </p>
        </div>

        <label className="admin-hsn-upload-file">
          <span>HSN/SAC rate CSV</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            disabled={busy}
          />
        </label>

        {selectedFile && (
          <p className="admin-hsn-upload-meta" role="status">
            {selectedFile.name} · {rowCount.toLocaleString('en-IN')} rate rows · {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            {' '} (limit {(MAX_HSN_RATE_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB)
          </p>
        )}
        {error && <div className="admin-hsn-upload-error" role="alert">{error}</div>}
        {success && <div className="admin-hsn-upload-success" role="status">{success}</div>}

        <div className="admin-hsn-upload-actions">
          <button type="button" className="admin-secondary-button" onClick={downloadTemplate} disabled={busy}>
            Download CSV template
          </button>
          <button
            type="button"
            className="admin-primary-button"
            onClick={handleUpload}
            disabled={!selectedFile || busy}
          >
            {busy ? 'Validating / uploading...' : 'Upload HSN/SAC rates'}
          </button>
        </div>
      </section>
    </AdminLayout>
  );
};

export default AdminHsnTaxRatesPage;
