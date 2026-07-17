'use client';

import { useEffect, useState } from 'react';
import {
  POS_DISPLAY_CHANNEL,
  type PosDisplayMessage,
} from '@/lib/pos/customer-display-channel';

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CustomerDisplayPage() {
  const [msg, setMsg] = useState<PosDisplayMessage | null>(null);

  useEffect(() => {
    function apply(raw: unknown) {
      if (!raw || typeof raw !== 'object') return;
      const m = raw as PosDisplayMessage;
      if (!m.type) return;
      setMsg(m);
    }

    try {
      const cached = localStorage.getItem(POS_DISPLAY_CHANNEL);
      if (cached) apply(JSON.parse(cached));
    } catch {
      /* ignore */
    }

    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(POS_DISPLAY_CHANNEL);
      ch.onmessage = (e) => apply(e.data);
    } catch {
      /* ignore */
    }

    function onStorage(e: StorageEvent) {
      if (e.key !== POS_DISPLAY_CHANNEL || !e.newValue) return;
      try {
        apply(JSON.parse(e.newValue));
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      ch?.close();
    };
  }, []);

  const store = msg && 'storeName' in msg ? msg.storeName : 'BookOne POS';
  const reg = msg && 'registerLabel' in msg ? msg.registerLabel : '';

  return (
    <div className="cfd-root">
      <header className="cfd-head">
        <div>
          <strong>{store}</strong>
          <span>{reg}</span>
        </div>
        <em>Customer display</em>
      </header>

      {!msg || msg.type === 'idle' ? (
        <div className="cfd-idle">
          <h1>Welcome</h1>
          <p>Your items will appear here</p>
        </div>
      ) : null}

      {msg?.type === 'thankyou' ? (
        <div className="cfd-idle thankyou">
          <h1>{msg.mode === 'return' ? 'Refund complete' : 'Thank you!'}</h1>
          <p className="cfd-total">LKR {money(msg.total)}</p>
          <p>Please take your receipt</p>
        </div>
      ) : null}

      {msg?.type === 'cart' ? (
        <div className="cfd-main">
          <div className={`cfd-mode ${msg.mode === 'return' ? 'return' : ''}`}>
            {msg.mode === 'return' ? 'RETURN' : 'SALE'}
          </div>
          <div className="cfd-lines">
            {msg.lines.length === 0 ? (
              <p className="cfd-empty">No items yet</p>
            ) : (
              msg.lines.map((l, i) => (
                <div key={`${l.description}-${i}`} className="cfd-line">
                  <div>
                    <strong>{l.description}</strong>
                    <span>
                      {l.quantity} × {money(l.unitPrice)}
                    </span>
                  </div>
                  <em>LKR {money(l.amount)}</em>
                </div>
              ))
            )}
          </div>
          <div className="cfd-foot">
            {msg.discount > 0 ? (
              <div>
                <span>Discount</span>
                <strong>− LKR {money(msg.discount)}</strong>
              </div>
            ) : null}
            {msg.tax > 0 ? (
              <div>
                <span>VAT</span>
                <strong>LKR {money(msg.tax)}</strong>
              </div>
            ) : null}
            <div className="grand">
              <span>Total</span>
              <strong>LKR {money(msg.total)}</strong>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
