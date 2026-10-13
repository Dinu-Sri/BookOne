import { NextResponse } from 'next/server';
import { prepareTenantArchive } from '@/lib/tenant-archive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let password = '';
  let confirm = '';
  try {
    const body = (await req.json()) as { password?: string; confirm?: string };
    password = String(body.password ?? '');
    confirm = String(body.confirm ?? '');
  } catch {
    return NextResponse.json({ ok: false, error: 'Password is required.' }, { status: 400 });
  }
  const result = await prepareTenantArchive(password, confirm);
  if (!result.ok) {
    const denied = /permission/i.test(result.error);
    return NextResponse.json(result, { status: denied ? 403 : 400 });
  }
  return NextResponse.json(result);
}
