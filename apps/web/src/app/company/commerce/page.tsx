import { redirect } from 'next/navigation';
import { getCompanySettingsData } from '@/app/actions/company-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { jobCanWrite } from '@/lib/access';
import { operatorFromSession, withCommerceService } from '@/lib/commerce-runtime';
import { CompanyCommerce } from '@/components/commerce/company-commerce';
import { listProducts } from '@/app/actions/inventory';

export default async function CompanyCommercePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; err?: string; tab?: string; connection?: string; published?: string }>;
}) {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login?from=/company/commerce');
  }
  const level = tenant.accessByLabel?.['Commerce Integrations'] ?? 'none';
  if (level === 'none') redirect(tenant.landingHref ?? '/?denied=1');

  const query = await searchParams;
  const canWrite = jobCanWrite(tenant, 'Commerce Integrations');
  const operator = await operatorFromSession();
  let products: Awaited<ReturnType<typeof listProducts>> = [];
  let productsError: string | null = null;
  const [view, company, productLoad] = await Promise.all([
    withCommerceService(operator.tenantId, (service) => service.listOperatorView(operator)),
    getCompanySettingsData().catch(() => null),
    listProducts()
      .then((rows) => ({ ok: true as const, rows }))
      .catch(() => ({ ok: false as const })),
  ]);
  if (productLoad.ok) products = productLoad.rows;
  else productsError = 'Could not load BookOne products.';
  const origin = process.env.AUTH_URL ?? process.env.BETTER_AUTH_URL ?? '';

  return (
    <BookOneShell active="Commerce Integrations" tenant={tenant}>
      <CompanyCommerce
        canWrite={canWrite}
        saved={query.saved === '1'}
        saveError={query.err ? decodeURIComponent(query.err) : null}
        publishedCount={query.published ? Number(query.published) : null}
        initialTab={query.tab === 'mapping' || query.tab === 'activity' ? query.tab : 'connections'}
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
        }))}
      />
    </BookOneShell>
  );
}
