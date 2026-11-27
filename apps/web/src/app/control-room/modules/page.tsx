import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listModuleMatrix } from '@/app/actions/platform';
import { getTenantInfo } from '@/app/actions/workspace';
import { isPlatformAdmin } from '@/lib/platform-admin';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { MODULE_CATALOG, MODULE_KEYS } from '@/lib/platform-modules';
import { StatusBadge } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';
import { ModuleSwitch } from '@/components/control-room/module-switch';

export default async function ControlRoomModulesPage() {
  let tenant;
  let matrix;
  try {
    tenant = await getTenantInfo();
    if (!isPlatformAdmin(tenant)) {
      redirect('/');
    }
    matrix = await listModuleMatrix();
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Modules" tenant={tenant}>
      <div className="workspace ux-page cr-modules">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Modules</h1>
              <p>Turn a module on or off for any company with one switch. Changes apply straight away and are recorded in the audit log.</p>
            </div>
          </div>
        </header>
        <div className="party-toolbar">
          <div className="cluster" style={{ gap: 8, flexWrap: 'wrap' }}>
            {MODULE_CATALOG.map((m) => (
              <span key={m.key} className={`badge ${m.alwaysOn ? 'success' : 'neutral'}`}>
                {m.name}
                {m.alwaysOn ? ' · core' : ''}
              </span>
            ))}
          </div>
          <Link href="/control-room/companies" style={{ marginLeft: 'auto' }}>
            <Button variant="secondary" type="button">
              Manage companies
            </Button>
          </Link>
        </div>

        <Card>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Plan</th>
                    <th>Status</th>
                    {MODULE_KEYS.map((k) => (
                      <th key={k} className="cr-mod-cell">
                        {MODULE_CATALOG.find((m) => m.key === k)?.name ?? k}
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {matrix.length === 0 ? (
                    <tr>
                      <td colSpan={4 + MODULE_KEYS.length} style={{ color: 'var(--ink-muted)' }}>
                        No companies
                      </td>
                    </tr>
                  ) : (
                    matrix.map((row) => (
                      <tr key={row.id}>
                        <td style={{ fontWeight: 700 }}>{row.name}</td>
                        <td style={{ textTransform: 'capitalize' }}>{row.plan}</td>
                        <td>
                          <StatusBadge status={row.status === 'active' ? 'active' : 'inactive'} />
                        </td>
                        {MODULE_KEYS.map((k) => (
                          <td key={k} className="cr-mod-cell">
                            <ModuleSwitch
                              companyId={row.id}
                              companyName={row.name}
                              moduleKey={k}
                              moduleName={MODULE_CATALOG.find((m) => m.key === k)?.name ?? k}
                              on={Boolean(row.modules[k])}
                            />
                          </td>
                        ))}
                        <td>
                          <Link href={`/control-room/companies/${row.id}`}>
                            <Button variant="ghost" type="button">
                              Edit
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>
    </BookOneShell>
  );
}
