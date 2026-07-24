import { NextResponse } from 'next/server';
import { readRunFile } from '@/lib/e2e-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Download agent-oriented failures.md */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = readRunFile(id, 'failures.md');
  if (!body) {
    return NextResponse.json({ error: 'failures.md not ready' }, { status: 404 });
  }
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="bookone-e2e-${id}-failures.md"`,
    },
  });
}
