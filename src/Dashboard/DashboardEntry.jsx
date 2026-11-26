import React, { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import GSTDashboard from '../GSTFiling/GSTDashboard';
import './Dashboard.css';
import InventoryPage from '../Inventory/Inventory';
import BillingPage from '../Billing/BillingPage';
import { useConfig } from '../hooks/useConfig';
import SellPage from '../sell/SellPage';
const PaymentCollectionPage = lazy(() => import('../Payments/PaymentCollectionPage.jsx'));
const LedgerReportPage = lazy(() => import('./LedgerReportPage.jsx'));
import AuditPage from '../Audit/AuditPage';
import PendingPaymentsCard from './PendingPaymentsCard';
import LowStockCard from './LowStockCard';
import { API_ENDPOINTS, apiFetch } from '../Config/api';
import { getCurrentShopProfile, readStoredShopProfile, getShopDisplayName, getShopLogoUrl } from '../modules/shopProfile/shopProfileService';
import { openWhatsAppChat } from '../utils/whatsapp';
import { buildDailySalesSummaryMessage, normalizeWhatsAppPhone } from '../utils/whatsappCommerce';
import {
  getCurrentUserRole,
  normalizeStoreRole,
  canAccessBilling,
  canAccessInventory,
  canAccessSellOrders,
  canWriteInventory,
  canViewAdvancedDashboard,
  isStoreAdmin,
  canAccessAudit,
  canAccessAdminPanel,
  isBillingOnlyRole,
  isInventoryOnlyRole,
} from '../Security/storeRoles';

const defaultMetrics = {
  salesToday: 0,
  pendingPayments: 0,
  lowStock: 0,
  ordersToday: 0
};

const normalizeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const unwrapResponsePayload = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;

  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data;
  }

  if (payload.result && typeof payload.result === 'object') {
    return payload.result;
  }

  if (payload.dashboard && typeof payload.dashboard === 'object') {
    return payload.dashboard;
  }

  if (payload.metrics && typeof payload.metrics === 'object') {
    return payload.metrics;
  }

  return payload;
};

const normalizeSalesSeries = (payload) => {
  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  return items.map((entry, index) => ({
    month: entry.month || entry.label || `M${index + 1}`,
    sales: normalizeNumber(entry.sales ?? entry.amount ?? entry.total ?? 0, 0)
  }));
};

const extractListPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.content)) return payload.data.content;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  return [];
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
    revenue,
    sku: product.sku ?? product.SKU ?? ''
  };
};

