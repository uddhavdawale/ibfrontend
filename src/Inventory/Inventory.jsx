import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './InventoryPage.css'; // New CSS below

const InventoryPage = () => {
  const navigate = useNavigate();
  
  // ALL YOUR INVENTORY STATE (Moved from Dashboard)
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const [inventoryData, setInventoryData] = useState([
    { id: 1, name: 'Shirt', qty: 12, min: 20, price: 299, category: 'Clothing' },
    { id: 2, name: 'Jeans', qty: 8, min: 15, price: 799, category: 'Clothing' },
    { id: 3, name: 'Laptop', qty: 5, min: 10, price: 45999, category: 'Electronics' },
    { id: 4, name: 'Mouse', qty: 25, min: 10, price: 499, category: 'Electronics' },
    { id: 5, name: 'Book', qty: 45, min: 50, price: 199, category: 'Stationery' },
  ]);

  // Filter/Search
  const filteredInventory = inventoryData.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ALL YOUR FUNCTIONS (Unchanged)
  const deleteItem = (id) => {
    setInventoryData(prev => prev.filter(item => item.id !== id));
    alert(`Product deleted! ID: ${id}`);
  };

  const editItem = (item) => {
    setEditingItem(item);
    setShowAddModal(true);
  };

  const reorderItem = (item) => {
    setInventoryData(prev =>
      prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 50 } : i)
    );
    alert(`Reordered 50 units of ${item.name}`);
  };

  const addProduct = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newProduct = {
      id: Date.now(),
      name: formData.get('name'),
      qty: parseInt(formData.get('qty')),
      min: parseInt(formData.get('min')),
      price: parseInt(formData.get('price')),
      category: formData.get('category')
    };
    setInventoryData(prev => [newProduct, ...prev]);
    setShowAddModal(false);
    e.target.reset();
  };

  const updateProduct = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const updated = {
      ...editingItem,
      name: formData.get('name'),
      qty: parseInt(formData.get('qty')),
      min: parseInt(formData.get('min')),
      price: parseInt(formData.get('price')),
      category: formData.get('category')
    };
    setInventoryData(prev => prev.map(item => item.id === editingItem.id ? updated : item));
    setShowAddModal(false);
    setEditingItem(null);
  };

  return (
    <div className="inventory-page">
      {/* Top Bar with Back Button */}
      <header className="page-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          ← Back to Dashboard
        </button>
        <div>
          <h1>Inventory Management</h1>
          <p>{filteredInventory.length} of {inventoryData.length} products</p>
        </div>
      </header>

      {/* Search & Add */}
      <div className="inventory-controls">
        <input 
          type="text" 
          placeholder="🔍 Search products..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <button className="add-btn primary" onClick={() => setShowAddModal(true)}>
          ➕ Add Product
        </button>
      </div>

      {/* Inventory Table */}
      <div className="table-container">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Qty</th>
              <th>Min</th>
              <th>Price</th>
              <th>Category</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredInventory.map((item) => (
              <tr key={item.id} className={item.qty < item.min ? 'low-stock' : ''}>
                <td>{item.name}</td>
                <td className={item.qty < item.min ? 'alert' : ''}>
                  {item.qty} {item.qty < item.min && '⚠️'}
                </td>
                <td>{item.min}</td>
                <td>₹{item.price.toLocaleString()}</td>
                <td>
                  <span className="category-tag">{item.category}</span>
                </td>
                <td>
                  <button className="action-btn edit" onClick={() => editItem(item)}>✏️</button>
                  <button className="action-btn reorder" onClick={() => reorderItem(item)}>🔄</button>
                  <button className="action-btn delete" onClick={() => deleteItem(item.id)}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal (Unchanged) */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editingItem ? 'Edit Product' : 'Add New Product'}</h3>
            <form onSubmit={editingItem ? updateProduct : addProduct}>
              <input name="name" defaultValue={editingItem?.name || ''} placeholder="Product Name" required />
              <input name="qty" type="number" defaultValue={editingItem?.qty || ''} placeholder="Quantity" required />
              <input name="min" type="number" defaultValue={editingItem?.min || ''} placeholder="Min Stock" required />
              <input name="price" type="number" defaultValue={editingItem?.price || ''} placeholder="Price ₹" required />
              <input name="category" defaultValue={editingItem?.category || ''} placeholder="Category" required />
              <div className="modal-actions">
                <button type="button" className="btn cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryPage;