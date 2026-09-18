import { redirect } from 'next/navigation';
import { getCompanySettingsData } from '@/app/actions/company-settings';
import { getDocumentStyle } from '@/app/actions/document-styles';
import { getTenantInfo } from '@/app/actions/workspace';
import { DocumentStyleForm } from '@/components/company/document-style-form';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Card, CardBody, CardHeader } from '@/components/ui/bookone-ui';

export default async function EditDocumentStylePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let tenant;
  let style;
  let masters;
  try {
    [tenant, style, masters] = await Promise.all([
      getTenantInfo(),
      getDocumentStyle(id),
      getCompanySettingsData(),
    ]);
  } catch {
    redirect('/login');
  }
  if (!style) redirect('/company/document-styles');

  return (
    <BookOneShell active="Document styles" tenant={tenant}>
      <div className="workspace">
        <Card>
          <CardHeader title={style.name} subtitle={`${style.isActive ? 'Active' : 'Not active'} · v${style.version}`} />
          <CardBody>
            <DocumentStyleForm style={style} brands={masters.brands.map((b) => ({ id: b.id, name: b.name }))} />
          </CardBody>
        </Card>
      </div>
    </BookOneShell>
  );
}
