import { NextResponse } from 'next/server';
import { getRun, readRunFile } from '@/lib/e2e-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!getRun(id) && !readRunFile(id, 'report.md')) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
  const md = readRunFile(id, 'report.md');
  if (!md) return NextResponse.json({ error: 'Report not ready' }, { status: 404 });
  return new NextResponse(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="bookone-e2e-${id}.md"`,
    },
  });
}
