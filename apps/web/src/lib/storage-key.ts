const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const RECEIPT_KEY = new RegExp(`^tenants/(${UUID})/receipts/(${UUID})/[^/]+$`, 'i');

function hasTraversal(key: string): boolean {
  return key.includes('..') || key.includes('\\') || key.includes('\0') || key.startsWith('/');
}

/** Object keys stored as `tenants/{tenantId}/…` must belong to the current tenant. */
export function isOwnedTenantStorageKey(tenantId: string, key: string): boolean {
  if (typeof key !== 'string' || !key || hasTraversal(key)) return false;
  const prefix = `tenants/${tenantId}/`;
  if (!key.startsWith(prefix)) return false;
  const rest = key.slice(prefix.length);
  return rest.length > 0 && !rest.startsWith('/') && !rest.includes('//');
}

export function isOwnedReceiptKey(tenantId: string, key: string): boolean {
  if (typeof key !== 'string' || !key || hasTraversal(key)) return false;
  const match = key.match(RECEIPT_KEY);
  return Boolean(match && match[1] === tenantId);
}
