'use client';

/**
 * Universal product add UX for commercial forms:
 * - Type SKU / name / barcode
 * - Suggestions while typing (portaled so not clipped by table/footer)
 * - Exactly one match → auto-add after debounce
 * - Multiple matches → pick from list (with 1:1 thumbnail)
 * - Enter selects highlighted suggestion
 * - onSearchActive: parent can collapse header for more space
 */

import { createPortal } from 'react-dom';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export type ProductPick = {
  id: string;
  sku: string;
  name: string;
  sellPrice: number;
  unitCost: number;
  barcode?: string | null;
  imageUrl?: string | null;
};

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ProductAddSearch({
  products,
  onPick,
  placeholder = 'Search SKU or product name…',
  autoFocus = false,
  onSearchActive,
}: {
  products: ProductPick[];
  onPick: (product: ProductPick) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** true when query non-empty (parent may collapse form header) */
  onSearchActive?: (active: boolean) => void;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [listPos, setListPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    openUp: boolean;
  } | null>(null);
  const lastAutoId = useRef<string | null>(null);

  useEffect(() => setMounted(true), []);

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

  function placeList() {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(320, openUp ? spaceAbove - gap : spaceBelow - gap));
    const top = openUp ? rect.top - gap : rect.bottom + gap;
    setListPos({
      top,
      left: rect.left,
      width: Math.max(rect.width, 280),
      maxHeight,
      openUp,
    });
  }

  function commit(p: ProductPick) {
    onPick(p);
    setQ('');
    setOpen(false);
    setHi(0);
    lastAutoId.current = null;
    onSearchActive?.(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  // Notify parent of search focus without thrashing when callback identity changes
  const onSearchActiveRef = useRef(onSearchActive);
  onSearchActiveRef.current = onSearchActive;
  const lastActiveRef = useRef(false);
  useEffect(() => {
    const active = q.trim().length > 0;
    if (active === lastActiveRef.current) return;
    lastActiveRef.current = active;
    onSearchActiveRef.current?.(active);
  }, [q]);

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
      if (matches.length === 1 && matches[0].id === only.id) {
        lastAutoId.current = only.id;
        commit(only);
      }
    }, 400);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exactMatch, matches, q]);

  useEffect(() => {
    setHi(0);
    const shouldOpen = q.trim().length > 0 && matches.length > 1;
    setOpen(shouldOpen);
    if (shouldOpen) {
      requestAnimationFrame(placeList);
    } else {
      setListPos(null);
    }
  }, [q, matches.length]);

  useEffect(() => {
    if (!open) return;
    function onScrollOrResize() {
      placeList();
    }
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    }
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      placeList();
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
      setQ('');
      onSearchActive?.(false);
    }
  }

  const listPortal =
    mounted && open && matches.length > 1 && listPos
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            className="product-add-search-list product-add-search-list-fixed"
            role="listbox"
            style={{
              position: 'fixed',
              top: listPos.openUp ? undefined : listPos.top,
              bottom: listPos.openUp ? window.innerHeight - listPos.top : undefined,
              left: listPos.left,
              width: listPos.width,
              maxHeight: listPos.maxHeight,
              zIndex: 220,
            }}
          >
            {matches.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === hi}>
                <button
                  type="button"
                  className={`product-add-search-option ${i === hi ? 'active' : ''}`}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => commit(p)}
                >
                  <span className="product-add-thumb" aria-hidden>
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" />
                    ) : (
                      <span className="product-add-thumb-fallback">
                        {(p.name || '?').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="product-add-search-main">
                    <strong>{p.sku}</strong>
                    <span>{p.name}</span>
                  </span>
                  <em>LKR {money(p.sellPrice)}</em>
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )
      : null;

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
          if (matches.length > 1) {
            setOpen(true);
            placeList();
          }
          if (q.trim()) onSearchActive?.(true);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
      />
      {listPortal}
      {q.trim() && matches.length === 0 ? (
        <p className="product-add-search-empty">No products match “{q.trim()}”</p>
      ) : null}
    </div>
  );
}
