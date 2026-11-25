import { NextResponse } from 'next/server';
import { getTenantInfo } from '@/app/actions/workspace';
import { getAgentBridgeService, loadAgentBridgeFlags } from '@/lib/agent-bridge-runtime';
import { publicOrigin } from '@/lib/public-origin';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    return NextResponse.redirect(new URL('/login', (await publicOrigin()) || 'http://localhost:3000'));
  }
  const flags = await loadAgentBridgeFlags(tenant.id);
  if (!flags.enabled) return new NextResponse('Inbox is off.', { status: 404 });
  const { id } = await ctx.params;
  const { service, actor } = await getAgentBridgeService();
  const status = await service.getProcessingStatus(actor, id);
  const blob = await service.getOwnedAttachment(actor, status.document.storageKey);
  if (!blob || 'ok' in blob) return new NextResponse('Original was not found.', { status: 404 });
  return new NextResponse(Buffer.from(blob.bytes), {
    headers: {
      'content-type': blob.mime,
      'content-disposition': `attachment; filename="${blob.filename.replace(/"/g, '')}"`,
      'cache-control': 'private, max-age=0',
    },
  });
}
