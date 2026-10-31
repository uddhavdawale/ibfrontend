import React, { useMemo, useState } from 'react';
import './InventoryUploadDialog.css';
import { parseInventorySheet, uploadInventorySheet, REQUIRED_INVENTORY_COLUMNS } from './inventoryUploadService';

const InventoryUploadDialog = ({ isOpen, onClose, onUploadSuccess }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      setSelectedFile(file);
      setPreviewRows(parsedRows.slice(0, 5));
    } catch (uploadError) {
      setSelectedFile(null);
      setPreviewRows([]);
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
      handleClose();
    } catch (uploadError) {
      setError(uploadError.message || 'Inventory upload failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setPreviewRows([]);
    setError('');
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
          <p>Use a CSV or Excel file with the following columns:</p>
          <div className="column-template">{headerText}</div>
        </div>

        <label className="file-picker">
          <input type="file" accept=".csv,.xls,.xlsx" onChange={handleFileChange} />
          <span>{selectedFile ? selectedFile.name : 'Choose file'}</span>
        </label>

        {error && <div className="upload-error">{error}</div>}

        {previewRows.length > 0 && (
          <div className="preview-box">
            <h4>Preview</h4>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Qty</th>
                  <th>Min Stock</th>
                  <th>Price</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={`${row.sku}-${index}`}>
                    <td>{row.product}</td>
                    <td>{row.sku}</td>
                    <td>{row.qty}</td>
                    <td>{row.minStock}</td>
                    <td>{row.price}</td>
                    <td>{row.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="upload-actions">
          <button type="button" className="cancel-button" onClick={handleClose}>Cancel</button>
          <button type="button" className="upload-button" onClick={handleUpload} disabled={!selectedFile || loading}>
            {loading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InventoryUploadDialog;
