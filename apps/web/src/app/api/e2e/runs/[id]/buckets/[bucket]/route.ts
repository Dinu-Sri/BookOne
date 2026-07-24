import { NextResponse } from 'next/server';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { getRun } from '@/lib/e2e-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Download per-bucket failure markdown written under runs/<id>/buckets/<bucket>-failures.md
 * Bucket param may be "sales" or "sales-failures.md".
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; bucket: string }> },
) {
  const { id, bucket } = await ctx.params;
  const run = getRun(id);
  // Allow download even if run dropped from memory — path under e2e-runner/runs
  const name = bucket.endsWith('.md')
    ? bucket
    : bucket.endsWith('-failures')
      ? `${bucket}.md`
      : `${bucket}-failures.md`;

  // Resolve runs dir the same way e2e-runner does
  const candidates = [
    join(process.cwd(), 'apps', 'e2e-runner', 'runs', id, 'buckets', name),
    join(process.cwd(), '..', 'e2e-runner', 'runs', id, 'buckets', name),
    join('/app/apps/e2e-runner/runs', id, 'buckets', name),
  ];
  let body: string | null = null;
  for (const p of candidates) {
    if (existsSync(p)) {
      body = readFileSync(p, 'utf8');
      break;
    }
  }
  if (!body) {
    return NextResponse.json(
      { error: `Bucket report not found: ${name}`, runStatus: run?.status },
      { status: 404 },
    );
  }
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="bookone-e2e-${id}-${name}"`,
    },
  });
}
