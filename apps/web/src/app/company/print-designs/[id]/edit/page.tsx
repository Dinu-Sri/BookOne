import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireTenantContext } from '@bookone/auth';
import { companyProfiles, db, eq, withTenantContext } from '@bookone/db';
import { PRINT_KIND_INFO, samplePrintData } from '@bookone/print-design';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { DesignEditor } from '@/components/print-designs/design-editor';
import { assetKeys, assetUrls, companyTin, getVersion } from '@/lib/print-designs';
import { companyFromProfile } from '@/lib/print-data';

export default async function PrintDesignEditPage({ params }: { params: Promise<{ id: string }> }) {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login?from=/company/print-designs');
  }
  const level = tenant.accessByLabel?.['Document styles'] ?? 'none';
  const { id } = await params;
  if (level !== 'write') redirect(level === 'none' ? (tenant.landingHref ?? '/?denied=1') : `/company/print-designs/${id}`);
  const user = await requireTenantContext();
  const v = await getVersion(user.tenantId, id);
  if (!v) redirect('/company/print-designs');

  const { data, has } = await withTenantContext(user.tenantId, async () => {
    const [images, keys, tin, rows] = await Promise.all([
      assetUrls(user.tenantId),
      assetKeys(user.tenantId),
      companyTin(user.tenantId),
      db().select().from(companyProfiles).where(eq(companyProfiles.tenantId, user.tenantId)).limit(1),
    ]);
    return {
      data: { ...samplePrintData(v.kind), company: companyFromProfile(rows[0] ?? null, tin, tenant.name), assets: images },
      has: { logo: !!keys.logo, signature: !!keys.signature, stamp: !!keys.stamp },
    };
  });

  return (
    <BookOneShell active="Print designs" tenant={tenant}>
      <div className="workspace pde-page">
        <header className="ux-head">
          <div className="ux-head-text">
            <Link href={`/company/print-designs/${v.id}`} className="ux-back" aria-label="Back to the design">
              <ArrowLeft size={16} aria-hidden />
            </Link>
            <div>
              <h1 className="page-title">Edit {PRINT_KIND_INFO[v.kind].label.toLowerCase()} design</h1>
              <p>
                Starting from {v.name} version {v.version}. Saving makes version {v.version + 1}; nothing changes on paper
                until you approve it.
              </p>
            </div>
          </div>
        </header>
        <DesignEditor basedOnId={v.id} kind={v.kind} initialName={v.name} initial={v.design} data={data} assets={has} />
      </div>
    </BookOneShell>
  );
}
