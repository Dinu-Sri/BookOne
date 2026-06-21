import { redirect } from 'next/navigation';
import { FileText } from 'lucide-react';
import { getCompanySettingsData, saveTaxProfile } from '@/app/actions/company-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CompanyCard, Field, SaveButton, SelectField } from '../_components';

export default async function CompanyTaxPage() {
  let tenant;
  let data;
  try {
    [tenant, data] = await Promise.all([getTenantInfo(), getCompanySettingsData()]);
  } catch {
    redirect('/login');
  }

  const tax = data.tax;

  return (
    <BookOneShell active="Tax Info" tenant={tenant}>
      <div className="workspace">
        <CompanyCard title="Tax info" subtitle="Tax identifiers and document numbering defaults." action={<FileText size={18} color="var(--brand)" />}>
          <form action={saveTaxProfile} className="form-grid">
            <Field label="TIN" name="tin" defaultValue={tax?.tin} />
            <Field label="VAT no." name="vatNumber" defaultValue={tax?.vatNumber} />
            <Field label="SVAT no." name="svatNumber" defaultValue={tax?.svatNumber} />
            <Field label="Tax office" name="taxOffice" defaultValue={tax?.taxOffice} />
            <Field label="Default tax rate" name="defaultTaxRate" defaultValue={tax?.defaultTaxRate ?? '0'} />
            <SelectField label="Tax basis" name="taxBasis" defaultValue={tax?.taxBasis ?? 'standard'}>
              <option value="standard">Standard</option>
              <option value="cash">Cash basis</option>
              <option value="accrual">Accrual basis</option>
            </SelectField>
            <Field label="Invoice prefix" name="invoicePrefix" defaultValue={tax?.invoicePrefix ?? 'INV'} />
            <Field label="Bill prefix" name="billPrefix" defaultValue={tax?.billPrefix ?? 'BILL'} />
            <SaveButton>Save tax info</SaveButton>
          </form>
        </CompanyCard>
      </div>
    </BookOneShell>
  );
}
