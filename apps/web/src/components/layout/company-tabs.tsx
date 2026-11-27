import Link from 'next/link';

/** Company profile pages shown as one tabbed screen (the menu keeps only "Company Details"). */
export const COMPANY_TABS: Array<{ label: string; tab: string; href: string }> = [
  { label: 'Company Details', tab: 'Details', href: '/company/details' },
  { label: 'Tax Info', tab: 'Tax', href: '/company/tax' },
  { label: 'Brands', tab: 'Brands', href: '/company/brands' },
  { label: 'Locations', tab: 'Locations', href: '/company/locations' },
  { label: 'Domain Verification', tab: 'Domains', href: '/company/domains' },
  { label: 'Team', tab: 'People', href: '/company/team' },
  { label: 'Jobs', tab: 'Jobs', href: '/company/team/jobs' },
];

export const COMPANY_TAB_LABELS = new Set(COMPANY_TABS.map((t) => t.label));

export function CompanyTabs({
  active,
  accessByLabel,
}: {
  active: string;
  accessByLabel?: Record<string, 'none' | 'read' | 'write'>;
}) {
  const tabs = COMPANY_TABS.filter((t) => !accessByLabel || (accessByLabel[t.label] ?? 'read') !== 'none' || t.label === active);
  return (
    <nav className="company-tabs" aria-label="Company">
      <div className="ux-tabs">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={t.label === active ? 'page' : undefined}>
            {t.tab}
          </Link>
        ))}
      </div>
    </nav>
  );
}
