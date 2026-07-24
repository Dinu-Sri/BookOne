/**
 * E2E buckets — run one domain pack at a time from /e2e or CLI.
 * E2E_SUITE can be a bucket id (auth, sales, …) or a preset (smoke, p0, core, full).
 */

export type E2eBucket = {
  id: string;
  label: string;
  description: string;
  /** Human time estimate */
  eta: string;
  /** Spec files relative to tests/ */
  files: string[];
  /** UI grouping */
  group: 'foundation' | 'money' | 'platform' | 'matrix' | 'depth';
};

export const E2E_BUCKETS: E2eBucket[] = [
  {
    id: 'smoke',
    label: 'Smoke',
    description: 'Login + core accounting routes + public docs',
    eta: '~2 min',
    files: ['00-smoke.spec.ts'],
    group: 'foundation',
  },
  {
    id: 'auth',
    label: 'Auth & session',
    description: 'Login, logout, deep link, remember-me (S-0001…)',
    eta: '~5–10 min',
    files: ['01-auth.spec.ts'],
    group: 'foundation',
  },
  {
    id: 'public',
    label: 'Public surfaces',
    description: 'Docs, search API, /e2e console',
    eta: '~3–5 min',
    files: ['02-public.spec.ts'],
    group: 'foundation',
  },
  {
    id: 'shell',
    label: 'Shell & routes',
    description: 'Sidebar, period, tenant route smoke',
    eta: '~10–15 min',
    files: ['03-shell-routes.spec.ts'],
    group: 'foundation',
  },
  {
    id: 'company',
    label: 'Company masters',
    description: 'Brand, location, tax, company details',
    eta: '~10–15 min',
    files: ['04-company-masters.spec.ts'],
    group: 'foundation',
  },
  {
    id: 'products',
    label: 'Parties & products',
    description: 'Customers, vendors, product/stock P0',
    eta: '~15–25 min',
    files: ['05-parties-products.spec.ts'],
    group: 'money',
  },
  {
    id: 'sales',
    label: 'Sales lifecycle',
    description: 'QT → SO → INV, payments, returns',
    eta: '~20–35 min',
    files: ['06-sales-journey.spec.ts'],
    group: 'money',
  },
  {
    id: 'purchase',
    label: 'Purchase & inventory',
    description: 'PO, GRN, bills, stock ops',
    eta: '~20–35 min',
    files: ['07-purchase-inventory.spec.ts'],
    group: 'money',
  },
  {
    id: 'accounting',
    label: 'Accounting',
    description: 'Simple Entry, journal, reports, recon',
    eta: '~15–25 min',
    files: ['08-accounting.spec.ts'],
    group: 'money',
  },
  {
    id: 'pos',
    label: 'POS',
    description: 'Terminal, shift, cart',
    eta: '~10–20 min',
    files: ['09-pos.spec.ts'],
    group: 'money',
  },
  {
    id: 'security',
    label: 'Security & edges',
    description: 'Tenancy, XSS/SQL-ish search, session',
    eta: '~10–15 min',
    files: ['10-edges-security.spec.ts'],
    group: 'platform',
  },
  {
    id: 'integrity',
    label: 'Integrity',
    description: 'Journal balance, TB, AR/AP, stock',
    eta: '~10–15 min',
    files: ['11-integrity.spec.ts'],
    group: 'platform',
  },
  {
    id: 'settings-save',
    label: 'Settings save',
    description: 'Company settings pages persist',
    eta: '~5–10 min',
    files: ['12-settings-save.spec.ts'],
    group: 'platform',
  },
  {
    id: 'validation',
    label: 'Validation catalog',
    description: 'Error classes §17',
    eta: '~15–25 min',
    files: ['13-validation-catalog.spec.ts'],
    group: 'platform',
  },
  {
    id: 'routes',
    label: 'Route smoke IDs',
    description: 'Every catalog route load (S-0511…)',
    eta: '~15–25 min',
    files: ['14-route-smoke-ids.spec.ts'],
    group: 'platform',
  },
  {
    id: 'business-day',
    label: 'Business-day journeys',
    description: 'Composed day flows §12',
    eta: '~20–30 min',
    files: ['15-business-day.spec.ts'],
    group: 'money',
  },
  {
    id: 'parties',
    label: 'Parties catalog',
    description: 'Full parties §7',
    eta: '~15–25 min',
    files: ['16-parties-catalog.spec.ts'],
    group: 'money',
  },
  {
    id: 'platform',
    label: 'Control Room & health',
    description: 'Platform console + health-check steps',
    eta: '~10–20 min',
    files: ['17-platform.spec.ts'],
    group: 'platform',
  },
  {
    id: 'settings-matrix',
    label: 'Settings matrix',
    description: 'VAT, GRN, credit limit, costing toggles',
    eta: '~15–25 min',
    files: ['18-settings-matrix.spec.ts'],
    group: 'matrix',
  },
  {
    id: 'mid-op',
    label: 'Mid-op edit/delete',
    description: 'Edit/delete edges §13',
    eta: '~15–25 min',
    files: ['19-mid-op-edges.spec.ts'],
    group: 'matrix',
  },
  {
    id: 'qty-price',
    label: 'Qty × price matrix',
    description: 'Numeric micro-matrix §23',
    eta: '~20–40 min',
    files: ['20-qty-price-matrix.spec.ts'],
    group: 'matrix',
  },
  {
    id: 'numeric',
    label: 'Numeric edges',
    description: 'Zero/negative/large amounts §16',
    eta: '~20–40 min',
    files: ['21-numeric-edges.spec.ts'],
    group: 'matrix',
  },
  {
    id: 'reports-period',
    label: 'Reports × period',
    description: 'Report tabs × period matrix §26',
    eta: '~15–30 min',
    files: ['22-reports-period-matrix.spec.ts'],
    group: 'matrix',
  },
  {
    id: 'payment-status',
    label: 'Payment & doc status',
    description: 'Payment methods + document status §24–25',
    eta: '~20–40 min',
    files: ['23-payment-status-matrix.spec.ts'],
    group: 'matrix',
  },
  {
    id: 'ui',
    label: 'UI / UX',
    description: 'Non-functional UI checks §20',
    eta: '~10–15 min',
    files: ['24-ui-ux.spec.ts'],
    group: 'depth',
  },
  {
    id: 'stress',
    label: 'Stress / rare',
    description: 'Scale and rare ops §21 (slow)',
    eta: '~30–60 min',
    files: ['25-stress.spec.ts'],
    group: 'depth',
  },
  {
    id: 'remainder',
    label: 'Domain remainders',
    description: 'P1–P3 catalog remainders §6/8–12/15/19',
    eta: '~1–2 h',
    files: ['26-domain-remainder.spec.ts'],
    group: 'depth',
  },
  {
    id: 'sweep',
    label: 'Catalog sweep',
    description: 'Coverage stragglers',
    eta: '~5–15 min',
    files: ['27-catalog-sweep.spec.ts'],
    group: 'depth',
  },
];

