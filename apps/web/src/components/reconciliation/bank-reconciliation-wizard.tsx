'use client';

import { useEffect, useState } from 'react';
import { listLiquidAccounts, type LiquidAccount } from '@/app/actions/cashbook-banks';
import type { ReconciliationImportSummary } from '@/app/actions/reconciliation';
import {
  getStatementImport,
  type StatementImportView,
} from '@/app/actions/statement-import';
import { StatementImportWizard } from '@/components/statement-import/statement-import-wizard';
import { Badge, Card } from '@/components/ui/bookone-ui';
import { Loader2 } from 'lucide-react';

/**
 * ERP bank reconciliation — uses shared statement-import engine (Excel/CSV).
 * Staging only until user confirms links / creates.
 */
export function BankReconciliationWizard({
  period,
  initialImport,
}: {
  period: string;
  /** @deprecated kept for page compatibility; engine loads by import id when present */
  transactions?: unknown;
  initialImport: ReconciliationImportSummary | null;
}) {
  const [banks, setBanks] = useState<LiquidAccount[]>([]);
  const [importView, setImportView] = useState<StatementImportView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b = await listLiquidAccounts();
        if (cancelled) return;
        setBanks(b);
        if (initialImport?.id) {
          const view = await getStatementImport(initialImport.id);
          if (!cancelled) setImportView(view);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialImport?.id]);

  return (
    <Card>
      <div className="card-header">
        <div>
          <p className="eyebrow">Bank reconciliation</p>
          <h2 className="card-title" style={{ marginTop: 4 }}>
            Import bank statement
          </h2>
          <p className="card-subtitle">
            Excel or CSV for period {period}. Match existing books first; create only after you
            confirm. Same engine as cashbook import.
          </p>
        </div>
        <Badge tone={importView ? 'info' : 'neutral'}>
          {loading ? <Loader2 size={12} className="spin" /> : null}
          {importView ? importView.status : 'Ready'}
        </Badge>
      </div>
      <div className="card-body">
        {loading ? (
          <p className="card-subtitle">Loading bank accounts…</p>
        ) : (
          <StatementImportWizard
            banks={banks}
            source="erp_recon"
            variant="erp"
            initialImport={importView}
          />
        )}
      </div>
    </Card>
  );
}
