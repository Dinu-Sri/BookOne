import { NextRequest, NextResponse } from 'next/server';
import {
  commerceErrorBody,
  CommerceError,
  COMMERCE_API_VERSION,
  COMMERCE_OPENAPI,
  CURL_EXAMPLES,
  RATE_LIMIT_PER_MINUTE,
  etagFor,
  parseInclude,
  type CatalogQuery,
  type CommerceActor,
  type CommerceService,
} from '@bookone/commerce';
import { publicOrigin } from '@/lib/public-origin';
import { authenticateCommerceRequest, withCommerceService } from '@/lib/commerce-runtime';
import { startCommerceBackground } from '@/lib/commerce-background';

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

function notFound(): never {
  throw new CommerceError({ code: 'NOT_FOUND', message: 'Unknown commerce route.', httpStatus: 404 });
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

function includesStats(req: NextRequest): boolean {
  return (req.nextUrl.searchParams.get('include') ?? '').split(',').some((v) => v.trim() === 'stats');
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
    stats: includesStats(req),
  };
}

async function mediaBase(tenantId: string): Promise<string> {
  const origin = await publicOrigin().catch(() => process.env.AUTH_URL ?? '');
  return `${origin.replace(/\/$/, '')}/api/commerce/media/${tenantId}`;
}

function seg(route: string, prefix: string): string {
  return decodeURIComponent(route.slice(prefix.length));
}

/**
 * Authenticate, run the handler in the company's RLS context, and log the call
 * (WP7 API audit log). Writes honour Idempotency-Key (G4).
 */
