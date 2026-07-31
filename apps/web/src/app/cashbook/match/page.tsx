import Link from 'next/link';
import { listRecentStatementImports } from '@/app/actions/statement-import';
import { BankMatchWizard } from '@/components/bank-import-studio/match-wizard';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { canAccessFullErp } from '@/lib/entity-kind';
import { requireEntityTenant } from '@/lib/require-entity-shell';

/**
 * BIS-5: Match imported bank lines to cashbook books (link only).
 */
export default async function CashbookMatchPage({
  searchParams,
}: {
  searchParams?: { importId?: string };
}) {
  const tenant = await requireEntityTenant({
    requirePersonalShell: true,
    loginFrom: '/cashbook/match',
  });

  const importId = searchParams?.importId;
  const fullErp = canAccessFullErp(tenant.entityKind, tenant.capabilityTier);

  let recent: Awaited<ReturnType<typeof listRecentStatementImports>> = [];
  if (!importId) {
    try {
      recent = await listRecentStatementImports(12);
    } catch {
      recent = [];
    }
  }

  return (
    <CashbookShell
      title={`${tenant.name} · Match bank`}
      active="home"
      showFullErpLink={fullErp}
    >
      <div className="cashbook-import-page">
        <div className="cashbook-import-head">
          <h1 className="cashbook-import-title">Match to books</h1>
          <Link href="/cashbook" className="cashbook-import-back">
            ← Cashbook
          </Link>
        </div>

        {importId ? (
          <BankMatchWizard importId={importId} />
        ) : (
          <div className="bis-match-pick">
            <p className="bis-money-label">Pick a recent bank import to match</p>
            {recent.length === 0 ? (
              <p className="bis-error" style={{ margin: 0 }}>
                No imports yet.{' '}
                <Link href="/cashbook/import">Import a bank file</Link> first.
              </p>
            ) : (
              <ul className="bis-match-import-list">
                {recent.map((r) => (
                  <li key={r.id}>
                    <Link href={`/cashbook/match?importId=${r.id}`} className="bis-match-import-link">
                      <strong>{r.fileName}</strong>
                      <span>
                        {r.period} · {r.rowCount} lines · {r.status}
                        {r.bankName ? ` · ${r.bankName}` : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </CashbookShell>
  );
}
