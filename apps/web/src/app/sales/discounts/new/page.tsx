import { redirect } from 'next/navigation';
import { createDiscountFromForm } from '@/app/actions/discounts';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { FormPageShell } from '@/components/module/list-page';
import { Button } from '@/components/ui/bookone-ui';

export default async function NewDiscountPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Discounts" tenant={tenant}>
      <FormPageShell
        eyebrow="Sales"
        title="New discount"
        lead="Percent or fixed amount — applied as net revenue reduction on sales docs."
        backHref="/sales/discounts"
      >
        <form action={createDiscountFromForm} className="form-grid">
          <div className="field field-full">
            <label>Name</label>
            <input className="input" name="name" required placeholder="Holiday 10%" />
          </div>
          <div className="field">
            <label>Code</label>
            <input className="input" name="code" placeholder="HOL10" />
          </div>
          <div className="field">
            <label>Type</label>
            <select className="input" name="discountType" defaultValue="percent">
              <option value="percent">Percent</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </div>
          <div className="field">
            <label>Value</label>
            <input className="input" name="value" required inputMode="decimal" placeholder="10" />
          </div>
          <div className="field">
            <label>Starts on</label>
            <input className="input" name="startsOn" type="date" />
          </div>
          <div className="field">
            <label>Ends on</label>
            <input className="input" name="endsOn" type="date" />
          </div>
          <div className="field field-full">
            <label>Notes</label>
            <input className="input" name="notes" />
          </div>
          <div className="field field-full">
            <Button variant="primary" type="submit">Save discount</Button>
          </div>
        </form>
      </FormPageShell>
    </BookOneShell>
  );
}
