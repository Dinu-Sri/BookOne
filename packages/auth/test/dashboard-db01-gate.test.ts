import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../..');

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('Dashboard DB-01 source contracts', () => {
  it('dashboard page no longer treats every load error as login and does not hardcode LKR or Live/Clean', () => {
    const page = read('apps/web/src/app/dashboard/page.tsx');
    expect(page).toMatch(/getBusinessOverview/);
    expect(page).toMatch(/assertScreenAccess\('\/dashboard'\)/);
    expect(page).toMatch(/report error/);
    expect(page).not.toMatch(/MetricCard/);
    expect(page).not.toMatch(/['"]LKR /);
    expect(page).not.toMatch(/Live/);
    expect(page).not.toMatch(/Clean/);
    expect(page).not.toMatch(/Cash available/);
    expect(page).not.toMatch(/Net position/);
  });

  it('overview action enforces dashboard read and company currency', () => {
    const action = read('apps/web/src/app/actions/dashboard.ts');
    expect(action).toMatch(/assertPermission\('accounting.dashboard.read', 'read'\)/);
    expect(action).toMatch(/currentDimensionScope/);
    expect(action).toMatch(/formatCompanyMoney/);
    expect(action).toMatch(/composeDashboardMetrics/);
    expect(action).toMatch(/externalCash/);
    expect(action).toMatch(/CARD_CLEARING_CODE/);
    expect(action).not.toMatch(/redirect\('\/login'\)/);
  });

  it('cash bars share a common scale instead of independent 100% widths', () => {
    const ui = read('apps/web/src/components/dashboard/dashboard-overview.tsx');
    expect(ui).toMatch(/const max = Math.max\(Math.abs\(inValue\), Math.abs\(outValue\)/);
    expect(ui).toMatch(/Selected period/);
    expect(ui).toMatch(/As of range end/);
    expect(ui).toMatch(/dash-chart-table/);
    expect(ui).not.toMatch(/width: data\.cashFlow\.moneyIn > 0 \? '100%'/);
  });

  it('preserves AgentBridge signing-file support', () => {
    const authz = read('packages/agent-bridge/src/authz.ts');
    expect(authz).toMatch(/AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE/);
    const compose = read('docker/docker-compose.staging.yml');
    expect(compose).toMatch(/agent_bridge_oauth_signing\.pem/);
  });

  it('metric dictionary exists', () => {
    const doc = read('docs/DASHBOARD_METRICS.md');
    expect(doc).toMatch(/DB01-NS/);
    expect(doc).toMatch(/DB01-OR/);
    expect(doc).toMatch(/DB01-NCM/);
    expect(doc).toMatch(/DB01-CB/);
    expect(doc).toMatch(/Availability matrix/);
  });
});
