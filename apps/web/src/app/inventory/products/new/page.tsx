import { redirect } from 'next/navigation';
import { createProductFromForm } from '@/app/actions/inventory';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { FormPageShell } from '@/components/module/list-page';
import { Button } from '@/components/ui/bookone-ui';

export default async function NewProductPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Products" tenant={tenant}>
      <FormPageShell
        eyebrow="Inventory"
        title="New product"
        lead="Stocked items track quantity and post COGS on sale. Services skip inventory."
        backHref="/inventory/products"
      >
        <form action={createProductFromForm} className="form-grid">
          <div className="field">
            <label>SKU</label>
            <input className="input" name="sku" required placeholder="SKU-001" />
          </div>
          <div className="field">
            <label>Name</label>
            <input className="input" name="name" required placeholder="Product name" />
          </div>
          <div className="field">
            <label>Type</label>
            <select className="input" name="productType" defaultValue="stocked">
              <option value="stocked">Stocked</option>
              <option value="service">Service</option>
            </select>
          </div>
          <div className="field">
            <label>Unit</label>
            <input className="input" name="unit" defaultValue="ea" />
          </div>
          <div className="field">
            <label>Unit cost</label>
            <input className="input" name="unitCost" inputMode="decimal" defaultValue="0" />
          </div>
          <div className="field">
            <label>Sell price</label>
            <input className="input" name="sellPrice" inputMode="decimal" defaultValue="0" />
          </div>
          <div className="field">
            <label>Opening qty</label>
            <input className="input" name="openingQty" inputMode="decimal" defaultValue="0" />
          </div>
          <div className="field field-full">
            <label>Description</label>
            <input className="input" name="description" />
          </div>
          <div className="field field-full">
            <Button variant="primary" type="submit">Save product</Button>
          </div>
        </form>
      </FormPageShell>
    </BookOneShell>
  );
}
