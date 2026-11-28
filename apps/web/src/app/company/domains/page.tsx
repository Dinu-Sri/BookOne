import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createCompanyDomain, listCompanyDomains, verifyCompanyDomain } from '@/app/actions/company-domains';
import { getTenantInfo } from '@/app/actions/workspace';
import { jobCanWrite } from '@/lib/access';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { TextField } from '@/components/ui/text-field';
import { CopyButton } from '@/components/settings/settings-kit';

export default async function CompanyDomainsPage() {
  let tenant;
  let domains;
  try {
    [tenant, domains] = await Promise.all([getTenantInfo(), listCompanyDomains()]);
  } catch {
    redirect('/login');
  }

  const canWrite = jobCanWrite(tenant, 'Domain Verification');

  return (
    <BookOneShell active="Domain Verification" tenant={tenant}>
      <div className="workspace ux-page set-page">
        <header className="ux-head">
          <div className="ux-head-text">
            <div>
              <h1 className="page-title">Domains</h1>
              <p>Prove you own your company&apos;s web address, so people with that email address can be recognised as your team.</p>
            </div>
          </div>
        </header>

        <div className="ux-split">
          <section className="ux-card co-card" aria-labelledby="domains-title">
            <header className="ux-card-head">
              <h2 id="domains-title">Your domains</h2>
              <span>{domains.length}</span>
            </header>

            <div className="co-list">
              {domains.length === 0 ? (
                <div className="ux-empty">
                  <strong>No domains yet.</strong>
                  <span>{canWrite ? 'Add your web address below, such as example.com.' : 'An Owner or Admin can add one.'}</span>
                </div>
              ) : null}
              {domains.map((domain) => {
                const verified = domain.status === 'verified';
                const record = `bookone-domain-verification=${domain.verificationToken}`;
                return (
                  <div className="co-domain" key={domain.id}>
                    <div className="co-domain-head">
                      <div className="co-item-text">
                        <strong>{domain.domain}</strong>
                        <span>
                          {verified && domain.verifiedAt
                            ? `Verified ${domain.verifiedAt.toISOString().slice(0, 10)}`
                            : 'Add the record below at your domain provider, then check.'}
                        </span>
                      </div>
                      <div className="cluster">
                        <Badge tone={verified ? 'success' : 'warning'}>{verified ? 'Verified' : 'Waiting for DNS'}</Badge>
                        {canWrite && !verified ? (
                          <form action={verifyCompanyDomain}>
                            <input type="hidden" name="domainId" value={domain.id} />
                            <Button variant="secondary" type="submit">
                              Check now
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                    {verified ? null : (
                      <dl className="co-dns">
                        <div>
                          <dt>Type </dt>
                          <dd>TXT</dd>
                        </div>
                        <div>
                          <dt>Name </dt>
                          <dd>
                            <code>_bookone.{domain.domain}</code>
                            <CopyButton value={`_bookone.${domain.domain}`} />
                          </dd>
                        </div>
                        <div>
                          <dt>Value </dt>
                          <dd>
                            <code className="co-dns-value" title={record}>{record}</code>
                            <CopyButton value={record} />
                          </dd>
                        </div>
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>

            {canWrite ? (
              <details className="ux-disclosure set-add" open={domains.length === 0}>
                <summary>Add a domain</summary>
                <form action={createCompanyDomain} className="set-add-grid is-single">
                  <TextField id="domain-new" name="domain" label="Domain" placeholder="example.com" required />
                  <div className="set-add-actions is-end">
                    <Button variant="primary" type="submit">
                      <Plus size={16} /> Add domain
                    </Button>
                  </div>
                </form>
              </details>
            ) : null}
          </section>

          <aside className="ux-guide set-guide" aria-label="How domain checks work">
            <h2>How it works</h2>
            <ol>
              <li>
                <strong>Add your domain</strong>
                <span>The part after @ in your work email.</span>
              </li>
              <li>
                <strong>Add the TXT record</strong>
                <span>In your domain provider&apos;s DNS settings, copy the name and value shown.</span>
              </li>
              <li>
                <strong>Check now</strong>
                <span>DNS changes can take a few hours to show. Check again later if it is still waiting.</span>
              </li>
            </ol>
          </aside>
        </div>
      </div>
    </BookOneShell>
  );
}
