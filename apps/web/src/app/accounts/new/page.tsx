import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CoaWizard } from '@/components/accounts/coa-wizard';
import { assertScreenAccess, jobCanWrite } from '@/lib/access';
import type { WizardTemplateId } from '@bookone/accounting';

export default async function NewAccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ template?: string }>;
}) {
  await assertScreenAccess('/accounts', 'write');
  const params = searchParams ? await searchParams : {};
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login?from=/accounts/new');
  }
  if (!jobCanWrite(tenant, 'Accounts')) redirect('/accounts');
  const template = (params.template as WizardTemplateId | undefined) ?? 'bank';

  return (
    <BookOneShell active="Accounts" tenant={tenant}>
      <div className="workspace">
        <CoaWizard defaultTemplate={template} />
      </div>
    </BookOneShell>
  );
}
