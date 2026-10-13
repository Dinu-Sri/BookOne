import { NextResponse } from 'next/server';
import { loadPreparedArchive } from '@/lib/tenant-archive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind');
  if (kind !== 'data' && kind !== 'files') {
    return NextResponse.json({ error: 'Choose data or files.' }, { status: 400 });
  }
  const result = await loadPreparedArchive(kind);
  if ('error' in result) {
    const denied = /permission/i.test(result.error);
    return NextResponse.json({ error: result.error }, { status: denied ? 403 : 400 });
  }
  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${result.fileName}"`,
      'Cache-Control': 'no-store',
      'Content-Length': String(result.buffer.length),
    },
  });
}
