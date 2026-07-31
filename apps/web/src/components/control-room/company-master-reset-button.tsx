'use client';

import { useState, useTransition } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { resetPlatformCompanyData } from '@/app/actions/reset-company';
import { pushStatusToast } from '@/components/layout/status-toast';
import { Button } from '@/components/ui/bookone-ui';

/**
 * Control Room: wipe all operational data for a company (keep profile/CoA/users).
 */
export function CompanyMasterResetButton({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleReset() {
    const ok = window.confirm(
      `MASTER RESET “${companyName}”?\n\nThis deletes all ledgers, documents, stock, parties, bank imports, and journals for this company.\n\nKeeps: company profile, users, chart of accounts, brands/locations.\n\nThis cannot be undone.`,
    );
    if (!ok) return;
    const typed = window.prompt('Type MASTER RESET to confirm full wipe of this company:');
    if (typed !== 'MASTER RESET') {
      setMessage('Cancelled — phrase did not match.');
      return;
    }

    setMessage(null);
    startTransition(() => {
      resetPlatformCompanyData(companyId, typed).then((res) => {
        if (!res.ok) {
          setMessage(res.error ?? 'Reset failed.');
          pushStatusToast({ kind: 'error', message: res.error ?? 'Reset failed' });
          return;
        }
        const msg = `Wiped ${res.tablesCleared ?? 0} table groups · ${res.deletedFiles ?? 0} files${
          res.warning ? ` · ${res.warning}` : ''
        }`;
        setMessage(msg);
        pushStatusToast({ kind: 'success', message: `Company data reset: ${companyName}` });
      });
    });
  }

  return (
    <div className="company-master-reset">
      <Button
        type="button"
        variant="ghost"
        onClick={handleReset}
        disabled={pending}
        title="Wipe all operational data for this company"
        style={{ color: 'var(--danger, #b91c1c)' }}
      >
        {pending ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
        Master reset data
      </Button>
      {message ? (
        <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 600, color: 'var(--ink-muted)' }}>
          {message}
        </p>
      ) : (
        <p style={{ margin: '6px 0 0', fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>
          Clears ledgers, docs, stock, parties & bank imports. Keeps company shell & chart of
          accounts.
        </p>
      )}
    </div>
  );
}
