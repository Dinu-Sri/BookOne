import Link from 'next/link';
import { BookOpenCheck, Building2, Calculator, CheckCircle2, Package, ShieldCheck, ShoppingCart, Users } from 'lucide-react';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Button } from '@/components/ui/bookone-ui';

const moduleRows = [
  {
    name: 'Accounting',
    status: 'Always on',
    summary: 'Core ledger, simple entry, journal, reports, accounts, and reconciliation.',
    icon: BookOpenCheck,
    locked: true,
  },
  {
    name: 'Company',
    status: 'Always on',
    summary: 'Company profile, tax details, brands, locations, and domain verification.',
    icon: Building2,
    locked: true,
  },
  {
    name: 'Tax',
    status: 'Available soon',
    summary: 'Tax dashboard, returns, tax invoices, and compliance workflows.',
    icon: Calculator,
    locked: false,
  },
  {
    name: 'Inventory',
    status: 'Available soon',
    summary: 'Items, stock ledger, purchases, and warehouse/location stock controls.',
    icon: Package,
    locked: false,
  },
  {
    name: 'POS',
    status: 'Available soon',
    summary: 'Registers, sales, shifts, devices, and live selling operations.',
    icon: ShoppingCart,
    locked: false,
  },
  {
    name: 'HR',
    status: 'Available soon',
    summary: 'Employees, payroll, attendance, leave, and staff records.',
    icon: Users,
    locked: false,
  },
];

export default async function ControlRoomModulesPage() {
  const tenant = await getTenantInfo();

  return (
    <BookOneShell active="Modules" tenant={tenant}>
      <section className="workspace">
        <div className="page-heading">
          <div>
            <div className="eyebrow">CONTROL ROOM</div>
            <h1 className="h1">Modules</h1>
            <p className="lead">Accounting and Company are core modules. Future modules will be enabled here per company after their screens and data boundaries are ready.</p>
          </div>
          <span className="badge info">
            <ShieldCheck size={14} /> Super admin
          </span>
        </div>

        <div className="card pad" style={{ marginBottom: 14 }}>
          <div className="cluster" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 className="card-title">ERP Health Check</h2>
              <p className="card-subtitle" style={{ marginTop: 4 }}>
                Run a mini business day on a staging company and see pass/fail for every step in one place.
              </p>
            </div>
            <Link href="/control-room/health-check">
              <Button variant="primary" type="button">
                Open health check
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid three">
          {moduleRows.map((module) => (
            <article className="card pad" key={module.name}>
              <div className="cluster" style={{ justifyContent: 'space-between' }}>
                <span className={module.locked ? 'badge success' : 'badge neutral'}>
                  {module.locked ? <CheckCircle2 size={14} /> : null}
                  {module.status}
                </span>
                <module.icon size={18} color="var(--brand-strong)" />
              </div>
              <h2 className="card-title" style={{ marginTop: 14 }}>{module.name}</h2>
              <p className="card-subtitle">{module.summary}</p>
            </article>
          ))}
        </div>
      </section>
    </BookOneShell>
  );
}
