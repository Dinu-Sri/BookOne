import { NextResponse } from 'next/server';
import { logOps } from '@/lib/ops-log';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { path?: string; durationMs?: number };
    const durationMs = Number(body.durationMs);
    if (!Number.isFinite(durationMs) || durationMs < 2000 || durationMs > 600000) {
      return NextResponse.json({ ok: true });
    }
    await logOps({
      kind: 'client',
      path: String(body.path ?? '').slice(0, 400),
      durationMs: Math.round(durationMs),
      status: 'client-wait',
      message: 'Form stayed pending in the browser',
    });
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true });
}
