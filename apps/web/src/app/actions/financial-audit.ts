'use server';

import {
  FINANCIAL_AUDIT_TABLES,
  financialAuditEventSummary,
  financialAuditSourceLabel,
  isFinancialAuditTable,
} from '@bookone/accounting';
import { requireTenantContext } from '@bookone/auth';
import { and, auditLog, db, desc, eq, inArray, users, withTenantContext } from '@bookone/db';
import { assertPermission } from '@/lib/access';

export type FinancialAuditEvent = {
  id: string;
  createdAt: Date;
  action: string;
  tableName: string;
  sourceLabel: string;
  recordId: string;
  actorName: string | null;
  actorEmail: string | null;
  notes: string | null;
  event: string;
};

/**
 * Tenant-scoped financial actor/action history. Journals are a different surface.
 * Foreign rows cannot appear: query is inside withTenantContext and filters tenant_id.
 */
export async function listFinancialAuditEvents(opts?: {
  recordId?: string;
  tableName?: string;
}): Promise<FinancialAuditEvent[]> {
  await assertPermission('accounting.journal.read', 'read');
  const user = await requireTenantContext();
  const recordId = opts?.recordId?.trim() || null;
  const tableName =
    opts?.tableName && isFinancialAuditTable(opts.tableName) ? opts.tableName : null;

  return withTenantContext(user.tenantId, async () => {
    const conditions = [
      eq(auditLog.tenantId, user.tenantId),
      inArray(auditLog.tableName, [...FINANCIAL_AUDIT_TABLES]),
    ];
    if (recordId) conditions.push(eq(auditLog.recordId, recordId));
    if (tableName) conditions.push(eq(auditLog.tableName, tableName));

    const rows = await db()
      .select({
        id: auditLog.id,
        createdAt: auditLog.createdAt,
        action: auditLog.action,
        tableName: auditLog.tableName,
        recordId: auditLog.recordId,
        notes: auditLog.notes,
        newValues: auditLog.newValues,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(and(...conditions))
      .orderBy(desc(auditLog.createdAt))
      .limit(100);

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      action: row.action,
      tableName: row.tableName,
      sourceLabel: financialAuditSourceLabel(row.tableName),
      recordId: row.recordId,
      actorName: row.actorName,
      actorEmail: row.actorEmail,
      notes: row.notes,
      event: financialAuditEventSummary(row.newValues, row.notes),
    }));
  });
}
