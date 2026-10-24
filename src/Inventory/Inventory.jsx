import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './InventoryPage.css';
import { API_ENDPOINTS, apiFetch } from '../Config/api';
import logger from '../utils/logger';
import InventoryUploadDialog from '../modules/inventoryUpload/InventoryUploadDialog';

const InventoryPage = () => {
  const navigate = useNavigate();
  
  const [products, setProducts] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  const PAGE_SIZE = 10;

  const normalizePage = (page, fallback = 0) => {
    const nextPage = Number(page);
    if (!Number.isFinite(nextPage) || nextPage < 0) return fallback;
    return Math.floor(nextPage);
  };
  
  const fetchProducts = async (page = currentPage, search = searchTerm) => {
    const requestedPage = normalizePage(page, 0);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: requestedPage.toString(),
        size: PAGE_SIZE.toString(),
        search: search || '',
        sortBy: 'id',
        sortDir: 'desc'
      });
      const response = await apiFetch(`${API_ENDPOINTS.products}?${params}`);
      if (!response.ok) {
        throw new Error(`Could not load products (${response.status})`);
      }
      const data = await response.json();
      const pagePayload = data && typeof data === 'object' && 'page' in data ? data.page : data;
      const pageNumber = normalizePage(pagePayload?.number ?? requestedPage, requestedPage);
      const totalPages = normalizePage(pagePayload?.totalPages ?? 0, 0);
      const safeTotalPages = totalPages > 0 ? totalPages : 0;

      setProducts(Array.isArray(data.content) ? data.content : []);
      setTotalPages(safeTotalPages);
      setCurrentPage(Math.min(pageNumber, safeTotalPages > 0 ? safeTotalPages - 1 : 0));
    } catch (error) {
      logger.error('Product fetch failed', error);
      setProducts([]);
      setTotalPages(0);
      setCurrentPage(0);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchProducts();
  }, []);
  
  const handleSearch = (term) => {
    setSearchTerm(term);
    setCurrentPage(0);
    fetchProducts(0, term);
  };
  
  const goToPage = (page) => {
    const nextPage = normalizePage(page, currentPage);
    if (nextPage < 0 || (totalPages > 0 && nextPage >= totalPages)) {
      return;
    }
    setCurrentPage(nextPage);
    fetchProducts(nextPage, searchTerm);
  };
  
