import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './InventoryPage.css';

const InventoryPage = () => {
  const navigate = useNavigate();
  
  const [products, setProducts] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  const PAGE_SIZE = 5;
  
  const fetchProducts = async (page = currentPage, search = searchTerm) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        size: PAGE_SIZE.toString(),
        search,
        sortBy: 'id',
        sortDir: 'desc'
      });
      
      const response = await fetch(`https://ibbackend-production.up.railway.app/api/products?${params}`);
      const data = await response.json();
      
      setProducts(data.content);
      setTotalPages(data.totalPages);
      setCurrentPage(data.number);
    } catch (error) {
      console.error('Fetch error:', error);
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
    fetchProducts(page);
  };
  
  const saveProduct = async (e, isEdit = false) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const product = {
      name: formData.get('name'),
      sku: formData.get('sku'),
      quantity: parseInt(formData.get('quantity')),
      minStock: parseInt(formData.get('minStock') || 0),
      price:  parseFloat(formData.get('price') ? parseFloat(formData.get('price')) : 0)
    };
    
    try {
      let response;
      if (isEdit && editingItem) {
        response = await fetch(`https://ibbackend-production.up.railway.app/api/products/${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(product)
        });
      } else {
        response = await fetch('https://ibfrontendlive.vercel.app/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(product)
        });
      }
      
      if (response.ok) {
        fetchProducts(currentPage, searchTerm);
        setShowAddModal(false);
        setEditingItem(null);
        e.target.reset();
      }
    } catch (error) {
      alert('Save failed');
    }
  };
  
  const deleteItem = async (id) => {
    if (confirm('Delete product?')) {
      await fetch(`https://ibbackend-production.up.railway.app/api/products/${id}`, { method: 'DELETE' });
      fetchProducts(currentPage, searchTerm);
    }
  };
  
  const editItem = (item) => {
    setEditingItem(item);
    setShowAddModal(true);
  };

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
        <button className="add-btn primary" onClick={() => setShowAddModal(true)}>
          ➕ Add Product
        </button>
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
        <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 0}>
          ← Previous
        </button>
        <span>Page {currentPage + 1} of {totalPages}</span>
        <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage + 1 >= totalPages}>
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
    </div>
  );
};

export default InventoryPage;
