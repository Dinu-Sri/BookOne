import { test, expect } from '../src/fixtures';
import { loadScenariosBySection } from '../src/helpers/catalog';
import { go } from '../src/helpers/nav';
import { expectAuthedShell, expectNoAppCrash } from '../src/helpers/assert';

/**
 * Catalog §26 — Reports × period matrix.
 */
const scenarios = loadScenariosBySection('26.');

function parseReportPeriod(title: string): { report: string; period?: string } {
  // e.g. "Report pnl period=current_month"
  const rm = title.match(/Report\s+(\w+)/i);
  const pm = title.match(/period\s*=\s*([\w-]+)/i);
  const reportMap: Record<string, string> = {
    pnl: 'pnl',
    balance: 'balance',
    cashflow: 'cashflow',
    ledger: 'ledger',
    trial: 'trial',
    gl: 'ledger',
  };
  const key = (rm?.[1] || 'trial').toLowerCase();
  return { report: reportMap[key] || key, period: pm?.[1] };
}

test.describe('Reports × period matrix §26 @reports @matrix @p1', () => {
  test.setTimeout(300_000);

  for (const s of scenarios) {
    test(`${s.id} ${s.title} @${s.priority.toLowerCase()}`, async ({ authedPage: page }) => {
      const { report, period } = parseReportPeriod(s.title);
      let path = `/reports?report=${report}`;
      if (period) path += `&period=${encodeURIComponent(period)}`;
      await go(page, path);
      const periodSel = page.locator('select[name="period"], .period-picker select').first();
      if (period && (await periodSel.isVisible().catch(() => false))) {
        await periodSel
          .selectOption({ label: new RegExp(period.replace(/_/g, '.*'), 'i') })
          .catch(async () => {
            await periodSel.selectOption({ index: 1 }).catch(() => undefined);
          });
        await page.waitForTimeout(400);
      }
      await expect(page.locator('.workspace, .card, table, .report-tabs').first()).toBeVisible();
      await expectAuthedShell(page);
      await expectNoAppCrash(page);
    });
  }
});
