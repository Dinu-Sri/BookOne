'use client';

import { useMemo, useState } from 'react';
import { convertDocumentAction, type PoRemainingLine } from '@/app/actions/commercial-docs';
import { formatLKR } from '@/components/module/list-page';
import { Button, Card } from '@/components/ui/bookone-ui';
import { QtyStepper } from '@/components/module/qty-stepper';

export function PoConvertForm({
  poId,
  lines: initial,
  documentNumber,
}: {
  poId: string;
  lines: PoRemainingLine[];
  documentNumber: string;
}) {
  const [qtys, setQtys] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const l of initial) m[l.id] = l.remainingQty > 0 ? String(l.remainingQty) : '0';
    return m;
  });

  const openLines = useMemo(() => initial.filter((l) => l.remainingQty > 0), [initial]);
  const any = openLines.some((l) => (Number(qtys[l.id]) || 0) > 0);

  if (openLines.length === 0) {
    return (
      <Card>
        <div className="card-body">
          <p style={{ margin: 0, fontSize: 13 }}>
            PO <strong>{documentNumber}</strong> is fully billed — nothing left to convert.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="card-body" style={{ display: 'grid', gap: 12 }}>
        <div>
          <strong>Receive or bill from PO</strong>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-soft)' }}>
            Adjust quantities. GRN stocks inventory without AP; purchase bill opens AP (no double stock if
            GRN already received).
          </p>
        </div>
        <form action={convertDocumentAction} id="po-convert-form">
          <input type="hidden" name="sourceId" value={poId} />
          <input type="hidden" name="lineCount" value={String(openLines.length)} />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Ordered</th>
                  <th>Billed</th>
                  <th>Remaining</th>
                  <th>This qty</th>
                  <th>Unit price</th>
                </tr>
              </thead>
              <tbody>
                {openLines.map((l, i) => (
                  <tr key={l.id}>
                    <td>
                      {l.description}
                      <input type="hidden" name={`line_${i}_description`} value={l.description} />
                      <input type="hidden" name={`line_${i}_productId`} value={l.productId ?? ''} />
                      <input type="hidden" name={`line_${i}_unitPrice`} value={String(l.unitPrice)} />
                      <input type="hidden" name={`line_${i}_unitCost`} value={String(l.unitCost)} />
                    </td>
                    <td>{l.orderedQty}</td>
                    <td>{l.billedQty}</td>
                    <td>{l.remainingQty}</td>
                    <td>
                      <QtyStepper
                        name={`line_${i}_quantity`}
                        value={qtys[l.id] ?? '0'}
                        onChange={(v) => {
                          const n = Math.min(l.remainingQty, Math.max(0, Number(v) || 0));
                          setQtys((prev) => ({ ...prev, [l.id]: String(n) }));
                        }}
                        min={0}
                      />
                    </td>
                    <td>{formatLKR(l.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button
              variant="secondary"
              type="submit"
              name="targetType"
              value="goods_receipt"
              disabled={!any}
              form="po-convert-form"
            >
              Receive goods (GRN)
            </Button>
            <Button
              variant="primary"
              type="submit"
              name="targetType"
              value="purchase"
              disabled={!any}
              form="po-convert-form"
            >
              Create purchase bill
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
