export const STORE_ROLES = Object.freeze({
  STORE_ADMIN: 'store_admin',
  STORE_MANAGER: 'store_manager',
  STORE_BILLING_VIEWER: 'store_billing_viewer',
  STORE_INVENTORY_VIEWER: 'store_inventory_viewer',
  BILLING_MANAGER: 'billing_manager',
  INVENTORY_MANAGER: 'inventory_manager',
  SYSTEM_ADMINISTRATOR: 'system_administrator',
  AUDIT_RELATED: 'audit_related',
});

const ROLE_ALIASES = Object.freeze({
  store_admin: STORE_ROLES.STORE_ADMIN,
  admin: STORE_ROLES.STORE_ADMIN,
  owner: STORE_ROLES.STORE_ADMIN,
  shop_owner: STORE_ROLES.STORE_ADMIN,
  'shop owner': STORE_ROLES.STORE_ADMIN,
  retailer: STORE_ROLES.STORE_ADMIN,
  retailer_owner: STORE_ROLES.STORE_ADMIN,
  retailer_shop_owner: STORE_ROLES.STORE_ADMIN,
  super_admin: STORE_ROLES.STORE_ADMIN,
  org_admin: STORE_ROLES.STORE_ADMIN,
  system_administrator: STORE_ROLES.SYSTEM_ADMINISTRATOR,
  'system administrator': STORE_ROLES.SYSTEM_ADMINISTRATOR,
  system_admin: STORE_ROLES.SYSTEM_ADMINISTRATOR,
  sys_admin: STORE_ROLES.SYSTEM_ADMINISTRATOR,

  store_manager: STORE_ROLES.STORE_MANAGER,
  manager: STORE_ROLES.STORE_MANAGER,

  store_billing_viewer: STORE_ROLES.STORE_BILLING_VIEWER,
  store_billing_viwer: STORE_ROLES.STORE_BILLING_VIEWER,
  billing_viewer: STORE_ROLES.STORE_BILLING_VIEWER,
  billing_manager: STORE_ROLES.BILLING_MANAGER,

  store_inventory_viewer: STORE_ROLES.STORE_INVENTORY_VIEWER,
  store_inventory_viwer: STORE_ROLES.STORE_INVENTORY_VIEWER,
  inventory_viewer: STORE_ROLES.STORE_INVENTORY_VIEWER,
  inventory_manager: STORE_ROLES.INVENTORY_MANAGER,

  audit_related: STORE_ROLES.AUDIT_RELATED,
  audit_manager: STORE_ROLES.AUDIT_RELATED,
  audit: STORE_ROLES.AUDIT_RELATED,
  audit_related_role: STORE_ROLES.AUDIT_RELATED,
  audit_role: STORE_ROLES.AUDIT_RELATED,
  audit_officer: STORE_ROLES.AUDIT_RELATED,
});

export const normalizeStoreRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  return ROLE_ALIASES[normalized] || STORE_ROLES.STORE_MANAGER;
};

export const getCurrentUserRole = () => {
  if (typeof window === 'undefined') return STORE_ROLES.STORE_MANAGER;

  try {
    const user = JSON.parse(window.localStorage.getItem('user') || '{}');
    return normalizeStoreRole(user?.role);
  } catch {
    return STORE_ROLES.STORE_MANAGER;
  }
};

export const canAccessBilling = (role) => {
  const normalizedRole = normalizeStoreRole(role);
  return normalizedRole === STORE_ROLES.STORE_ADMIN
    || normalizedRole === STORE_ROLES.BILLING_MANAGER
    || normalizedRole === STORE_ROLES.STORE_BILLING_VIEWER;
};

export const canWriteBilling = (role) => {
  const normalizedRole = normalizeStoreRole(role);
  return normalizedRole === STORE_ROLES.STORE_ADMIN
    || normalizedRole === STORE_ROLES.BILLING_MANAGER;
};

export const canAccessInventory = (role) => {
  const normalizedRole = normalizeStoreRole(role);
  return normalizedRole === STORE_ROLES.STORE_ADMIN
    || normalizedRole === STORE_ROLES.INVENTORY_MANAGER
    || normalizedRole === STORE_ROLES.STORE_INVENTORY_VIEWER;
};

export const canWriteInventory = (role) => {
  const normalizedRole = normalizeStoreRole(role);
  return normalizedRole === STORE_ROLES.STORE_ADMIN
    || normalizedRole === STORE_ROLES.INVENTORY_MANAGER;
};

export const canAccessSellOrders = (role) => canAccessBilling(role);

export const canCancelSellOrders = (role) => canWriteBilling(role);

export const canViewAdvancedDashboard = (role) => {
  const normalizedRole = normalizeStoreRole(role);
  return normalizedRole === STORE_ROLES.STORE_ADMIN;
};

export const canAccessAudit = (role) => {
  const normalizedRole = normalizeStoreRole(role);
  return normalizedRole === STORE_ROLES.SYSTEM_ADMINISTRATOR
    || normalizedRole === STORE_ROLES.STORE_ADMIN
    || normalizedRole === STORE_ROLES.AUDIT_RELATED;
};

export const isStoreAdmin = (role) => normalizeStoreRole(role) === STORE_ROLES.STORE_ADMIN;

export const isBillingOnlyRole = (role) => normalizeStoreRole(role) === STORE_ROLES.BILLING_MANAGER;

export const isInventoryOnlyRole = (role) => normalizeStoreRole(role) === STORE_ROLES.INVENTORY_MANAGER;