/** Named multi-bucket presets for daily / weekly runs. */
export const E2E_PRESETS: Record<string, { label: string; description: string; eta: string; buckets: string[] }> = {
  smoke: {
    label: 'Smoke only',
    description: 'Fastest green-light',
    eta: '~2 min',
    buckets: ['smoke'],
  },
  p0: {
    label: 'P0 critical',
    description: 'Auth through validation (money paths)',
    eta: '~45–90 min',
    buckets: [
      'smoke',
      'auth',
      'public',
      'shell',
      'company',
      'products',
      'sales',
      'purchase',
      'accounting',
      'pos',
      'security',
      'integrity',
      'settings-save',
      'validation',
    ],
  },
  core: {
    label: 'Core daily',
    description: 'Recommended daily — no matrices/stress',
    eta: '~1.5–2.5 h',
    buckets: [
      'smoke',
      'auth',
      'public',
      'shell',
      'company',
      'products',
      'sales',
      'purchase',
      'accounting',
      'pos',
      'security',
      'integrity',
      'settings-save',
      'validation',
      'routes',
      'business-day',
      'parties',
      'platform',
      'settings-matrix',
      'mid-op',
      'ui',
    ],
  },
  full: {
    label: 'Full catalog',
    description: 'All buckets including matrices & remainder',
    eta: 'multi-hour',
    buckets: E2E_BUCKETS.map((b) => b.id),
  },
};

export function getBucket(id: string): E2eBucket | undefined {
  return E2E_BUCKETS.find((b) => b.id === id);
}

export function resolveSuiteToFiles(suite: string): { files: string[]; kind: 'bucket' | 'preset' | 'unknown'; label: string } {
  const key = suite.toLowerCase().trim();
  const bucket = getBucket(key);
  if (bucket) {
    return { files: bucket.files, kind: 'bucket', label: bucket.label };
  }
  const preset = E2E_PRESETS[key];
  if (preset) {
    const files = [
      ...new Set(
        preset.buckets.flatMap((id) => getBucket(id)?.files ?? []),
      ),
    ];
    return { files, kind: 'preset', label: preset.label };
  }
  // default core
  const core = E2E_PRESETS.core!;
  const files = [...new Set(core.buckets.flatMap((id) => getBucket(id)?.files ?? []))];
  return { files, kind: 'preset', label: core.label };
}

export function bucketIdForFile(file: string): string {
  const base = file.replace(/^.*[/\\]/, '');
  const b = E2E_BUCKETS.find((x) => x.files.includes(base));
  return b?.id ?? 'other';
}

export function listBucketsForApi() {
  return {
    buckets: E2E_BUCKETS,
    presets: Object.entries(E2E_PRESETS).map(([id, p]) => ({ id, ...p })),
  };
}
