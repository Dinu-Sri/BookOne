import { NextResponse } from 'next/server';
import { getRun, readRunFile } from '@/lib/e2e-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const file = readRunFile(id, 'run.log');
  const run = getRun(id);
  const text = file ?? run?.log.join('\n') ?? null;
  if (text == null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="bookone-e2e-${id}.log"`,
    },
  });
}
