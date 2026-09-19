'use client';

import { useState } from 'react';

export type DiscountPick = {
  id: string;
  name: string;
  code: string | null;
  discountType: string;
  value: string | number;
};

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DiscountPicker({
  discounts,
  discountId,
  onDiscountId,
  headerDiscount,
  headerDiscountType,
  onHeaderDiscount,
  onHeaderDiscountType,
  amountLabel = 'Document discount',
}: {
  discounts: DiscountPick[];
  discountId: string;
  onDiscountId: (id: string) => void;
  headerDiscount: string;
  headerDiscountType: 'percent' | 'fixed';
  onHeaderDiscount: (v: string) => void;
  onHeaderDiscountType: (v: 'percent' | 'fixed') => void;
  amountLabel?: string;
}) {
  const [code, setCode] = useState('');
  const [codeNote, setCodeNote] = useState('');
  const locked = Boolean(discountId);

  function applyCode(raw: string) {
    const q = raw.trim().toLowerCase();
    if (!q) {
      setCodeNote('');
      return;
    }
    const hit = discounts.find((d) => (d.code ?? '').trim().toLowerCase() === q);
    if (!hit) {
      setCodeNote('No matching discount code.');
      return;
    }
    onDiscountId(hit.id);
    setCode(hit.code ?? raw.trim());
    setCodeNote(`${hit.name} applied.`);
  }

  return (
    <>
      {discounts.length > 0 ? (
        <div className="field">
          <label htmlFor="discount-code">Discount code</label>
          <input
            id="discount-code"
            className="input"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeNote('');
            }}
            onBlur={() => applyCode(code)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyCode(code);
              }
            }}
            placeholder="e.g. HOL10"
            autoComplete="off"
          />
          {codeNote ? <small className="muted-line">{codeNote}</small> : (
            <small className="muted-line">Type a saved code and press Enter.</small>
          )}
        </div>
      ) : null}
      {discounts.length > 0 ? (
        <div className="field">
          <label>Saved discount</label>
          <select
            className="input"
            name="discountId"
            value={discountId}
            onChange={(e) => {
              onDiscountId(e.target.value);
              const d = discounts.find((x) => x.id === e.target.value);
              setCode(d?.code ?? '');
              setCodeNote('');
            }}
          >
            <option value="">None — use values below</option>
            {discounts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code ? `${d.code} — ` : ''}
                {d.name} ({d.discountType === 'percent' ? `${d.value}%` : `LKR ${money(Number(d.value))}`})
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="discountId" value="" />
      )}
      <div className="field">
        <label htmlFor="header-discount-amt">{amountLabel}</label>
        <div className="cluster" style={{ gap: 6 }}>
          <select
            className="input"
            value={headerDiscountType}
            onChange={(e) => onHeaderDiscountType(e.target.value as 'percent' | 'fixed')}
            disabled={locked}
            style={{ maxWidth: 90 }}
          >
            <option value="percent">%</option>
            <option value="fixed">LKR</option>
          </select>
          <input
            id="header-discount-amt"
            className="input"
            inputMode="decimal"
            value={headerDiscount}
            onChange={(e) => onHeaderDiscount(e.target.value)}
            placeholder="0"
            disabled={locked}
          />
        </div>
      </div>
    </>
  );
}
