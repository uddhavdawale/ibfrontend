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
    { id: 6, name: 'BlackPen', qty: 100, min: 50, price: 20, category: 'Stationery' },
  ];

  const deleteItem = (id) => {
    console.log('Delete item:', id);
  };

  return (
    <div className="dashboard">
      {/* TOP BAR - Material Design */}
      <div className="top-bar">
        <div className="logo">
          <span className="logo-icon">📦</span>
          <span>IB</span>
        </div>
        <div className="top-search">
          <input type="text" placeholder="🔍 Search products, orders..." />
        </div>
        <div className="top-actions">
          <select className="language-btn" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option>EN</option>
            <option>MR</option>
            <option>HI</option>
          </select>
          <div className="user-profile" onClick={onLogout}>
            <img src="https://via.placeholder.com/32" alt="User" className="user-avatar" />
            <span>{username}</span>
            <svg className="dropdown-icon" width="16" height="16" viewBox="0 0 24 24">
              <path d="M7 10l5 5 5-5z" fill="currentColor"/>
            </svg>
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <button className="nav-item active">
              <span className="nav-icon">📊</span>
              <span>Dashboard</span>
            </button>
            <button className="nav-item">
              <span className="nav-icon">📦</span>
              <span>Inventory</span>
              <span className="badge low-stock">8</span>
            </button>
            <button className="nav-item">
              <span className="nav-icon">💰</span>
              <span>Billing</span>
            </button>
            <button className="nav-item">
              <span className="nav-icon">📱</span>
              <span>Products</span>
            </button>
          </nav>
        </aside>

        {/* MAIN CONTENT */}
        <main className="main-content">
          {/* PAGE HEADER */}
          <header className="page-header">
            <div>
              <h1>Dashboard</h1>
              <p>Inventory & Billing Overview</p>
            </div>
            <div className="header-actions">
              <button className="btn secondary">This Month</button>
            </div>
          </header>

          {/* YOUR METRICS - Material Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-info">
                <h3>₹15,420</h3>
                <p>Sales Today</p>
              </div>
              <div className="stat-change positive">+12%</div>
            </div>
            <div className="stat-card">
              <div className="stat-info">
                <h3>₹2,500</h3>
                <p>Pending Payments</p>
              </div>
              <div className="stat-change negative">-3%</div>
            </div>
            <div className="stat-card">
              <div className="stat-info">
                <h3>8 items</h3>
                <p>Low Stock ⚠️</p>
              </div>
              <div className="stat-change alert">Critical</div>
            </div>
            <div className="stat-card">
              <div className="stat-info">
                <h3>12</h3>
                <p>Today's Orders</p>
              </div>
              <div className="stat-change positive">+20%</div>
            </div>
          </div>

          {/* YOUR CHARTS - Material Cards */}
          <div className="charts-row">
            <div className="chart-card stock-gauge">
              <h3>Stock Health</h3>
              <div className="gauge-container">
                <div className="gauge-circle" style={{'--progress': '78%'}}>
                  <span className="gauge-value">78%</span>
                  <span className="gauge-label">Healthy</span>
                </div>
              </div>
            </div>
            <div className="chart-card">
              <h3>Payment Status</h3>
              <div className="pie-placeholder">
                <div className="pie-slice paid">65%</div>
                <div className="pie-slice pending">25%</div>
                <div className="pie-slice overdue">10%</div>
              </div>
            </div>
            <div className="chart-card">
              <h3>Sales Trend</h3>
              <div className="line-placeholder">
                <div className="trend-line"></div>
              </div>
            </div>
          </div>

          {/* YOUR INVENTORY TABLE - Material Design */}
          <div className="inventory-section">
            <div className="section-header">
              <h2>Inventory</h2>
              <button className="add-btn primary">➕ Add Product</button>
            </div>
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
                  {inventoryData.map((item) => (
                    <tr key={item.id} className={item.qty < item.min ? 'low-stock' : ''}>
                      <td>
                        <div className="product-info">
                          <span className="product-name">{item.name}</span>
                        </div>
                      </td>
                      <td className={`qty ${item.qty < item.min ? 'alert' : ''}`}>
                        {item.qty} {item.qty < item.min && <span className="alert-icon">⚠️</span>}
                      </td>
                      <td>{item.min}</td>
                      <td>₹{item.price.toLocaleString()}</td>
                      <td>
                        <span className="category-tag">{item.category}</span>
                      </td>
                      <td>
                        <button className="action-btn edit" title="Edit">✏️</button>
                        <button className="action-btn reorder" title="Reorder">🔄</button>
                        <button className="action-btn delete" onClick={() => deleteItem(item.id)} title="Delete">🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default Dashboard;
