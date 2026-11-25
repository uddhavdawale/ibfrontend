import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINTS, apiFetch } from '../Config/api';
import './InventoryPage.css';

const PAGE_SIZE = 25;

const formatMoney = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value) || 0);

const InventoryReport = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [pageInfo, setPageInfo] = useState({
    number: 0,
    totalElements: 0,
    totalPages: 0,
  });
  const [inventoryValue, setInventoryValue] = useState(null);
  const [inventoryValueLoading, setInventoryValueLoading] = useState(true);
  const [inventoryValueError, setInventoryValueError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadInventoryValue = async () => {
    setInventoryValueLoading(true);
    setInventoryValueError('');
    try {
      const response = await apiFetch(API_ENDPOINTS.inventoryValue);
      if (!response.ok) {
        throw new Error(`Could not load inventory value (${response.status})`);
      }
      const payload = await response.json();
      const value = Number(payload?.inventoryValue);
      if (!Number.isFinite(value)) {
        throw new Error('Inventory value API returned an invalid amount.');
      }
      setInventoryValue(value);
    } catch (loadError) {
      setInventoryValue(null);
      setInventoryValueError(loadError.message || 'Unable to load total inventory value.');
    } finally {
      setInventoryValueLoading(false);
    }
  };

  const loadProducts = async (page = 0, search = appliedSearch) => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(API_ENDPOINTS.productsPage(page, PAGE_SIZE, search));
      if (!response.ok) {
        throw new Error(`Could not load inventory report (${response.status})`);
      }
      const payload = await response.json();
      const metadata = payload?.page ?? payload;
      if (!Array.isArray(payload?.content) || !metadata) {
        throw new Error('Inventory report API returned an unsupported response format.');
      }

      const normalizedPage = {
        number: Number(metadata.number),
        totalElements: Number(metadata.totalElements),
        totalPages: Number(metadata.totalPages),
      };
      if (!Number.isInteger(normalizedPage.number) || normalizedPage.number !== page
        || !Number.isInteger(normalizedPage.totalElements) || normalizedPage.totalElements < 0
        || !Number.isInteger(normalizedPage.totalPages) || normalizedPage.totalPages < 0
        || payload.content.length > PAGE_SIZE) {
        throw new Error('Inventory report API returned invalid pagination details.');
      }

      setProducts(payload.content.map((product) => ({
        ...product,
        quantity: Number(product.quantity) || 0,
        minStock: Number(product.minStock) || 0,
        price: Number(product.price) || 0,
      })));
      setPageInfo(normalizedPage);
    } catch (loadError) {
      setProducts([]);
      setPageInfo({ number: 0, totalElements: 0, totalPages: 0 });
      setError(loadError.message || 'Unable to load inventory report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts(0, '');
    loadInventoryValue();
  }, []);

  const handleSearch = (event) => {
    event.preventDefault();
    const query = searchTerm.trim();
    setAppliedSearch(query);
    loadProducts(0, query);
  };

  const refreshReport = () => {
    loadProducts(pageInfo.number, appliedSearch);
    loadInventoryValue();
  };

  const pageValue = products.reduce(
    (total, product) => total + (product.quantity * product.price),
    0
  );
  const firstResult = pageInfo.totalElements === 0 ? 0 : (pageInfo.number * PAGE_SIZE) + 1;
  const lastResult = Math.min((pageInfo.number + 1) * PAGE_SIZE, pageInfo.totalElements);

  return (
    <main className="inventory-page inventory-report-page">
      <header className="page-header">
        <button type="button" className="back-btn" onClick={() => navigate('/dashboard')}>
          ← Back to Dashboard
        </button>
        <div>
          <h1>Inventory Report</h1>
          <p>Stock quantities and value by product</p>
        </div>
      </header>

      {error && <div className="inventory-report-error" role="alert">{error}</div>}

      <section className="inventory-insights inventory-report-insights" aria-label="Inventory totals">
        <div className="insight-card">
          <span className="insight-label">Total inventory value</span>
          <strong>
            {inventoryValueLoading
              ? 'Loading…'
              : inventoryValue === null
                ? 'Unavailable'
                : formatMoney(inventoryValue)}
          </strong>
          <small>All products, at current selling price</small>
          {inventoryValueError && (
            <small className="inventory-value-error" role="alert">{inventoryValueError}</small>
          )}
        </div>
        <div className="insight-card">
          <span className="insight-label">Products in report</span>
          <strong>{pageInfo.totalElements.toLocaleString('en-IN')}</strong>
          <small>{appliedSearch ? 'Matching the current search' : 'Across this retailer inventory'}</small>
        </div>
      </section>

      <div className="inventory-controls inventory-report-controls">
        <form className="inventory-report-search" onSubmit={handleSearch}>
          <input
            type="search"
            className="search-input"
            maxLength={100}
            placeholder="Search product name or SKU..."
            aria-label="Search inventory report"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <button type="submit" className="add-btn primary" disabled={loading}>Search</button>
        </form>
        <button type="button" className="add-btn secondary" onClick={refreshReport} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="table-container">
        <table className="inventory-table inventory-report-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Category</th>
              <th>HSN/SAC</th>
              <th>Quantity</th>
              <th>Min stock</th>
              <th>Unit price</th>
              <th>Stock value</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" className="inventory-report-placeholder">Loading inventory report...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan="8" className="inventory-report-placeholder">No inventory products found.</td></tr>
            ) : products.map((product) => (
              <tr key={product.id}>
                <td>{product.name}</td>
                <td>{product.sku || '-'}</td>
                <td>{product.category || 'General'}</td>
                <td>{product.hsn || product.hsnSac || '-'}</td>
                <td>{product.quantity.toLocaleString('en-IN')}</td>
                <td>{product.minStock.toLocaleString('en-IN')}</td>
                <td>{formatMoney(product.price)}</td>
                <td>{formatMoney(product.quantity * product.price)}</td>
              </tr>
            ))}
          </tbody>
          {!loading && products.length > 0 && (
            <tfoot>
              <tr>
                <th colSpan="7">This page stock value</th>
                <th>{formatMoney(pageValue)}</th>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {pageInfo.totalPages > 0 && (
        <nav className="pagination inventory-report-pagination" aria-label="Inventory report pagination">
          <span>Showing {firstResult}–{lastResult} of {pageInfo.totalElements}</span>
          <button
            type="button"
            onClick={() => loadProducts(pageInfo.number - 1, appliedSearch)}
            disabled={loading || pageInfo.number === 0}
            aria-label="Previous inventory report page"
          >
            ← Previous
          </button>
          <span aria-current="page">{pageInfo.number + 1} of {pageInfo.totalPages}</span>
          <button
            type="button"
            onClick={() => loadProducts(pageInfo.number + 1, appliedSearch)}
            disabled={loading || pageInfo.number + 1 >= pageInfo.totalPages}
            aria-label="Next inventory report page"
          >
            Next →
          </button>
        </nav>
      )}
    </main>
  );
};

export default InventoryReport;
