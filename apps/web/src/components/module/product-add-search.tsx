'use client';

/**
 * Universal product add UX for commercial forms:
 * - Type SKU / name / barcode
 * - Suggestions while typing (portaled)
 * - Exactly one match → auto-add after debounce
 * - Multiple matches → pick from list (1:1 thumbnail)
 * - No match + Enter / "Add as free text" → manual line (qty 1, blank price)
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
  onPickManual,
  placeholder = 'Search SKU or product name…',
  autoFocus = false,
  onSearchActive,
}: {
  products: ProductPick[];
  onPick: (product: ProductPick) => void;
  /** Free-text line when no catalog match (description only; qty 1, price blank). */
  onPickManual?: (description: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
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

  function clearSearch() {
    setQ('');
    setOpen(false);
    setHi(0);
    lastAutoId.current = null;
    onSearchActive?.(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function commit(p: ProductPick) {
    onPick(p);
    clearSearch();
  }

  function commitManual() {
    const text = q.trim();
    if (!text || !onPickManual) return;
    onPickManual(text);
    clearSearch();
  }

  const onSearchActiveRef = useRef(onSearchActive);
  onSearchActiveRef.current = onSearchActive;
  const lastActiveRef = useRef(false);
  useEffect(() => {
    const active = q.trim().length > 0;
    if (active === lastActiveRef.current) return;
    lastActiveRef.current = active;
    onSearchActiveRef.current?.(active);
  }, [q]);

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
    // Show list for multi-match OR free-text option when no match
    const shouldOpen =
      q.trim().length > 0 && (matches.length > 1 || (matches.length === 0 && Boolean(onPickManual)));
    setOpen(shouldOpen);
    if (shouldOpen) {
      requestAnimationFrame(placeList);
    } else {
      setListPos(null);
    }
  }, [q, matches.length, onPickManual]);

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
      const max = matches.length > 0 ? matches.length - 1 : 0;
      setHi((h) => Math.min(h + 1, max));
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
        return;
      }
      // No catalog match → free-text line
      if (matches.length === 0 && q.trim() && onPickManual) {
        commitManual();
      }
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setQ('');
      onSearchActive?.(false);
    }
  }

  const showFreeTextOption = Boolean(onPickManual) && q.trim().length > 0 && matches.length === 0;
  const showMulti = matches.length > 1;

  const listPortal =
    mounted && open && listPos && (showMulti || showFreeTextOption)
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
            {showMulti
              ? matches.map((p, i) => (
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
                ))
              : null}
            {showFreeTextOption ? (
              <li role="option" aria-selected>
                <button type="button" className="product-add-search-option free-text active" onClick={commitManual}>
                  <span className="product-add-thumb" aria-hidden>
                    <span className="product-add-thumb-fallback">+</span>
                  </span>
                  <span className="product-add-search-main">
                    <strong>Add as free text</strong>
                    <span>“{q.trim()}” · qty 1 · set price on line</span>
                  </span>
                  <em>Manual</em>
                </button>
              </li>
            ) : null}
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
          if (matches.length > 1 || (matches.length === 0 && q.trim() && onPickManual)) {
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
      {q.trim() && matches.length === 0 && !onPickManual ? (
        <p className="product-add-search-empty">No products match “{q.trim()}”</p>
      ) : null}
      {q.trim() && matches.length === 0 && onPickManual ? (
        <p className="product-add-search-empty">
          No catalog match — press <kbd>Enter</kbd> to add as free text
        </p>
      ) : null}
    </div>
  );
}