async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
  run: (args: { route: string; actor: CommerceActor; service: CommerceService; body: Record<string, unknown> }) => Promise<NextResponse>,
) {
  startCommerceBackground();
  const started = Date.now();
  let actor: CommerceActor | null = null;
  let response: NextResponse;
  const { path } = await ctx.params;
  const route = (path ?? []).join('/');
  try {
    actor = await authenticateCommerceRequest(req.headers.get('authorization'));
    const body =
      req.method === 'GET' || req.method === 'DELETE' ? {} : ((await req.json().catch(() => ({}))) as Record<string, unknown>);
    const a = actor;
    response = await withCommerceService(a.tenantId, async (service) => {
      const key = req.headers.get('idempotency-key')?.trim();
      const generic = key && req.method !== 'GET' && !(req.method === 'POST' && route === 'orders');
      const scopeKey = `${req.method} ${route} ${key}`;
      if (generic) {
        const replay = await service.idempotentReplay(a, scopeKey, body);
        if (replay) {
          const { _status, ...data } = replay as Record<string, unknown> & { _status?: number };
          return okJson(req, data, a.rateLimitRemaining, Number(_status ?? 200));
        }
      }
      const res = await run({ route, actor: a, service, body });
      if (generic && res.status < 300) {
        const data = (await res.clone().json().catch(() => null)) as Record<string, unknown> | null;
        if (data) await service.rememberIdempotent(a, scopeKey, body, { ...data, _status: res.status });
      }
      return res;
    });
  } catch (err) {
    response = fail(err);
  }
  if (actor) {
    const a = actor;
    const status = response.status;
    void withCommerceService(a.tenantId, (service) =>
      service.logApiCall({
        tenantId: a.tenantId,
        connectionId: a.connectionId,
        keyPrefix: a.prefix,
        method: req.method,
        path: `/${route}${req.nextUrl.search}`.slice(0, 300),
        status,
        durationMs: Date.now() - started,
        requestId: response.headers.get('x-request-id'),
      }),
    ).catch(() => undefined);
  }
  return response;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const route = (path ?? []).join('/');
  if (route === 'openapi.json' || route === 'openapi') {
    return json({ ...COMMERCE_OPENAPI, 'x-examples': CURL_EXAMPLES });
  }
  if (route === 'health') {
    // WP7: no auth. Service status and API version for monitors.
    return json({ ok: true, status: 'ok', apiVersion: COMMERCE_API_VERSION, specVersion: COMMERCE_OPENAPI.info.version, serviceTime: new Date().toISOString() });
  }
  return handle(req, ctx, async ({ route, actor, service }) => {
    const q = req.nextUrl.searchParams;
    const rl = actor.rateLimitRemaining;
    if (route === 'connection') return okJson(req, await service.connection(actor), rl);
    if (route === 'products') return okJson(req, await service.products(actor, q.get('cursor') ?? undefined), rl);
    if (route === 'catalog/candidates') return okJson(req, await service.catalogCandidates(actor), rl);
    if (route === 'payment-methods') return okJson(req, await service.paymentMethods(actor), rl);
    if (route === 'pricing') return okJson(req, await service.pricing(actor, skuList(req), q.get('customerGroup')), rl);
    if (route === 'catalog/products') return okJson(req, await service.catalogProducts(actor, await catalogQuery(req, actor.tenantId)), rl);
    if (route === 'catalog/related') {
      const sku = skuList(req)[0];
      if (!sku) throw new CommerceError({ code: 'VALIDATION', message: 'Pass sku=.', httpStatus: 422 });
      const cq = await catalogQuery(req, actor.tenantId);
      return okJson(req, await service.relatedProducts(actor, sku, cq.include ?? [], cq.mediaBase, Number(q.get('limit') ?? 8)), rl);
    }
    if (route === 'catalog/new-arrivals') {
      const cq = await catalogQuery(req, actor.tenantId);
      return okJson(req, await service.newArrivals(actor, Number(q.get('days') ?? 30), cq.include ?? [], cq.mediaBase, cq.cursor, cq.limit), rl);
    }
    if (route.startsWith('catalog/products/')) {
      const rest = route.slice('catalog/products/'.length);
      const cq = await catalogQuery(req, actor.tenantId);
      const match = rest.startsWith('by-sku/') ? { sku: decodeURIComponent(rest.slice('by-sku/'.length)) } : { id: decodeURIComponent(rest) };
      return okJson(req, await service.catalogProduct(actor, match, cq.include ?? [], cq.mediaBase, cq.scope, cq.customerGroup, cq.stats), rl);
    }
    if (route === 'catalog/categories' || route === 'catalog/brands' || route === 'catalog/attributes') {
      const limit = q.get('limit') ? Number(q.get('limit')) : undefined;
      const out =
        route === 'catalog/categories'
          ? await service.catalogCategories(actor, q.get('cursor'), limit)
          : route === 'catalog/brands'
            ? await service.catalogBrands(actor, q.get('cursor'), limit)
            : await service.catalogAttributes(actor, q.get('cursor'), limit);
      return okJson(req, out, rl);
    }
    if (route === 'inventory') {
      const sku = skuList(req);
      return okJson(req, await service.inventory(actor, sku.length ? sku : undefined), rl);
    }
    if (route === 'changes') return okJson(req, await service.changes(actor, q.get('cursor') ?? undefined, q.get('kinds')), rl);
    // ---- WP3 ----
    if (route.startsWith('reservations/')) return okJson(req, await service.getReservation(actor, seg(route, 'reservations/')), rl);
    // ---- WP4 ----
    if (route === 'webhooks') {
      need(actor, 'catalog');
      return okJson(req, { items: await service.listWebhooks(actor.tenantId, actor.connectionId), nextCursor: null, requestId: crypto.randomUUID() }, rl);
    }
    if (route.startsWith('webhooks/') && route.endsWith('/deliveries')) {
      need(actor, 'catalog');
      const id = decodeURIComponent(route.slice('webhooks/'.length, -'/deliveries'.length));
      return okJson(req, { items: await service.webhookDeliveries(actor.tenantId, actor.connectionId, id), nextCursor: null, requestId: crypto.randomUUID() }, rl);
    }
    // ---- WP5 / WP6 ----
    if (route === 'orders') {
      return okJson(
        req,
        await service.listOrdersForChannel(actor, {
          updatedSince: q.get('updatedSince'),
          status: q.get('status'),
          cursor: q.get('cursor'),
          limit: q.get('limit') ? Number(q.get('limit')) : undefined,
        }),
        rl,
      );
    }
    if (route.startsWith('orders/') && route.endsWith('/invoice')) {
      return okJson(req, await service.orderInvoice(actor, decodeURIComponent(route.slice('orders/'.length, -'/invoice'.length))), rl);
    }
    if (route.startsWith('orders/') && !route.endsWith('/events')) return okJson(req, await service.getOrder(actor, seg(route, 'orders/')), rl);
    if (route.startsWith('customers/') && route.endsWith('/orders')) {
      return okJson(req, await service.channelCustomerOrders(actor, decodeURIComponent(route.slice('customers/'.length, -'/orders'.length))), rl);
    }
    if (route.startsWith('customers/')) return okJson(req, await service.getChannelCustomer(actor, seg(route, 'customers/')), rl);
    notFound();
  });
}

