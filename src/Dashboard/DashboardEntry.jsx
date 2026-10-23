import React, { useState, useEffect } from 'react';
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
import { API_BASE_URL, API_ENDPOINTS, apiFetch } from '../Config/api';

const defaultMetrics = {
  salesToday: 15420,
  pendingPayments: 2500,
  lowStock: 8,
  ordersToday: 12
};

const defaultSalesData = [
  { month: 'Jan', sales: 4000 },
  { month: 'Feb', sales: 3000 },
  { month: 'Mar', sales: 2000 },
  { month: 'Apr', sales: 2780 },
  { month: 'May', sales: 1890 },
  { month: 'Jun', sales: 2390 }
];

const defaultTopSoldProducts = [
  { name: 'Laptop Pro 14', sold: 86, revenue: 1840000 },
  { name: 'Smart TV 55', sold: 72, revenue: 1460000 },
  { name: 'Air Purifier', sold: 68, revenue: 475000 },
  { name: 'Bluetooth Speaker', sold: 61, revenue: 315000 },
  { name: 'Washing Machine', sold: 57, revenue: 990000 },
  { name: 'Rice 10kg', sold: 54, revenue: 180000 },
  { name: 'Mobile Case', sold: 49, revenue: 98000 },
  { name: 'Office Chair', sold: 42, revenue: 210000 },
  { name: 'Power Bank', sold: 39, revenue: 120000 },
  { name: 'T-Shirt Combo', sold: 35, revenue: 92000 }
];

const normalizeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeSalesSeries = (payload) => {
  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  return items.map((entry, index) => ({
    month: entry.month || entry.label || `M${index + 1}`,
    sales: normalizeNumber(entry.sales ?? entry.amount ?? entry.total ?? 0, 0)
  }));
};

const normalizeInventoryItem = (product) => {
  const qty = normalizeNumber(product.quantity ?? product.stock ?? product.qty ?? product.ItemQty ?? 0, 0);
  const min = normalizeNumber(
    product.minStock ?? product.minimumStock ?? product.minQty ?? product.lowStockThreshold ?? Math.max(5, Math.ceil(qty * 0.2)),
    0
  );

  return {
    id: product.id ?? product.productId ?? product.product_id ?? Date.now() + Math.random(),
    name: product.name ?? product.productName ?? 'Unnamed Product',
    qty,
    min,
    price: normalizeNumber(product.price ?? product.unitPrice ?? product.salePrice ?? 0, 0),
    category: product.category ?? product.type ?? product.group ?? 'General'
  };
};

const normalizeTopSoldProduct = (product, index) => {
  const sold = normalizeNumber(
    product.salesCount ?? product.soldQty ?? product.purchaseCount ?? product.popularity ?? product.totalSold ?? product.unitsSold ?? 0,
    0
  );
  const unitPrice = normalizeNumber(product.price ?? product.unitPrice ?? product.salePrice ?? 0, 0);
  const revenue = normalizeNumber(
    product.revenue ?? product.salesValue ?? product.totalRevenue ?? sold * unitPrice,
    sold * unitPrice
  );

  return {
    id: product.id ?? product.productId ?? product.product_id ?? index + 1,
    name: product.name ?? product.productName ?? 'Unnamed Product',
    sold,
    revenue
  };
};

const fetchJsonWithFallback = async (urls = []) => {
  for (const url of urls) {
    try {
      const response = await apiFetch(url);
      if (!response.ok) continue;
      return await response.json();
    } catch {
      // continue to next URL
    }
  }
  return null;
};

