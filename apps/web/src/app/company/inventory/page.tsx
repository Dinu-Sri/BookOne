import { redirect } from 'next/navigation';
import {
  getInventorySettings,
  saveInventorySettingsFromForm,
} from '@/app/actions/inventory-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { SelectRow, SettingsForm, SettingsSection } from '@/components/settings/settings-kit';

export default async function CompanyInventorySettingsPage() {
  let tenant;
  let settings;
  try {
    [tenant, settings] = await Promise.all([getTenantInfo(), getInventorySettings()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Inventory Settings" tenant={tenant}>
      <div className="workspace ux-page set-page">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Inventory settings</h1>
              <p>Choose how stock is costed and whether stock can go below zero.</p>
            </div>
          </div>
        </header>

        <div className="ux-split">
          <div className="ux-main">
            <SettingsForm
              id="inventory-settings"
              action={saveInventorySettingsFromForm}
              title="Stock rules"
              saveLabel="Save inventory settings"
            >
              <SettingsSection title="Costing">
                <SelectRow
                  name="costingMethod"
                  label="Costing method"
                  help="Sets the cost of goods sold when you sell stock."
                  defaultValue={settings.costingMethod}
                  wide
                  options={[
                    { value: 'last', label: 'Last cost', description: 'The newest buy price becomes the product cost.' },
                    { value: 'average', label: 'Weighted average', description: 'Blends the old stock value with each new receipt.' },
                    { value: 'fifo', label: 'FIFO lots', description: 'Each delivery keeps its price; sales use the oldest first.' },
                  ]}
                />
              </SettingsSection>
              <SettingsSection title="Stock below zero">
                <SelectRow
                  name="negativeStockPolicy"
                  label="Negative stock"
                  help="When blocked, invoices, POS sales, purchase returns and adjustments that would take stock below zero are stopped."
                  defaultValue={settings.negativeStockPolicy}
                  options={[
                    { value: 'allow', label: 'Allow negative stock' },
                    { value: 'block', label: 'Block it' },
                  ]}
                />
              </SettingsSection>
            </SettingsForm>
          </div>

          <aside className="ux-guide set-guide" aria-label="About inventory settings">
            <h2>Good to know</h2>
            <p>
              <strong>FIFO example:</strong> you buy 10 at 500, then 20 at 450. The first 10 you sell cost 500 each,
              the rest 450.
            </p>
            <p>Physical products and rental fleet quantities use lots. Digital and service items do not hold stock.</p>
          </aside>
        </div>
      </div>
    </BookOneShell>
  );
}
