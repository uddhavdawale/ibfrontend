import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line 
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import GSTDashboard from '../GSTFiling/GSTDashboard';
import './Dashboard.css';
import InventoryPage from '../Inventory/Inventory';
import BillingPage from '../Billing/BillingPage';
import { useConfig } from '../hooks/useConfig';
import SellPage from '../sell/SellPage';

function Dashboard({ username, onLogout }) {
  // ✅ ALL STATES
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [language, setLanguage] = useState('EN');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const { config } = useConfig();
  const navigate = useNavigate();
  const [isMinimized, setIsMinimized] = useState(false);
  
  // Dashboard states
  const [soonExpiryItems, setSoonExpiryItems] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false); // Changed to false initially
  const [salesData, setSalesData] = useState([
    { month: 'Jan', sales: 4000 },
    { month: 'Feb', sales: 3000 },
    { month: 'Mar', sales: 2000 },
    { month: 'Apr', sales: 2780 },
    { month: 'May', sales: 1890 },
    { month: 'Jun', sales: 2390 },
  ]);
  const [inventoryData, setInventoryData] = useState([
    { id: 1, name: 'Shirt', qty: 12, min: 20, price: 299, category: 'Clothing' },
    { id: 2, name: 'Jeans', qty: 8, min: 15, price: 799, category: 'Clothing' },
    { id: 3, name: 'Laptop', qty: 5, min: 10, price: 45999, category: 'Electronics' },
    { id: 4, name: 'Mouse', qty: 25, min: 10, price: 499, category: 'Electronics' },
    { id: 5, name: 'Book', qty: 45, min: 50, price: 199, category: 'Stationery' },
  ]);
  const [metrics, setMetrics] = useState({
    salesToday: 15420,
    pendingPayments: 2500,
    pendingCount: 0,
    lowStock: 8,
    ordersToday: 12,
    totalProducts: 0,
    soonExpiring: 0
  });
  
  // ✅ FIXED: Polling refs to prevent infinite loops
  const intervalRef = useRef(null);
  const isMountedRef = useRef(true);
  const lastFetchTimeRef = useRef(0);
  const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

  // ✅ FIXED: Stable fetch function - NO dependencies causing loops
  const fetchDashboardData = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    setLoadingStats(true);
    try {
      const response = await fetch('/api/dashboard/stats');
      if (!response.ok) throw new Error('API failed');
      const data = await response.json();
      
      if (!isMountedRef.current) return;
      
      setDashboardStats(data);
      setMetrics({
        salesToday: data.salesToday || 15420,
        pendingPayments: data.pendingAmount || 2500,
        pendingCount: data.pendingCount || 0,
        lowStock: data.lowStock || 8,
        ordersToday: data.ordersToday || 12,
        totalProducts: data.totalProducts || 0,
        soonExpiring: data.soonExpiring || 0
      });

      // Process expiry items safely
      const now = new Date();
      const EXPIRY_THRESHOLD_DAYS = 30;
      const expiryItems = (data.products || [])
        .filter(product => product.expiryDate)
        .map(product => ({
          ...product,
          daysLeft: Math.ceil((new Date(product.expiryDate) - now) / (1000 * 60 * 60 * 24))
        }))
        .filter(product => product.daysLeft <= EXPIRY_THRESHOLD_DAYS && product.daysLeft > 0)
        .sort((a, b) => a.daysLeft - b.daysLeft)
        .slice(0, 5);

      setSoonExpiryItems(expiryItems);
      setInventoryData(data.products || inventoryData);
      setSalesData(data.salesLastSixMonths || salesData);
      
      lastFetchTimeRef.current = Date.now();
      
    } catch (error) {
      console.error('Dashboard stats fetch failed:', error);
    } finally {
      if (isMountedRef.current) {
        setLoadingStats(false);
      }
    }
  }, []); // ✅ EMPTY deps - STABLE function

  // ✅ FIXED: Smart polling - NO infinite loops
  useEffect(() => {
    isMountedRef.current = true;
    
    const startPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      
      // Initial load only once
      if (Date.now() - lastFetchTimeRef.current > REFRESH_INTERVAL || lastFetchTimeRef.current === 0) {
        fetchDashboardData();
      }
      
      // Smart polling - only when tab visible
      intervalRef.current = setInterval(() => {
        if (document.visibilityState === 'visible' && activeTab === 'dashboard') {
          fetchDashboardData();
        }
      }, REFRESH_INTERVAL);
    };

    if (activeTab === 'dashboard') {
      startPolling();
    }

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [activeTab, fetchDashboardData]);

  // ✅ Visibility API - pause when tab hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeTab === 'dashboard') {
        fetchDashboardData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchDashboardData]);

  const filteredInventory = inventoryData.filter(item =>
    item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Profile menu handler
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showProfileMenu && !event.target.closest('.user-profile')) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  // Live metrics simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => ({
        ...prev,
        salesToday: prev.salesToday + Math.floor(Math.random() * 100),
        ordersToday: prev.ordersToday + Math.floor(Math.random() * 2)
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // All existing functions unchanged
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

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <>
            <header className="page-header">
              <div>
                <h1>Dashboard</h1>
                <p>{filteredInventory.length} of {inventoryData.length} products</p>
                <small>Last updated: {new Date(lastFetchTimeRef.current).toLocaleTimeString()}</small>
              </div>
              <div className="header-actions">
                <button className="btn secondary refresh-btn" onClick={fetchDashboardData}>
                  🔄 Refresh
                </button>
                <button className="btn secondary" onClick={() => setShowAddModal(true)}>
                  ➕ Add Product
                </button>
              </div>
            </header>

            {loadingStats && (
              <div className="loading-state" style={{textAlign: 'center', padding: '2rem'}}>
                <div>🔄 Loading dashboard...</div>
              </div>
            )}

            {soonExpiryItems.length > 0 && !loadingStats && (
              <div className="alert-section expiry-alert">
                <div className="alert-header">
                  <h3>⚠️ Soon Expiring Items ({soonExpiryItems.length})</h3>
                </div>
                <div className="expiry-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>Days Left</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {soonExpiryItems.map((item) => (
                        <tr key={item.id} className={`expiry-row priority-${item.daysLeft <= 7 ? 'high' : 'medium'}`}>
                          <td><strong>{item.name}</strong></td>
                          <td>{item.quantity || item.qty}</td>
                          <td>
                            <span className={`days-left days-${item.daysLeft <= 7 ? 'urgent' : item.daysLeft <= 15 ? 'warning' : 'info'}`}>
                              {item.daysLeft} days
                            </span>
                          </td>
                          <td>
                            <button 
                              className="action-btn small edit"
                              onClick={() => {
                                setActiveTab('inventory');
                                setTimeout(() => alert(`Go to inventory to fix ${item.name}`), 100);
                              }}
                            >
                              ⚡ Fix Now
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-info">
                  <h3>₹{metrics.salesToday.toLocaleString()}</h3>
                  <p>Sales Today</p>
                </div>
                <div className="stat-change positive">Live</div>
              </div>
              <div className="stat-card">
                <div className="stat-info">
                  <h3>₹{(metrics.pendingPayments || 0).toLocaleString()}</h3>
                  <p>Pending Payments</p>
                </div>
                <div className="stat-change negative">-₹500</div>
              </div>
              <div className="stat-card">
                <div className="stat-info">
                  <h3>{metrics.lowStock} items</h3>
                  <p>Low Stock ⚠️</p>
                </div>
                <div className="stat-change alert">Critical</div>
              </div>
              <div className="stat-card">
                <div className="stat-info">
                  <h3>{metrics.soonExpiring}</h3>
                  <p>Soon Expiring ⏰</p>
                </div>
                <div className="stat-change urgent">Priority</div>
              </div>
            </div>

            <div className="charts-row">
              <div className="chart-card">
                <h3>Sales Overview</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salesData}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="sales" fill="#1976d2" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-card stock-gauge">
                <h3>Stock Health</h3>
                <div className="gauge-container">
                  <div className="gauge-circle" style={{'--progress': '78%'}}>
                    <span className="gauge-value">50%</span>
                  </div>
                  <p>Healthy</p>
                </div>
              </div>
            </div>

            <div className="inventory-section">
              <div className="section-header">
                <h2>Inventory ({filteredInventory.length})</h2>
                <button className="add-btn primary" onClick={() => setShowAddModal(true)}>
                  ➕ Add Product
                </button>
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
                    {filteredInventory.map((item) => (
                      <tr key={item.id} className={item.qty < item.min ? 'low-stock' : ''}>
                        <td>{item.name}</td>
                        <td className={item.qty < item.min ? 'alert' : ''}>
                          {item.qty} {item.qty < item.min && '⚠️'}
                        </td>
                        <td>{item.min}</td>
                        <td>₹{item.price.toLocaleString()}</td>
                        <td><span className="category-tag">{item.category}</span></td>
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
            </div>
          </>
        );
      case 'GSTFilling':
        return <GSTDashboard />;
      case 'inventory':
        return <InventoryPage />;
      case 'billing':
        return <BillingPage setActiveTab={setActiveTab} />;
      case 'sell':
        return <SellPage setActiveTab={setActiveTab} />;
      default:
        return null;
    }
  };

  return (
    <div className="dashboard">
      <div className="top-bar">
        <div className="logo">
          <span className="logo-icon">📦</span>
          <span>{config?.shop?.name || 'InventoryPro'}</span>
          <span>IB</span>
        </div>
        <div className="top-search">
          <input 
            type="text" 
            placeholder="🔍 Search products, orders..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="top-actions">
          <select className="language-btn" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option>EN</option>
            <option>MR</option>
            <option>HI</option>
          </select>
          <div className="user-profile">
            <div 
              className="profile-trigger"
              onClick={(e) => {
                e.stopPropagation();
                setShowProfileMenu(!showProfileMenu);
              }}
            >
              <img 
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(username || 'User')}&background=1976d2&color=fff&size=28&bold=true`} 
                alt={username} 
                className="user-avatar"
              />
              <span className="username-text">{username}</span>
              <svg className={`dropdown-icon ${showProfileMenu ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none">
                <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
              </svg>
            </div>
            {showProfileMenu && (
              <div className="profile-dropdown">
                <button className="menu-item" onClick={() => { setShowProfileMenu(false); navigate('/Profile'); }}>
                  <span>👤</span> Profile
                </button>
                <button className="menu-item" onClick={() => {setShowProfileMenu(false); alert('✏️ Edit profile - Coming soon!');}}>
                  <span>✏️</span> Edit
                </button>
                <div className="menu-divider"></div>
                <button className="menu-item logout-item" onClick={() => {setShowProfileMenu(false); onLogout();}}>
                  <span>🚪</span> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
              <span className="nav-icon">📊</span>
              <span>Dashboard</span>
              {metrics.soonExpiring > 0 && <span className="badge urgent">{metrics.soonExpiring}</span>}
            </button>
            <button className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
              <span className="nav-icon">📦</span>
              <span>Inventory</span>
              <span className="badge low-stock">{inventoryData.filter(i => i.qty < i.min).length}</span>
            </button>
            <button className={`nav-item ${activeTab === 'GSTFilling' ? 'active' : ''}`} onClick={() => setActiveTab('GSTFilling')}>
              <span className="nav-icon">📋</span>
              <span>GST Filing</span>
            </button>
            <button className={`nav-item ${activeTab === 'billing' ? 'active' : ''}`} onClick={() => setActiveTab('billing')}>
              <span className="nav-icon">💰</span>
              <span>Billing</span>
            </button>
            <button className={`nav-item ${activeTab === 'sell' ? 'active' : ''}`} onClick={() => setActiveTab('sell')}>
              <span className="nav-icon">📋</span>
              <span>Sell Orders</span>
            </button>
          </nav>
        </aside>

        <main className="main-content">
          {renderTabContent()}
        </main>

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
    </div>
  );
}

export default Dashboard;