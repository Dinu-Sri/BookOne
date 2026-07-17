import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createDiscountFromForm } from '@/app/actions/discounts';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
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
      <div className="workspace party-workspace">
        <form action={createDiscountFromForm} className="doc-form-shell">
          <div className="party-form-top">
            <Link href="/sales/discounts" className="party-back-btn">
              <span className="party-back-arrow">←</span>
              <span>
                <strong>Back to list</strong>
                <small>Discounts</small>
              </span>
            </Link>
          </div>
          <div className="doc-form-scroll">
            <div className="doc-form-header">
              <div className="field field-span-2">
                <label>Name *</label>
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
                <label>Value *</label>
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
              <div className="field field-span-2">
                <label>Notes</label>
                <input className="input" name="notes" />
              </div>
            </div>
          </div>
          <div className="doc-form-footer">
            <Link href="/sales/discounts">
              <Button variant="secondary" type="button">
                Cancel
              </Button>
            </Link>
            <Button variant="primary" type="submit">
              Save discount
            </Button>
          </div>
        </form>
      </div>
    </BookOneShell>
  );
}
