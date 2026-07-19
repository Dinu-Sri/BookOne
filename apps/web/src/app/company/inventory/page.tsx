import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  getInventorySettings,
  saveInventorySettingsFromForm,
} from '@/app/actions/inventory-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Button } from '@/components/ui/bookone-ui';

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
      <div className="workspace party-workspace" style={{ display: 'grid', gap: 14 }}>
        <div className="party-form-shell" style={{ maxHeight: 'none', minHeight: 0 }}>
          <div className="party-form-top">
            <Link href="/company/details" className="party-back-btn">
              <span className="party-back-arrow">←</span>
              <span>
                <strong>Back</strong>
                <small>Company</small>
              </span>
            </Link>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
              Inventory controls
            </span>
          </div>
          <form action={saveInventorySettingsFromForm} className="party-form-body">
            <div className="party-tab-panel">
              <div className="party-tab-grid">
                <div className="field field-full">
                  <label>Costing method</label>
                  <select
                    className="input"
                    name="costingMethod"
                    defaultValue={settings.costingMethod}
                  >
                    <option value="last">Last cost (purchase/GRN price overwrites unit cost)</option>
                    <option value="average">
                      Weighted average (blends existing stock value with new receipt)
                    </option>
                  </select>
                  <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                    Used for product master unit cost and COGS on sales. Average weights by total qty
                    on hand before the receipt.
                  </p>
                </div>
                <div className="field field-full">
                  <label>Negative stock</label>
                  <select
                    className="input"
                    name="negativeStockPolicy"
                    defaultValue={settings.negativeStockPolicy}
                  >
                    <option value="allow">Allow negative stock</option>
                    <option value="block">Block movements that would go negative</option>
                  </select>
                  <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                    When blocked, sales invoices, POS, purchase returns, and stock adjustments that
                    would reduce qty below zero are rejected.
                  </p>
                </div>
              </div>
            </div>
            <div className="party-form-footer">
              <Button variant="primary" type="submit">
                Save inventory settings
              </Button>
            </div>
          </form>
        </div>
      </div>
    </BookOneShell>
  );
}
