import { NextRequest, NextResponse } from 'next/server';
import {
  commerceErrorBody,
  CommerceError,
  COMMERCE_OPENAPI,
  CURL_EXAMPLES,
  RATE_LIMIT_PER_MINUTE,
  etagFor,
  parseInclude,
  type CatalogQuery,
} from '@bookone/commerce';
import { publicOrigin } from '@/lib/public-origin';
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

/** G5/G8: every authenticated response carries rate-limit headers; GETs get an ETag and honour If-None-Match. */
function okJson(req: NextRequest, data: unknown, remaining: number | undefined, status = 200) {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(RATE_LIMIT_PER_MINUTE),
    'X-RateLimit-Remaining': String(remaining ?? RATE_LIMIT_PER_MINUTE),
  };
  const requestId = (data as { requestId?: string } | null)?.requestId;
  if (requestId) headers['X-Request-Id'] = requestId;
  if (req.method === 'GET' && status === 200) {
    const etag = etagFor(data);
    headers.ETag = etag;
    headers['Cache-Control'] = 'private, no-cache';
    const match = req.headers.get('if-none-match');
    if (match && match.split(',').map((v) => v.trim()).includes(etag)) {
      return new NextResponse(null, { status: 304, headers });
    }
  }
  return json(data, status, headers);
}

function skuList(req: NextRequest): string[] {
  return req.nextUrl.searchParams
    .getAll('sku')
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
}

async function catalogQuery(req: NextRequest, tenantId: string): Promise<CatalogQuery> {
  const q = req.nextUrl.searchParams;
  const skus = skuList(req);
  if (skus.length > 100) throw new CommerceError({ code: 'VALIDATION', message: 'Pass at most 100 SKUs per call.', httpStatus: 422 });
  const status = q.get('status');
  const updatedSince = q.get('updatedSince');
  if (updatedSince && !Number.isFinite(Date.parse(updatedSince))) {
    throw new CommerceError({ code: 'VALIDATION', message: 'updatedSince must be an ISO 8601 timestamp.', httpStatus: 422 });
  }
  return {
    cursor: q.get('cursor'),
    limit: q.get('limit') ? Number(q.get('limit')) : undefined,
    updatedSince,
    status: status === 'archived' || status === 'all' ? status : 'active',
    categoryId: q.get('categoryId'),
    brandId: q.get('brandId'),
    skus,
    include: parseInclude(q.get('include')),
    scope: q.get('scope') === 'all' ? 'all' : 'published',
    mediaBase: await mediaBase(tenantId),
    customerGroup: q.get('customerGroup'),
  };
}

async function mediaBase(tenantId: string): Promise<string> {
  const origin = await publicOrigin().catch(() => process.env.AUTH_URL ?? '');
  return `${origin.replace(/\/$/, '')}/api/commerce/media/${tenantId}`;
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
      if (route === 'connection') return okJson(req, await service.connection(actor), actor.rateLimitRemaining);
      if (route === 'products') {
        return okJson(req, await service.products(actor, req.nextUrl.searchParams.get('cursor') ?? undefined), actor.rateLimitRemaining);
      }
      if (route === 'catalog/candidates') {
        return okJson(req, await service.catalogCandidates(actor), actor.rateLimitRemaining);
      }
      if (route === 'payment-methods') return okJson(req, await service.paymentMethods(actor), actor.rateLimitRemaining);
      // ---- WP2 pricing ----
      if (route === 'pricing') {
        return okJson(req, await service.pricing(actor, skuList(req), req.nextUrl.searchParams.get('customerGroup')), actor.rateLimitRemaining);
      }
      // ---- WP1 catalog read ----
      if (route === 'catalog/products') {
        return okJson(req, await service.catalogProducts(actor, await catalogQuery(req, actor.tenantId)), actor.rateLimitRemaining);
      }
      if (route.startsWith('catalog/products/')) {
        const rest = route.slice('catalog/products/'.length);
        const q = await catalogQuery(req, actor.tenantId);
        const match = rest.startsWith('by-sku/')
          ? { sku: decodeURIComponent(rest.slice('by-sku/'.length)) }
          : { id: decodeURIComponent(rest) };
        return okJson(
          req,
          await service.catalogProduct(actor, match, q.include ?? [], q.mediaBase, q.scope, q.customerGroup),
          actor.rateLimitRemaining,
        );
      }
      if (route === 'catalog/categories' || route === 'catalog/brands' || route === 'catalog/attributes') {
        const q = req.nextUrl.searchParams;
        const limit = q.get('limit') ? Number(q.get('limit')) : undefined;
        const out =
          route === 'catalog/categories'
            ? await service.catalogCategories(actor, q.get('cursor'), limit)
            : route === 'catalog/brands'
              ? await service.catalogBrands(actor, q.get('cursor'), limit)
              : await service.catalogAttributes(actor, q.get('cursor'), limit);
        return okJson(req, out, actor.rateLimitRemaining);
      }
      if (route === 'inventory') {
        // Repeat sku= or pass a comma list (up to 100).
        const sku = req.nextUrl.searchParams
          .getAll('sku')
          .flatMap((v) => v.split(','))
          .map((v) => v.trim())
          .filter(Boolean);
        return okJson(req, await service.inventory(actor, sku.length ? sku : undefined), actor.rateLimitRemaining);
      }
      if (route === 'changes') {
        return okJson(req, await service.changes(actor, req.nextUrl.searchParams.get('cursor') ?? undefined), actor.rateLimitRemaining);
      }
      if (route.startsWith('orders/') && !route.endsWith('/events')) {
        const externalId = decodeURIComponent(route.slice('orders/'.length));
        return okJson(req, await service.getOrder(actor, externalId), actor.rateLimitRemaining);
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
