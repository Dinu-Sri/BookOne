'use client';

import { useState, useTransition } from 'react';
import { LockKeyhole, Loader2, ShieldCheck } from 'lucide-react';
import { lockPeriod, type PeriodLockInfo, type ReconciliationImportSummary } from '@/app/actions/reconciliation';
import { Badge, Button, Card } from '@/components/ui/bookone-ui';

export function PeriodCloseControls({
  period,
  lock,
  importSummary,
}: {
  period: string;
  lock: PeriodLockInfo | null;
  importSummary: ReconciliationImportSummary | null;
}) {
  const [currentLock, setCurrentLock] = useState(lock);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const reviewCount = importSummary?.lines.filter((line) => line.status === 'review').length ?? 0;
  const canLock = !currentLock && Boolean(importSummary) && reviewCount === 0;

  function handleLock() {
    setError(null);
    startTransition(() => {
      lockPeriod(period).then((result) => {
        if (!result.ok) {
          setError(result.error ?? 'Could not lock this period.');
          return;
        }
        setCurrentLock({
          id: 'pending-refresh',
          period,
          status: 'locked',
          lockedAt: new Date().toISOString(),
          notes: 'Locked from reconciliation workflow.',
        });
      });
    });
  }

  return (
    <Card>
      <div className="card-header">
        <div>
          <p className="eyebrow">Period close</p>
          <h2 className="card-title" style={{ marginTop: 4 }}>Lock {period}</h2>
          <p className="card-subtitle">Locked periods require reversing entries for corrections.</p>
        </div>
        <Badge tone={currentLock ? 'success' : !importSummary || reviewCount > 0 ? 'warning' : 'info'}>
          {currentLock ? <ShieldCheck size={12} /> : <LockKeyhole size={12} />}
          {currentLock ? 'Locked' : !importSummary ? 'Import first' : reviewCount > 0 ? 'Review first' : 'Open'}
        </Badge>
      </div>
      <div className="card-body">
        <div className="balance-list">
          <div className="balance-row">
            <div>
              <strong>{reviewCount} statement lines need review</strong>
              <span>{importSummary ? 'Mark rows Reconciled or Unmatched before locking.' : 'Upload a bank statement before locking.'}</span>
            </div>
            <Badge tone={importSummary && reviewCount === 0 ? 'success' : 'warning'}>
              {importSummary && reviewCount === 0 ? 'OK' : 'Pending'}
            </Badge>
          </div>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <Button variant="primary" disabled={!canLock || isPending} onClick={handleLock} style={{ marginTop: 14 }}>
          {isPending ? <Loader2 size={15} /> : <LockKeyhole size={15} />}
          {currentLock ? 'Period locked' : 'Lock period'}
        </Button>
      </div>
    </Card>
  );
}
