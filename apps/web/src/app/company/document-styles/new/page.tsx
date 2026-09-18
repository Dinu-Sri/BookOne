import { redirect } from 'next/navigation';
import { getCompanySettingsData } from '@/app/actions/company-settings';
import { getTenantInfo } from '@/app/actions/workspace';
import { DocumentStyleForm } from '@/components/company/document-style-form';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Card, CardBody, CardHeader } from '@/components/ui/bookone-ui';

export default async function NewDocumentStylePage() {
  let tenant;
  let masters;
  try {
    [tenant, masters] = await Promise.all([getTenantInfo(), getCompanySettingsData()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Document styles" tenant={tenant}>
      <div className="workspace">
        <Card>
          <CardHeader title="New document style" subtitle="Does not change prints until you Make active." />
          <CardBody>
            <DocumentStyleForm brands={masters.brands.map((b) => ({ id: b.id, name: b.name }))} />
          </CardBody>
        </Card>
      </div>
    </BookOneShell>
  );
}
