import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from './AdminLayout';
import { API_ENDPOINTS, apiFetch } from '../Config/api';
import { isValidIndianGstin } from '../modules/shopProfile/shopProfileService';

const PAGE_SIZE = 20;
const EMPTY_ORGANIZATION = {
  name: '',
  address: '',
  city: '',
  pincode: '',
  gstin: '',
  phone: '',
  email: '',
};

const parseResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const readPage = (payload, key, page) => {
  const data = payload?.data ?? payload;
  const rows = [
    payload?.[key],
    data?.[key],
    data?.content,
    data?.items,
    data?.data,
    payload?.content,
    payload?.items,
    payload?.results,
    Array.isArray(data) ? data : null,
  ].find(Array.isArray) || [];
  const metadata = data && !Array.isArray(data) ? data : payload;
  const totalPages = Number(metadata?.totalPages ?? payload?.totalPages);
  const hasMore = Number.isFinite(totalPages)
    ? page + 1 < totalPages
    : typeof metadata?.last === 'boolean'
      ? !metadata.last
      : rows.length === PAGE_SIZE;

  return { rows, hasMore };
};

const normalizeOrganization = (record = {}) => ({
  id: String(record.id ?? record.organizationId ?? '').trim(),
  name: String(record.name ?? record.organizationName ?? '').trim(),
  address: String(record.address ?? '').trim(),
  city: String(record.city ?? '').trim(),
  pincode: String(record.pincode ?? record.postalCode ?? '').trim(),
  gstin: String(record.gstin ?? record.gstNumber ?? '').trim().toUpperCase(),
});

const getStoreTenantId = (store = {}) => String(
  store.tenantId ?? store.tenant?.id ?? store.id ?? store.storeId ?? store.shopId ?? ''
).trim();

const getStoreOrganization = (store = {}) => store.organization ?? store.assignedOrganization ?? null;

const getStoreOrganizationId = (store = {}) => {
  const organization = getStoreOrganization(store);
  return String(store.organizationId ?? organization?.id ?? organization?.organizationId ?? '').trim();
};

const getStoreOrganizationName = (store = {}) => {
  const organization = getStoreOrganization(store);
  return String(store.organizationName ?? organization?.name ?? organization?.organizationName ?? '').trim();
};

