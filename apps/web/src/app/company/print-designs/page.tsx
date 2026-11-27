import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@bookone/auth';
import { PRINT_KINDS, PRINT_KIND_INFO, isPrintKind, type PrintKind } from '@bookone/print-design';
import { getTenantInfo } from '@/app/actions/workspace';
import { removePrintAsset, startPrintDesign, stopUsingPrintDesign } from '@/app/actions/print-designs';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { AssetUploadButton } from '@/components/print-designs/asset-upload';
import { DesignStatusBadge, madeBy, shortDate as when } from '@/components/print-designs/design-labels';
import { assetUrls, listVersions, printItemsOverview } from '@/lib/print-designs';
import { withTenantContext } from '@bookone/db';

const DONE: Record<string, string> = {
  deleted: 'Design version deleted.',
  stopped: 'Back to the BookOne standard print for this item.',
  image: 'Image saved.',
  'image-removed': 'Image removed.',
};

export default async function PrintDesignsPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string; err?: string; done?: string }>;
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
  const q = await searchParams;
  const user = await requireTenantContext();
  const [items, versions, images] = await Promise.all([
    withTenantContext(user.tenantId, () => printItemsOverview(user.tenantId)),
    listVersions(user.tenantId),
    withTenantContext(user.tenantId, () => assetUrls(user.tenantId)),
  ]);
  const waiting = versions.filter((v) => v.status === 'awaiting_approval');
  const selected: PrintKind = q.item && isPrintKind(q.item) ? q.item : waiting[0]?.kind ?? 'invoice';
  const info = PRINT_KIND_INFO[selected];
  const item = items.find((i) => i.kind === selected)!;
  const mine = versions.filter((v) => v.kind === selected);
  const families = [...new Set(mine.map((v) => v.familyId))].map((fam) => {
    const list = mine.filter((v) => v.familyId === fam).sort((a, b) => b.version - a.version);
    return { familyId: fam, name: list[0]!.name, latest: list[0]!, versions: list, inUse: list.find((v) => v.inUse) ?? null };
  });

  return (
    <BookOneShell active="Print designs" tenant={tenant}>
      <div className="workspace ux-page pdh">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Print designs</h1>
              <p>
                Choose how each document looks on paper. Ask your AI assistant to copy a design from a photo, or edit one
                here. Nothing changes on paper until you approve it.
              </p>
            </div>
          </div>
          <div className="ux-head-actions">
            <a href="#images" className="pdh-quiet">
              Logo and images
            </a>
            <Link href="/company/document-styles" className="pdh-quiet">
              Standard look
            </Link>
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

        {waiting.length > 0 ? (
          <section className="ux-next" aria-label="Waiting for approval">
            <div className="ux-next-row is-warn">
              <div>
                <strong>
                  {waiting.length} design{waiting.length === 1 ? ' is' : 's are'} waiting for your approval.
                </strong>
                <span>
                  {waiting
                    .slice(0, 3)
                    .map((w) => `${PRINT_KIND_INFO[w.kind].label}: ${w.name} v${w.version} ${madeBy(w)}`)
                    .join(' · ')}
                </span>
              </div>
              <Link href={`/company/print-designs/${waiting[0]!.id}`} className="button primary">
                Review
              </Link>
            </div>
          </section>
        ) : null}

        <div className="pdh-grid">
          <nav className="ux-card pdh-items" aria-label="Print items">
            <header className="ux-card-head">
              <h2>Print items</h2>
              <span>{PRINT_KINDS.length}</span>
            </header>
            <ul>
              {items.map((it) => (
                <li key={it.kind}>
                  <Link
                    href={`/company/print-designs?item=${it.kind}`}
                    aria-current={it.kind === selected ? 'page' : undefined}
                    className={it.kind === selected ? 'is-current' : undefined}
                  >
                    <span className="pdh-item-name">{it.label}</span>
                    <span className="pdh-item-use">{it.inUse ? `${it.inUse.name} v${it.inUse.version}` : 'BookOne standard'}</span>
                    {it.awaitingApproval ? <span className="pdh-dot" aria-label={`${it.awaitingApproval} waiting`} /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <section className="ux-card pdh-detail" aria-labelledby="pdh-item-title">
            <header className="ux-card-head pdh-detail-head">
              <div>
                <h2 id="pdh-item-title">{info.label}</h2>
                <p>{info.description}</p>
              </div>
              {canWrite ? (
                <form action={startPrintDesign} className="pdh-new">
                  <input type="hidden" name="kind" value={selected} />
                  <input type="hidden" name="name" value={`${info.label} design`} />
                  <Button type="submit" variant="primary">
                    New design
                  </Button>
                </form>
              ) : null}
            </header>

            <div className="pdh-use">
              <div>
                <span className="pdh-use-label">Printing now</span>
                <strong>{item.inUse ? `${item.inUse.name} · version ${item.inUse.version}` : 'BookOne standard'}</strong>
                <span className="ux-muted">
                  {item.inUse
                    ? 'Every new print of this item uses this design. Documents printed before keep their design.'
                    : 'The standard print, with your logo and colour from Standard look.'}
                </span>
              </div>
              {item.inUse && canWrite ? (
                <form action={stopUsingPrintDesign}>
                  <input type="hidden" name="kind" value={selected} />
                  <Button type="submit" variant="ghost">
                    Use BookOne standard
                  </Button>
                </form>
              ) : null}
            </div>

            {families.length === 0 ? (
              <div className="pdh-empty">
                <strong>No designs for {info.label.toLowerCase()} yet.</strong>
                <span>
                  Press New design to start from the BookOne starting design, or ask your assistant in chat: &quot;Design my{' '}
                  {info.label.toLowerCase()} like this photo&quot;.
                </span>
              </div>
            ) : (
              <ul className="pdh-families">
                {families.map((f) => (
                  <li key={f.familyId} className="pdh-family">
                    <div className="pdh-family-head">
                      <div>
                        <strong>{f.name}</strong>
                        <span className="ux-muted">
                          {f.versions.length} version{f.versions.length === 1 ? '' : 's'} · latest v{f.latest.version}{' '}
                          {madeBy(f.latest)}, {when(f.latest.createdAt)}
                        </span>
                      </div>
                      <DesignStatusBadge v={f.inUse ?? f.latest} />
                    </div>
                    <ol className="pdh-versions">
                      {f.versions.map((v) => (
                        <li key={v.id}>
                          <Link href={`/company/print-designs/${v.id}`}>
                            <span className="pdh-v">v{v.version}</span>
                            <span className="pdh-v-note">{v.changeNote || 'No note'}</span>
                            <span className="pdh-v-meta">
                              {madeBy(v)} · {when(v.createdAt)}
                            </span>
                            <DesignStatusBadge v={v} />
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="ux-card" id="images" aria-labelledby="pdh-images-title">
          <header className="ux-card-head">
            <h2 id="pdh-images-title">Logo and images</h2>
            <span>Used by designs that show a logo, signature or stamp</span>
          </header>
          <div className="ux-rows">
            {(
              [
                ['logo', 'Logo', 'Your company logo. PNG with a clear background prints best.'],
                ['signature', 'Signature', 'A scanned signature for the signature line, if your designs use it.'],
                ['stamp', 'Company stamp', 'Your stamp or seal, if your designs show it.'],
              ] as const
            ).map(([slot, title, text]) => (
              <div className="ux-row pdh-asset" key={slot}>
                <div className="pdh-asset-img">
                  {images[slot] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={images[slot]!} alt={`${title} preview`} />
                  ) : (
                    <span>None</span>
                  )}
                </div>
                <div className="ux-row-text">
                  <strong>
                    {title} {images[slot] ? <Badge tone="success">Uploaded</Badge> : <Badge tone="neutral">Not uploaded</Badge>}
                  </strong>
                  <span>{text}</span>
                </div>
                {canWrite ? (
                  <div className="ux-row-side">
                    <AssetUploadButton slot={slot} label={images[slot] ? 'Replace' : 'Upload'} />
                    {images[slot] && slot !== 'logo' ? (
                      <form action={removePrintAsset}>
                        <input type="hidden" name="slot" value={slot} />
                        <Button type="submit" variant="ghost">
                          Remove
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>
    </BookOneShell>
  );
}
