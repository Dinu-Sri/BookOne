'use server';

import { revalidatePath } from 'next/cache';
import {
  classifiedSeedValues,
  classifyAccount,
  dryRunCoaImport,
  exportCoaCsv,
  nextSuggestedCode,
  parseCoaCsv,
  validateArchiveAccount,
  validateCreateAccount,
  validateEditAccount,
  wizardTemplate,
  type WizardTemplateId,
} from '@bookone/accounting';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  auditLog,
  db,
  journalLines,
  partyAdvances,
  withTenantContext,
  and,
  eq,
  isNull,
  sql,
  asc,
} from '@bookone/db';
import { assertPermission } from '@/lib/access';

export type CoaActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; issues?: Array<{ field: string; message: string }> };

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let i = 0; i < 5 && current && typeof current === 'object'; i += 1) {
    if ((current as { code?: unknown }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function existingLite(tenantId: string) {
  const rows = await db()
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      isActive: accounts.isActive,
      voidedAt: accounts.voidedAt,
      isGroup: accounts.isGroup,
    })
    .from(accounts)
    .where(eq(accounts.tenantId, tenantId));
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    isActive: row.isActive === '1',
    voided: Boolean(row.voidedAt),
    isGroup: row.isGroup === '1',
  }));
}

export async function suggestAccountCode(templateId: WizardTemplateId): Promise<CoaActionResult<{ code: string }>> {
  try {
    await assertPermission('accounting.accounts.write', 'write');
    const user = await requireTenantContext();
    const template = wizardTemplate(templateId);
    if (!template) return { ok: false, error: 'Unknown account type.' };
    return withTenantContext(user.tenantId, async () => {
      const rows = await db().select({ code: accounts.code }).from(accounts).where(eq(accounts.tenantId, user.tenantId));
      const code = nextSuggestedCode(template.suggestedRange, rows.map((r) => r.code));
      if (!code) return { ok: false, error: `No free code left in ${template.suggestedRange.from}–${template.suggestedRange.to}.` };
      return { ok: true, data: { code } };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not suggest a code.' };
  }
}

export async function createCompanyAccount(input: {
  templateId: WizardTemplateId;
  code: string;
  name: string;
  description?: string;
  parentCode?: string;
  institution?: string;
  lastDigits?: string;
}): Promise<CoaActionResult<{ id: string; code: string }>> {
  try {
    await assertPermission('accounting.accounts.write', 'write');
    const user = await requireTenantContext();
    return withTenantContext(user.tenantId, async () => {
      const existing = await existingLite(user.tenantId);
      const parsed = validateCreateAccount({
        templateId: input.templateId,
        code: input.code,
        name: input.name,
        parentCode: input.parentCode,
        existing,
      });
      if (!parsed.ok) return { ok: false, error: parsed.issues[0]?.message ?? 'Invalid account.', issues: parsed.issues };
      const template = wizardTemplate(input.templateId);
      const seed = classifiedSeedValues({
        code: parsed.account.code,
        name: parsed.name,
        type: parsed.account.type,
        normalSide: parsed.account.normalSide,
      });
      try {
        const [row] = await db()
          .insert(accounts)
          .values({
            tenantId: user.tenantId,
            code: parsed.account.code,
            name: parsed.name,
            type: parsed.account.type,
            normalSide: parsed.account.normalSide,
            parentCode: input.parentCode?.trim() || null,
            description: input.description?.trim() || null,
            subtype: template?.subtype ?? seed.subtype,
            purpose: template?.purpose ?? seed.purpose,
            isGroup: template?.isGroup ? '1' : '0',
            isSystem: '0',
            isContra: template?.isContra ? '1' : '0',
            cashFlowClass: template?.cashFlowClass ?? seed.cashFlowClass,
            liquidity: template?.liquidity ?? seed.liquidity,
            reconcilable: template?.reconcilable ? '1' : '0',
            controlRole: template?.isGroup ? 'none' : (template?.controlRole ?? seed.controlRole),
            institution: input.institution?.trim().slice(0, 120) || null,
            lastDigits: input.lastDigits?.replace(/\D/g, '').slice(-4) || null,
            isActive: '1',
            version: 1,
          })
          .returning({ id: accounts.id, code: accounts.code });
        if (!row) return { ok: false, error: 'Could not create the account.' };
        await db().insert(auditLog).values({
          tenantId: user.tenantId,
          userId: user.id,
          action: 'CREATE',
          tableName: 'accounts',
          recordId: row.id,
          newValues: { code: row.code, name: parsed.name, template: input.templateId },
        });
        revalidatePath('/accounts');
        revalidatePath('/cashbook');
        return { ok: true, data: row };
      } catch (error) {
        if (isUniqueViolation(error)) {
          return { ok: false, error: 'That code or name is already used. Retry with a different code.' };
        }
        throw error;
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not create the account.' };
  }
}

export async function updateCompanyAccount(input: {
  id: string;
  expectedVersion: number;
  name?: string;
  description?: string | null;
  parentCode?: string | null;
  institution?: string | null;
  lastDigits?: string | null;
}): Promise<CoaActionResult<{ version: number }>> {
  try {
    await assertPermission('accounting.accounts.write', 'write');
    const user = await requireTenantContext();
    return withTenantContext(user.tenantId, async () => {
      const [current] = await db()
        .select()
        .from(accounts)
        .where(and(eq(accounts.tenantId, user.tenantId), eq(accounts.id, input.id)))
        .limit(1);
      if (!current) return { ok: false, error: 'Account not found.' };
      const existing = await existingLite(user.tenantId);
      const posted = await db()
        .select({ n: sql<number>`count(*)` })
        .from(journalLines)
        .where(and(eq(journalLines.tenantId, user.tenantId), eq(journalLines.accountId, current.id), isNull(journalLines.voidedAt)));
      const children = await db()
        .select({ n: sql<number>`count(*)` })
        .from(accounts)
        .where(and(eq(accounts.tenantId, user.tenantId), eq(accounts.parentCode, current.code), isNull(accounts.voidedAt)));
      const classified = classifyAccount(current);
      const parsed = validateEditAccount({
        current: {
          ...classified,
          id: current.id,
          name: current.name,
          version: current.version,
          postedCount: Number(posted[0]?.n ?? 0),
          childCount: Number(children[0]?.n ?? 0),
        },
        patch: { name: input.name, description: input.description, parentCode: input.parentCode },
        expectedVersion: input.expectedVersion,
        existing,
      });
      if (!parsed.ok) return { ok: false, error: parsed.issues[0]?.message ?? 'Invalid change.', issues: parsed.issues };
      const [row] = await db()
        .update(accounts)
        .set({
          name: input.name?.trim() ?? current.name,
          description: input.description === undefined ? current.description : input.description,
          parentCode: input.parentCode === undefined ? current.parentCode : input.parentCode,
          institution: input.institution === undefined ? current.institution : input.institution,
          lastDigits: input.lastDigits === undefined ? current.lastDigits : input.lastDigits?.replace(/\D/g, '').slice(-4) || null,
          version: current.version + 1,
          updatedAt: sql`NOW()`,
        })
        .where(
          and(eq(accounts.id, current.id), eq(accounts.tenantId, user.tenantId), eq(accounts.version, input.expectedVersion)),
        )
        .returning({ id: accounts.id, version: accounts.version });
      if (!row) return { ok: false, error: 'This account changed since you opened it. Reload and try again.' };
      await db().insert(auditLog).values({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'UPDATE',
        tableName: 'accounts',
        recordId: current.id,
        oldValues: { name: current.name, description: current.description },
        newValues: { name: input.name ?? current.name, description: input.description },
      });
      revalidatePath('/accounts');
      revalidatePath(`/accounts/${current.id}`);
      return { ok: true, data: { version: row.version } };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save the account.' };
  }
}

export async function archiveCompanyAccount(id: string, expectedVersion: number): Promise<CoaActionResult<{ id: string }>> {
  try {
    await assertPermission('accounting.accounts.write', 'write');
    const user = await requireTenantContext();
    return withTenantContext(user.tenantId, async () => {
      const [current] = await db()
        .select()
        .from(accounts)
        .where(and(eq(accounts.tenantId, user.tenantId), eq(accounts.id, id), isNull(accounts.voidedAt)))
        .limit(1);
      if (!current) return { ok: false, error: 'Account not found.' };
      if (current.version !== expectedVersion) {
        return { ok: false, error: 'This account changed since you opened it. Reload and try again.' };
      }
      const posted = await db()
        .select({
          debit: sql<string>`COALESCE(SUM(CASE WHEN ${journalLines.side} = 'debit' THEN ${journalLines.amount}::numeric ELSE 0 END), 0)`,
          credit: sql<string>`COALESCE(SUM(CASE WHEN ${journalLines.side} = 'credit' THEN ${journalLines.amount}::numeric ELSE 0 END), 0)`,
          n: sql<number>`count(*)`,
        })
        .from(journalLines)
        .where(and(eq(journalLines.tenantId, user.tenantId), eq(journalLines.accountId, current.id), isNull(journalLines.voidedAt)));
      const children = await db()
        .select({ n: sql<number>`count(*)` })
        .from(accounts)
        .where(and(eq(accounts.tenantId, user.tenantId), eq(accounts.parentCode, current.code), isNull(accounts.voidedAt)));
      const advances = await db()
        .select({ n: sql<number>`count(*)` })
        .from(partyAdvances)
        .where(
          and(
            eq(partyAdvances.tenantId, user.tenantId),
            eq(partyAdvances.accountId, current.id),
            eq(partyAdvances.status, 'open'),
            isNull(partyAdvances.voidedAt),
          ),
        );
      const debit = Number(posted[0]?.debit ?? 0);
      const credit = Number(posted[0]?.credit ?? 0);
      const classified = classifyAccount(current);
      const parsed = validateArchiveAccount({
        current: {
          ...classified,
          id: current.id,
          name: current.name,
          version: current.version,
          postedCount: Number(posted[0]?.n ?? 0),
          childCount: Number(children[0]?.n ?? 0),
          advanceOutstanding: Number(advances[0]?.n ?? 0),
          balance: classified.normalSide === 'debit' ? debit - credit : credit - debit,
        },
      });
      if (!parsed.ok) return { ok: false, error: parsed.issues[0]?.message ?? 'Cannot archive this account.', issues: parsed.issues };
      await db()
        .update(accounts)
        .set({ voidedAt: sql`NOW()`, isActive: '0', version: current.version + 1, updatedAt: sql`NOW()` })
        .where(and(eq(accounts.id, current.id), eq(accounts.tenantId, user.tenantId)));
      await db().insert(auditLog).values({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'ARCHIVE',
        tableName: 'accounts',
        recordId: current.id,
        oldValues: { code: current.code, name: current.name },
      });
      revalidatePath('/accounts');
      return { ok: true, data: { id: current.id } };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not archive the account.' };
  }
}

export async function reactivateCompanyAccount(id: string): Promise<CoaActionResult<{ id: string }>> {
  try {
    await assertPermission('accounting.accounts.write', 'write');
    const user = await requireTenantContext();
    return withTenantContext(user.tenantId, async () => {
      const [current] = await db()
        .select({ id: accounts.id, code: accounts.code, name: accounts.name, version: accounts.version })
        .from(accounts)
        .where(and(eq(accounts.tenantId, user.tenantId), eq(accounts.id, id)))
        .limit(1);
      if (!current) return { ok: false, error: 'Account not found.' };
      await db()
        .update(accounts)
        .set({ voidedAt: null, isActive: '1', version: current.version + 1, updatedAt: sql`NOW()` })
        .where(and(eq(accounts.id, current.id), eq(accounts.tenantId, user.tenantId)));
      await db().insert(auditLog).values({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'REACTIVATE',
        tableName: 'accounts',
        recordId: current.id,
        newValues: { code: current.code, name: current.name },
      });
      revalidatePath('/accounts');
      return { ok: true, data: { id: current.id } };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not reactivate the account.' };
  }
}

export async function exportChartCsv(): Promise<CoaActionResult<{ csv: string }>> {
  try {
    await assertPermission('accounting.accounts.read', 'read');
    const user = await requireTenantContext();
    return withTenantContext(user.tenantId, async () => {
      const rows = await db()
        .select({
          code: accounts.code,
          name: accounts.name,
          type: accounts.type,
          subtype: accounts.subtype,
          parentCode: accounts.parentCode,
          description: accounts.description,
          isGroup: accounts.isGroup,
        })
        .from(accounts)
        .where(eq(accounts.tenantId, user.tenantId))
        .orderBy(asc(accounts.code));
      return { ok: true, data: { csv: exportCoaCsv(rows) } };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not export the chart.' };
  }
}

export async function dryRunChartCsv(text: string): Promise<
  CoaActionResult<{ creates: number; skipped: number; issues: Array<{ line: number; field: string; message: string }> }>
> {
  try {
    await assertPermission('accounting.accounts.write', 'write');
    const user = await requireTenantContext();
    return withTenantContext(user.tenantId, async () => {
      const parsed = parseCoaCsv(text);
      if (parsed.issues.length && parsed.rows.length === 0) {
        return { ok: false, error: parsed.issues[0]!.message, issues: parsed.issues };
      }
      const existing = await existingLite(user.tenantId);
      const plan = dryRunCoaImport(parsed.rows, existing);
      return {
        ok: true,
        data: { creates: plan.creates.length, skipped: plan.skipped.length, issues: [...parsed.issues, ...plan.issues] },
      };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not validate the CSV.' };
  }
}

export async function importChartCsv(text: string): Promise<CoaActionResult<{ created: number; skipped: number }>> {
  try {
    await assertPermission('accounting.accounts.write', 'write');
    const user = await requireTenantContext();
    return withTenantContext(user.tenantId, async () => {
      const parsed = parseCoaCsv(text);
      const existing = await existingLite(user.tenantId);
      const plan = dryRunCoaImport(parsed.rows, existing);
      if (plan.issues.length) {
        return { ok: false, error: plan.issues[0]!.message, issues: plan.issues };
      }
      let created = 0;
      for (const row of plan.creates) {
        const seed = classifiedSeedValues({
          code: row.code,
          name: row.name,
          type: row.type,
          normalSide: row.type === 'asset' || row.type === 'expense' ? 'debit' : 'credit',
        });
        await db().insert(accounts).values({
          tenantId: user.tenantId,
          code: row.code,
          name: row.name,
          type: row.type,
          normalSide: seed.normalSide,
          parentCode: row.parentCode || null,
          description: row.description || null,
          subtype: row.subtype || seed.subtype,
          purpose: seed.purpose,
          isGroup: row.isGroup,
          isSystem: '0',
          isContra: seed.isContra,
          cashFlowClass: seed.cashFlowClass,
          liquidity: seed.liquidity,
          reconcilable: seed.reconcilable,
          controlRole: seed.controlRole,
          isActive: '1',
        });
        created += 1;
      }
      await db().insert(auditLog).values({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'IMPORT',
        tableName: 'accounts',
        recordId: user.tenantId,
        newValues: { created, skipped: plan.skipped.length },
      });
      revalidatePath('/accounts');
      return { ok: true, data: { created, skipped: plan.skipped.length } };
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: 'A code in this file already exists. Dry-run and retry.' };
    return { ok: false, error: e instanceof Error ? e.message : 'Could not import the chart.' };
  }
}
