'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  closePosShift,
  completePosReturn,
  completePosSale,
  lookupPosSale,
  openPosShift,
  previewShiftZReport,
  type PosBootstrap,
  type PosProductLite,
  type PosTicket,
  type PosTicketSummary,
  type PosZReport,
} from '@/app/actions/pos-session';

type CartLine = {
  key: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  sku?: string;
  maxQty?: number;
};

type Tender = 'cash' | 'card' | 'bank' | 'mixed';
type PosMode = 'sale' | 'return';

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function lineTotal(l: CartLine) {
  return Math.round(l.quantity * l.unitPrice * 100) / 100;
}

const CASH_CHIPS = [100, 500, 1000, 2000, 5000];

export function PosTerminal({
  bootstrap,
  recentSales = [],
}: {
  bootstrap: PosBootstrap;
  recentSales?: PosTicketSummary[];
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const activeRegisters = bootstrap.registers;
  const [registerId, setRegisterId] = useState(() => activeRegisters[0]?.id ?? '');
  const [shiftId, setShiftId] = useState<string | null>(() => {
    const reg = activeRegisters[0]?.id;
    return bootstrap.openShifts.find((s) => s.registerId === reg)?.id ?? null;
  });
  const [openingFloat, setOpeningFloat] = useState('0');

  const [mode, setMode] = useState<PosMode>('sale');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | 'all'>('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [partyName, setPartyName] = useState('Walk-in');
  const [headerDiscount, setHeaderDiscount] = useState(0);
  const [discountId, setDiscountId] = useState('');
  const [invoiceKind, setInvoiceKind] = useState<'commercial' | 'tax_invoice'>('commercial');

  // Return mode
  const [ticketQuery, setTicketQuery] = useState('');
  const [sourceTicket, setSourceTicket] = useState<PosTicket | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [freeReturn, setFreeReturn] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [tender, setTender] = useState<Tender>('cash');
  const [cashTendered, setCashTendered] = useState('');
  const [mixedCash, setMixedCash] = useState('');
  const [mixedCard, setMixedCard] = useState('');
  const [lastDocId, setLastDocId] = useState<string | null>(null);

  // Shift close / Z
  const [closeOpen, setCloseOpen] = useState(false);
  const [zPreview, setZPreview] = useState<PosZReport | null>(null);
  const [closingCash, setClosingCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');

  const register = activeRegisters.find((r) => r.id === registerId) ?? activeRegisters[0];

  useEffect(() => {
    const open = bootstrap.openShifts.find((s) => s.registerId === registerId);
    setShiftId(open?.id ?? null);
  }, [registerId, bootstrap.openShifts]);

  useEffect(() => {
    if (!payOpen) searchRef.current?.focus();
  }, [payOpen, cart.length, mode]);

  const filteredProducts = useMemo(() => {
    let list = bootstrap.products;
    if (category !== 'all') list = list.filter((p) => p.category === category);
    const q = query.trim().toLowerCase();
    if (!q) return list.slice(0, 48);
    return list
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q)),
      )
      .slice(0, 48);
  }, [bootstrap.products, category, query]);

  const subtotal = useMemo(
    () => Math.round(cart.reduce((s, l) => s + lineTotal(l), 0) * 100) / 100,
    [cart],
  );

  const discountAmt = useMemo(() => {
    if (mode === 'return') return 0;
    if (discountId) {
      const d = bootstrap.discounts.find((x) => x.id === discountId);
      if (d) {
        return d.discountType === 'percent'
          ? Math.round(((subtotal * d.value) / 100) * 100) / 100
          : Math.min(subtotal, d.value);
      }
    }
    return Math.min(subtotal, Math.max(0, headerDiscount));
  }, [mode, discountId, bootstrap.discounts, subtotal, headerDiscount]);

  const net = Math.round((subtotal - discountAmt) * 100) / 100;
  const vatRate =
    mode === 'sale' && invoiceKind === 'tax_invoice' && bootstrap.vatRegistered
      ? bootstrap.vatRatePercent
      : 0;
  const vat = Math.round(((net * vatRate) / 100) * 100) / 100;
  const total = Math.round((net + vat) * 100) / 100;

  const cashNum = Number(String(cashTendered).replace(/[^0-9.]/g, '')) || 0;
  const change = tender === 'cash' ? Math.max(0, Math.round((cashNum - total) * 100) / 100) : 0;

  function switchMode(next: PosMode) {
    if (next === mode) return;
    if (cart.length > 0 && !window.confirm('Switch mode and clear cart?')) return;
    setMode(next);
    setCart([]);
    setSourceTicket(null);
    setTicketQuery('');
    setFreeReturn(false);
    setReturnReason('');
    setError(null);
    setStatus(null);
    setPayOpen(false);
    setDiscountId('');
    setHeaderDiscount(0);
  }

  const addProduct = useCallback((p: PosProductLite, qty = 1) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) =>
          l.key === existing.key ? { ...l, quantity: l.quantity + qty } : l,
        );
      }
      return [
        ...prev,
        {
          key: `${p.id}-${Date.now()}`,
          productId: p.id,
          description: p.name,
          quantity: qty,
          unitPrice: p.sellPrice,
          sku: p.sku,
        },
      ];
    });
    setQuery('');
    setStatus(null);
    setError(null);
  }, []);

  function addReturnLine(line: {
    productId: string | null;
    description: string;
    unitPrice: number;
    remainingQty: number;
  }) {
    if (line.remainingQty <= 0) return;
    setCart((prev) => {
      const existing = prev.find(
        (l) => l.productId === line.productId && l.description === line.description,
      );
      if (existing) {
        const nextQty = Math.min(line.remainingQty, existing.quantity + 1);
        return prev.map((l) => (l.key === existing.key ? { ...l, quantity: nextQty } : l));
      }
      return [
        ...prev,
        {
          key: `ret-${line.productId ?? line.description}-${Date.now()}`,
          productId: line.productId,
          description: line.description,
          quantity: 1,
          unitPrice: line.unitPrice,
          maxQty: line.remainingQty,
        },
      ];
    });
  }

  function loadAllReturnable(ticket: PosTicket) {
    const lines: CartLine[] = ticket.lines
      .filter((l) => l.remainingQty > 0)
      .map((l) => ({
        key: `ret-${l.id}`,
        productId: l.productId,
        description: l.description,
        quantity: l.remainingQty,
        unitPrice: l.unitPrice,
        maxQty: l.remainingQty,
      }));
    setCart(lines);
  }

  function handleSearchSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (mode === 'return' && !freeReturn) {
      setError('In ticket return, pick lines from the ticket. Use Free return to scan products.');
      return;
    }
    const exact =
      bootstrap.products.find((p) => p.barcode && p.barcode === q) ||
      bootstrap.products.find((p) => p.sku.toLowerCase() === q.toLowerCase());
    if (exact) {
      addProduct(exact);
      return;
    }
    const first = filteredProducts[0];
    if (first) addProduct(first);
    else setError(`No product for “${q}”`);
  }

  function setQty(key: string, quantity: number) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((l) => l.key !== key));
      return;
    }
    setCart((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const max = l.maxQty ?? Infinity;
        return { ...l, quantity: Math.min(max, quantity) };
      }),
    );
  }

  function clearCart() {
    if (cart.length === 0) return;
    if (!window.confirm('Clear cart?')) return;
    setCart([]);
  }

  function doOpenShift() {
    if (!registerId) return;
    setError(null);
    startTransition(async () => {
      const res = await openPosShift({
        registerId,
        openingFloat: Number(String(openingFloat).replace(/[^0-9.]/g, '')) || 0,
      });
      if (!res.ok || !res.shiftId) {
        setError(res.error ?? 'Could not open shift');
        return;
      }
      setShiftId(res.shiftId);
      setStatus('Shift opened');
    });
  }

  function openCloseShift() {
    if (!shiftId) return;
    if (cart.length > 0) {
      setError('Clear or complete the cart before closing the shift.');
      return;
    }
    setError(null);
    setCloseOpen(true);
    setZPreview(null);
    startTransition(async () => {
      const res = await previewShiftZReport(shiftId);
      if (!res.ok || !res.report) {
        setError(res.error ?? 'Could not load Z-report');
        setCloseOpen(false);
        return;
      }
      setZPreview(res.report);
      setClosingCash(String(res.report.expectedCash));
    });
  }

  function doCloseShift() {
    if (!shiftId) return;
    const count = Number(String(closingCash).replace(/[^0-9.]/g, '')) || 0;
    setError(null);
    startTransition(async () => {
      const res = await closePosShift({
        shiftId,
        closingCashCount: count,
        notes: closeNotes || undefined,
      });
      if (!res.ok) {
        setError(res.error ?? 'Close failed');
        return;
      }
      const closedId = shiftId;
      setCloseOpen(false);
      setZPreview(null);
      setShiftId(null);
      setStatus('Shift closed');
      window.open(`/pos/z-report/${closedId}?autoprint=1`, '_blank', 'noopener,width=480,height=800');
    });
  }

  function doLookupTicket(q?: string) {
    const raw = (q ?? ticketQuery).trim();
    if (!raw) {
      setError('Enter a receipt number');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await lookupPosSale(raw);
      if (!res.ok || !res.ticket) {
        setError(res.error ?? 'Not found');
        setSourceTicket(null);
        return;
      }
      setSourceTicket(res.ticket);
      setPartyName(res.ticket.partyName);
      setFreeReturn(false);
      setCart([]);
      setStatus(`Loaded ${res.ticket.documentNumber}`);
    });
  }

  function openPay() {
    if (cart.length === 0) {
      setError(mode === 'return' ? 'Add return lines first' : 'Add items to cart first');
      return;
    }
    if (!shiftId) {
      setError('Open a shift for this register first');
      return;
    }
    if (mode === 'return' && !freeReturn && !sourceTicket) {
      setError('Lookup a ticket or enable free return');
      return;
    }
    setError(null);
    setTender('cash');
    setCashTendered(String(total));
    setMixedCash(String(total));
    setMixedCard('0');
    setPayOpen(true);
  }

  function finishPrint(id: string) {
    const printMode = register?.printMode ?? 'browser';
    if (printMode === 'browser' || printMode === 'both') {
      window.open(`/pos/receipt/${id}?autoprint=1`, '_blank', 'noopener,width=420,height=720');
    }
    if (printMode === 'thermal' || printMode === 'both') {
      console.info('[POS] Thermal print queued for', id, register?.thermalDeviceHint);
    }
  }

  function completeSale() {
    if (!shiftId || !registerId) return;
    if (tender === 'cash' && cashNum + 0.001 < total) {
      setError('Cash tendered is less than total');
      return;
    }
    if (tender === 'mixed') {
      const c = Number(mixedCash) || 0;
      const card = Number(mixedCard) || 0;
      if (Math.round((c + card) * 100) / 100 + 0.001 < total) {
        setError('Mixed tenders must cover total');
        return;
      }
    }

    setError(null);
    startTransition(async () => {
      const res = await completePosSale({
        registerId,
        shiftId,
        partyName: partyName || 'Walk-in',
        invoiceKind: bootstrap.vatRegistered ? invoiceKind : 'commercial',
        tender,
        cashAmount:
          tender === 'cash' ? cashNum : tender === 'mixed' ? Number(mixedCash) || 0 : 0,
        cardAmount: tender === 'card' ? total : tender === 'mixed' ? Number(mixedCard) || 0 : 0,
        bankAmount: tender === 'bank' ? total : 0,
        headerDiscount: discountId ? 0 : discountAmt,
        discountId: discountId || null,
        lines: cart.map((l) => ({
          productId: l.productId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      });

      if (!res.ok || !res.id) {
        setError(res.error ?? 'Sale failed');
        return;
      }

      setLastDocId(res.id);
      setCart([]);
      setPayOpen(false);
      setDiscountId('');
      setHeaderDiscount(0);
      setInvoiceKind('commercial');
      setStatus(`Sale ${res.documentNumber} complete`);
      finishPrint(res.id);
      searchRef.current?.focus();
    });
  }

  function completeReturn() {
    if (!shiftId || !registerId) return;
    const refundTender = tender === 'mixed' ? 'cash' : tender;
    setError(null);
    startTransition(async () => {
      const res = await completePosReturn({
        registerId,
        shiftId,
        sourcePosSaleId: freeReturn ? null : sourceTicket?.id ?? null,
        partyName: partyName || sourceTicket?.partyName || 'Walk-in',
        refundTender: refundTender as 'cash' | 'card' | 'bank',
        reason: returnReason || undefined,
        lines: cart.map((l) => ({
          productId: l.productId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      });

      if (!res.ok || !res.id) {
        setError(res.error ?? 'Return failed');
        return;
      }

      setLastDocId(res.id);
      setCart([]);
      setPayOpen(false);
      setSourceTicket(null);
      setTicketQuery('');
      setReturnReason('');
      setFreeReturn(false);
      setStatus(`Return ${res.documentNumber} complete`);
      finishPrint(res.id);
      searchRef.current?.focus();
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F4') {
        e.preventDefault();
        if (!payOpen) openPay();
      }
      if (e.key === 'Escape' && payOpen) {
        e.preventDefault();
        setPayOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (activeRegisters.length === 0) {
    return (
      <div className="pos-root">
        <div className="pos-empty">
          <h1>No POS registers</h1>
          <p>Add a register under Company → Sales Settings.</p>
          <Link href="/company/sales#pos-registers">Open Sales Settings</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`pos-root ${mode === 'return' ? 'pos-mode-return' : ''}`}>
      <header className="pos-topbar">
        <div className="pos-brand">
          <strong>{bootstrap.tenantName}</strong>
          <span>POS</span>
        </div>
        <div className="pos-mode-toggle" role="tablist" aria-label="POS mode">
          <button
            type="button"
            role="tab"
            className={mode === 'sale' ? 'active' : ''}
            onClick={() => switchMode('sale')}
          >
            Sale
          </button>
          <button
            type="button"
            role="tab"
            className={mode === 'return' ? 'active return' : ''}
            onClick={() => switchMode('return')}
          >
            Return
          </button>
        </div>
        <div className="pos-top-fields">
          <label>
            Register
            <select
              value={registerId}
              onChange={(e) => setRegisterId(e.target.value)}
              disabled={pending}
            >
              {activeRegisters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.name}
                </option>
              ))}
            </select>
          </label>
          <span className="pos-chip">{shiftId ? 'Shift open' : 'No shift'}</span>
          <span className="pos-chip muted">{bootstrap.cashierName}</span>
        </div>
        <div className="pos-top-actions">
          {shiftId ? (
            <button type="button" className="pos-link-btn" onClick={openCloseShift} disabled={pending}>
              Close shift
            </button>
          ) : null}
          {lastDocId ? (
            <Link className="pos-link-btn" href={`/pos/receipt/${lastDocId}`} target="_blank">
              Last receipt
            </Link>
          ) : null}
          <Link className="pos-link-btn" href="/sales/pos">
            History
          </Link>
          <Link className="pos-link-btn" href="/sales/pos/shifts">
            Shifts
          </Link>
          <Link className="pos-link-btn" href="/">
            Exit
          </Link>
        </div>
      </header>

      {!shiftId ? (
        <div className="pos-shift-gate">
          <div className="pos-shift-card">
            <h2>Open shift — {register?.name}</h2>
            <p>Enter opening cash float, then start selling on this counter.</p>
            <label>
              Opening float (LKR)
              <input
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <button type="button" className="pos-btn primary" disabled={pending} onClick={doOpenShift}>
              {pending ? 'Opening…' : 'Open shift & sell'}
            </button>
            {error ? <p className="pos-error">{error}</p> : null}
          </div>
        </div>
      ) : (
        <div className="pos-main">
          <section className="pos-catalog">
            {mode === 'return' && !freeReturn ? (
              <>
                <form
                  className="pos-search-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    doLookupTicket();
                  }}
                >
                  <input
                    ref={searchRef}
                    className="pos-search pos-search-return"
                    value={ticketQuery}
                    onChange={(e) => setTicketQuery(e.target.value)}
                    placeholder="Scan / type receipt no. (e.g. POS-…)"
                    autoComplete="off"
                    autoFocus
                  />
                  <button type="submit" className="pos-btn" disabled={pending}>
                    Find
                  </button>
                </form>
                <div className="pos-return-tools">
                  <button
                    type="button"
                    className="pos-btn"
                    onClick={() => {
                      setFreeReturn(true);
                      setSourceTicket(null);
                      setCart([]);
                      setStatus('Free return — scan or pick products');
                    }}
                  >
                    Free return (no ticket)
                  </button>
                </div>
                {sourceTicket ? (
                  <div className="pos-ticket-box">
                    <div className="pos-ticket-head">
                      <div>
                        <strong>{sourceTicket.documentNumber}</strong>
                        <span>
                          {sourceTicket.issueDate} · {sourceTicket.partyName} · LKR{' '}
                          {money(sourceTicket.total)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="pos-btn"
                        onClick={() => loadAllReturnable(sourceTicket)}
                      >
                        Return all remaining
                      </button>
                    </div>
                    <div className="pos-ticket-lines">
                      {sourceTicket.lines.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          className="pos-ticket-line"
                          disabled={l.remainingQty <= 0}
                          onClick={() =>
                            addReturnLine({
                              productId: l.productId,
                              description: l.description,
                              unitPrice: l.unitPrice,
                              remainingQty: l.remainingQty,
                            })
                          }
                        >
                          <span>
                            <strong>{l.description}</strong>
                            <em>
                              Sold {l.quantity} · left {l.remainingQty} · LKR {money(l.unitPrice)}
                            </em>
                          </span>
                          <span className="add">+ Return</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="pos-recent">
                    <p className="pos-muted">Recent POS sales — tap to load</p>
                    <div className="pos-recent-list">
                      {recentSales.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="pos-recent-row"
                          onClick={() => {
                            setTicketQuery(s.documentNumber);
                            doLookupTicket(s.documentNumber);
                          }}
                        >
                          <strong>{s.documentNumber}</strong>
                          <span>
                            {s.issueDate} · {s.partyName}
                          </span>
                          <em>LKR {money(s.total)}</em>
                        </button>
                      ))}
                      {recentSales.length === 0 ? (
                        <p className="pos-muted">No recent sales.</p>
                      ) : null}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {mode === 'return' && freeReturn ? (
                  <div className="pos-return-tools">
                    <button
                      type="button"
                      className="pos-btn"
                      onClick={() => {
                        setFreeReturn(false);
                        setCart([]);
                      }}
                    >
                      ← Back to ticket lookup
                    </button>
                    <span className="pos-chip return-chip">Free return</span>
                  </div>
                ) : null}
                <form className="pos-search-row" onSubmit={handleSearchSubmit}>
                  <input
                    ref={searchRef}
                    className="pos-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Scan barcode or search name / SKU…"
                    autoComplete="off"
                    autoFocus
                  />
                  <button type="submit" className="pos-btn">
                    Add
                  </button>
                </form>
                <div className="pos-cats">
                  <button
                    type="button"
                    className={category === 'all' ? 'active' : ''}
                    onClick={() => setCategory('all')}
                  >
                    All
                  </button>
                  {bootstrap.categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={category === c ? 'active' : ''}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="pos-tiles">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="pos-tile"
                      onClick={() => addProduct(p)}
                    >
                      <div className="pos-tile-img">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" />
                        ) : (
                          <span>{p.name.slice(0, 1)}</span>
                        )}
                      </div>
                      <div className="pos-tile-body">
                        <strong>{p.name}</strong>
                        <em>LKR {money(p.sellPrice)}</em>
                      </div>
                    </button>
                  ))}
                  {filteredProducts.length === 0 ? (
                    <p className="pos-muted">No products match.</p>
                  ) : null}
                </div>
              </>
            )}
          </section>

          <section className="pos-cart">
            <div className="pos-cart-head">
              <label>
                Customer
                <select value={partyName} onChange={(e) => setPartyName(e.target.value)}>
                  <option value="Walk-in">Walk-in</option>
                  {bootstrap.partyOptions.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.code ? `${p.code} — ` : ''}
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {mode === 'sale' && bootstrap.vatRegistered ? (
                <label>
                  Kind
                  <select
                    value={invoiceKind}
                    onChange={(e) => setInvoiceKind(e.target.value as 'commercial' | 'tax_invoice')}
                  >
                    <option value="commercial">Commercial</option>
                    <option value="tax_invoice">TAX INVOICE</option>
                  </select>
                </label>
              ) : mode === 'return' ? (
                <label>
                  Reason
                  <input
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    placeholder="Optional"
                  />
                </label>
              ) : null}
            </div>

            {mode === 'return' && sourceTicket ? (
              <p className="pos-cart-banner">
                Returning from <strong>{sourceTicket.documentNumber}</strong>
              </p>
            ) : null}
            {mode === 'return' && freeReturn ? (
              <p className="pos-cart-banner warn">Free return — not linked to a ticket</p>
            ) : null}

            <div className="pos-cart-lines">
              {cart.length === 0 ? (
                <p className="pos-muted">
                  {mode === 'return'
                    ? 'Return cart empty — pick ticket lines or free-return products.'
                    : 'Cart empty — scan or tap a product.'}
                </p>
              ) : (
                cart.map((l) => (
                  <div key={l.key} className="pos-line">
                    <div className="pos-line-main">
                      <strong>{l.description}</strong>
                      <span>
                        LKR {money(l.unitPrice)}
                        {l.maxQty != null ? ` · max ${l.maxQty}` : ''}
                      </span>
                    </div>
                    <div className="pos-line-qty">
                      <button type="button" onClick={() => setQty(l.key, l.quantity - 1)}>
                        −
                      </button>
                      <input
                        value={l.quantity}
                        onChange={(e) =>
                          setQty(l.key, Number(String(e.target.value).replace(/[^0-9.]/g, '')) || 0)
                        }
                      />
                      <button type="button" onClick={() => setQty(l.key, l.quantity + 1)}>
                        +
                      </button>
                    </div>
                    <div className="pos-line-amt">LKR {money(lineTotal(l))}</div>
                    <button type="button" className="pos-line-void" onClick={() => setQty(l.key, 0)}>
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pos-cart-foot">
              {mode === 'sale' ? (
                <div className="pos-disc-row">
                  <label>
                    Discount scheme
                    <select
                      value={discountId}
                      onChange={(e) => {
                        setDiscountId(e.target.value);
                        if (e.target.value) setHeaderDiscount(0);
                      }}
                    >
                      <option value="">None</option>
                      {bootstrap.discounts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Manual disc.
                    <input
                      inputMode="decimal"
                      value={headerDiscount || ''}
                      disabled={Boolean(discountId)}
                      onChange={(e) =>
                        setHeaderDiscount(
                          Number(String(e.target.value).replace(/[^0-9.]/g, '')) || 0,
                        )
                      }
                    />
                  </label>
                </div>
              ) : null}
              <div className="pos-totals">
                <div>
                  <span>Subtotal</span>
                  <strong>LKR {money(subtotal)}</strong>
                </div>
                {mode === 'sale' ? (
                  <div>
                    <span>Discount</span>
                    <strong>LKR {money(discountAmt)}</strong>
                  </div>
                ) : null}
                {vat > 0 ? (
                  <div>
                    <span>VAT {vatRate}%</span>
                    <strong>LKR {money(vat)}</strong>
                  </div>
                ) : null}
                <div className="grand">
                  <span>{mode === 'return' ? 'Refund total' : 'Total'}</span>
                  <strong>LKR {money(total)}</strong>
                </div>
              </div>
              <div className="pos-cart-actions">
                <button type="button" className="pos-btn" onClick={clearCart} disabled={cart.length === 0}>
                  Clear
                </button>
                <button
                  type="button"
                  className={`pos-btn primary pay ${mode === 'return' ? 'refund' : ''}`}
                  onClick={openPay}
                  disabled={cart.length === 0 || pending}
                >
                  {mode === 'return' ? `REFUND · LKR ${money(total)}` : `PAY · LKR ${money(total)}`}
                </button>
              </div>
              <p className="pos-hotkeys">
                {mode === 'return'
                  ? 'F4 Refund · Find ticket or free return'
                  : 'F4 Pay · Enter add scan · Esc close pay'}
              </p>
            </div>
          </section>
        </div>
      )}

      {error ? <div className="pos-toast error">{error}</div> : null}
      {status ? <div className="pos-toast ok">{status}</div> : null}

      {closeOpen ? (
        <div className="pos-pay-backdrop" role="dialog" aria-modal="true">
          <div className="pos-pay-sheet pos-z-sheet">
            <header>
              <h2>Close shift · Z-report</h2>
              <button type="button" className="pos-btn" onClick={() => setCloseOpen(false)}>
                Cancel
              </button>
            </header>
            {!zPreview ? (
              <p className="pos-muted">Loading totals…</p>
            ) : (
              <>
                <p className="pos-muted">
                  {zPreview.registerCode} — {zPreview.registerName}
                  <br />
                  Opened {new Date(zPreview.openedAt).toLocaleString()}
                </p>
                <div className="pos-z-grid">
                  <div>
                    <span>Sales ({zPreview.salesCount})</span>
                    <strong>LKR {money(zPreview.salesTotal)}</strong>
                  </div>
                  <div>
                    <span>Returns ({zPreview.returnsCount})</span>
                    <strong>LKR {money(zPreview.returnsTotal)}</strong>
                  </div>
                  <div>
                    <span>Net</span>
                    <strong>LKR {money(zPreview.netSales)}</strong>
                  </div>
                  <div>
                    <span>Cash in</span>
                    <strong>LKR {money(zPreview.cashIn)}</strong>
                  </div>
                  <div>
                    <span>Cash out (refunds)</span>
                    <strong>LKR {money(zPreview.cashOut)}</strong>
                  </div>
                  <div>
                    <span>Opening float</span>
                    <strong>LKR {money(zPreview.openingFloat)}</strong>
                  </div>
                  <div className="grand">
                    <span>Expected cash in drawer</span>
                    <strong>LKR {money(zPreview.expectedCash)}</strong>
                  </div>
                </div>
                <div className="pos-z-tenders">
                  <p>
                    Sales tender — Cash {money(zPreview.tenderSales.cash)} · Card{' '}
                    {money(zPreview.tenderSales.card)} · Bank {money(zPreview.tenderSales.bank)} · Mixed{' '}
                    {money(zPreview.tenderSales.mixed)}
                  </p>
                </div>
                <div className="pos-cash-block">
                  <label>
                    Counted cash in drawer *
                    <input
                      value={closingCash}
                      onChange={(e) => setClosingCash(e.target.value)}
                      inputMode="decimal"
                      autoFocus
                    />
                  </label>
                  <p className="pos-change">
                    Variance{' '}
                    <strong
                      className={
                        (Number(closingCash) || 0) - zPreview.expectedCash === 0
                          ? ''
                          : (Number(closingCash) || 0) - zPreview.expectedCash > 0
                            ? 'pos-var-over'
                            : 'pos-var-short'
                      }
                    >
                      LKR{' '}
                      {money(
                        Math.round(((Number(closingCash) || 0) - zPreview.expectedCash) * 100) / 100,
                      )}
                    </strong>
                  </p>
                  <label>
                    Notes
                    <input
                      value={closeNotes}
                      onChange={(e) => setCloseNotes(e.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                </div>
                {error ? <p className="pos-error">{error}</p> : null}
                <button
                  type="button"
                  className="pos-btn primary pay wide"
                  disabled={pending}
                  onClick={doCloseShift}
                >
                  {pending ? 'Closing…' : 'Close shift & print Z'}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {payOpen ? (
        <div className="pos-pay-backdrop" role="dialog" aria-modal="true">
          <div className="pos-pay-sheet">
            <header>
              <h2>{mode === 'return' ? 'Refund payment' : 'Take payment'}</h2>
              <button type="button" className="pos-btn" onClick={() => setPayOpen(false)}>
                Close
              </button>
            </header>
            <p className="pos-pay-total">
              {mode === 'return' ? 'Refund' : 'Total due'}{' '}
              <strong>LKR {money(total)}</strong>
            </p>
            <div className="pos-tender-tabs">
              {(mode === 'return'
                ? (['cash', 'card', 'bank'] as Tender[])
                : (['cash', 'card', 'bank', 'mixed'] as Tender[])
              ).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={tender === t ? 'active' : ''}
                  onClick={() => setTender(t)}
                >
                  {t === 'cash' ? 'Cash' : t === 'card' ? 'Card' : t === 'bank' ? 'Bank' : 'Mixed'}
                </button>
              ))}
            </div>

            {mode === 'sale' && tender === 'cash' ? (
              <div className="pos-cash-block">
                <label>
                  Cash tendered
                  <input
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    inputMode="decimal"
                    autoFocus
                  />
                </label>
                <div className="pos-chips">
                  <button type="button" onClick={() => setCashTendered(String(total))}>
                    Exact
                  </button>
                  {CASH_CHIPS.map((c) => (
                    <button key={c} type="button" onClick={() => setCashTendered(String(c))}>
                      {c}
                    </button>
                  ))}
                </div>
                <p className="pos-change">
                  Change <strong>LKR {money(change)}</strong>
                </p>
              </div>
            ) : null}

            {mode === 'sale' && tender === 'mixed' ? (
              <div className="pos-cash-block">
                <label>
                  Cash
                  <input
                    value={mixedCash}
                    onChange={(e) => setMixedCash(e.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <label>
                  Card
                  <input
                    value={mixedCard}
                    onChange={(e) => setMixedCard(e.target.value)}
                    inputMode="decimal"
                  />
                </label>
              </div>
            ) : null}

            {mode === 'return' ? (
              <p className="pos-muted">
                Refund posts as sales return, restocks physical items, and pays out via{' '}
                {tender === 'cash' ? 'Cash' : tender === 'card' ? 'Card clearing' : 'Bank'}.
              </p>
            ) : null}

            {error ? <p className="pos-error">{error}</p> : null}

            <button
              type="button"
              className={`pos-btn primary pay wide ${mode === 'return' ? 'refund' : ''}`}
              disabled={pending}
              onClick={mode === 'return' ? completeReturn : completeSale}
            >
              {pending
                ? 'Posting…'
                : mode === 'return'
                  ? `Complete refund · LKR ${money(total)}`
                  : `Complete sale · LKR ${money(total)}`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
