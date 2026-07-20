import { NextResponse } from 'next/server';
import { createRun, listRuns, publicRun } from '@/lib/e2e-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(listRuns().map(publicRun));
}

export async function POST(request: Request) {
  let body: { email?: string; password?: string; baseUrl?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const result = createRun({
    email: String(body.email ?? ''),
    password: String(body.password ?? ''),
    baseUrl: String(body.baseUrl ?? origin),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }
  return NextResponse.json(result.run, { status: 202 });
}
