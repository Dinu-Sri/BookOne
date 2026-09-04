import { pgClient } from '@bookone/db';

/** Workspaces belonging to these logins are kept. Everyone else is removable. */
export const KEEP_COMPANY_EMAILS = ['dinu.sri.m@gmail.com', 'info@clossyan.com'] as const;

export const PURGE_CONFIRM = 'REMOVE EXTRA COMPANIES';

export type CleanupCompanyRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  entityKind: string;
};

export type CleanupPlan = {
  keepEmails: string[];
  keep: CleanupCompanyRow[];
  remove: CleanupCompanyRow[];
};

const TENANT_CHILD_TABLES = [
  'rental_return_photos',
  'rental_booking_lines',
  'rental_events',
  'rental_settings',
  'bank_reconciliation_case_bank_lines',
  'bank_reconciliation_case_book_transactions',
  'bank_reconciliation_outstanding_items',
  'bank_reconciliation_events',
  'bank_reconciliation_snapshots',
  'bank_reconciliation_cases',
  'bank_reconciliation_session_imports',
  'bank_reconciliation_sessions',
  'bank_import_issues',
  'bank_statement_import_events',
  'bank_statement_lines',
  'bank_statement_imports',
  'bank_statement_profile_versions',
  'bank_statement_profiles',
  'settlement_allocations',
  'sales_invoice_sources',
  'business_document_lines',
  'journal_lines',
  'business_documents',
  'journal_entries',
  'inventory_stock_doc_lines',
  'inventory_stock_docs',
  'inventory_movements',
  'inventory_stock_levels',
  'inventory_products',
  'pos_shifts',
  'pos_registers',
  'tax_invoice_sequences',
  'sales_discounts',
  'sales_settings',
  'purchase_settings',
  'inventory_settings',
  'health_check_runs',
  'period_locks',
  'transactions',
  'parties',
  'audit_log',
  'company_domains',
  'locations',
  'brands',
  'financial_years',
  'tax_profiles',
  'company_profiles',
  'accounts',
  'tenant_memberships',
] as const;

function keepEmailList(): string[] {
  return KEEP_COMPANY_EMAILS.map((e) => e.toLowerCase());
}

function mapCompanyRows(
  rows: { id: string; name: string; slug: string; status: string | null; entityKind: string | null }[],
): CleanupCompanyRow[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    status: r.status ?? 'active',
    entityKind: r.entityKind ?? 'company',
  }));
}

export async function planPlatformCompanyCleanup(): Promise<CleanupPlan> {
  const sql = pgClient();
  const emails = keepEmailList();

  const keep = await sql<
    { id: string; name: string; slug: string; status: string | null; entityKind: string | null }[]
  >`
    SELECT DISTINCT t.id, t.name, t.slug, t.status, t.entity_kind AS "entityKind"
    FROM tenants t
    WHERE t.id IN (
      SELECT u.tenant_id
      FROM users u
      WHERE lower(u.email) IN ${sql(emails)}
        AND u.voided_at IS NULL
      UNION
      SELECT m.tenant_id
      FROM tenant_memberships m
      INNER JOIN users u ON u.id = m.user_id
      WHERE lower(u.email) IN ${sql(emails)}
        AND m.voided_at IS NULL
    )
    ORDER BY t.name
  `;

  const keepIds = keep.map((r) => r.id);
  const remove =
    keepIds.length === 0
      ? await sql<
          { id: string; name: string; slug: string; status: string | null; entityKind: string | null }[]
        >`
          SELECT t.id, t.name, t.slug, t.status, t.entity_kind AS "entityKind"
          FROM tenants t
          ORDER BY t.created_at DESC
        `
      : await sql<
          { id: string; name: string; slug: string; status: string | null; entityKind: string | null }[]
        >`
          SELECT t.id, t.name, t.slug, t.status, t.entity_kind AS "entityKind"
          FROM tenants t
          WHERE t.id::text NOT IN ${sql(keepIds)}
          ORDER BY t.created_at DESC
        `;

  return {
    keepEmails: emails,
    keep: mapCompanyRows(keep),
    remove: mapCompanyRows(remove),
  };
}

export async function executePlatformCompanyCleanup(confirmText: string): Promise<{
  ok: boolean;
  error?: string;
  kept: CleanupCompanyRow[];
  deleted: CleanupCompanyRow[];
}> {
  if (confirmText !== PURGE_CONFIRM) {
    return {
      ok: false,
      error: `Type ${PURGE_CONFIRM} exactly to remove extra companies.`,
      kept: [],
      deleted: [],
    };
  }

  const plan = await planPlatformCompanyCleanup();
  if (plan.keep.length === 0) {
    return { ok: false, error: 'Refusing to purge: no keep companies resolved.', kept: [], deleted: [] };
  }
  if (plan.remove.length === 0) {
    return { ok: true, kept: plan.keep, deleted: [] };
  }

  const sql = pgClient();
  const emails = keepEmailList();
  const extraIds = plan.remove.map((r) => r.id);

  await sql.begin(async (tx) => {
    const extraUserIds = await tx<{ id: string }[]>`
      SELECT id FROM users
      WHERE tenant_id::text IN ${tx(extraIds)}
        AND lower(email) NOT IN ${tx(emails)}
    `;
    const extraUserIdList = extraUserIds.map((u) => u.id);
    const extraEmails = await tx<{ email: string }[]>`
      SELECT DISTINCT lower(email) AS email
      FROM users
      WHERE tenant_id::text IN ${tx(extraIds)}
        AND lower(email) NOT IN ${tx(emails)}
    `;
    const extraEmailList = extraEmails.map((r) => r.email);

    if (extraUserIdList.length > 0) {
      await tx`DELETE FROM platform_audit_events WHERE actor_user_id::text IN ${tx(extraUserIdList)}`;
    }
    await tx`DELETE FROM platform_audit_events WHERE target_tenant_id::text IN ${tx(extraIds)}`;

    for (const tenantId of extraIds) {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      for (const table of TENANT_CHILD_TABLES) {
        await tx.unsafe(`DELETE FROM ${table} WHERE tenant_id = $1::uuid`, [tenantId]);
      }
      await tx`
        DELETE FROM users
        WHERE tenant_id = ${tenantId}::uuid
          AND lower(email) NOT IN ${tx(emails)}
      `;
      await tx`
        UPDATE users
        SET tenant_id = ${plan.keep[0].id}::uuid, updated_at = NOW()
        WHERE tenant_id = ${tenantId}::uuid
          AND lower(email) IN ${tx(emails)}
      `;
      await tx`DELETE FROM tenants WHERE id = ${tenantId}::uuid`;
    }

    if (extraEmailList.length > 0) {
      await tx`DELETE FROM auth_verifications WHERE lower(identifier) IN ${tx(extraEmailList)}`;
      await tx`DELETE FROM auth_invitations WHERE lower(email) IN ${tx(extraEmailList)}`;
      await tx`
        DELETE FROM auth_members
        WHERE "userId" IN (SELECT id FROM auth_users WHERE lower(email) IN ${tx(extraEmailList)})
      `;
      await tx`
        DELETE FROM auth_sessions
        WHERE "userId" IN (SELECT id FROM auth_users WHERE lower(email) IN ${tx(extraEmailList)})
      `;
      await tx`
        DELETE FROM auth_accounts
        WHERE "userId" IN (SELECT id FROM auth_users WHERE lower(email) IN ${tx(extraEmailList)})
      `;
      await tx`DELETE FROM auth_users WHERE lower(email) IN ${tx(extraEmailList)}`;
    }
  });

  return { ok: true, kept: plan.keep, deleted: plan.remove };
}
