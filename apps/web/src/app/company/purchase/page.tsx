import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPurchaseSettings, savePurchaseSettingsFromForm } from '@/app/actions/purchase-settings';
import { getDocumentFormOptions } from '@/app/actions/documents';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { SelectRow, SettingsForm, SettingsSection, SwitchRow } from '@/components/settings/settings-kit';

const TERMS = ['Due on receipt', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60'];

export default async function CompanyPurchaseSettingsPage() {
  let tenant;
  let settings;
  let options;
  try {
    [tenant, settings, options] = await Promise.all([
      getTenantInfo(),
      getPurchaseSettings(),
      getDocumentFormOptions(),
    ]);
  } catch {
    redirect('/login');
  }

  const expenseAccounts = options.expenseAccounts.length
    ? options.expenseAccounts
    : [{ code: '6800', name: 'General Expense' }];

  return (
    <BookOneShell active="Purchase Settings" tenant={tenant}>
      <div className="workspace ux-page set-page">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Purchase settings</h1>
              <p>Decide the checks a supplier bill must pass and the defaults new bills start with.</p>
            </div>
          </div>
        </header>

        <div className="ux-split">
          <div className="ux-main">
            <SettingsForm
              id="purchase-settings"
              action={savePurchaseSettingsFromForm}
              title="Bills and suppliers"
              saveLabel="Save purchase settings"
            >
              <SettingsSection title="Checks on supplier bills">
                <SwitchRow
                  name="requireBillApproval"
                  label="Approve bills before they post"
                  help="Bills wait as pending approval. Approve on the bill to post it to your books and stock."
                  defaultChecked={settings.requireBillApproval}
                />
                <SwitchRow
                  name="requireSupplierInvoiceNo"
                  label="Require the supplier invoice number"
                  help="On credit bills, the supplier's own invoice number must be filled in."
                  defaultChecked={settings.requireSupplierInvoiceNo}
                />
                <SwitchRow
                  name="blockDuplicateBills"
                  label="Block duplicate bills"
                  help="Stops a second bill with the same supplier and supplier invoice number."
                  defaultChecked={settings.blockDuplicateBills}
                />
                <SwitchRow
                  name="requireGrnBeforeBill"
                  label="Receive goods before billing"
                  help="A purchase order with products needs a goods receipt before it can be billed."
                  defaultChecked={settings.requireGrnBeforeBill}
                />
                <SwitchRow
                  name="postGrniOnReceipt"
                  label="Value stock when goods arrive"
                  help="Goods receipts add stock value right away (Inventory 5100 against Goods received not billed 2150). The bill then clears 2150. Leave off to count quantity only."
                  defaultChecked={settings.postGrniOnReceipt}
                />
              </SettingsSection>
              <SettingsSection title="Defaults for new bills">
                <SelectRow
                  name="defaultPaymentTerms"
                  label="Payment terms"
                  help="When a new bill is due."
                  defaultValue={settings.defaultPaymentTerms}
                  options={TERMS.map((t) => ({ value: t, label: t }))}
                />
                <SelectRow
                  name="defaultExpenseAccount"
                  label="Expense account"
                  help="Used on bill lines that are not products."
                  defaultValue={settings.defaultExpenseAccount}
                  wide
                  options={expenseAccounts.map((a) => ({ value: a.code, label: `${a.name} (${a.code})` }))}
                />
              </SettingsSection>
            </SettingsForm>
          </div>

          <aside className="ux-guide set-guide" aria-label="About purchase settings">
            <h2>Good to know</h2>
            <p>These checks apply when a bill is saved or posted.</p>
            <p>
              Reading supplier bills from email or files, and AI assistant connections, are set up in{' '}
              <Link href="/company/agent-bridge">Company → AgentBridge</Link>.
            </p>
          </aside>
        </div>
      </div>
    </BookOneShell>
  );
}
