'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  completePosSale,
  openPosShift,
  type PosBootstrap,
  type PosProductLite,
} from '@/app/actions/pos-session';

type CartLine = {
  key: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  sku?: string;
};

type Tender = 'cash' | 'card' | 'bank' | 'mixed';

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function lineTotal(l: CartLine) {
  return Math.round(l.quantity * l.unitPrice * 100) / 100;
}

const CASH_CHIPS = [100, 500, 1000, 2000, 5000];

export function PosTerminal({ bootstrap }: { bootstrap: PosBootstrap }) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const activeRegisters = bootstrap.registers;
  const [registerId, setRegisterId] = useState(
    () => activeRegisters[0]?.id ?? '',
  );
  const [shiftId, setShiftId] = useState<string | null>(() => {
    const reg = activeRegisters[0]?.id;
    return bootstrap.openShifts.find((s) => s.registerId === reg)?.id ?? null;
  });
  const [openingFloat, setOpeningFloat] = useState('0');

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | 'all'>('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [partyName, setPartyName] = useState('Walk-in');
  const [headerDiscount, setHeaderDiscount] = useState(0);
  const [discountId, setDiscountId] = useState('');
  const [invoiceKind, setInvoiceKind] = useState<'commercial' | 'tax_invoice'>('commercial');

  const [payOpen, setPayOpen] = useState(false);
  const [tender, setTender] = useState<Tender>('cash');
  const [cashTendered, setCashTendered] = useState('');
  const [mixedCash, setMixedCash] = useState('');
  const [mixedCard, setMixedCard] = useState('');
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);

  const register = activeRegisters.find((r) => r.id === registerId) ?? activeRegisters[0];

  // Keep shift in sync when register changes
  useEffect(() => {
    const open = bootstrap.openShifts.find((s) => s.registerId === registerId);
    setShiftId(open?.id ?? null);
  }, [registerId, bootstrap.openShifts]);

  // Always refocus search for barcode gun
  useEffect(() => {
    if (!payOpen) searchRef.current?.focus();
  }, [payOpen, cart.length]);

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
    if (discountId) {
      const d = bootstrap.discounts.find((x) => x.id === discountId);
      if (d) {
        return d.discountType === 'percent'
          ? Math.round(((subtotal * d.value) / 100) * 100) / 100
          : Math.min(subtotal, d.value);
      }
    }
    return Math.min(subtotal, Math.max(0, headerDiscount));
  }, [discountId, bootstrap.discounts, subtotal, headerDiscount]);

  const net = Math.round((subtotal - discountAmt) * 100) / 100;
  const vatRate =
    invoiceKind === 'tax_invoice' && bootstrap.vatRegistered ? bootstrap.vatRatePercent : 0;
  const vat = Math.round(((net * vatRate) / 100) * 100) / 100;
  const total = Math.round((net + vat) * 100) / 100;

  const cashNum = Number(String(cashTendered).replace(/[^0-9.]/g, '')) || 0;
  const change = tender === 'cash' ? Math.max(0, Math.round((cashNum - total) * 100) / 100) : 0;

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

  function handleSearchSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    // Exact barcode / SKU first (gun path)
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
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, quantity } : l)));
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

  function openPay() {
    if (cart.length === 0) {
      setError('Add items to cart first');
      return;
    }
    if (!shiftId) {
      setError('Open a shift for this register first');
      return;
    }
    setError(null);
    setTender('cash');
    setCashTendered(String(total));
    setMixedCash(String(total));
    setMixedCard('0');
    setPayOpen(true);
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

      setLastSaleId(res.id);
      setCart([]);
      setPayOpen(false);
      setDiscountId('');
      setHeaderDiscount(0);
      setInvoiceKind('commercial');
      setStatus(`Sale ${res.documentNumber} complete`);

      const mode = register?.printMode ?? 'browser';
      if (mode === 'browser' || mode === 'both') {
        window.open(`/pos/receipt/${res.id}?autoprint=1`, '_blank', 'noopener,width=420,height=720');
      }
      if (mode === 'thermal' || mode === 'both') {
        // Phase 1 stub: thermal queue via browser print fallback note
        console.info('[POS] Thermal print queued for', res.id, register?.thermalDeviceHint);
      }
      searchRef.current?.focus();
    });
  }

  // Hotkeys
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
    <div className="pos-root">
      <header className="pos-topbar">
        <div className="pos-brand">
          <strong>{bootstrap.tenantName}</strong>
          <span>POS</span>
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
          <span className="pos-chip muted">
            Print:{' '}
            {register?.printMode === 'both'
              ? 'Browser+Thermal'
              : register?.printMode === 'thermal'
                ? 'Thermal'
                : 'Browser'}
          </span>
        </div>
        <div className="pos-top-actions">
          {lastSaleId ? (
            <Link className="pos-link-btn" href={`/pos/receipt/${lastSaleId}`} target="_blank">
              Last receipt
            </Link>
          ) : null}
          <Link className="pos-link-btn" href="/sales/pos">
            History
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
          {/* Catalog */}
          <section className="pos-catalog">
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
          </section>

          {/* Cart */}
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
              {bootstrap.vatRegistered ? (
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
              ) : null}
            </div>

            <div className="pos-cart-lines">
              {cart.length === 0 ? (
                <p className="pos-muted">Cart empty — scan or tap a product.</p>
              ) : (
                cart.map((l) => (
                  <div key={l.key} className="pos-line">
                    <div className="pos-line-main">
                      <strong>{l.description}</strong>
                      <span>LKR {money(l.unitPrice)}</span>
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
                      setHeaderDiscount(Number(String(e.target.value).replace(/[^0-9.]/g, '')) || 0)
                    }
                  />
                </label>
              </div>
              <div className="pos-totals">
                <div>
                  <span>Subtotal</span>
                  <strong>LKR {money(subtotal)}</strong>
                </div>
                <div>
                  <span>Discount</span>
                  <strong>LKR {money(discountAmt)}</strong>
                </div>
                {vat > 0 ? (
                  <div>
                    <span>VAT {vatRate}%</span>
                    <strong>LKR {money(vat)}</strong>
                  </div>
                ) : null}
                <div className="grand">
                  <span>Total</span>
                  <strong>LKR {money(total)}</strong>
                </div>
              </div>
              <div className="pos-cart-actions">
                <button type="button" className="pos-btn" onClick={clearCart} disabled={cart.length === 0}>
                  Clear
                </button>
                <button
                  type="button"
                  className="pos-btn primary pay"
                  onClick={openPay}
                  disabled={cart.length === 0 || pending}
                >
                  PAY · LKR {money(total)}
                </button>
              </div>
              <p className="pos-hotkeys">F4 Pay · Enter add scan · Esc close pay</p>
            </div>
          </section>
        </div>
      )}

      {error ? <div className="pos-toast error">{error}</div> : null}
      {status ? <div className="pos-toast ok">{status}</div> : null}

      {payOpen ? (
        <div className="pos-pay-backdrop" role="dialog" aria-modal="true">
          <div className="pos-pay-sheet">
            <header>
              <h2>Take payment</h2>
              <button type="button" className="pos-btn" onClick={() => setPayOpen(false)}>
                Close
              </button>
            </header>
            <p className="pos-pay-total">
              Total due <strong>LKR {money(total)}</strong>
            </p>
            <div className="pos-tender-tabs">
              {(['cash', 'card', 'bank', 'mixed'] as Tender[]).map((t) => (
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

            {tender === 'cash' ? (
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

            {tender === 'mixed' ? (
              <div className="pos-cash-block">
                <label>
                  Cash
                  <input value={mixedCash} onChange={(e) => setMixedCash(e.target.value)} inputMode="decimal" />
                </label>
                <label>
                  Card
                  <input value={mixedCard} onChange={(e) => setMixedCard(e.target.value)} inputMode="decimal" />
                </label>
              </div>
            ) : null}

            {(tender === 'card' || tender === 'bank') && (
              <p className="pos-muted">Full amount posts to {tender === 'card' ? 'Card clearing (1200)' : 'Bank (1100)'}.</p>
            )}

            {error ? <p className="pos-error">{error}</p> : null}

            <button
              type="button"
              className="pos-btn primary pay wide"
              disabled={pending}
              onClick={completeSale}
            >
              {pending ? 'Posting…' : `Complete sale · LKR ${money(total)}`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
