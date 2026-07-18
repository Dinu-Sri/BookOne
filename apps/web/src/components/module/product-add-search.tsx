'use client';

/**
 * Universal product add UX for commercial forms (quotes, orders, invoices, etc.):
 * - Type SKU / name / barcode
 * - Suggestions while typing
 * - Exactly one match → auto-add after short debounce
 * - Multiple matches → pick from list
 * - Enter selects highlighted suggestion
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';

export type ProductPick = {
  id: string;
  sku: string;
  name: string;
  sellPrice: number;
  unitCost: number;
  barcode?: string | null;
};

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ProductAddSearch({
  products,
  onPick,
  placeholder = 'Search SKU or product name…',
  autoFocus = false,
}: {
  products: ProductPick[];
  onPick: (product: ProductPick) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const lastAutoId = useRef<string | null>(null);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return products
      .filter((p) => {
        const sku = p.sku.toLowerCase();
        const name = p.name.toLowerCase();
        const barcode = (p.barcode ?? '').toLowerCase();
        return sku.includes(t) || name.includes(t) || (barcode && barcode.includes(t));
      })
      .slice(0, 12);
  }, [q, products]);

  const exactMatch = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return null;
    return (
      products.find((p) => p.sku.toLowerCase() === t) ||
      products.find((p) => (p.barcode ?? '').toLowerCase() === t) ||
      null
    );
  }, [q, products]);

  function commit(p: ProductPick) {
    onPick(p);
    setQ('');
    setOpen(false);
    setHi(0);
    lastAutoId.current = null;
    // Keep focus for rapid multi-add
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  // Auto-add: exact SKU/barcode immediately, or sole fuzzy match after debounce
  useEffect(() => {
    if (exactMatch) {
      if (lastAutoId.current === exactMatch.id) return;
      lastAutoId.current = exactMatch.id;
      commit(exactMatch);
      return;
    }

    if (matches.length !== 1 || q.trim().length < 2) {
      lastAutoId.current = null;
      return;
    }

    const only = matches[0];
    if (lastAutoId.current === only.id) return;
    const handle = window.setTimeout(() => {
      // Re-check still sole match
      if (matches.length === 1 && matches[0].id === only.id) {
        lastAutoId.current = only.id;
        commit(only);
      }
    }, 400);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commit intentionally stable via onPick
  }, [exactMatch, matches, q]);

  useEffect(() => {
    setHi(0);
    setOpen(q.trim().length > 0 && matches.length > 1);
  }, [q, matches.length]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHi((h) => Math.min(h + 1, Math.max(0, matches.length - 1)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (exactMatch) {
        commit(exactMatch);
        return;
      }
      if (matches.length === 1) {
        commit(matches[0]);
        return;
      }
      if (matches.length > 1 && matches[hi]) {
        commit(matches[hi]);
      }
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="product-add-search" ref={rootRef}>
      <input
        ref={inputRef}
        className="input product-add-search-input"
        value={q}
        onChange={(e) => {
          lastAutoId.current = null;
          setQ(e.target.value);
        }}
        onFocus={() => {
          if (matches.length > 1) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
      />
      {open && matches.length > 1 ? (
        <ul id={listId} className="product-add-search-list" role="listbox">
          {matches.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === hi}>
              <button
                type="button"
                className={`product-add-search-option ${i === hi ? 'active' : ''}`}
                onMouseEnter={() => setHi(i)}
                onClick={() => commit(p)}
              >
                <span className="product-add-search-main">
                  <strong>{p.sku}</strong>
                  <span>{p.name}</span>
                </span>
                <em>LKR {money(p.sellPrice)}</em>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {q.trim() && matches.length === 0 ? (
        <p className="product-add-search-empty">No products match “{q.trim()}”</p>
      ) : null}
    </div>
  );
}
