import 'server-only';

import { db, desc, opsRequestLogs } from '@bookone/db';

const SLOW_MS = 2000;

export async function logOps(entry: {
  kind: 'slow' | 'error' | 'client';
  path?: string;
  durationMs?: number;
  status?: string;
  message?: string;
}): Promise<void> {
  try {
    await db().insert(opsRequestLogs).values({
      kind: entry.kind,
      path: (entry.path ?? '').slice(0, 500) || null,
      durationMs: entry.durationMs ?? null,
      status: (entry.status ?? '').slice(0, 40) || null,
      message: entry.message ? entry.message.slice(0, 2000) : null,
    });
  } catch {
    // Never break the product because logging failed (table not migrated yet, etc.).
  }
}

export async function logIfSlow(path: string, startedAt: number, extra?: { status?: string; message?: string }) {
  const durationMs = Date.now() - startedAt;
  if (durationMs < SLOW_MS) return;
  await logOps({
    kind: 'slow',
    path,
    durationMs,
    status: extra?.status ?? 'ok',
    message: extra?.message,
  });
}

export async function listOpsLogs(limit = 200) {
  const rows = await db()
    .select()
    .from(opsRequestLogs)
    .orderBy(desc(opsRequestLogs.createdAt))
    .limit(Math.min(500, Math.max(20, limit)));
  return rows;
}
