import React, { useMemo, useState } from 'react';

const buildUniqueLabel = (name, category, duplicateCount = 0) => {
  const safeName = String(name || '').trim() || 'Item';
  const safeCategory = String(category || '').trim();

  if (duplicateCount > 0 && safeCategory) {
    return `${safeName} (${safeCategory})`;
  }

  return safeName;
};

const normalizeLowStockItem = (item, index) => {
  const rawName = item?.name ?? item?.productName ?? `Item ${index + 1}`;
  const name = String(rawName).trim() || `Item ${index + 1}`;
  const stock = Number(item?.qty ?? item?.quantity ?? item?.stock ?? 0);
  const min = Number(item?.min ?? item?.minStock ?? item?.minimumStock ?? item?.threshold ?? 0);
  const category = item?.category ?? item?.group ?? item?.type ?? 'General';

  return {
    id: item?.id ?? item?.productId ?? `${name}-${category}-${index}`,
    name,
    stock,
    min,
    category,
    label: buildUniqueLabel(name, category, 0)
  };
};

const LowStockCard = ({ items = [], loading = false }) => {
  const [showDropdown, setShowDropdown] = useState(false);

  const normalizedItems = useMemo(() => {
    const normalized = (Array.isArray(items) ? items : [])
      .map((item, index) => normalizeLowStockItem(item, index))
      .filter((item) => Number(item.stock || 0) <= Number(item.min || 0));
    const uniqueMap = new Map();

    normalized.forEach((item) => {
      if (!uniqueMap.has(String(item.id))) uniqueMap.set(String(item.id), item);
    });
    const uniqueItems = Array.from(uniqueMap.values());

    const nameCounts = new Map();
    uniqueItems.forEach((item) => {
      const key = item.name.toLowerCase();
      nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
    });

    return uniqueItems.map((item) => ({
      ...item,
      label: buildUniqueLabel(item.name, item.category, (nameCounts.get(item.name.toLowerCase()) || 1) - 1)
    }))
      .sort((a, b) => a.stock - b.stock || a.min - b.min);
  }, [items]);

  const totalLowStockCount = normalizedItems.length;
  const visibleItems = normalizedItems.slice(0, 8);

  return (
    <div className="pending-payments-card low-stock-card">
      <button
        type="button"
        className="stat-card pending-payments-trigger"
        onClick={() => setShowDropdown((prev) => !prev)}
        aria-expanded={showDropdown}
        aria-controls="low-stock-list"
      >
        <span className="stat-info">
          <strong className="stat-value">{totalLowStockCount}</strong>
          <span className="stat-label">Low Stock ⚠️</span>
        </span>
        <span className={`stat-change ${totalLowStockCount > 0 ? 'alert' : 'positive'}`}>
          {loading ? 'Loading…' : items.length === 0 ? 'No data' : totalLowStockCount > 0 ? 'Reorder' : 'On track'}
        </span>
      </button>

      {showDropdown && (
        <div className="pending-payment-dropdown" id="low-stock-list">
          <div className="pending-payment-header">
            <span>Low stock items</span>
            <button
              type="button"
              className="pending-payment-close"
              onClick={(event) => {
                event.stopPropagation();
                setShowDropdown(false);
              }}
              aria-label="Close low stock items"
            >
              ×
            </button>
          </div>

          {loading ? (
            <ul>
              <li><span>Loading inventory…</span><strong>—</strong></li>
            </ul>
          ) : visibleItems.length > 0 ? (
            <ul>
              {visibleItems.map((item) => (
                <li key={item.id}>
                  <span>{item.label}</span>
                  <strong>{item.stock} left</strong>
                </li>
              ))}
            </ul>
          ) : (
            <ul>
              <li>
                <span>No low stock items</span>
                <strong>0</strong>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default LowStockCard;
