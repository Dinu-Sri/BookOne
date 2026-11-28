import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import postgres from 'postgres';
import { closeMaintenanceDb, maintenanceSql } from '../../packages/db/src/maintenance-db';
import { chartOfAccountsForEntity, classifiedSeedValues } from '../../packages/accounting/src/index';
import { CATALOG_VERSION } from '../../packages/auth/src/permissions/catalog';
import { JOB_TEMPLATES } from '../../packages/auth/src/permissions/templates';

export type SeededUser = {
  id: string;
  authUserId: string;
  email: string;
  password: string;
  name: string;
  job: 'owner' | 'viewer';
};

export type SeededCompany = {
  tenantId: string;
  name: string;
  slug: string;
  owner: SeededUser;
  viewer?: SeededUser;
};

export type PilotSeed = {
  runId: string;
  companies: { alpha: SeededCompany; beta: SeededCompany };
};

const PASSWORD = 'Pilot-coreguard-1101!';

async function insertCredential(
  sql: postgres.Sql,
  email: string,
  name: string,
  password: string,
): Promise<string> {
  const authUserId = randomUUID();
  const hashed = await hashPassword(password);
  await sql`
    INSERT INTO auth_users (id, name, email, "emailVerified", "createdAt", "updatedAt")
    VALUES (${authUserId}, ${name}, ${email}, TRUE, NOW(), NOW())
  `;
  await sql`
    INSERT INTO auth_accounts (id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${authUserId}, ${authUserId}, 'credential', ${hashed}, NOW(), NOW())
  `;
  return authUserId;
}

