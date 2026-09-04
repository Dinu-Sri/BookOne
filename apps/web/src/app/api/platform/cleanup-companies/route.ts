import { NextResponse } from 'next/server';
import { requireTenantContext } from '@bookone/auth';
import {
  executePlatformCompanyCleanup,
  planPlatformCompanyCleanup,
  PURGE_CONFIRM,
} from '@/lib/platform-cleanup';

export const dynamic = 'force-dynamic';

function isPlatformAdmin(user: { role: string; email: string }) {
  return user.role === 'super_admin' || user.email === 'dinu.sri.m@gmail.com';
}

async function requireAdmin() {
  const user = await requireTenantContext();
  if (!isPlatformAdmin(user)) {
    return { user: null, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, response: null };
}

export async function GET() {
  try {
    const { response } = await requireAdmin();
    if (response) return response;
    const plan = await planPlatformCompanyCleanup();
    return NextResponse.json({ ...plan, confirmPhrase: PURGE_CONFIRM });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { response } = await requireAdmin();
    if (response) return response;
    const body = (await request.json().catch(() => ({}))) as { confirm?: string };
    const result = await executePlatformCompanyCleanup(String(body.confirm ?? ''));
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cleanup failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