const normalizeTopSoldProductFromSummary = (product, index) => {
  const sold = normalizeNumber(
    product.totalQty ?? product.soldQty ?? product.unitsSold ?? product.salesCount ?? product.quantity ?? 0,
    0
  );
  const revenue = normalizeNumber(
    product.totalAmount ?? product.totalRevenue ?? product.salesValue ?? product.amount ?? 0,
    0
  );

  return {
    id: product.productId ?? product.id ?? product.product_id ?? index + 1,
    name: product.name ?? product.productName ?? 'Unnamed Product',
    sold,
    revenue,
    sku: product.sku ?? product.SKU ?? ''
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
  const [showManageStoreMenu, setShowManageStoreMenu] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('ib-theme') || 'light');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [shopProfile, setShopProfile] = useState(() => readStoredShopProfile());
  const [failedShopLogoUrl, setFailedShopLogoUrl] = useState('');
  const [securityContext, setSecurityContext] = useState({ tenantId: null, userId: null, role: null });
  const [dashboardInfoMessage, setDashboardInfoMessage] = useState('');
  const [dashboardDataStatus, setDashboardDataStatus] = useState('loading');
  const [hasDashboardSummary, setHasDashboardSummary] = useState(false);
  const [dashboardLastUpdated, setDashboardLastUpdated] = useState(null);
  const [sessionRole, setSessionRole] = useState(() => getCurrentUserRole());
  const [dashboardRefreshToken, setDashboardRefreshToken] = useState(0);
  const [isDashboardRefreshing, setIsDashboardRefreshing] = useState(false);
  const { config } = useConfig();
  const navigate = useNavigate();
  const shopDisplayName = getShopDisplayName(shopProfile);
  const currentShopName = shopDisplayName && shopDisplayName !== 'IB ENTERPRISES'
    ? shopDisplayName
    : (config?.shop?.name || shopDisplayName);
  const shopLogoUrl = getShopLogoUrl(shopProfile);
  const shopInitials = currentShopName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  const [inventoryData, setInventoryData] = useState([]);

  // Keep the dashboard empty until live values are available.
  const [metrics, setMetrics] = useState(defaultMetrics);
  const [salesData, setSalesData] = useState([]);
  const [topSoldProducts, setTopSoldProducts] = useState([]);
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
  const healthyStockCount = inventoryData.filter((item) => item.qty > item.min).length;
  const stockHealthPercent = inventoryData.length
    ? Math.round((healthyStockCount / inventoryData.length) * 100)
    : null;

  const filteredInventory = inventoryData.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentRole = useMemo(() => normalizeStoreRole(securityContext?.role || sessionRole), [securityContext, sessionRole]);
  const roleBadgeLabel = useMemo(() => {
    if (currentRole === 'store_admin') return 'Store Admin';
    if (currentRole === 'store_manager') return 'Store Manager';
    if (currentRole === 'billing_manager') return 'Billing Manager';
    if (currentRole === 'inventory_manager') return 'Inventory Manager';
    if (currentRole === 'store_billing_viewer') return 'Billing Viewer';
    if (currentRole === 'store_inventory_viewer') return 'Inventory Viewer';
    if (currentRole === 'system_administrator') return 'System Administrator';
    if (currentRole === 'audit_related') return 'Audit Related';
    return 'Store Manager';
  }, [currentRole]);
  const isInventoryWritable = useMemo(() => canWriteInventory(currentRole), [currentRole]);
  const canOpenInventory = useMemo(() => canAccessInventory(currentRole), [currentRole]);
  const canOpenBilling = useMemo(() => canAccessBilling(currentRole), [currentRole]);
  const canOpenSellOrders = useMemo(() => canAccessSellOrders(currentRole), [currentRole]);
  const canOpenAudit = useMemo(() => canAccessAudit(currentRole), [currentRole]);
  const canOpenAdvancedDashboard = useMemo(() => canViewAdvancedDashboard(currentRole), [currentRole]);
  const canOpenAdminPanel = useMemo(() => canAccessAdminPanel(currentRole), [currentRole]);
  const canManageUsers = useMemo(() => isStoreAdmin(currentRole), [currentRole]);
  const hasBillingOnlyScope = useMemo(() => isBillingOnlyRole(currentRole), [currentRole]);
  const hasInventoryOnlyScope = useMemo(() => isInventoryOnlyRole(currentRole), [currentRole]);
  const canShowDashboardTab = !hasBillingOnlyScope && !hasInventoryOnlyScope;
  const canShowGstTab = !hasBillingOnlyScope && !hasInventoryOnlyScope;
  const canShowInventoryTab = canOpenInventory && !hasBillingOnlyScope;
  const canShowBillingTab = canOpenBilling && !hasInventoryOnlyScope;
  const canShowSellTab = canOpenSellOrders && !hasInventoryOnlyScope;
  const canShowPaymentReportTab = canOpenBilling && !hasInventoryOnlyScope;
  const canShowAuditTab = canOpenAudit && !hasBillingOnlyScope && !hasInventoryOnlyScope;

  // ALL YOUR EXISTING EFFECTS & FUNCTIONS (UNCHANGED - just removed duplicate useEffect)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ib-theme', theme);
  }, [theme]);

  useEffect(() => {
    setSessionRole(getCurrentUserRole());
  }, []);

  useEffect(() => {
    if (hasBillingOnlyScope && !['billing', 'sell', 'payments', 'ledger'].includes(activeTab)) {
      setActiveTab('billing');
      return;
    }

    if (hasInventoryOnlyScope && activeTab !== 'inventory') {
      setActiveTab('inventory');
      return;
    }

    if (activeTab === 'inventory' && !canShowInventoryTab) setActiveTab(canShowDashboardTab ? 'dashboard' : 'billing');
    if (activeTab === 'billing' && !canShowBillingTab) setActiveTab(canShowDashboardTab ? 'dashboard' : 'inventory');
    if (activeTab === 'sell' && !canShowSellTab) setActiveTab(canShowDashboardTab ? 'dashboard' : 'billing');
    if (activeTab === 'payments' && !canShowPaymentReportTab) setActiveTab(canShowDashboardTab ? 'dashboard' : 'billing');
    if (activeTab === 'ledger' && !canShowBillingTab) setActiveTab(canShowDashboardTab ? 'dashboard' : 'billing');
    if (activeTab === 'audit' && !canShowAuditTab) setActiveTab(canShowDashboardTab ? 'dashboard' : 'billing');
    if (activeTab === 'GSTFilling' && !canShowGstTab) setActiveTab(canShowDashboardTab ? 'dashboard' : (hasInventoryOnlyScope ? 'inventory' : 'billing'));
    if (activeTab === 'dashboard' && !canShowDashboardTab) setActiveTab(hasInventoryOnlyScope ? 'inventory' : 'billing');
  }, [
    activeTab,
    canShowInventoryTab,
    canShowBillingTab,
    canShowSellTab,
    canShowPaymentReportTab,
    canShowAuditTab,
    canShowDashboardTab,
    canShowGstTab,
    hasBillingOnlyScope,
    hasInventoryOnlyScope,
  ]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showProfileMenu && !event.target.closest('.user-profile')) {
        setShowProfileMenu(false);
        setShowManageStoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu]);

  useEffect(() => {
    let active = true;
    const isManualRefresh = dashboardRefreshToken > 0;
    let hasDashboardData = false;
    let dashboardLoadFailed = false;
    let dashboardRequestFailed = false;

    setDashboardDataStatus('loading');
    setHasDashboardSummary(false);
    if (isManualRefresh && active) {
      setIsDashboardRefreshing(true);
    }

    getCurrentShopProfile()
      .then((profile) => {
        if (active) setShopProfile(profile);
      })
      .catch(() => {
        if (active) setShopProfile(readStoredShopProfile());
      });

    const loadDashboardData = async () => {
      try {
        const summary = await fetchJsonWithFallback([
          API_ENDPOINTS.dashboardSummary,
          API_ENDPOINTS.dashboardLegacy,
          API_ENDPOINTS.metrics
        ]);

        if (summary && active) {
          hasDashboardData = true;
          const summaryPayload = unwrapResponsePayload(summary);

          const nextSecurityContext = {
            tenantId: summaryPayload?.tenantId ?? summaryPayload?.securityContext?.tenantId ?? null,
            userId: summaryPayload?.userId ?? summaryPayload?.securityContext?.userId ?? null,
            role: summaryPayload?.role ?? summaryPayload?.securityContext?.role ?? null,
          };

          if (active) {
            setSecurityContext(nextSecurityContext);
            const role = String(nextSecurityContext.role || '').toUpperCase();
            if (role && !canViewAdvancedDashboard(role)) {
              setDashboardInfoMessage('Some dashboard details are restricted for your role.');
            } else {
              setDashboardInfoMessage('');
            }
          }

          const normalizedSummary = {
            salesToday: normalizeNumber(summaryPayload?.salesToday ?? summaryPayload?.sales ?? 0),
            pendingPayments: normalizeNumber(summaryPayload?.pendingPayments ?? summaryPayload?.pending ?? 0),
            lowStock: normalizeNumber(summaryPayload?.lowStock ?? summaryPayload?.lowStockCount ?? 0),
            ordersToday: normalizeNumber(summaryPayload?.ordersToday ?? summaryPayload?.orders ?? 0)
          };
          setMetrics(normalizedSummary);
          setHasDashboardSummary(true);

          const summaryTopSoldProducts = Array.isArray(summaryPayload?.topSoldProducts)
            ? summaryPayload.topSoldProducts.map(normalizeTopSoldProductFromSummary)
            : [];

          setTopSoldProducts(summaryTopSoldProducts.slice(0, 10));
        } else {
          dashboardLoadFailed = true;
        }

        const productsResponse = await fetchJsonWithFallback([
          API_ENDPOINTS.productsWithSize(100),
          API_ENDPOINTS.products,
        ]);

        const unwrappedProducts = unwrapResponsePayload(productsResponse);
        const productList = extractListPayload(unwrappedProducts);

        if (productsResponse && active) {
          hasDashboardData = true;
          const normalizedProducts = productList.map(normalizeInventoryItem);
          setInventoryData(normalizedProducts);

          const liveTopSoldProducts = productList
            .map((product, index) => normalizeTopSoldProduct(product, index))
            .filter(item => item.sold > 0 || item.revenue > 0)
            .sort((a, b) => b.sold - a.sold || b.revenue - a.revenue)
            .slice(0, 10);

          if (liveTopSoldProducts.length > 0) {
            setTopSoldProducts(liveTopSoldProducts);
          } else if (!summary) {
            setTopSoldProducts([]);
          }
        } else {
          dashboardLoadFailed = true;
        }

        const sales = await fetchJsonWithFallback([
          API_ENDPOINTS.salesLastSixMonths
        ]);

        if (sales && active) {
          hasDashboardData = true;
          const salesPayload = unwrapResponsePayload(sales);
          const normalizedSales = normalizeSalesSeries(salesPayload);
          setSalesData(normalizedSales);
        } else {
          dashboardLoadFailed = true;
        }
      } catch (error) {
        console.error('Dashboard data could not be loaded', error);
        dashboardLoadFailed = true;
        dashboardRequestFailed = true;
      } finally {
        if (active) {
          if (hasDashboardData) {
            setDashboardDataStatus(dashboardLoadFailed ? 'partial' : 'ready');
            setDashboardLastUpdated(new Date());
          } else {
            setDashboardDataStatus(dashboardRequestFailed ? 'error' : 'unavailable');
          }
        }
        if (active && isManualRefresh) {
          setIsDashboardRefreshing(false);
        }
      }
    };

    loadDashboardData();
    return () => { active = false; };
  }, [dashboardRefreshToken]);

  const refreshDashboardSummary = async () => {
    try {
      const summary = await fetchJsonWithFallback([
        API_ENDPOINTS.dashboardSummary,
        API_ENDPOINTS.dashboardLegacy,
        API_ENDPOINTS.metrics
      ]);
      if (!summary) {
        throw new Error('Dashboard summary could not be refreshed.');
      }

      const payload = unwrapResponsePayload(summary);
      setMetrics((current) => ({
        ...current,
        salesToday: normalizeNumber(payload?.salesToday ?? payload?.sales ?? 0),
        pendingPayments: normalizeNumber(payload?.pendingPayments ?? payload?.pending ?? 0),
        ordersToday: normalizeNumber(payload?.ordersToday ?? payload?.orders ?? 0)
      }));
      setHasDashboardSummary(true);
      setDashboardLastUpdated(new Date());
    } catch (error) {
      console.warn('Dashboard summary could not be refreshed after order cancellation.', error);
    }
  };

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

  const handleDashboardRefresh = () => {
    if (isDashboardRefreshing) return;
    setDashboardRefreshToken((prev) => prev + 1);
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
        if (!canShowDashboardTab) {
          return null;
        }
        return (
          <>
            {/* YOUR EXISTING DASHBOARD CONTENT - 100% PRESERVED */}
            <header className="page-header">
              <div>
                <h1>Dashboard</h1>
                <p className="dashboard-date">
                  {new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())}
                  <span className="dashboard-catalog-count">
                    {filteredInventory.length} of {inventoryData.length} products
                  </span>
                </p>
                {dashboardInfoMessage && <p className="error-text">{dashboardInfoMessage}</p>}
                <p className={`dashboard-data-status status-${dashboardDataStatus}`} role="status" aria-live="polite">
                  {dashboardDataStatus === 'loading' && 'Loading business data…'}
                  {dashboardDataStatus === 'ready' && `Data updated${dashboardLastUpdated ? ` at ${dashboardLastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`}
                  {dashboardDataStatus === 'partial' && 'Some business data could not be loaded. Refresh to try again.'}
                  {dashboardDataStatus === 'unavailable' && 'Business data is currently unavailable. Try refreshing.'}
                  {dashboardDataStatus === 'error' && 'Unable to load business data. Try refreshing.'}
                </p>
              </div>
              <div className="header-actions">
                <button
                  type="button"
                  className={`tiny-refresh-btn ${isDashboardRefreshing ? 'is-loading' : ''}`}
                  onClick={handleDashboardRefresh}
                  disabled={isDashboardRefreshing}
                  aria-label="Refresh dashboard"
                  title="Refresh dashboard"
                >
                  ↻
                </button>
                {canShowDashboardTab && (
                  <button type="button" className="btn secondary" onClick={handleShareDailySalesSummary}>
                    📱 Share Daily Summary
                  </button>
                )}
                {isInventoryWritable && (
                  <button className="btn secondary" onClick={() => setShowAddModal(true)}>➕ Add Product</button>
                )}
              </div>
            </header>

            <div className="stats-grid">
              <div className="stat-card sales-card">
                <div className="stat-info">
                  <h3>₹{metrics.salesToday.toLocaleString('en-IN')}</h3>
                  <p>Sales Today</p>
                </div>
                <div className="stat-change positive">Today</div>
              </div>
              <PendingPaymentsCard
                defaultTotal={metrics.pendingPayments}
                summaryAvailable={hasDashboardSummary}
                summaryLoading={dashboardDataStatus === 'loading'}
              />
              <LowStockCard items={inventoryData} loading={dashboardDataStatus === 'loading'} />
              <div className="stat-card orders-card">
                <div className="stat-info">
                  <h3>{metrics.ordersToday}</h3>
                  <p>Today's Orders</p>
                </div>
                <div className="stat-change positive">Today</div>
              </div>
            </div>

            <div className="charts-row">
              <div className="chart-card">
                <div className="chart-heading">
                  <div>
                    <h3>Sales overview</h3>
                    <p>Monthly sales performance</p>
                  </div>
                  <span className="chart-period">Last 6 months</span>
                </div>
                {salesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={salesData}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />
                      <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Sales']} />
                      <Bar dataKey="sales" fill="#1976d2" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="dashboard-empty-state" role="status">
                    {dashboardDataStatus === 'loading' ? 'Loading sales history…' : 'Sales history will appear when data is available.'}
                  </div>
                )}
              </div>

              <div className="side-stack">
                <div className="chart-card stock-gauge">
                  <h3>Stock Health</h3>
                  {stockHealthPercent === null ? (
                    <div className="dashboard-empty-state">
                      {dashboardDataStatus === 'loading' ? 'Loading inventory…' : 'Inventory data is not available yet.'}
                    </div>
                  ) : (
                    <div className="gauge-container">
                      <div className="gauge-circle" style={{'--progress': `${stockHealthPercent}%`}}>
                        <span className="gauge-value">{stockHealthPercent}%</span>
                      </div>
                      <p>{healthyStockCount} of {inventoryData.length} products above minimum stock</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {canOpenAdvancedDashboard ? (
            <div className="mini-panels-row">
              <div className="chart-card top-stock-card">
                <div className="top-sold-header">
                  <h3>Lowest stock items</h3>
                  <span className={`mini-badge ${urgentStockItems.length > 0 ? 'warning' : ''}`}>
                    {inventoryData.length === 0 ? 'No data' : urgentStockItems.length > 0 ? 'Needs attention' : 'On track'}
                  </span>
                </div>

                <div className="top-sold-list scroll-panel">
                  {lowestStockProducts.length > 0 ? (
                    lowestStockProducts.map((product, index) => (
                      <div className="top-stock-row" key={`${product.name}-${index}`}>
                        <div className="top-sold-rank stock-rank">#{index + 1}</div>
                        <div className="top-sold-meta">
                          <strong>{product.name}</strong>
                          <span>{product.stock} left / min {product.min}</span>
                        </div>
                        <div className="top-sold-revenue stock-value">{product.stock}</div>
                      </div>
                    ))
                  ) : (
                    <div className="top-sold-empty">
                      {dashboardDataStatus === 'loading' ? 'Loading inventory…' : 'Inventory data is not available yet.'}
                    </div>
                  )}
                </div>
              </div>

              <div className="chart-card top-sold-card">
                <div className="top-sold-header">
                  <h3>Top 10 Sold Products</h3>
                  <span className="mini-badge">Top 10</span>
                </div>

                <div className="top-sold-list scroll-panel">
                  {topSoldProducts.length === 0 ? (
                    <div className="top-sold-empty">
                      {dashboardDataStatus === 'loading' ? 'Loading sales data…' : 'No sales data available.'}
                    </div>
                  ) : (
                    topSoldProducts.map((product, index) => (
                      <div className="top-sold-row" key={`${product.name}-${product.sku || 'sku'}-${index}`}>
                        <div className="top-sold-rank">#{index + 1}</div>
                        <div className="top-sold-meta">
                          <strong>{product.name}</strong>
                          <span>{product.sku ? `${product.sku} • ` : ''}{product.sold} sold</span>
                        </div>
                        <div className="top-sold-revenue">₹{(product.revenue ?? 0).toLocaleString('en-IN')}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            ) : (
              <div className="chart-card top-sold-card">
                <div className="top-sold-header">
                  <h3>Restricted Details</h3>
                  <span className="mini-badge warning">Role-limited</span>
                </div>
                <div className="top-sold-list">
                  <div className="top-sold-empty">Detailed product lists are hidden for your role.</div>
                </div>
              </div>
            )}

            {canOpenAdvancedDashboard && (
            <div className="smart-insights-panel">
              <div className="smart-insight-card accent">
                <div className="insight-label">Urgent actions</div>
                <div className="insight-value small">{urgentStockItems.length > 0 ? 'Reorder now' : 'No action needed'}</div>
                <ul className="insight-list">
                  {urgentStockItems.length > 0 ? (
                    urgentStockItems.map(item => (
                      <li key={item.id}><span>{item.name}</span><strong>{item.qty} left</strong></li>
                    ))
                  ) : (
                    <li>
                      <span>{inventoryData.length > 0 ? 'Everything stocked' : 'Inventory data unavailable'}</span>
                      <strong>{inventoryData.length > 0 ? 'Safe' : '—'}</strong>
                    </li>
                  )}
                </ul>
              </div>

              <div className="smart-insight-card">
                <div className="insight-label">Highest stock value</div>
                <div className="insight-value">{topCategory ? topCategory[0] : 'N/A'}</div>
                <div className="insight-subtext">{topCategory ? `₹${(topCategory[1] / 100000).toFixed(1)}L inventory value` : 'No data yet'}</div>
              </div>

              <div className="smart-insight-card">
                <div className="insight-label">Catalog coverage</div>
                <div className="insight-value small">{inventoryData.length} products</div>
                <div className="insight-subtext">{Object.keys(categorySummary).length} categories in your inventory</div>
              </div>
            </div>
            )}

          </>
        );
      
      case 'GSTFilling':
        if (!canShowGstTab) {
          return null;
        }
        return <GSTDashboard />; // FULL GST DASHBOARD
        
      case 'inventory':
        return canShowInventoryTab ? <InventoryPage /> : <div className="chart-card top-sold-card"><div className="top-sold-empty">You do not have access to inventory.</div></div>;
      case 'billing':
        return canShowBillingTab ? <BillingPage /> : <div className="chart-card top-sold-card"><div className="top-sold-empty">You do not have access to billing.</div></div>;

      case 'sell':
        return canShowSellTab
          ? <SellPage
              onOpenPaymentReport={() => setActiveTab('payments')}
              onOrderCancelled={refreshDashboardSummary}
            />
          : <div className="chart-card top-sold-card"><div className="top-sold-empty">You do not have access to sell orders.</div></div>;
      case 'payments':
        return canShowPaymentReportTab
          ? <Suspense fallback={<div className="loading-screen" role="status">Loading payment tools…</div>}>
              <PaymentCollectionPage onNavigateToSell={() => setActiveTab('sell')} />
            </Suspense>
          : <div className="chart-card top-sold-card"><div className="top-sold-empty">You do not have access to payment reports.</div></div>;
      case 'ledger':
        return canShowBillingTab
          ? <Suspense fallback={<div className="loading-screen" role="status">Loading customer ledger…</div>}>
              <LedgerReportPage onBackToDashboard={() => setActiveTab('dashboard')} />
            </Suspense>
          : <div className="chart-card top-sold-card"><div className="top-sold-empty">You do not have access to the customer ledger.</div></div>;
      case 'audit':
        return canShowAuditTab ? <AuditPage /> : <div className="chart-card top-sold-card"><div className="top-sold-empty">You do not have access to audit.</div></div>;

      default:
        return null;
    }
  };

  // YOUR EXISTING RETURN (ONLY SIDEBAR UPDATED)
  const lowStockCount = inventoryData.filter((item) => item.qty <= item.min).length;

  const handleQuickMenuAction = (path) => {
    setShowProfileMenu(false);
    setShowManageStoreMenu(false);
    navigate(path);
  };

  const handleShareDailySalesSummary = () => {
    const ownerPhone = normalizeWhatsAppPhone(
      shopProfile?.ownerPhone
      || shopProfile?.phone
      || shopProfile?.contactNumber
      || shopProfile?.mobile
    );
    if (!ownerPhone) {
      alert('Add the owner phone number in Shop Profile before sharing the daily summary.');
      navigate('/profile');
      return;
    }

    openWhatsAppChat(ownerPhone, buildDailySalesSummaryMessage({
      shopName: getShopDisplayName(shopProfile),
      salesToday: metrics.salesToday,
      pendingPayments: metrics.pendingPayments,
      ordersToday: metrics.ordersToday,
      lowStockCount: lowStockCount,
    }));
  };

  return (
    <div className={`dashboard theme-${theme}`}>
      <div className="top-bar">
        <div className="logo">
          <span className="shop-brand-mark" aria-hidden="true">
            <span className="shop-brand-fallback">{shopInitials}</span>
            {shopLogoUrl && failedShopLogoUrl !== shopLogoUrl && (
              <img
                key={shopLogoUrl}
                className="shop-brand-image"
                src={shopLogoUrl}
                alt=""
                onError={() => setFailedShopLogoUrl(shopLogoUrl)}
              />
            )}
          </span>
          <span className="shop-brand-copy">
            <span className="shop-brand-name" title={currentShopName}>{currentShopName}</span>
            <span className="shop-brand-caption">Business workspace</span>
          </span>
        </div>
        <div className="top-search">
          <input 
            type="text" 
            placeholder="Search products…"
            aria-label="Search products"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="top-actions">
          <span className={`role-badge role-${currentRole}`}>{roleBadgeLabel}</span>
          {canManageUsers && (
            <select
              className="language-btn"
              value=""
              onChange={(e) => {
                const selected = e.target.value;
                if (selected) navigate(selected);
              }}
              aria-label="Quick actions"
            >
              <option value="" disabled>Quick Actions</option>
              <option value="/customers">Customer List</option>
              <option value="/inventory">Replenish Orders</option>
              <option value="/customers">Dealers</option>
              <option value="/store-users">Helpers</option>
            </select>
          )}

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
                if (showProfileMenu) setShowManageStoreMenu(false);
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
                <button className="menu-item" onClick={() => handleQuickMenuAction('/Profile')}>
                  <span className="menu-item-icon">👤</span>
                  <span className="menu-item-label">Profile</span>
                </button>
                {canOpenAdminPanel && (
                  <button className="menu-item" onClick={() => { setShowProfileMenu(false); handleQuickMenuAction('/admin/dashboard'); }}>
                    <span className="menu-item-icon">🛡️</span>
                    <span className="menu-item-label">Admin Panel</span>
                  </button>
                )}
                {canManageUsers && (
                  <>
                    <button
                      className="menu-item manage-store-parent"
                      onClick={() => setShowManageStoreMenu((prev) => !prev)}
                    >
                      <span className="menu-item-icon">🏬</span>
                      <span className="menu-item-label">Manage Store</span>
                      <span className={`submenu-arrow ${showManageStoreMenu ? 'open' : ''}`}>▾</span>
                    </button>
                    {showManageStoreMenu && (
                      <div className="manage-store-submenu">
                        <button className="menu-item submenu-item" onClick={() => { setShowManageStoreMenu(false); handleQuickMenuAction('/users-roles'); }}>
                          <span className="menu-item-icon">🧩</span>
                          <span className="menu-item-label">Add Users / Roles</span>
                        </button>
                        <button className="menu-item submenu-item" onClick={() => { setShowManageStoreMenu(false); handleQuickMenuAction('/store-users'); }}>
                          <span className="menu-item-icon">👥</span>
                          <span className="menu-item-label">Existing Users</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
                <button className="menu-item" onClick={() => {setShowProfileMenu(false); alert('✏️ Edit profile - Coming soon!');}}>
                  <span className="menu-item-icon">✏️</span>
                  <span className="menu-item-label">Edit</span>
                </button>
                <div className="menu-divider"></div>
                <button className="menu-item logout-item" onClick={() => {setShowProfileMenu(false); onLogout();}}>
                  <span className="menu-item-icon">🚪</span>
                  <span className="menu-item-label">Logout</span>
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
            {canShowDashboardTab && (
              <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                <span className="nav-icon">📊</span>
                <span>Dashboard</span>
              </button>
            )}

            {canShowInventoryTab && (
              <button className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
                <span className="nav-icon">📦</span>
                <span>Inventory</span>
                <span className="badge low-stock">{lowStockCount}</span>
              </button>
            )}

            {canShowGstTab && (
              <button className={`nav-item ${activeTab === 'GSTFilling' ? 'active' : ''}`} onClick={() => setActiveTab('GSTFilling')}>
                <span className="nav-icon">📋</span>
                <span>GST Filing</span>
              </button>
            )}

            {canShowBillingTab && (
              <button className={`nav-item ${activeTab === 'billing' ? 'active' : ''}`} onClick={() => setActiveTab('billing')}>
                <span className="nav-icon">💰</span>
                <span>Billing</span>
              </button>
            )}

            {canShowBillingTab && (
              <button className={`nav-item ${activeTab === 'ledger' ? 'active' : ''}`} onClick={() => setActiveTab('ledger')}>
                <span className="nav-icon">📒</span>
                <span>Customer Ledger</span>
              </button>
            )}

            {canShowPaymentReportTab && (
              <button className={`nav-item ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => setActiveTab('payments')}>
                <span className="nav-icon">💳</span>
                <span>Payment Report</span>
              </button>
            )}

            {canShowAuditTab && (
              <button className={`nav-item ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>
                <span className="nav-icon">🧾</span>
                <span>Audit</span>
              </button>
            )}

            {canShowSellTab && (
              <button className={`nav-item ${activeTab === 'sell' ? 'active' : ''}`} onClick={() => setActiveTab('sell')}>
                <span className="nav-icon">📋</span>
                <span>Sell Orders</span>
              </button>
            )}

            {/* Legacy UI placeholders intentionally hidden for role-based navigation */}

              

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