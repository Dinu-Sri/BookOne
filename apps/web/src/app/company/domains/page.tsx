import { redirect } from 'next/navigation';
import { Globe2, Plus } from 'lucide-react';
import { createCompanyDomain, listCompanyDomains, verifyCompanyDomain } from '@/app/actions/company-domains';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { CompanyCard, EmptyLine, Field, SaveButton } from '../_components';

export default async function CompanyDomainsPage() {
  let tenant;
  let domains;
  try {
    [tenant, domains] = await Promise.all([getTenantInfo(), listCompanyDomains()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Domain Verification" tenant={tenant}>
      <div className="workspace">
        <CompanyCard title="Domain verification" subtitle="Verify your company domain using DNS TXT before domain-based organization access is enabled." action={<Globe2 size={18} color="var(--brand)" />}>
          <form action={createCompanyDomain} className="form-grid">
            <Field label="Domain" name="domain" placeholder="example.com" wide />
            <SaveButton><Plus size={16} /> Add domain</SaveButton>
          </form>

          <div className="balance-list" style={{ marginTop: 16 }}>
            <EmptyLine show={domains.length === 0}>No domains added yet.</EmptyLine>
            {domains.map((domain) => (
              <div className="balance-row" key={domain.id} style={{ alignItems: 'flex-start' }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <strong>{domain.domain}</strong>
                  <span>Add DNS TXT record at <code>_bookone.{domain.domain}</code></span>
                  <code style={{ overflowWrap: 'anywhere' }}>{`bookone-domain-verification=${domain.verificationToken}`}</code>
                  {domain.verifiedAt ? <span>Verified {domain.verifiedAt.toLocaleString()}</span> : null}
                </div>
                <div className="cluster">
                  <Badge tone={domain.status === 'verified' ? 'success' : 'warning'}>{domain.status}</Badge>
                  {domain.status !== 'verified' ? (
                    <form action={verifyCompanyDomain}>
                      <input type="hidden" name="domainId" value={domain.id} />
                      <Button variant="secondary" type="submit">Check DNS</Button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </CompanyCard>
      </div>
    </BookOneShell>
  );
}