function Dashboard({ username, onLogout }) {
  // ALL YOUR EXISTING STATE (UNCHANGED)
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [language, setLanguage] = useState('EN');
  const [theme, setTheme] = useState(() => localStorage.getItem('ib-theme') || 'light');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const { config } = useConfig();
  const navigate = useNavigate();

  // Interactive Inventory Data (UNCHANGED)
  const [inventoryData, setInventoryData] = useState([
    { id: 1, name: 'Shirt', qty: 12, min: 20, price: 299, category: 'Clothing' },
    { id: 2, name: 'Jeans', qty: 8, min: 15, price: 799, category: 'Clothing' },
    { id: 3, name: 'Laptop', qty: 5, min: 10, price: 45999, category: 'Electronics' },
    { id: 4, name: 'Mouse', qty: 25, min: 10, price: 499, category: 'Electronics' },
    { id: 5, name: 'Book', qty: 45, min: 50, price: 199, category: 'Stationery' },
  ]);

  // Metrics (defaults matched to the UI contract when the backend is unavailable)
  const [metrics, setMetrics] = useState(defaultMetrics);
  const [salesData, setSalesData] = useState(defaultSalesData);
  const [topSoldProducts, setTopSoldProducts] = useState(
    [...defaultTopSoldProducts].sort((a, b) => b.sold - a.sold).slice(0, 10)
  );
  const lowestStockProducts = [...inventoryData]
    .sort((a, b) => a.qty - b.qty || a.min - b.min)
    .slice(0, 10)
    .map(item => ({
      name: item.name,
      stock: item.qty,
      min: item.min,
      category: item.category
    }));
  const urgentStockItems = [...inventoryData]
    .filter(item => item.qty <= item.min)
    .sort((a, b) => a.qty - b.qty)
    .slice(0, 3);
  const categorySummary = [...inventoryData].reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + item.qty * item.price;
    return acc;
  }, {});
  const topCategory = Object.entries(categorySummary).sort((a, b) => b[1] - a[1])[0];

  const filteredInventory = inventoryData.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ALL YOUR EXISTING EFFECTS & FUNCTIONS (UNCHANGED - just removed duplicate useEffect)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ib-theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showProfileMenu && !event.target.closest('.user-profile')) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  useEffect(() => {
    let active = true;

    const loadDashboardData = async () => {
      try {
        const summary = await fetchJsonWithFallback([
          API_ENDPOINTS.dashboardSummary,
          `${API_BASE_URL}/api/dashboard`,
          `${API_BASE_URL}/api/metrics`
        ]);

        if (summary && active) {
          setMetrics({
            salesToday: normalizeNumber(summary.salesToday ?? summary.sales ?? 0, defaultMetrics.salesToday),
            pendingPayments: normalizeNumber(summary.pendingPayments ?? summary.pending ?? 0, defaultMetrics.pendingPayments),
            lowStock: normalizeNumber(summary.lowStock ?? summary.lowStockCount ?? 0, defaultMetrics.lowStock),
            ordersToday: normalizeNumber(summary.ordersToday ?? summary.orders ?? 0, defaultMetrics.ordersToday)
          });
        }

        const productsResponse = await fetchJsonWithFallback([
          `${API_BASE_URL}/api/products?size=1000`,
          API_ENDPOINTS.products,
        ]);

        const productList = Array.isArray(productsResponse?.content)
          ? productsResponse.content
          : Array.isArray(productsResponse)
            ? productsResponse
            : [];

        if (productList.length > 0 && active) {
          const normalizedProducts = productList.map(normalizeInventoryItem);
          setInventoryData(normalizedProducts);

          const liveTopSoldProducts = productList
            .map((product, index) => normalizeTopSoldProduct(product, index))
            .filter(item => item.sold > 0 || item.revenue > 0)
            .sort((a, b) => b.sold - a.sold || b.revenue - a.revenue)
            .slice(0, 10);

          if (liveTopSoldProducts.length > 0) {
            setTopSoldProducts(liveTopSoldProducts);
          }
        }

        const sales = await fetchJsonWithFallback([
          API_ENDPOINTS.salesLastSixMonths
        ]);

        if (sales && active) {
          const normalizedSales = normalizeSalesSeries(sales);
          if (normalizedSales.length > 0) {
            setSalesData(normalizedSales);
          }
        }
      } catch {
        // Keep the safe, preconfigured mock values if the backend is unavailable.
      }
    };

    loadDashboardData();
    return () => { active = false; };
  }, []);

  // ALL YOUR EXISTING FUNCTIONS (UNCHANGED)
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

  const addProduct = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
      name: String(formData.get('name') || '').trim(),
      quantity: Number(formData.get('qty') || 0),
      minStock: Number(formData.get('min') || 0),
      price: Number(formData.get('price') || 0),
      category: String(formData.get('category') || '').trim() || 'General',
      sku: String(formData.get('sku') || '').trim() || `SKU-${Date.now()}`
    };

    try {
      const response = await apiFetch(API_ENDPOINTS.products, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Save failed (${response.status})`);
      }

      const savedProduct = await response.json().catch(() => payload);
      const normalized = normalizeInventoryItem({
        ...savedProduct,
        ...payload,
        id: savedProduct?.id ?? Date.now(),
        productId: savedProduct?.id ?? savedProduct?.productId ?? Date.now(),
        quantity: Number(savedProduct?.quantity ?? payload.quantity ?? 0),
        stock: Number(savedProduct?.stock ?? payload.quantity ?? 0),
        minStock: Number(savedProduct?.minStock ?? payload.minStock ?? 0),
        minimumStock: Number(savedProduct?.minimumStock ?? payload.minStock ?? 0),
        price: Number(savedProduct?.price ?? payload.price ?? 0),
      });

      setInventoryData(prev => [normalized, ...prev]);
      setShowAddModal(false);
      e.target.reset();
    } catch (error) {
      console.error('Add product failed', error);
      alert('Unable to save product. Please try again.');
    }
  };

  const updateProduct = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
      name: String(formData.get('name') || '').trim(),
      quantity: Number(formData.get('qty') || 0),
      minStock: Number(formData.get('min') || 0),
      price: Number(formData.get('price') || 0),
      category: String(formData.get('category') || '').trim() || 'General',
      sku: String(formData.get('sku') || '').trim() || editingItem?.sku || ''
    };

    try {
      const response = await apiFetch(API_ENDPOINTS.productById(editingItem?.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Update failed (${response.status})`);
      }

      const savedProduct = await response.json().catch(() => ({ ...editingItem, ...payload }));
      const normalized = normalizeInventoryItem({
        ...savedProduct,
        ...payload,
        id: editingItem.id,
        productId: editingItem.id,
        quantity: Number(savedProduct?.quantity ?? payload.quantity ?? 0),
        stock: Number(savedProduct?.stock ?? payload.quantity ?? 0),
        minStock: Number(savedProduct?.minStock ?? payload.minStock ?? 0),
        minimumStock: Number(savedProduct?.minimumStock ?? payload.minStock ?? 0),
        price: Number(savedProduct?.price ?? payload.price ?? 0),
      });

      setInventoryData(prev => prev.map(item => item.id === editingItem.id ? normalized : item));
      setShowAddModal(false);
      setEditingItem(null);
      e.target.reset();
    } catch (error) {
      console.error('Update product failed', error);
      alert('Unable to update product. Please try again.');
    }
  };

  // NEW: Render content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <>
            {/* YOUR EXISTING DASHBOARD CONTENT - 100% PRESERVED */}
            <header className="page-header">
              <div>
                <h1>Dashboard</h1>
                <p>{filteredInventory.length} of {inventoryData.length} products</p>
              </div>
              <div className="header-actions">
                <button className="btn secondary" onClick={() => setShowAddModal(true)}>➕ Add Product</button>
              </div>
            </header>

            <div className="stats-grid">
              <div className="stat-card" onClick={() => alert('Sales details')}>
                <div className="stat-info">
                  <h3>₹{metrics.salesToday.toLocaleString()}</h3>
                  <p>Sales Today</p>
                </div>
                <div className="stat-change positive">Live</div>
              </div>
              <div className="stat-card">
                <div className="stat-info">
                  <h3>₹{metrics.pendingPayments.toLocaleString()}</h3>
                  <p>Pending Payments</p>
                </div>
                <div className="stat-change negative">-₹500</div>
              </div>
              <div className="stat-card">
                <div className="stat-info">
                  <h3>{metrics.lowStock}</h3>
                  <p>Low Stock ⚠️</p>
                </div>
                <div className="stat-change alert">Critical</div>
              </div>
              <div className="stat-card">
                <div className="stat-info">
                  <h3>{metrics.ordersToday}</h3>
                  <p>Today's Orders</p>
                </div>
                <div className="stat-change positive">+2</div>
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

              <div className="side-stack">
                <div className="chart-card stock-gauge">
                  <h3>Stock Health</h3>
                  <div className="gauge-container">
                    <div className="gauge-circle" style={{'--progress': '78%'}}>
                      <span className="gauge-value">78%</span>
                    </div>
                    <p>Healthy</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mini-panels-row">
              <div className="chart-card top-stock-card">
                <div className="top-sold-header">
                  <h3>Top 10 Minimum Stock</h3>
                  <span className="mini-badge warning">Alert</span>
                </div>

                <div className="top-sold-list scroll-panel">
                  {lowestStockProducts.map((product, index) => (
                    <div className="top-stock-row" key={`${product.name}-${index}`}>
                      <div className="top-sold-rank stock-rank">#{index + 1}</div>
                      <div className="top-sold-meta">
                        <strong>{product.name}</strong>
                        <span>{product.stock} left / min {product.min}</span>
                      </div>
                      <div className="top-sold-revenue stock-value">{product.stock}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="chart-card top-sold-card">
                <div className="top-sold-header">
                  <h3>Top 10 Sold Products</h3>
                  <span className="mini-badge">Live</span>
                </div>

                <div className="top-sold-list scroll-panel">
                  {topSoldProducts.map((product, index) => (
                    <div className="top-sold-row" key={`${product.name}-${index}`}>
                      <div className="top-sold-rank">#{index + 1}</div>
                      <div className="top-sold-meta">
                        <strong>{product.name}</strong>
                        <span>{product.sold} sold</span>
                      </div>
                      <div className="top-sold-revenue">₹{product.revenue.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="smart-insights-panel">
              <div className="smart-insight-card accent">
                <div className="insight-label">Urgent actions</div>
                <div className="insight-value small">Reorder now</div>
                <ul className="insight-list">
                  {urgentStockItems.length > 0 ? (
                    urgentStockItems.map(item => (
                      <li key={item.id}><span>{item.name}</span><strong>{item.qty} left</strong></li>
                    ))
                  ) : (
                    <li><span>Everything stocked</span><strong>Safe</strong></li>
                  )}
                </ul>
              </div>

              <div className="smart-insight-card">
                <div className="insight-label">Top category</div>
                <div className="insight-value">{topCategory ? topCategory[0] : 'N/A'}</div>
                <div className="insight-subtext">{topCategory ? `₹${(topCategory[1] / 100000).toFixed(1)}L inventory value` : 'No data yet'}</div>
              </div>

              <div className="smart-insight-card">
                <div className="insight-label">Owner note</div>
                <div className="insight-value small">Focus today</div>
                <div className="insight-subtext">Push fast-moving SKUs and replenish low-stock essentials before 5 PM.</div>
              </div>
            </div>

            <div className="owner-insights-row">
              <div className="insight-card highlight">
                <div className="insight-label">Fastest Moving Category</div>
                <div className="insight-value">{topCategory ? topCategory[0] : 'Electronics'}</div>
                <div className="insight-subtext">{topCategory ? `₹${(topCategory[1] / 100000).toFixed(1)}L in stock value` : '₹1.8L in sales this week'}</div>
              </div>

              <div className="insight-card">
                <div className="insight-label">Cash Flow Health</div>
                <div className="insight-value">₹3.4L</div>
                <div className="insight-subtext">Collections on track</div>
              </div>

              <div className="insight-card">
                <div className="insight-label">Best Reorder Suggestion</div>
                <div className="insight-value">Rice / Dairy</div>
                <div className="insight-subtext">Reorder in next 2 days</div>
              </div>
            </div>

          </>
        );
      
      case 'GSTFilling':
        return <GSTDashboard />; // FULL GST DASHBOARD
        
      case 'inventory':
        return <InventoryPage />;
      case 'billing':
        return <BillingPage />;

      case 'sell':  // 👈 NEW CASE
        return <SellPage />;

      default:
        return null;
    }
  };

  // YOUR EXISTING RETURN (ONLY SIDEBAR UPDATED)
  return (
    <div className={`dashboard theme-${theme}`}>
      {/* TOP BAR - UNCHANGED */}
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

          <select className="theme-select" value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="aurora">Aurora</option>
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
                <button 
                  className="menu-item"  
                  onClick={() => { setShowProfileMenu(false); navigate('/Profile'); }}
                >
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
        {/* SIDEBAR - FIXED GST TAB */}
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
              <span className="nav-icon">📊</span>
              <span>Dashboard</span>
            </button>
            <button className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
              <span className="nav-icon">📦</span>
              <span>Inventory</span>
              <span className="badge low-stock">{inventoryData.filter(i => i.qty < i.min).length}</span>
            </button>
            <button className={`nav-item ${activeTab === 'GSTFilling' ? 'active' : ''}`} onClick={() => setActiveTab('GSTFilling')}>
              <span className="nav-icon">📋</span> {/* CHANGED ICON */}
              <span>GST Filing</span>  {/* FIXED LABEL */}
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

        {/* MAIN CONTENT - DYNAMIC */}
        <main className="main-content">
          {renderTabContent()}
        </main>

        {/* MODAL - UNCHANGED */}
        {showAddModal && (
          <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <h3>{editingItem ? 'Edit Product' : 'Add New Product'}</h3>
              <form onSubmit={editingItem ? updateProduct : addProduct}>
                <input name="name" defaultValue={editingItem?.name || ''} placeholder="Product Name" required />
                <input name="sku" defaultValue={editingItem?.sku || ''} placeholder="SKU (optional)" />
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