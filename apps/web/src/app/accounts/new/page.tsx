import { redirect } from 'next/navigation';
import { getTenantInfo, listAccountsWithBalances } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { CoaWizard } from '@/components/accounts/coa-wizard';
import { assertScreenAccess, jobCanWrite } from '@/lib/access';
import type { WizardTemplateId } from '@bookone/accounting';

export default async function NewAccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ template?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  let tenant;
  let accounts;
  try {
    [tenant, accounts] = await Promise.all([getTenantInfo(), listAccountsWithBalances()]);
  } catch {
    redirect('/login?from=/accounts/new');
  }
  await assertScreenAccess('/accounts', 'read');
  if (!jobCanWrite(tenant, 'Accounts')) redirect('/accounts');
  const template = (params.template as WizardTemplateId | undefined) ?? 'bank';

  return (
    <BookOneShell active="Accounts" tenant={tenant}>
      <div className="workspace party-workspace">
        <CoaWizard defaultTemplate={template} accounts={accounts} />
      </div>
    </BookOneShell>
  );
}
