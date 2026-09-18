'use client';

import { useEffect, useState } from 'react';
import { getDocumentPrintModel, type DocumentPrintModel } from '@/app/actions/document-print';
import { DocumentPrintSheet } from '@/components/print/document-print-sheet';
import { Button } from '@/components/ui/bookone-ui';

export function PrintPreviewModal({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const [model, setModel] = useState<DocumentPrintModel | null>(null);
  const [error, setError] = useState('');

  function printSheet() {
    const sheet = document.querySelector('.doc-print-sheet');
    if (!sheet) {
      window.print();
      return;
    }
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) {
      window.print();
      return;
    }
    const styles = Array.from(document.querySelectorAll('.doc-print-root style'))
      .map((s) => s.innerHTML)
      .join('\n');
    const title = (sheet.getAttribute('data-print-title') || model?.meta.number || ' ').replace(/[<>]/g, '');
    doc.open();
    doc.write(
      `<!doctype html><html><head><title>${title}</title><style>@page{size:A4;margin:10mm}html,body{margin:0}body{background:#fff}</style><style>${styles}</style></head><body>${sheet.outerHTML}</body></html>`,
    );
    doc.close();
    const run = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1000);
    };
    iframe.onload = run;
    setTimeout(run, 250);
  }

  useEffect(() => {
    let alive = true;
    getDocumentPrintModel(documentId)
      .then((next) => {
        if (!alive) return;
        if (!next) setError('Could not load this document.');
        else setModel(next);
      })
      .catch(() => {
        if (alive) setError('Could not load print preview.');
      });
    return () => {
      alive = false;
    };
  }, [documentId]);

  return (
    <div className="doc-print-modal" role="dialog" aria-modal="true">
      <div className="doc-print-modal-bar no-print">
        <strong>Print preview</strong>
        <span className="muted-line" style={{ fontSize: 12 }}>
          Turn off Headers and footers in the print dialog
        </span>
        <div className="cluster" style={{ gap: 8 }}>
          <Button variant="primary" type="button" onClick={() => printSheet()} disabled={!model}>
            Print
          </Button>
          <Button variant="secondary" type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
      {error ? <p className="form-error" style={{ padding: 16 }}>{error}</p> : null}
      {!model && !error ? <p className="muted-line" style={{ padding: 16 }}>Loading preview…</p> : null}
      {model ? (
        <div className="doc-print-modal-paper">
          <DocumentPrintSheet model={model} embedded />
        </div>
      ) : null}
    </div>
  );
}

export function PrintPreviewButton({
  documentId,
  label = 'Print',
  variant = 'secondary',
}: {
  documentId: string;
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} type="button" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? <PrintPreviewModal documentId={documentId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
