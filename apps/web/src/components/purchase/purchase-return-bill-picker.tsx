'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { searchBillsForReturn } from '@/app/actions/commercial-docs';
import { purchaseReturnFromBillPath } from '@bookone/accounting';
import { Button } from '@/components/ui/bookone-ui';

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PurchaseReturnBillPicker({
  selectedNumber,
  remainingQuantity,
  remainingValue,
}: {
  selectedNumber?: string | null;
  remainingQuantity?: number;
  remainingValue?: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(selectedNumber ?? '');
  const [hits, setHits] = useState<
    {
      id: string;
      documentNumber: string;
      taxInvoiceNumber: string | null;
      partyName: string;
      issueDate: string;
      total: number;
    }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(selectedNumber ?? '');
  }, [selectedNumber]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || (selectedNumber && q === selectedNumber)) {
      setHits([]);
      setSearching(false);
      return;
    }
    const handle = window.setTimeout(() => {
      setSearching(true);
      searchBillsForReturn(q)
        .then((next) => {
          setHits(next);
          setOpen(true);
        })
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query, selectedNumber]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function pick(id: string) {
    setOpen(false);
    router.push(purchaseReturnFromBillPath(id));
  }

  function clear() {
    setQuery('');
    setHits([]);
    setOpen(false);
    router.push('/purchase/returns/new');
  }

  return (
    <div className="field invoice-return-search" ref={rootRef}>
      <label htmlFor="bill-return-q">Find bill to return</label>
      <div className="invoice-return-row">
        <input
          id="bill-return-q"
          className="input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (hits.length > 0) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Type bill number or vendor name…"
          autoComplete="off"
        />
        {selectedNumber ? (
          <Button variant="secondary" type="button" onClick={clear}>
            Change
          </Button>
        ) : null}
        {open && hits.length > 0 ? (
          <ul className="invoice-return-hits" role="listbox">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button type="button" onClick={() => pick(hit.id)}>
                  <strong>{hit.documentNumber}</strong>
                  {hit.taxInvoiceNumber ? <span> · {hit.taxInvoiceNumber}</span> : null}
                  <span>
                    {hit.partyName} · {hit.issueDate} · LKR {money(hit.total)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {open && query.trim().length >= 2 && !searching && hits.length === 0 ? (
          <div className="invoice-return-hits invoice-return-empty">No matching bills</div>
        ) : null}
      </div>
      {searching ? <small className="muted-line">Searching…</small> : null}
      {!searching && selectedNumber ? (
        <small className="muted-line">
          Loaded {selectedNumber}
          {remainingQuantity != null ? ` · remaining qty ${remainingQuantity}` : ''}
          {remainingValue != null ? ` · remaining value LKR ${money(remainingValue)}` : ''}.
          Vendor is locked. Reduce quantity for a partial return.
        </small>
      ) : !searching ? (
        <small className="muted-line">
          Type at least 2 characters. Selecting opens a return with remaining quantity — do not
          submit an unlinked return for a billed source.
        </small>
      ) : null}
    </div>
  );
}