const AdminOrganizationsPage = ({ onLogout }) => {
  const [organizations, setOrganizations] = useState([]);
  const [stores, setStores] = useState([]);
  const [organizationPage, setOrganizationPage] = useState(0);
  const [storePage, setStorePage] = useState(0);
  const [hasMoreOrganizations, setHasMoreOrganizations] = useState(false);
  const [hasMoreStores, setHasMoreStores] = useState(false);
  const [organizationLoading, setOrganizationLoading] = useState(true);
  const [storesLoading, setStoresLoading] = useState(true);
  const [savingOrganization, setSavingOrganization] = useState(false);
  const [savingStoreId, setSavingStoreId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [storeSearchInput, setStoreSearchInput] = useState('');
  const [storeSearch, setStoreSearch] = useState('');
  const [form, setForm] = useState(EMPTY_ORGANIZATION);
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const [organizationError, setOrganizationError] = useState('');
  const [storesError, setStoresError] = useState('');
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');

  const organizationOptions = useMemo(
    () => organizations.filter((organization) => organization.id && organization.name),
    [organizations]
  );

  useEffect(() => {
    let active = true;
    const loadOrganizations = async () => {
      setOrganizationLoading(true);
      setOrganizationError('');
      try {
        const response = await apiFetch(API_ENDPOINTS.adminOrganizationsPage(organizationPage, PAGE_SIZE), {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const payload = await parseResponse(response);
        if (!response.ok || payload?.success === false) {
          throw new Error(payload.message || `Unable to load organizations (${response.status}).`);
        }
        const pageData = readPage(payload, 'organizations', organizationPage);
        if (active) {
          setOrganizations(pageData.rows.map(normalizeOrganization));
          setHasMoreOrganizations(pageData.hasMore);
        }
      } catch (error) {
        if (active) setOrganizationError(error.message || 'Unable to load organizations.');
      } finally {
        if (active) setOrganizationLoading(false);
      }
    };
    loadOrganizations();
    return () => { active = false; };
  }, [organizationPage, refreshKey]);

  useEffect(() => {
    let active = true;
    const loadStores = async () => {
      setStoresLoading(true);
      setStoresError('');
      try {
        const response = await apiFetch(API_ENDPOINTS.adminStores(storePage, PAGE_SIZE, storeSearch), {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const payload = await parseResponse(response);
        if (!response.ok || payload?.success === false) {
          throw new Error(payload.message || `Unable to load stores (${response.status}).`);
        }
        const pageData = readPage(payload, 'stores', storePage);
        if (active) {
          setStores(pageData.rows);
          setHasMoreStores(pageData.hasMore);
          setAssignmentDrafts(Object.fromEntries(
            pageData.rows.map((store) => [getStoreTenantId(store), getStoreOrganizationId(store)])
          ));
        }
      } catch (error) {
        if (active) setStoresError(error.message || 'Unable to load stores.');
      } finally {
        if (active) setStoresLoading(false);
      }
    };
    loadStores();
    return () => { active = false; };
  }, [storePage, storeSearch, refreshKey]);

  const handleCreateOrganization = async (event) => {
    event.preventDefault();
    setActionError('');
    setSuccess('');

    const name = form.name.trim();
    const gstin = form.gstin.trim().toUpperCase();
    if (!name) {
      setActionError('Organization name is required.');
      return;
    }
    if (gstin && !isValidIndianGstin(gstin)) {
      setActionError('Enter a valid 15-character GSTIN, or leave it blank.');
      return;
    }

    setSavingOrganization(true);
    try {
      const response = await apiFetch(API_ENDPOINTS.adminOrganizations, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        retryOn429: false,
        body: JSON.stringify({
          name,
          address: form.address.trim(),
          city: form.city.trim(),
          pincode: form.pincode.trim(),
          gstin,
          phone: form.phone.trim(),
          email: form.email.trim(),
        }),
      });
      const payload = await parseResponse(response);
      if (!response.ok || payload?.success === false) {
        throw new Error(payload.message || `Unable to create organization (${response.status}).`);
      }

      setForm(EMPTY_ORGANIZATION);
      setOrganizationPage(0);
      setRefreshKey((current) => current + 1);
      setSuccess('Organization created.');
    } catch (error) {
      setActionError(error.message || 'Unable to create organization.');
    } finally {
      setSavingOrganization(false);
    }
  };

  const handleAssignmentSave = async (store) => {
    const tenantId = getStoreTenantId(store);
    const currentOrganizationId = getStoreOrganizationId(store);
    const nextOrganizationId = String(assignmentDrafts[tenantId] ?? currentOrganizationId).trim();
    if (!tenantId || nextOrganizationId === currentOrganizationId) return;

    setActionError('');
    setSuccess('');
    setSavingStoreId(tenantId);
    try {
      const organizationId = nextOrganizationId || currentOrganizationId;
      const response = await apiFetch(
        API_ENDPOINTS.adminOrganizationStore(organizationId, tenantId),
        { method: nextOrganizationId ? 'PUT' : 'DELETE', retryOn429: false }
      );
      const payload = await parseResponse(response);
      if (!response.ok || payload?.success === false) {
        throw new Error(payload.message || `Unable to update store assignment (${response.status}).`);
      }

      setSuccess(nextOrganizationId ? 'Store assigned to the organization.' : 'Store organization assignment removed.');
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(error.message || 'Unable to update store assignment.');
    } finally {
      setSavingStoreId('');
    }
  };

  const handleStoreSearch = (event) => {
    event.preventDefault();
    const query = storeSearchInput.trim();
    setStorePage(0);
    if (query === storeSearch) setRefreshKey((current) => current + 1);
    else setStoreSearch(query);
  };

  const handleRefresh = () => {
    setRefreshKey((current) => current + 1);
  };

  return (
    <AdminLayout
      title="Organizations"
      subtitle="Create organizations and assign stores. Store inventory, customers, users, and invoices remain store-scoped."
      currentUser="System Admin"
      onLogout={onLogout}
      onRefresh={handleRefresh}
    >
      {actionError && <div className="organization-feedback error" role="alert">{actionError}</div>}
      {success && <div className="organization-feedback success" role="status">{success}</div>}

      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>Create organization</h2>
        </div>
        <form onSubmit={handleCreateOrganization}>
          <div className="organization-form-grid">
            <label>
              Organization name *
              <input
                className="admin-input"
                value={form.name}
                maxLength={160}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </label>
            <label>
              GSTIN (required for organization-issued GST invoices)
              <input
                className="admin-input"
                value={form.gstin}
                maxLength={15}
                onChange={(event) => setForm((current) => ({ ...current, gstin: event.target.value.toUpperCase() }))}
                autoCapitalize="characters"
              />
            </label>
            <label>
              Address
              <input
                className="admin-input"
                value={form.address}
                maxLength={240}
                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              />
            </label>
            <label>
              City
              <input
                className="admin-input"
                value={form.city}
                maxLength={100}
                onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
              />
            </label>
            <label>
              Pincode
              <input
                className="admin-input"
                value={form.pincode}
                maxLength={10}
                onChange={(event) => setForm((current) => ({ ...current, pincode: event.target.value }))}
                inputMode="numeric"
              />
            </label>
            <label>
              Contact phone
              <input
                className="admin-input"
                value={form.phone}
                maxLength={30}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                inputMode="tel"
              />
            </label>
            <label>
              Contact email
              <input
                className="admin-input"
                type="email"
                value={form.email}
                maxLength={254}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
          </div>
          <button type="submit" className="admin-primary-button" disabled={savingOrganization}>
            {savingOrganization ? 'Creating…' : 'Create organization'}
          </button>
        </form>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>Organizations</h2>
          <span className="muted-text">Page {organizationPage + 1}</span>
        </div>
        {organizationLoading ? (
          <p className="muted-text" role="status">Loading organizations…</p>
        ) : organizations.length === 0 ? (
          <p className="muted-text">No organizations found.</p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table organization-table">
              <thead>
                <tr><th>Name</th><th>GSTIN</th><th>Address</th><th>ID</th></tr>
              </thead>
              <tbody>
                {organizations.map((organization) => (
                  <tr key={organization.id || organization.name}>
                    <td><strong>{organization.name || 'Unnamed organization'}</strong></td>
                    <td>{organization.gstin || 'Not provided'}</td>
                    <td>{[organization.address, organization.city, organization.pincode].filter(Boolean).join(', ') || '—'}</td>
                    <td>{organization.id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {organizationError && <p className="organization-inline-error" role="alert">{organizationError}</p>}
        <div className="organization-pagination">
          <button
            type="button"
            className="admin-secondary-button"
            onClick={() => setOrganizationPage((page) => Math.max(page - 1, 0))}
            disabled={organizationPage === 0 || organizationLoading}
          >
            Previous organizations
          </button>
          <button
            type="button"
            className="admin-secondary-button"
            onClick={() => setOrganizationPage((page) => page + 1)}
            disabled={!hasMoreOrganizations || organizationLoading}
          >
            Next organizations
          </button>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-header">
          <h2>Store assignments</h2>
          <span className="muted-text">Page {storePage + 1}</span>
        </div>
        <form className="admin-toolbar organization-search" onSubmit={handleStoreSearch}>
          <input
            className="admin-input"
            value={storeSearchInput}
            maxLength={100}
            onChange={(event) => setStoreSearchInput(event.target.value)}
            placeholder="Search stores"
            aria-label="Search stores"
          />
          <button type="submit" className="admin-primary-button">Search stores</button>
        </form>
        {storesLoading ? (
          <p className="muted-text" role="status">Loading stores…</p>
        ) : stores.length === 0 ? (
          <p className="muted-text">No stores found.</p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table organization-table">
              <thead>
                <tr><th>Store</th><th>Store ID</th><th>Current organization</th><th>Assign organization</th><th>Action</th></tr>
              </thead>
              <tbody>
                {stores.map((store, index) => {
                  const tenantId = getStoreTenantId(store);
                  const currentOrganizationId = getStoreOrganizationId(store);
                  const selectedOrganizationId = String(assignmentDrafts[tenantId] ?? currentOrganizationId);
                  const currentOrganizationName = getStoreOrganizationName(store);
                  const currentOrganizationInList = organizationOptions.some(
                    (organization) => organization.id === currentOrganizationId
                  );
                  const storeName = store.name ?? store.storeName ?? store.businessName ?? store.shop?.name ?? 'Unnamed store';
                  const saving = savingStoreId === tenantId;

                  return (
                    <tr key={tenantId || `store-${index}`}>
                      <td><strong>{storeName}</strong></td>
                      <td>{tenantId || '—'}</td>
                      <td>{currentOrganizationName || 'Unassigned'}</td>
                      <td>
                        <select
                          className="admin-input organization-select"
                          value={selectedOrganizationId}
                          onChange={(event) => setAssignmentDrafts((current) => ({
                            ...current,
                            [tenantId]: event.target.value,
                          }))}
                          aria-label={`Organization for ${storeName}`}
                          disabled={!tenantId || saving || organizationLoading}
                        >
                          <option value="">Unassigned</option>
                          {currentOrganizationId && !currentOrganizationInList && (
                            <option value={currentOrganizationId}>
                              {currentOrganizationName || 'Current organization'}
                            </option>
                          )}
                          {organizationOptions.map((organization) => (
                            <option key={organization.id} value={organization.id}>{organization.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="admin-row-button"
                            onClick={() => handleAssignmentSave(store)}
                            disabled={
                              !tenantId
                              || saving
                              || selectedOrganizationId === currentOrganizationId
                              || (Boolean(selectedOrganizationId) && !organizationOptions.some(
                                (organization) => organization.id === selectedOrganizationId
                              ))
                            }
                          >
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {storesError && <p className="organization-inline-error" role="alert">{storesError}</p>}
        <div className="organization-pagination">
          <button
            type="button"
            className="admin-secondary-button"
            onClick={() => setStorePage((page) => Math.max(page - 1, 0))}
            disabled={storePage === 0 || storesLoading}
          >
            Previous stores
          </button>
          <button
            type="button"
            className="admin-secondary-button"
            onClick={() => setStorePage((page) => page + 1)}
            disabled={!hasMoreStores || storesLoading}
          >
            Next stores
          </button>
        </div>
      </section>
    </AdminLayout>
  );
};

export default AdminOrganizationsPage;
