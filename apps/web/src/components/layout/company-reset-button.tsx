'use client';

import { useState, useTransition } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { resetCurrentCompanyData } from '@/app/actions/reset-company';
import { Button } from '@/components/ui/bookone-ui';

export function CompanyResetButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleReset() {
    const confirmText = window.prompt('This clears test ledger data for the current company. Type RESET to continue.');
    if (confirmText !== 'RESET') return;

    setMessage(null);
    startTransition(() => {
      resetCurrentCompanyData(confirmText).then((result) => {
        if (!result.ok) {
          setMessage(result.error ?? 'Reset failed.');
          return;
        }
        setMessage(result.warning ?? `Reset complete. Deleted ${result.deletedFiles ?? 0} uploaded files.`);
        window.setTimeout(() => {
          window.location.href = '/';
        }, 700);
      });
    });
  }

  return (
    <div className="reset-control">
      <Button variant="ghost" type="button" onClick={handleReset} disabled={isPending} title="Temporary testing reset">
        {isPending ? <Loader2 size={15} /> : <RotateCcw size={15} />}
        Reset data
      </Button>
      {message ? <span>{message}</span> : null}
    </div>
  );
}
