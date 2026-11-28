'use server';

import { userMessageForError } from '@/lib/coreguard-errors';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@bookone/auth';
import { and, auditLog, db, desc, eq, isNull, periodLocks, sql, withTenantContext } from '@bookone/db';
import { assertPermission, writeDeniedMessage } from '@/lib/access';

/**
 * Closing and reopening months (CoreGuard D5, BR-6).
 * The only way to close a month is coreguard.lock_period, and the only way to reopen one is
 * coreguard.unlock_period with a reason. Both run inside the tenant context, in READ COMMITTED.
 * Postings dated in a closed month are refused by guard G05 in the database.
 */

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Choose a month.');
const reasonSchema = z
  .string()
  .trim()
  .min(3, 'Say why you are reopening this month.')
  .max(500, 'Keep the reason under 500 characters.');

export type MonthLockRow = {
  id: string;
  period: string;
  status: 'locked' | 'unlocked';
  lockedAt: string;
  unlockedAt: string | null;
  notes: string | null;
};

export async function listMonthLocks(): Promise<MonthLockRow[]> {
  await assertPermission('accounting.accounts.read', 'read');
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select({
        id: periodLocks.id,
        period: periodLocks.period,
        status: periodLocks.status,
        lockedAt: periodLocks.lockedAt,
        unlockedAt: periodLocks.unlockedAt,
        notes: periodLocks.notes,
      })
      .from(periodLocks)
      .where(and(eq(periodLocks.tenantId, user.tenantId), isNull(periodLocks.voidedAt)))
      .orderBy(desc(periodLocks.period), desc(periodLocks.lockedAt))
      .limit(120);
    return rows.map((row) => ({
      id: row.id,
      period: row.period,
      status: row.status === 'locked' ? 'locked' : 'unlocked',
      lockedAt: row.lockedAt.toISOString(),
      unlockedAt: row.unlockedAt ? row.unlockedAt.toISOString() : null,
      notes: row.notes,
    }));
  });
}

export async function closeMonth(period: string): Promise<{ ok: boolean; error?: string }> {
  const denied = await writeDeniedMessage('accounting.accounts.write');
  if (denied) return { ok: false, error: denied };
  try {
    const parsedPeriod = periodSchema.parse(period);
    const user = await requireTenantContext();
    await withTenantContext(user.tenantId, async () => {
      await db().transaction(async () => {
        const rows = (await db().execute(
          sql`SELECT coreguard.lock_period(${user.tenantId}::uuid, ${parsedPeriod}, ${user.id}::uuid, ${'Closed from Accounts → Closed months.'}) AS id`,
        )) as unknown as Array<{ id: string }>;
        const lockId = rows[0]?.id;
        if (!lockId) throw new Error('Could not close this month.');
        await db().insert(auditLog).values({
          tenantId: user.tenantId,
          userId: user.id,
          action: 'LOCK',
          tableName: 'period_locks',
          recordId: lockId,
          newValues: { period: parsedPeriod, status: 'locked' },
          notes: 'Closed accounting month.',
        });
      });
    });
    revalidatePath('/accounts/months');
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? 'Choose a month.' };
    return { ok: false, error: userMessageForError(error, 'Could not close this month.') };
  }
}

export async function reopenMonth(period: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const denied = await writeDeniedMessage('accounting.accounts.write');
  if (denied) return { ok: false, error: denied };
  try {
    const parsedPeriod = periodSchema.parse(period);
    const parsedReason = reasonSchema.safeParse(reason ?? '');
    if (!parsedReason.success) {
      return { ok: false, error: parsedReason.error.issues[0]?.message ?? 'Say why you are reopening this month.' };
    }
    const user = await requireTenantContext();
    await withTenantContext(user.tenantId, async () => {
      await db().transaction(async () => {
        const [lock] = await db()
          .select({ id: periodLocks.id })
          .from(periodLocks)
          .where(
            and(
              eq(periodLocks.tenantId, user.tenantId),
              eq(periodLocks.period, parsedPeriod),
              eq(periodLocks.status, 'locked'),
              isNull(periodLocks.voidedAt),
            ),
          )
          .limit(1);
        if (!lock) throw new Error(`${parsedPeriod} is not closed.`);
        await db().execute(
          sql`SELECT coreguard.unlock_period(${user.tenantId}::uuid, ${parsedPeriod}, ${user.id}::uuid, ${parsedReason.data})`,
        );
        await db().insert(auditLog).values({
          tenantId: user.tenantId,
          userId: user.id,
          action: 'UNLOCK',
          tableName: 'period_locks',
          recordId: lock.id,
          newValues: { period: parsedPeriod, status: 'unlocked', reason: parsedReason.data },
          notes: 'Reopened accounting month.',
        });
      });
    });
    revalidatePath('/accounts/months');
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? 'Choose a month.' };
    return { ok: false, error: userMessageForError(error, 'Could not reopen this month.') };
  }
}
