import { redirect } from 'next/navigation';
import { createPartyFromForm } from '@/app/actions/parties';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { FormPageShell } from '@/components/module/list-page';
import { Button } from '@/components/ui/bookone-ui';

export default async function NewCustomerPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Customers" tenant={tenant}>
      <FormPageShell
        eyebrow="Parties"
        title="New customer"
        lead="Save a reusable customer record for sales documents."
        backHref="/parties/customers"
      >
        <form action={createPartyFromForm} className="form-grid">
          <input type="hidden" name="kind" value="customer" />
          <div className="field field-full">
            <label>Name</label>
            <input className="input" name="name" required placeholder="Customer name" />
          </div>
          <div className="field">
            <label>Code</label>
            <input className="input" name="code" placeholder="CUST-001" />
          </div>
          <div className="field">
            <label>Phone</label>
            <input className="input" name="phone" placeholder="+94..." />
          </div>
          <div className="field">
            <label>Email</label>
            <input className="input" name="email" type="email" />
          </div>
          <div className="field">
            <label>Tax ID</label>
            <input className="input" name="taxId" />
          </div>
          <div className="field field-full">
            <label>Address</label>
            <input className="input" name="address" />
          </div>
          <div className="field field-full">
            <label>Notes</label>
            <input className="input" name="notes" />
          </div>
          <div className="field field-full">
            <Button variant="primary" type="submit">Save customer</Button>
          </div>
        </form>
      </FormPageShell>
    </BookOneShell>
  );
}
