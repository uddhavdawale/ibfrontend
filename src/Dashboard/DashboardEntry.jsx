import React, { useState } from 'react';
import './Dashboard.css';

function Dashboard({ username, onLogout }) {
  const [language, setLanguage] = useState('EN');
  
  const inventoryData = [
    { id: 1, name: 'Shirt', qty: 12, min: 20, price: 299, category: 'Clothing' },
    { id: 2, name: 'Jeans', qty: 8, min: 15, price: 799, category: 'Clothing' },
    { id: 3, name: 'Laptop', qty: 5, min: 10, price: 45999, category: 'Electronics' },
    { id: 4, name: 'Mouse', qty: 25, min: 10, price: 499, category: 'Electronics' },
    { id: 5, name: 'Book', qty: 45, min: 50, price: 199, category: 'Stationery' },
  ];

  const deleteItem = (id) => {
    console.log('Delete item:', id);
  };

  return (
    <div className="dashboard-container">
      {/* HEADER */}
      <header className="dashboard-header">
        <div className="logo">
          <h1>📦 INV-BILL</h1>
        </div>
        <div className="search-bar">
          <input type="text" placeholder="🔍 Search products, orders..." />
        </div>
        <div className="header-right">
          <div className="profile">
            <span>👤 {username}</span>
          </div>
          <div className="language-selector">
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option>EN</option>
              <option>MR</option>
              <option>HI</option>
            </select>
          </div>
        </div>
      </header>

      {/* METRICS */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-value">₹15,420</div>
          <div className="metric-label">Sales Today</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">₹2,500</div>
          <div className="metric-label">Pending Payments</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">8 items</div>
          <div className="metric-label">Low Stock</div>
        </div>
        <div className="metric-card">
          <div className="metric-value">12</div>
          <div className="metric-label">Today's Orders</div>
        </div>
      </div>

      {/* CHARTS */}
      <div className="charts-row">
        <div className="stock-gauge">
          <div className="gauge-container">
            <div className="gauge-circle" style={{'--progress': '78%'}}>
              <span className="gauge-value">78%</span>
            </div>
            <div className="gauge-label">Stock Health</div>
          </div>
        </div>
        <div className="chart-placeholder pie-chart">🧀 Categories Pie Chart</div>
        <div className="chart-placeholder line-chart">📈 Sales Trend (Line)</div>
      </div>

      {/* INVENTORY TABLE */}
      <div className="inventory-section">
        <div className="section-header">
          <h2>Inventory</h2>
          <button className="add-btn">➕ Add Product</button>
        </div>
        <div className="table-container">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty</th>
                <th>Min</th>
                <th>Price</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {inventoryData.map((item) => (
                <tr key={item.id} className={item.qty < item.min ? 'low-stock' : ''}>
                  <td>{item.name}</td>
                  <td className={item.qty < item.min ? 'alert' : ''}>
                    {item.qty} {item.qty < item.min && '⚠️'}
                  </td>
                  <td>{item.min}</td>
                  <td>₹{item.price.toLocaleString()}</td>
                  <td>
                    <button className="action-btn edit">✏️ Edit</button>
                    <button className="action-btn reorder">🔄 Reorder</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