function need(actor: CommerceActor, scope: 'catalog' | 'inventory' | 'order' | 'lifecycle') {
  if (!actor.scopes.includes(scope)) {
    throw new CommerceError({ code: 'FORBIDDEN', message: `This key is missing the ${scope} scope.`, httpStatus: 403 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx, async ({ route, actor, service, body }) => {
    const rl = actor.rateLimitRemaining;
    if (route === 'catalog/acknowledge') return okJson(req, await service.acknowledgeCatalog(actor, ((body.items as never) ?? []) as never), rl);
    if (route === 'orders/validate') return okJson(req, await service.validateOrder(actor, body as never), rl);
    if (route === 'orders') return okJson(req, await service.submitOrder(actor, body as never, req.headers.get('idempotency-key')), rl, 202);
    if (route.startsWith('orders/') && route.endsWith('/events')) {
      const externalId = decodeURIComponent(route.slice('orders/'.length, -'/events'.length));
      return okJson(req, await service.applyEvent(actor, externalId, body as never), rl, 202);
    }
    if (route.startsWith('orders/') && route.endsWith('/returns')) {
      const externalId = decodeURIComponent(route.slice('orders/'.length, -'/returns'.length));
      return okJson(req, await service.createReturn(actor, externalId, body as never), rl, 202);
    }
    if (route === 'reservations') return okJson(req, await service.createReservation(actor, body as never), rl, 201);
    if (route === 'webhooks') {
      need(actor, 'catalog');
      return okJson(req, await service.createWebhook(actor.tenantId, actor.connectionId, body as never), rl, 201);
    }
    if (route.startsWith('webhooks/') && route.endsWith('/test')) {
      need(actor, 'catalog');
      return okJson(req, await service.testWebhook(actor.tenantId, actor.connectionId, decodeURIComponent(route.slice('webhooks/'.length, -'/test'.length))), rl, 202);
    }
    if (route.startsWith('webhooks/') && route.endsWith('/rotate')) {
      need(actor, 'catalog');
      return okJson(req, await service.rotateWebhookSecret(actor.tenantId, actor.connectionId, decodeURIComponent(route.slice('webhooks/'.length, -'/rotate'.length))), rl);
    }
    notFound();
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx, async ({ route, actor, service, body }) => {
    if (route.startsWith('reservations/')) {
      return okJson(req, await service.updateReservation(actor, seg(route, 'reservations/'), body as never), actor.rateLimitRemaining);
    }
    notFound();
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx, async ({ route, actor, service, body }) => {
    if (route.startsWith('customers/')) {
      return okJson(req, await service.upsertChannelCustomer(actor, seg(route, 'customers/'), body as never), actor.rateLimitRemaining);
    }
    notFound();
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handle(req, ctx, async ({ route, actor, service }) => {
    if (route.startsWith('reservations/')) {
      return okJson(req, await service.releaseReservation(actor, seg(route, 'reservations/')), actor.rateLimitRemaining);
    }
    if (route.startsWith('webhooks/')) {
      need(actor, 'catalog');
      return okJson(req, await service.deleteWebhook(actor.tenantId, actor.connectionId, seg(route, 'webhooks/')), actor.rateLimitRemaining);
    }
    notFound();
  });
}
