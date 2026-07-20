import { NextResponse } from 'next/server';
import { buildDownloadBundle } from '@/lib/e2e-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const bundle = await buildDownloadBundle(id);
  if (!bundle) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  return new NextResponse(new Uint8Array(bundle.body), {
    headers: {
      'Content-Type': bundle.contentType,
      'Content-Disposition': `attachment; filename="${bundle.filename}"`,
    },
  });
}
