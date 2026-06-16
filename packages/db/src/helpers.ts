import { pgClient } from './db';

export async function setTenantContext(tenantId: string): Promise<void> {
  await pgClient()`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
}

export async function clearTenantContext(): Promise<void> {
  await pgClient()`SELECT set_config('app.current_tenant_id', '', true)`;
}

export async function withTenantContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  await setTenantContext(tenantId);
  try {
    return await fn();
  } finally {
    await clearTenantContext();
  }
}

export function tenantColumn() {
  // Re-export the helper so schema files can reference it
  return 'tenant_id';
}
