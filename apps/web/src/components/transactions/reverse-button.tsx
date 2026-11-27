'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { reverseTransactionFromForm } from '@/app/actions/record-entry';
import { pushStatusToast } from '@/components/layout/status-toast';
import { Button } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { withFormPending } from '@/components/ui/form-busy';

/**
 * Reverse asks first and says exactly what will happen, and how to undo it, before any
 * reversing entry is posted.
 */
export function ReverseButton({
  transactionId,
  description,
  party,
  date,
  amountLabel,
  reconciled,
}: {
  transactionId: string;
  description: string;
  party: string;
  date: string;
  amountLabel: string;
  reconciled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  async function confirm() {
    setBusy(true);
    const fd = new FormData();
    fd.set('transactionId', transactionId);
    try {
      await withFormPending(() => reverseTransactionFromForm(fd));
      setOpen(false);
      pushStatusToast({ kind: 'success', message: 'Entry reversed' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        type="button"
        className="table-icon-action"
        aria-label={`Reverse ${description}`}
        onClick={() => setOpen(true)}
      >
        <RotateCcw size={14} aria-hidden /> Reverse
      </Button>
      <ConfirmDialog
        open={open}
        title="Reverse this entry?"
        confirmLabel="Reverse entry"
        tone="danger"
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={() => void confirm()}
      >
        <div className="rev-dialog">
          <p className="rev-what">
            <strong>{description || 'Entry'}</strong>
            <span>
              {party ? `${party} · ` : ''}
              {date} · {amountLabel}
            </span>
          </p>
          <h3>What happens</h3>
          <ul>
            <li>BookOne adds a new entry dated today ({today}) for the same amount, the opposite way.</li>
            <li>Your account balances go back to how they were before this entry.</li>
            <li>Nothing is deleted. This entry stays in the list marked Reversed, and the new one is marked Reversal.</li>
            {reconciled ? (
              <li>This entry is matched to your bank statement. The reversal shows as a new item in your next bank reconciliation.</li>
            ) : null}
          </ul>
          <h3>If you change your mind</h3>
          <p>
            A reversal cannot be reversed again. To put this entry back, record it again in Simple Entry with the same
            details.
          </p>
        </div>
      </ConfirmDialog>
    </>
  );
}