const saveProduct = async (e, isEdit = false) => {
  e.preventDefault();

  const formData = new FormData(e.target);

  const product = {
    name: formData.get('name'),
    sku: formData.get('sku'),
    quantity: parseInt(formData.get('quantity') || 0),
    minStock: parseInt(formData.get('minStock') || 0),
    price: parseFloat(formData.get('price') || 0),
  };

  try {
    const response = await apiFetch(API_ENDPOINTS.products, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(product),
    });

    if (!response.ok) {
      logger.warn('Product save rejected', { status: response.status });
      alert(`Save failed: ${response.status}`);
      return;
    }

    setShowAddModal(false);
    setEditingItem(null);
    e.target.reset();

    fetchProducts(currentPage, searchTerm);
  } catch (error) {
    logger.error('Product save failed', error);
    alert('Save failed');
  }
};
  
  const deleteItem = async (id) => {
    if (confirm('Delete product?')) {
      const response = await apiFetch(API_ENDPOINTS.productById(id), {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error(`Delete failed (${response.status})`);
      fetchProducts(currentPage, searchTerm);
    }
  };
  
  const editItem = (item) => {
    setEditingItem(item);
    setShowAddModal(true);
  };

  const handleInventoryUploadSuccess = async () => {
    await fetchProducts(currentPage, searchTerm);
    setShowUploadModal(false);
  };

  const lowStockProducts = products.filter(item => Number(item.quantity || 0) <= Number(item.minStock || 0));
  const totalUnits = products.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const totalInventoryValue = products.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.price || 0)), 0);
  const topCategories = Object.entries(
    products.reduce((acc, item) => {
      const category = item.category || item.group || 'General';
      acc[category] = (acc[category] || 0) + Number(item.quantity || 0);
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div className="inventory-page">
      <header className="page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          ← Back to Dashboard
        </button>
        <div>
          <h1>📦 Inventory Management</h1>
          <p>{products.length} of {totalPages * PAGE_SIZE} products</p>
        </div>
      </header>

      <div className="inventory-controls">
        <input 
          type="text" 
          placeholder="🔍 Search name/SKU..." 
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
          className="search-input"
        />
        <div className="inventory-actions">
          <button className="add-btn secondary" onClick={() => setShowUploadModal(true)}>
            ⬆️ Upload Inventory
          </button>
          <button className="add-btn primary" onClick={() => setShowAddModal(true)}>
            ➕ Add Product
          </button>
        </div>
      </div>

      <div className="inventory-insights">
        <div className="insight-card">
          <span className="insight-label">Total stock</span>
          <strong>{totalUnits}</strong>
          <small>Units available</small>
        </div>
        <div className="insight-card alert-card">
          <span className="insight-label">Low stock</span>
          <strong>{lowStockProducts.length}</strong>
          <small>Products need reorder</small>
        </div>
        <div className="insight-card">
          <span className="insight-label">Inventory value</span>
          <strong>₹{totalInventoryValue.toLocaleString('en-IN')}</strong>
          <small>Stock at current price</small>
        </div>
        <div className="insight-card">
          <span className="insight-label">Top category</span>
          <strong>{topCategories[0]?.[0] || 'General'}</strong>
          <small>{topCategories[0]?.[1] || 0} units</small>
        </div>
      </div>

      <div className="inventory-reminder-row">
        <div className="reminder-card">
          <h3>Retailer action queue</h3>
          <ul>
            {lowStockProducts.length > 0 ? lowStockProducts.slice(0, 4).map(item => (
              <li key={item.id}><span>{item.name}</span><strong>{item.quantity} left</strong></li>
            )) : <li><span>All good</span><strong>Stock healthy</strong></li>}
          </ul>
        </div>

        <div className="reminder-card">
          <h3>Category snapshot</h3>
          <ul>
            {topCategories.length > 0 ? topCategories.map(([category, count]) => (
              <li key={category}><span>{category}</span><strong>{count} pcs</strong></li>
            )) : <li><span>No data</span><strong>0 pcs</strong></li>}
          </ul>
        </div>
      </div>

      {loading && <div className="loading">Loading products...</div>}

      <div className="table-container">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Product</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Min Stock</th>
              <th>Price</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {products.map((item) => (
              <tr key={item.id} className={item.quantity < item.minStock ? 'low-stock' : ''}>
                <td>#{item.id}</td>
                <td>{item.name}</td>
                <td>{item.sku || '-'}</td>
                <td className={item.quantity < item.minStock ? 'alert' : ''}>
                  {item.quantity} {item.quantity < item.minStock && '⚠️'}
                </td>
                <td>{item.minStock || 0}</td>
                <td>₹{item.price?.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                <td>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '-'}</td>
                <td>
                  <button className="action-btn edit" onClick={() => editItem(item)}>✏️</button>
                  <button className="action-btn delete" onClick={() => deleteItem(item.id)}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 0 || totalPages === 0}>
          ← Previous
        </button>
        <span>Page {Math.max(currentPage + 1, totalPages > 0 ? 1 : 0)} of {totalPages || 1}</span>
        <button onClick={() => goToPage(currentPage + 1)} disabled={totalPages === 0 || currentPage + 1 >= totalPages}>
          Next →
        </button>
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editingItem ? 'Edit Product' : 'Add New Product'}</h3>
            <form onSubmit={(e) => saveProduct(e, !!editingItem)}>
              <input name="name" defaultValue={editingItem?.name || ''} placeholder="Product Name *" required />
              <input name="sku" defaultValue={editingItem?.sku || ''} placeholder="SKU (optional)" />
              <input name="quantity" type="number" defaultValue={editingItem?.quantity || 0} placeholder="Quantity *" required min="0" />
              <input name="minStock" type="number" defaultValue={editingItem?.minStock || ''} placeholder="Min Stock" min="0" />
              <input name="price" type="number" step="0.01" defaultValue={editingItem?.price || ''} placeholder="Price ₹ *" required min="0" />
              <div className="modal-actions">
                <button type="button" className="btn cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn primary">Save Product</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <InventoryUploadDialog
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadSuccess={handleInventoryUploadSuccess}
      />
    </div>
  );
};

export default InventoryPage;
