import { currentTenantScopeId, drizzleOn, pgClient, reservePgClient, runWithTenantDb } from './db';

const TENANT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setTenantContext(tenantId: string): Promise<void> {
  await pgClient()`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`;
}

export async function clearTenantContext(): Promise<void> {
  await pgClient()`SELECT set_config('app.current_tenant_id', '', false)`;
}

export async function withTenantContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  const id = typeof tenantId === 'string' ? tenantId.trim() : '';
  if (!TENANT_UUID.test(id)) {
    throw new Error('Tenant context is required.');
  }
  if (currentTenantScopeId() === id) {
    return fn();
  }

  const sql = await reservePgClient();
  try {
    await sql`SELECT set_config('app.current_tenant_id', ${id}, false)`;
    return await runWithTenantDb({ tenantId: id, sql, db: drizzleOn(sql) }, fn);
  } finally {
    try {
      await sql`SELECT set_config('app.current_tenant_id', '', false)`;
    } catch {
      // Connection may already be broken; still release it to the pool.
    }
    sql.release();
  }
}

export function tenantColumn() {
  // Re-export the helper so schema files can reference it
  return 'tenant_id';
}