async function seedCompany(
  sql: postgres.Sql,
  runId: string,
  kind: 'alpha' | 'beta',
  withViewer: boolean,
): Promise<SeededCompany> {
  const tenantId = randomUUID();
  const slug = `cg-${kind}-${runId.slice(0, 8)}`;
  const name = kind === 'alpha' ? `Pilot Alpha ${runId.slice(0, 8)}` : `Pilot Beta ${runId.slice(0, 8)}`;
  const modules = { sales: true, purchase: true, inventory: false, pos: false, rental: false, hr: false };
  await sql`
    INSERT INTO tenants (id, name, slug, plan, environment, status, modules, entity_kind, capability_tier, rbac_enforced)
    VALUES (
      ${tenantId},
      ${name},
      ${slug},
      'starter',
      'staging',
      'active',
      ${sql.json(modules)},
      'company',
      'full',
      TRUE
    )
  `;
  await sql`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`;
  await sql`
    INSERT INTO company_profiles (id, tenant_id, legal_name, country, base_currency, timezone)
    VALUES (${randomUUID()}, ${tenantId}, ${name}, 'Sri Lanka', 'LKR', 'Asia/Colombo')
  `;

  const ownerEmail = `pilot-owner-${kind}-${runId.slice(0, 8)}@bookone.test`.toLowerCase();
  const ownerAuthId = await insertCredential(sql, ownerEmail, `Pilot Owner ${kind}`, PASSWORD);
  const ownerId = randomUUID();
  await sql`
    INSERT INTO users (id, tenant_id, active_tenant_id, email, name, password_hash, role)
    VALUES (${ownerId}, ${tenantId}, ${tenantId}, ${ownerEmail}, ${'Pilot Owner ' + kind}, 'better-auth-managed', 'admin')
  `;

  for (const job of JOB_TEMPLATES) {
    await sql`
      INSERT INTO tenant_roles (id, tenant_id, name, slug, template_key, template_version, is_locked)
      VALUES (
        ${randomUUID()},
        ${tenantId},
        ${job.name},
        ${job.slug},
        ${job.key},
        ${String(CATALOG_VERSION)},
        ${job.key === 'owner' ? '1' : '0'}
      )
    `;
  }
  const [ownerRole] = await sql<{ id: string }[]>`
    SELECT id FROM tenant_roles WHERE tenant_id = ${tenantId} AND slug = 'owner' LIMIT 1
  `;
  await sql`
    INSERT INTO tenant_memberships (id, tenant_id, user_id, role, primary_role_id, status)
    VALUES (${randomUUID()}, ${tenantId}, ${ownerId}, 'owner', ${ownerRole?.id ?? null}, 'active')
  `;

  const pack = chartOfAccountsForEntity('company');
  for (const account of pack) {
    const seed = classifiedSeedValues(account);
    await sql`
      INSERT INTO accounts (
        id, tenant_id, code, name, type, normal_side, subtype, purpose, is_group, is_system,
        is_contra, cash_flow_class, liquidity, reconcilable, control_role, is_active, version
      ) VALUES (
        ${randomUUID()}, ${tenantId}, ${seed.code}, ${seed.name}, ${seed.type}, ${seed.normalSide},
        ${seed.subtype}, ${seed.purpose}, ${seed.isGroup}, ${seed.isSystem}, ${seed.isContra},
        ${seed.cashFlowClass}, ${seed.liquidity}, ${seed.reconcilable}, ${seed.controlRole}, '1', 1
      )
    `;
  }

  const company: SeededCompany = {
    tenantId,
    name,
    slug,
    owner: {
      id: ownerId,
      authUserId: ownerAuthId,
      email: ownerEmail,
      password: PASSWORD,
      name: `Pilot Owner ${kind}`,
      job: 'owner',
    },
  };

  if (withViewer) {
    const viewerEmail = `pilot-viewer-${kind}-${runId.slice(0, 8)}@bookone.test`.toLowerCase();
    const viewerAuthId = await insertCredential(sql, viewerEmail, `Pilot Viewer ${kind}`, PASSWORD);
    const viewerId = randomUUID();
    await sql`
      INSERT INTO users (id, tenant_id, active_tenant_id, email, name, password_hash, role)
      VALUES (${viewerId}, ${tenantId}, ${tenantId}, ${viewerEmail}, ${'Pilot Viewer ' + kind}, 'better-auth-managed', 'member')
    `;
    const [viewerRole] = await sql<{ id: string }[]>`
      SELECT id FROM tenant_roles WHERE tenant_id = ${tenantId} AND slug = 'viewer' LIMIT 1
    `;
    await sql`
      INSERT INTO tenant_memberships (id, tenant_id, user_id, role, primary_role_id, status)
      VALUES (${randomUUID()}, ${tenantId}, ${viewerId}, 'viewer', ${viewerRole?.id ?? null}, 'active')
    `;
    company.viewer = {
      id: viewerId,
      authUserId: viewerAuthId,
      email: viewerEmail,
      password: PASSWORD,
      name: `Pilot Viewer ${kind}`,
      job: 'viewer',
    };
  }

  return company;
}

