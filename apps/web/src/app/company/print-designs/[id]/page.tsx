import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireTenantContext } from '@bookone/auth';
import { companyProfiles, db, eq, withTenantContext } from '@bookone/db';
import { PRINT_KIND_INFO, paperLabel, samplePrintData, validateDesign } from '@bookone/print-design';
import { getTenantInfo } from '@/app/actions/workspace';
import { approvePrintDesign, stopUsingPrintDesign } from '@/app/actions/print-designs';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { DesignPrintSheet } from '@/components/print/design-print-sheet';
import { DeleteDesignVersion } from '@/components/print-designs/delete-version';
import { DesignStatusBadge, madeBy, shortDate } from '@/components/print-designs/design-labels';
import { Button } from '@/components/ui/bookone-ui';
import { assetKeys, assetUrls, companyTin, getVersion, listVersions } from '@/lib/print-designs';
import { companyFromProfile } from '@/lib/print-data';

const DONE: Record<string, string> = {
  approved: 'Approved. New prints of this item use this design from now on.',
  stopped: 'Back to the BookOne standard print for this item. This design is kept.',
  saved: 'Saved as a new version. Check the preview, then approve it to use it.',
};

export default async function PrintDesignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; done?: string }>;
}) {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login?from=/company/print-designs');
  }
  const level = tenant.accessByLabel?.['Document styles'] ?? 'none';
  if (level === 'none') redirect(tenant.landingHref ?? '/?denied=1');
  const canWrite = level === 'write';
  const { id } = await params;
  const q = await searchParams;
  const user = await requireTenantContext();
  const v = await getVersion(user.tenantId, id);
  if (!v) redirect('/company/print-designs');
  const info = PRINT_KIND_INFO[v.kind];

  const { family, keys, data } = await withTenantContext(user.tenantId, async () => {
    const [all, images, keys, tin, rows] = await Promise.all([
      listVersions(user.tenantId, v.kind),
      assetUrls(user.tenantId),
      assetKeys(user.tenantId),
      companyTin(user.tenantId),
      db().select().from(companyProfiles).where(eq(companyProfiles.tenantId, user.tenantId)).limit(1),
    ]);
    const sample = samplePrintData(v.kind);
    // Real company details and images, sample customer and lines.
    const data = { ...sample, company: companyFromProfile(rows[0] ?? null, tin, tenant.name), assets: images };
    return { family: all.filter((x) => x.familyId === v.familyId).sort((a, b) => b.version - a.version), keys, data };
  });
  const check = validateDesign(v.kind, v.design, { assets: { logo: !!keys.logo, signature: !!keys.signature, stamp: !!keys.stamp } });
  const warnings = check.warnings.map((w) => w.message);

  return (
    <BookOneShell active="Print designs" tenant={tenant}>
      <div className="workspace ux-page pdd">
        <header className="ux-head">
          <div className="ux-head-text">
            <Link href={`/company/print-designs?item=${v.kind}`} className="ux-back" aria-label="Back to print designs">
              <ArrowLeft size={16} aria-hidden />
            </Link>
            <div>
              <h1 className="page-title">
                {v.name} <span className="pdd-version">version {v.version}</span>
              </h1>
              <p>
                {info.label} · {paperLabel(v.design.paper)} · made {madeBy(v)} on {shortDate(v.createdAt)}
              </p>
            </div>
          </div>
          <div className="ux-head-actions">
            <DesignStatusBadge v={v} />
            {canWrite ? (
              <Link href={`/company/print-designs/${v.id}/edit`} className="button secondary">
                Edit as new version
              </Link>
            ) : null}
            {canWrite && !v.inUse ? (
              <form action={approvePrintDesign}>
                <input type="hidden" name="id" value={v.id} />
                <Button type="submit" variant="primary">
                  Approve and use
                </Button>
              </form>
            ) : null}
            {canWrite && v.inUse ? (
              <form action={stopUsingPrintDesign}>
                <input type="hidden" name="kind" value={v.kind} />
                <input type="hidden" name="id" value={v.id} />
                <Button type="submit" variant="secondary">
                  Use BookOne standard
                </Button>
              </form>
            ) : null}
          </div>
        </header>

        {q.err ? (
          <p className="pdh-flash is-error" role="alert">
            {q.err}
          </p>
        ) : q.done && DONE[q.done] ? (
          <p className="pdh-flash is-ok" role="status">
            {DONE[q.done]}
          </p>
        ) : null}

        <div className="pdd-grid">
          <aside className="pdd-side">
            <section className="ux-card">
              <header className="ux-card-head">
                <h2>Before you approve</h2>
              </header>
              <div className="ux-card-body">
                <p>
                  The preview uses your company details and images with a sample customer and items. Check the title,
                  your details, the columns and the totals.
                </p>
                {warnings.length ? (
                  <ul className="pdd-warnings">
                    {warnings.map((w) => (
                      <li key={w}>
                        {w}{' '}
                        {/upload/i.test(w) ? <Link href="/company/print-designs#images">Upload now</Link> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="pdd-ok">Meets every rule for a {info.label.toLowerCase()}.</p>
                )}
                {v.changeNote ? (
                  <div className="pdd-note">
                    <strong>Note {madeBy(v)}</strong>
                    <span>{v.changeNote}</span>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="ux-card">
              <header className="ux-card-head">
                <h2>Versions</h2>
                <span>{family.length}</span>
              </header>
              <ol className="pdh-versions pdd-versions">
                {family.map((x) => (
                  <li key={x.id}>
                    <Link href={`/company/print-designs/${x.id}`} aria-current={x.id === v.id ? 'page' : undefined}>
                      <span className="pdh-v">v{x.version}</span>
                      <span className="pdh-v-meta">
                        {madeBy(x)} · {shortDate(x.createdAt)}
                      </span>
                      <DesignStatusBadge v={x} />
                    </Link>
                  </li>
                ))}
              </ol>
            </section>

            {canWrite && !v.inUse ? (
              <div className="pdd-danger">
                <DeleteDesignVersion id={v.id} label={`${v.name} version ${v.version}`} />
              </div>
            ) : null}
          </aside>

          <section className="pdd-preview" aria-label="Preview">
            <DesignPrintSheet design={v.design} data={data} preview embedded />
          </section>
        </div>
      </div>
    </BookOneShell>
  );
}
