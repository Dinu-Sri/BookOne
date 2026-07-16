import { redirect } from 'next/navigation';
import Link from 'next/link';
import { listProducts } from '@/app/actions/inventory';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { formatLKR, ModulePageHeader, StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';

export default async function ProductsPage() {
  let tenant;
  let rows;
  try {
    [tenant, rows] = await Promise.all([getTenantInfo(), listProducts()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Products" tenant={tenant}>
      <div className="workspace">
        <ModulePageHeader
          eyebrow="Inventory"
          title="Products"
          lead="Sellable and stocked items. Unit cost drives COGS on sales invoices and POS."
          newHref="/inventory/products/new"
          newLabel="New product"
        />
        <Card>
          <div className="card-body" style={{ padding: 0 }}>
            {rows.length === 0 ? (
              <div className="empty-state" style={{ padding: 32 }}>
                <h3>No products yet</h3>
                <p>Create products before stocked sales or inventory movements.</p>
                <div style={{ marginTop: 12 }}>
                  <Link href="/inventory/products/new">
                    <Button variant="primary" type="button">New product</Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Cost</th>
                      <th>Price</th>
                      <th>Qty on hand</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td><strong>{r.sku}</strong></td>
                        <td>{r.name}</td>
                        <td>{r.productType}</td>
                        <td>{formatLKR(r.unitCost)}</td>
                        <td>{formatLKR(r.sellPrice)}</td>
                        <td>{r.qtyOnHand}</td>
                        <td><StatusBadge status={r.isActive === '1' ? 'active' : 'void'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      </div>
    </BookOneShell>
  );
}
