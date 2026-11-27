import { redirect } from 'next/navigation';
import { getCompanySettingsData } from '@/app/actions/company-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { jobCanWrite } from '@/lib/access';
import { probeModuleWriteDetail } from '@/lib/module-access';
import { listCommercePaymentAccounts } from '@/lib/commerce-payment-accounts';
import { operatorFromSession, withCommerceService } from '@/lib/commerce-runtime';
import { CompanyCommerce } from '@/components/commerce/company-commerce';
import { listProducts } from '@/app/actions/inventory';
import { startCommerceBackground } from '@/lib/commerce-background';

export default async function CompanyCommercePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; err?: string; tab?: string; connection?: string; published?: string; order?: string; list?: string }>;
}) {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login?from=/company/commerce');
  }
  const level = tenant.accessByLabel?.['Commerce Integrations'] ?? 'none';
  if (level === 'none') redirect(tenant.landingHref ?? '/?denied=1');

  startCommerceBackground();
  const query = await searchParams;
  const canWrite = jobCanWrite(tenant, 'Commerce Integrations');
  const operator = await operatorFromSession();
  let products: Awaited<ReturnType<typeof listProducts>> = [];
  let productsError: string | null = null;
  const [viewData, company, productLoad] = await Promise.all([
    // One tenant session for the view and every connection's web orders.
    withCommerceService(operator.tenantId, async (service) => {
      const rows = await service.listOperatorView(operator);
      const orders = new Map<string, Awaited<ReturnType<typeof service.listWebOrders>>>();
      const catalogs = new Map<string, Awaited<ReturnType<typeof service.channelCatalogForOperator>> | null>();
      const priceLists = await service.listPriceListsForOperator(operator).catch(() => []);
      const dev = new Map<string, { webhooks: Awaited<ReturnType<typeof service.webhooksForOperator>>; reservations: Awaited<ReturnType<typeof service.reservationsForOperator>>; apiCalls: Awaited<ReturnType<typeof service.apiCallsForOperator>> }>();
      const prices = new Map<string, { channelPriceListId: string | null; editListId: string | null; rows: Awaited<ReturnType<typeof service.pricesForOperator>>['rows'] }>();
      for (const row of rows) {
        const channelListId = (row.connection.channelSettings?.priceListId as string | null | undefined) ?? null;
        const wanted = query.list && (!query.connection || query.connection === row.connection.id) ? query.list : channelListId;
        const editListId = priceLists.some((l) => l.id === wanted) ? wanted ?? null : null;
        const priced = await service.pricesForOperator(operator, row.connection.id, editListId).catch(() => null);
        prices.set(row.connection.id, { channelPriceListId: channelListId, editListId, rows: priced?.rows ?? [] });
        dev.set(row.connection.id, {
          webhooks: await service.webhooksForOperator(operator, row.connection.id).catch(() => []),
          reservations: await service.reservationsForOperator(operator, row.connection.id).catch(() => []),
          apiCalls: await service.apiCallsForOperator(operator, row.connection.id, 50).catch(() => []),
        });
        orders.set(row.connection.id, await service.listWebOrders(operator, row.connection.id).catch(() => []));
        catalogs.set(row.connection.id, await service.channelCatalogForOperator(operator, row.connection.id).catch(() => null));
      }
      return { rows, orders, catalogs, priceLists, prices, dev };
    }),
    getCompanySettingsData().catch(() => null),
    listProducts()
      .then((rows) => ({ ok: true as const, rows }))
      .catch(() => ({ ok: false as const })),
  ]);
  const view = viewData.rows;
  const webOrders = viewData.orders;
  const channelCatalogs = viewData.catalogs;
  if (productLoad.ok) products = productLoad.rows;
  else productsError = 'Could not load BookOne products.';
  const [inventory, paymentAccounts] = await Promise.all([
    probeModuleWriteDetail('inventory').catch(() => null),
    listCommercePaymentAccounts(tenant.id).catch(() => []),
  ]);
  const inventoryOff = inventory?.reason === 'module_off' || inventory?.reason === 'tier';
  const origin = process.env.AUTH_URL ?? process.env.BETTER_AUTH_URL ?? '';

  return (
    <BookOneShell active="Commerce Integrations" tenant={tenant}>
      <CompanyCommerce
        canWrite={canWrite}
        inventoryOff={inventoryOff}
        paymentAccounts={paymentAccounts}
        saved={query.saved === '1'}
        saveError={query.err ? decodeURIComponent(query.err) : null}
        publishedCount={query.published ? Number(query.published) : null}
        initialTab={
          (['overview', 'orders', 'mapping', 'prices', 'payments', 'settings', 'developer', 'activity'] as const).find(
            (t) => t === (query.tab === 'products' ? 'mapping' : query.tab),
          ) ?? 'overview'
        }
        initialOrderId={query.order}
        initialConnectionId={query.connection ?? ''}
        apiBase={origin ? `${origin.replace(/\/$/, '')}/api/commerce/v1` : '/api/commerce/v1'}
        productsError={productsError}
        locations={(company?.locations ?? []).map((l) => ({
          id: l.id,
          name: l.name,
          locationType: l.locationType,
        }))}
        products={products.map((p) => ({ id: p.id, sku: p.sku, name: p.name }))}
        connections={view.map((row) => ({
          id: row.connection.id,
          name: row.connection.name,
          kind: row.connection.kind,
          environment: row.connection.environment,
          postingMode: row.connection.postingMode,
          inboundPaused: row.connection.inboundPaused,
          outboundPaused: row.connection.outboundPaused,
          currency: row.connection.currency,
          locationId: row.connection.locationId,
          paymentSettings: row.connection.paymentSettings ?? { defaultAccountCode: null, methods: {}, seenMethods: [] },
          webOrders: webOrders.get(row.connection.id) ?? [],
          channelCatalog: channelCatalogs.get(row.connection.id) ?? null,
          webhooks: viewData.dev.get(row.connection.id)?.webhooks ?? [],
          reservations: viewData.dev.get(row.connection.id)?.reservations ?? [],
          apiCalls: viewData.dev.get(row.connection.id)?.apiCalls ?? [],
          prices: {
            lists: viewData.priceLists,
            channelPriceListId: viewData.prices.get(row.connection.id)?.channelPriceListId ?? null,
            editListId: viewData.prices.get(row.connection.id)?.editListId ?? null,
            timezone: tenant.timezone || 'Asia/Colombo',
            rows: viewData.prices.get(row.connection.id)?.rows ?? [],
          },
          mappingCount: row.mappingCount,
          reviewCount: row.reviewCount,
          lastCatalog: row.connection.lastCatalogSyncAt,
          lastStock: row.connection.lastStockSyncAt,
          lastOrder: row.connection.lastOrderSyncAt,
          credentials: row.credentials,
          mappings: row.mappings,
          reviews: row.reviews,
          activity: row.activity.map((a) => ({
            id: a.id,
            action: a.action,
            entity: a.entity,
            createdAt: a.createdAt,
          })),
          proposals: row.proposals.map((p) => ({
            id: p.id,
            status: p.status,
            origin: p.origin,
            items: p.items.map((item) => ({
              sku: item.sku,
              kind: item.kind,
              reason: item.reason,
              bookoneName: item.bookoneName,
              origin: item.origin,
            })),
          })),
          publishClaims: row.publishClaims.map((c) => ({
            id: c.id,
            sku: c.sku,
            status: c.status,
            issue: c.issue,
          })),
        }))}
      />
    </BookOneShell>
  );
}
