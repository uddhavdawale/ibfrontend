import React, { useMemo, useState } from 'react';
import './InventoryUploadDialog.css';
import {
  MAX_PREVIEW_ROWS,
  REQUIRED_INVENTORY_COLUMNS,
  getInventoryPreviewRows,
  parseInventorySheet,
  uploadInventorySheet,
} from './inventoryUploadService';

const InventoryUploadDialog = ({ isOpen, onClose, onUploadSuccess }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewStats, setPreviewStats] = useState({ total: 0, displayed: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

  const headerText = useMemo(
    () => REQUIRED_INVENTORY_COLUMNS.join('   |   '),
    []
  );

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError('');
      const parsedRows = await parseInventorySheet(file);
      const nextPreviewRows = getInventoryPreviewRows(parsedRows, MAX_PREVIEW_ROWS);
      setSelectedFile(file);
      setPreviewRows(nextPreviewRows);
      setPreviewStats({ total: parsedRows.length, displayed: nextPreviewRows.length });
    } catch (uploadError) {
      setSelectedFile(null);
      setPreviewRows([]);
      setPreviewStats({ total: 0, displayed: 0 });
      setError(uploadError.message || 'Unable to read the selected file.');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please choose a CSV or Excel file first.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const result = await uploadInventorySheet(selectedFile);
      onUploadSuccess?.(result);
      setShowSuccessDialog(true);
    } catch (uploadError) {
      setError(uploadError.message || 'Inventory upload failed.');
    } finally {
      setLoading(false);
    }
  };

  const resetUploadState = () => {
    setSelectedFile(null);
    setPreviewRows([]);
    setPreviewStats({ total: 0, displayed: 0 });
    setError('');
    setShowSuccessDialog(false);
  };

  const handleClose = () => {
    resetUploadState();
    onClose();
  };

  const handleSuccessDialogClose = () => {
    resetUploadState();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="inventory-upload-overlay" onClick={handleClose}>
      <div className="inventory-upload-modal" onClick={(event) => event.stopPropagation()}>
        <div className="inventory-upload-header">
          <div>
            <p className="eyebrow">Bulk Import</p>
            <h3>Upload Inventory Sheet</h3>
          </div>
          <button type="button" className="close-button" onClick={handleClose} aria-label="Close dialog">×</button>
        </div>

        <div className="upload-instructions">
          <p>Use a CSV or Excel file with the following columns. SKU may be omitted when HSN/SAC is provided; it will be used as the SKU:</p>
          <div className="column-template">{headerText}</div>
          <p className="upload-hint">Aliases accepted: Product/Item, SKU/Product SKU, HSN/SAC, MRP/ Item, Qty, Min Stock, Set, Price/QTY. Category defaults to General and Set defaults to 1.</p>
        </div>

        <label className="file-picker">
          <input type="file" accept=".csv,.xls,.xlsx" onChange={handleFileChange} />
          <span>{selectedFile ? selectedFile.name : 'Choose file'}</span>
        </label>

        {error && <div className="upload-error">{error}</div>}

        {previewRows.length > 0 && (
          <div className="preview-box">
            <div className="preview-box-header">
              <h4>Preview</h4>
              <span>
                {previewStats.total > previewStats.displayed
                  ? `Showing ${previewStats.displayed} of ${previewStats.total} rows`
                  : `${previewStats.total} rows ready`}
              </span>
            </div>
            <div className="preview-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>SKU</th>
                    <th>HSN/SAC</th>
                    <th>MRP/ Item</th>
                    <th>QTY</th>
                    <th>Set</th>
                    <th>Price/QTY</th>
                    <th>PO Number</th>
                    <th>Min Stock</th>
                    <th>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={`${row.sku}-${index}`}>
                      <td>{row.product}</td>
                      <td>{row.sku}</td>
                      <td>{row.hsnSac || row.sku}</td>
                      <td>{row.mrp || row.price}</td>
                      <td>{row.qty}</td>
                      <td>{row.set || 0}</td>
                      <td>{row.pricePerQty || row.price}</td>
                      <td>{row.poNumber || ''}</td>
                      <td>{row.minStock || 0}</td>
                      <td>{row.category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="upload-actions">
          <button type="button" className="cancel-button" onClick={handleClose}>Cancel</button>
          <button type="button" className="upload-button" onClick={handleUpload} disabled={!selectedFile || loading}>
            {loading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>

      {showSuccessDialog && (
        <div className="inventory-success-overlay" onClick={handleSuccessDialogClose}>
          <div className="inventory-success-modal" onClick={(event) => event.stopPropagation()}>
            <div className="inventory-success-icon">✓</div>
            <h4>Upload Successful</h4>
            <p>Your inventory sheet has been uploaded successfully.</p>
            <button type="button" className="success-ok-button" onClick={handleSuccessDialogClose}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryUploadDialog;
