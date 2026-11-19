import { redirect } from 'next/navigation';
import { isSpendableCashCode } from '@bookone/accounting';
import { listAdvanceParties, listOpenAdvanceDocuments, listPartyAdvances } from '@/app/actions/advances';
import { getTenantInfo, listAccountsWithBalances } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { AdvancesPanel } from '@/components/advances/advances-panel';
import { assertPermission, jobCanWrite } from '@/lib/access';

export default async function AdvancesPage() {
  let tenant;
  let advances;
  let people;
  let documents;
  let accounts;
  try {
    [tenant, advances, people, documents, accounts] = await Promise.all([
      getTenantInfo(),
      listPartyAdvances(),
      listAdvanceParties(),
      listOpenAdvanceDocuments(),
      listAccountsWithBalances(),
    ]);
  } catch {
    redirect('/login?from=/advances');
  }
  await assertPermission('accounting.accounts.read', 'read', { surface: 'rsc' });
  const canWrite =
    jobCanWrite(tenant, 'Receive Payments') ||
    jobCanWrite(tenant, 'Pay Vendors') ||
    jobCanWrite(tenant, 'Simple Entry') ||
    jobCanWrite(tenant, 'Accounts');
  const cashAccounts = accounts
    .filter((row) => row.isActive !== '0' && row.isGroup !== '1' && isSpendableCashCode(row.code))
    .map((row) => ({ code: row.code, name: row.name }));

  return (
    <BookOneShell active="Advances" tenant={tenant}>
      <AdvancesPanel
        advances={advances}
        parties={people}
        documents={documents}
        cashAccounts={cashAccounts}
        canWrite={canWrite}
      />
    </BookOneShell>
  );
}