export async function seedPilotCompanies(databaseUrl: string): Promise<PilotSeed> {
  const runId = randomUUID();
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const alpha = await seedCompany(sql, runId, 'alpha', true);
    const beta = await seedCompany(sql, runId, 'beta', false);
    await sql`SELECT set_config('app.current_tenant_id', '', false)`;
    return { runId, companies: { alpha, beta } };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function cleanupPilotSeed(databaseUrl: string, seed: PilotSeed): Promise<void> {
  const tenantIds = [seed.companies.alpha.tenantId, seed.companies.beta.tenantId];
  const emails = [
    seed.companies.alpha.owner.email,
    seed.companies.alpha.viewer?.email,
    seed.companies.beta.owner.email,
  ].filter((value): value is string => Boolean(value));
  // CoreGuard §4.6: the cleanup deletes the pilot's own ledger rows, which only the maintenance login may do,
  // in one transaction that starts with the maintenance reason (every statement is logged in coreguard.bypass_log).
  // The pilot only targets allowlisted local test databases, whose login is a superuser and so a member of
  // coreguard_maintenance; it doubles as the maintenance login when MAINTENANCE_DATABASE_URL is not set.
  if (!process.env.MAINTENANCE_DATABASE_URL?.trim()) process.env.MAINTENANCE_DATABASE_URL = databaseUrl;
  const client = maintenanceSql();
  try {
    await client.begin(async (sql) => {
      await sql`SET LOCAL bookone.ledger_maintenance = 'coreguard_cleanup'`;
      for (const tenantId of tenantIds) {
        await sql`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`;
        await sql`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
        const commerceTable = await sql<{ t: string | null }[]>`SELECT to_regclass('public.commerce_connections')::text AS t`;
        if (commerceTable[0]?.t) {
          // Newer commerce tables (WP0-WP7); some may not exist on older databases.
          for (const table of [
            'commerce_api_calls',
            'commerce_webhook_deliveries',
            'commerce_webhooks',
            'commerce_customers',
            'commerce_reservations',
            'commerce_stock_commitments',
            'commerce_channel_products',
            'commerce_publish_claims',
            'commerce_mapping_proposals',
          ]) {
            const exists = await sql<{ t: string | null }[]>`SELECT to_regclass(${`public.${table}`})::text AS t`;
            if (exists[0]?.t) await sql`DELETE FROM ${sql(table)} WHERE tenant_id = ${tenantId}`;
          }
          await sql`DELETE FROM commerce_order_events WHERE tenant_id = ${tenantId}`;
          await sql`DELETE FROM commerce_order_lines WHERE tenant_id = ${tenantId}`;
          await sql`DELETE FROM commerce_refunds WHERE tenant_id = ${tenantId}`;
          await sql`DELETE FROM commerce_idempotency WHERE tenant_id = ${tenantId}`;
          await sql`DELETE FROM commerce_orders WHERE tenant_id = ${tenantId}`;
          await sql`DELETE FROM commerce_outbox WHERE tenant_id = ${tenantId}`;
          await sql`DELETE FROM commerce_checkpoints WHERE tenant_id = ${tenantId}`;
          await sql`DELETE FROM commerce_product_mappings WHERE tenant_id = ${tenantId}`;
          await sql`DELETE FROM commerce_credentials WHERE tenant_id = ${tenantId}`;
          await sql`DELETE FROM commerce_activity WHERE tenant_id = ${tenantId}`;
          await sql`DELETE FROM commerce_connections WHERE tenant_id = ${tenantId}`;
        }
        await sql`DELETE FROM ops_idempotency WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM settlement_allocations WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM inventory_cost_layer_consumptions WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM inventory_cost_layers WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM inventory_movements WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM inventory_stock_doc_lines WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM inventory_stock_docs WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM business_document_lines WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM business_documents WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM inventory_stock_levels WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM inventory_products WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM bank_reconciliation_case_book_transactions WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM bank_reconciliation_case_bank_lines WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM bank_reconciliation_outstanding_items WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM bank_reconciliation_events WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM bank_reconciliation_snapshots WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM bank_reconciliation_session_imports WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM bank_reconciliation_cases WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM bank_reconciliation_sessions WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM bank_import_issues WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM bank_statement_import_events WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM bank_statement_lines WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM bank_statement_imports WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM bank_statement_profile_versions WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM bank_statement_profiles WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM opening_balance_lines WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM opening_balance_runs WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM journal_lines WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM journal_entries WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM transactions WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM locations WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM party_advance_allocations WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM party_advances WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM parties WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM audit_log WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM accounts WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM tenant_permission_overrides WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM tenant_membership_roles WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM tenant_role_permissions WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM tenant_teams WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM tenant_memberships WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM tenant_roles WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM company_profiles WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM users WHERE tenant_id = ${tenantId}`;
        await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
      }
      if (emails.length) {
        await sql`DELETE FROM auth_accounts WHERE "userId" IN (SELECT id FROM auth_users WHERE email IN ${sql(emails)})`;
        await sql`DELETE FROM auth_sessions WHERE "userId" IN (SELECT id FROM auth_users WHERE email IN ${sql(emails)})`;
        await sql`DELETE FROM auth_users WHERE email IN ${sql(emails)}`;
      }
    });
  } finally {
    await closeMaintenanceDb();
  }
}
