import { NextRequest, NextResponse } from 'next/server';
import { commerceErrorBody, CommerceError, COMMERCE_OPENAPI, CURL_EXAMPLES } from '@bookone/commerce';
import { authenticateCommerceRequest, withCommerceService } from '@/lib/commerce-runtime';
import { withTenantContext } from '@bookone/db';

export const runtime = 'nodejs';

function json(data: unknown, status = 200, extra?: HeadersInit) {
  return NextResponse.json(data, { status, headers: extra });
}

function fail(err: unknown) {
  if (err instanceof CommerceError) {
    const headers: HeadersInit = {};
    if (err.retryAfter) headers['Retry-After'] = String(err.retryAfter);
    return json(commerceErrorBody(err), err.httpStatus, headers);
  }
  const message = err instanceof Error ? err.message : 'Commerce request failed.';
  return json({ ok: false, code: 'VALIDATION', error: message, requestId: crypto.randomUUID() }, 400);
}

async function authenticate(req: NextRequest) {
  return authenticateCommerceRequest(req.headers.get('authorization'));
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await ctx.params;
    const route = (path ?? []).join('/');
    if (route === 'openapi.json' || route === 'openapi') {
      return json({ ...COMMERCE_OPENAPI, 'x-examples': CURL_EXAMPLES });
    }
    const actor = await authenticate(req);
    return await withTenantContext(actor.tenantId, async () => {
      const service = await (await import('@/lib/commerce-runtime')).makeCommerceService();
      if (route === 'connection') return json(await service.connection(actor));
      if (route === 'products') {
        return json(await service.products(actor, req.nextUrl.searchParams.get('cursor') ?? undefined));
      }
      if (route === 'catalog/candidates') {
        return json(await service.catalogCandidates(actor));
      }
      if (route === 'payment-methods') return json(await service.paymentMethods(actor));
      if (route === 'inventory') {
        // Repeat sku= or pass a comma list (up to 100).
        const sku = req.nextUrl.searchParams
          .getAll('sku')
          .flatMap((v) => v.split(','))
          .map((v) => v.trim())
          .filter(Boolean);
        return json(await service.inventory(actor, sku.length ? sku : undefined));
      }
      if (route === 'changes') {
        return json(await service.changes(actor, req.nextUrl.searchParams.get('cursor') ?? undefined));
      }
      if (route.startsWith('orders/') && !route.endsWith('/events')) {
        const externalId = decodeURIComponent(route.slice('orders/'.length));
        return json(await service.getOrder(actor, externalId));
      }
      throw new CommerceError({ code: 'NOT_FOUND', message: 'Unknown commerce route.', httpStatus: 404 });
    });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await ctx.params;
    const route = (path ?? []).join('/');
    const actor = await authenticate(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return await withCommerceService(actor.tenantId, async (service) => {
      if (route === 'catalog/acknowledge') {
        return json(await service.acknowledgeCatalog(actor, ((body.items as never) ?? []) as never));
      }
      if (route === 'orders/validate') {
        return json(await service.validateOrder(actor, body as never));
      }
      if (route === 'orders') {
        const key = req.headers.get('idempotency-key');
        const receipt = await service.submitOrder(actor, body as never, key);
        return json(receipt, 202);
      }
      if (route.endsWith('/events') && route.startsWith('orders/')) {
        const externalId = decodeURIComponent(route.slice('orders/'.length, route.length - '/events'.length));
        const receipt = await service.applyEvent(actor, externalId, body as never);
        return json(receipt, 202);
      }
      if (route === 'reservations') {
        service.reservations();
      }
      throw new CommerceError({ code: 'NOT_FOUND', message: 'Unknown commerce route.', httpStatus: 404 });
    });
  } catch (err) {
    return fail(err);
  }
}
