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

const LowStockCard = ({ items = [] }) => {
  const [showDropdown, setShowDropdown] = useState(false);

  const normalizedItems = useMemo(() => {
    const uniqueMap = new Map();
    const normalized = (Array.isArray(items) ? items : [])
      .map((item, index) => normalizeLowStockItem(item, index))
      .filter((item) => Number(item.stock || 0) <= Number(item.min || 0));

    const nameCounts = new Map();
    normalized.forEach((item) => {
      const key = item.name.toLowerCase();
      nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
    });

    normalized.forEach((item) => {
      const key = `${item.name.toLowerCase()}::${item.category.toLowerCase()}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          ...item,
          label: buildUniqueLabel(item.name, item.category, (nameCounts.get(item.name.toLowerCase()) || 1) - 1)
        });
      }
    });

    return Array.from(uniqueMap.values())
      .sort((a, b) => a.stock - b.stock || a.min - b.min)
      .slice(0, 8);
  }, [items]);

  const totalLowStockCount = normalizedItems.length;

  return (
    <div
      className="stat-card pending-payments-card low-stock-card"
      onClick={() => setShowDropdown((prev) => !prev)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setShowDropdown((prev) => !prev);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="stat-info">
        <h3>{totalLowStockCount}</h3>
        <p>Low Stock ⚠️</p>
      </div>
      <div className="stat-change alert">Critical</div>

      {showDropdown && (
        <div className="pending-payment-dropdown">
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

          {normalizedItems.length > 0 ? (
            <ul>
              {normalizedItems.map((item) => (
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
