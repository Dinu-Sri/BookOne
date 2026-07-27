'use client';

import { useState, useTransition } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { exportCashbookCsv } from '@/app/actions/cashbook-export';
import { Button } from '@/components/ui/bookone-ui';
import type { BookDomain } from '@/lib/entity-kind';

export function CashbookExportButton({
  bookDomain,
  period,
  label = 'Download CSV',
}: {
  bookDomain?: BookDomain | null;
  period?: string | null;
  label?: string;
}) {
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      setError('');
      const res = await exportCashbookCsv({ bookDomain, period });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="cb-export">
      <Button variant="secondary" type="button" disabled={pending} onClick={run} className="cb-export-btn">
        {pending ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
        {label}
      </Button>
      {error ? <p className="cashbook-error">{error}</p> : null}
    </div>
  );
}
