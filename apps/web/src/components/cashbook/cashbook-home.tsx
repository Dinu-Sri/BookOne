'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  FileText,
  Landmark,
  Loader2,
  Upload,
} from 'lucide-react';
import { recordEntry } from '@/app/actions/record-entry';
import type { CashbookRow } from '@/app/actions/cashbook';
import { CashbookShell } from '@/components/cashbook/cashbook-shell';
import { gloss, readSiGlossPreference, writeSiGlossPreference } from '@/lib/si-gloss';
import { readBookDomainPref, writeBookDomainPref, type BookDomainPref } from '@/lib/book-domain';
import type { EntityKind } from '@/lib/entity-kind';

type Mode = 'money_in' | 'money_out' | 'move_money' | 'loan' | null;

function formatLkr(n: number) {
  return `LKR ${n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CashbookHomeClient({
  entityKind,
  tenantName,
  initialRows,
  moneyIn,
  moneyOut,
  net,
  period,
}: {
  entityKind: EntityKind;
  tenantName: string;
  initialRows: CashbookRow[];
  moneyIn: number;
  moneyOut: number;
  net: number;
  period: string;
}) {
  const sole = entityKind === 'sole_prop';
  const [si, setSi] = useState(() => readSiGlossPreference());
  const [domain, setDomain] = useState<BookDomainPref>(() =>
    sole ? readBookDomainPref('business') : 'personal',
  );
  const [rows, setRows] = useState(initialRows);
  const [sumIn, setSumIn] = useState(moneyIn);
  const [sumOut, setSumOut] = useState(moneyOut);
  const [sumNet, setSumNet] = useState(net);
  const [mode, setMode] = useState<Mode>(null);
  const [party, setParty] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [payMethod, setPayMethod] = useState<'Cash' | 'Bank'>('Cash');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const title = useMemo(() => {
    if (entityKind === 'sole_prop') {
      return domain === 'personal'
        ? `${tenantName} · ${gloss('personal', si)}`
        : `${tenantName} · ${gloss('business', si)}`;
    }
    return `${tenantName} · ${gloss('personal', si)}`;
  }, [entityKind, domain, tenantName, si]);

  const tiles = useMemo(() => {
    const base = [
      { id: 'money_in' as const, icon: ArrowDownLeft, key: 'money_in' },
      { id: 'money_out' as const, icon: ArrowUpRight, key: 'money_out' },
      { id: 'move_money' as const, icon: ArrowRightLeft, key: 'move_money' },
      { id: 'loan' as const, icon: Landmark, key: 'loan' },
    ];
    if (sole && domain === 'business') {
      return [
        ...base.slice(0, 2),
        { id: 'money_in' as const, icon: FileText, key: 'invoice' },
        { id: 'money_out' as const, icon: FileText, key: 'bill' },
        ...base.slice(2),
      ];
    }
    return base;
  }, [sole, domain]);

  function toggleSi() {
    const next = !si;
    setSi(next);
    writeSiGlossPreference(next);
  }

  function switchDomain(d: BookDomainPref) {
    setDomain(d);
    writeBookDomainPref(d);
    // Reload with domain query so server filters sheet
    window.location.href = `/cashbook?domain=${d}`;
  }

  function openMode(m: Mode) {
    setMode(m);
    setError('');
    setParty('');
    setAmount('');
    setDescription('');
  }

  function submit() {
    const amt = Number(amount);
    if (!party.trim() || !Number.isFinite(amt) || amt <= 0 || !description.trim()) {
      setError('Please fill who, amount, and description.');
      return;
    }
    const direction = mode === 'loan' ? 'money_in' : mode;
    if (!direction || direction === 'loan') {
      // loan: treat took loan as money_in from lender
    }
    const dir =
      mode === 'loan'
        ? description.toLowerCase().includes('pay') || description.toLowerCase().includes('ගෙව')
          ? 'money_out'
          : 'money_in'
        : mode;
    if (!dir) return;

    const paymentAccount =
      payMethod === 'Cash'
        ? { kind: 'code' as const, value: '1000' }
        : { kind: 'code' as const, value: '1100' };

    startTransition(async () => {
      setError('');
      const base = {
        party: party.trim(),
        description: description.trim(),
        amount: amt,
        currency: 'LKR',
        paymentMethod: payMethod,
        paymentAccount,
        date: new Date().toISOString().slice(0, 10),
        bookDomain: domain,
      };

      let result;
      if (dir === 'money_in') {
        result = await recordEntry({
          ...base,
          direction: 'money_in',
          moneyInType: 'owner_contribution',
        });
      } else if (dir === 'money_out') {
        result = await recordEntry({
          ...base,
          direction: 'money_out',
        });
      } else if (dir === 'move_money') {
        result = await recordEntry({
          ...base,
          direction: 'move_money',
          fromAccount: { kind: 'code', value: '1000' },
          toAccount: { kind: 'code', value: '1100' },
          paymentAccount: { kind: 'code', value: '1100' },
        });
      } else {
        return;
      }

      if (!result.success) {
        setError(result.error || 'Could not save');
        return;
      }
      // Optimistic row
      const row: CashbookRow = {
        id: result.transactionId || String(Date.now()),
        date: base.date,
        party: base.party,
        description: base.description,
        direction: dir,
        amount: amt,
        currency: 'LKR',
        bookDomain: domain,
      };
      setRows((r) => [row, ...r]);
      if (dir === 'money_in') {
        setSumIn((v) => v + amt);
        setSumNet((v) => v + amt);
      } else if (dir === 'money_out') {
        setSumOut((v) => v + amt);
        setSumNet((v) => v - amt);
      }
      setMode(null);
    });
  }

  return (
    <CashbookShell
      title={title}
      active="home"
      si={si}
      right={
        <button type="button" className="cashbook-si-toggle" onClick={toggleSi}>
          {si ? 'SI ✓' : 'SI'}
        </button>
      }
    >
      {sole ? (
        <div className="cashbook-domain">
          <button
            type="button"
            className={`cashbook-tile domain ${domain === 'personal' ? 'active' : ''}`}
            onClick={() => switchDomain('personal')}
          >
            {gloss('personal', si)}
          </button>
          <button
            type="button"
            className={`cashbook-tile domain ${domain === 'business' ? 'active' : ''}`}
            onClick={() => switchDomain('business')}
          >
            {gloss('business', si)}
          </button>
        </div>
      ) : null}

      <div className="cashbook-summary">
        <div>
          <span>{gloss('money_in', si)}</span>
          <strong className="in">{formatLkr(sumIn)}</strong>
        </div>
        <div>
          <span>{gloss('money_out', si)}</span>
          <strong className="out">{formatLkr(sumOut)}</strong>
        </div>
        <div>
          <span>Net</span>
          <strong>{formatLkr(sumNet)}</strong>
        </div>
        <div className="muted">{period}</div>
      </div>

      <div className="cashbook-tiles">
        {tiles.map((t) => (
          <button
            key={t.key + t.id}
            type="button"
            className={`cashbook-tile action ${mode === t.id ? 'active' : ''} ${t.id === 'money_in' ? 'in' : t.id === 'money_out' ? 'out' : ''}`}
            onClick={() => openMode(t.id)}
          >
            <t.icon size={22} />
            <span>{gloss(t.key, si)}</span>
          </button>
        ))}
        <button type="button" className="cashbook-tile action muted" disabled title="Coming soon">
          <Upload size={22} />
          <span>{gloss('import_excel', si)}</span>
        </button>
      </div>

      {mode ? (
        <div className="cashbook-entry-card">
          <div className="cashbook-entry-head">
            <strong>{gloss(mode === 'loan' ? 'loan' : mode, si)}</strong>
            <button type="button" className="linkish" onClick={() => setMode(null)}>
              Close
            </button>
          </div>
          <label>
            {mode === 'money_in' || (mode === 'loan' && !description.toLowerCase().includes('pay'))
              ? gloss('from_whom', si)
              : gloss('paid_to', si)}
            <input value={party} onChange={(e) => setParty(e.target.value)} autoFocus />
          </label>
          <label>
            {gloss('amount', si)}
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <label>
            {gloss('description', si)}
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="cashbook-pay-tiles">
            {(['Cash', 'Bank'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`cashbook-tile pay ${payMethod === m ? 'active' : ''}`}
                onClick={() => setPayMethod(m)}
              >
                {gloss(m.toLowerCase(), si)}
              </button>
            ))}
          </div>
          {error ? <p className="cashbook-error">{error}</p> : null}
          <button type="button" className="cashbook-save" disabled={pending} onClick={submit}>
            {pending ? <Loader2 className="spin" size={18} /> : null}
            {gloss('save', si)}
          </button>
        </div>
      ) : null}

      <div className="cashbook-sheet-wrap">
        <table className="cashbook-sheet">
          <thead>
            <tr>
              <th>{gloss('date', si)}</th>
              <th>Who</th>
              <th>{gloss('description', si)}</th>
              <th className="num">In</th>
              <th className="num">Out</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Tap <strong>{gloss('money_out', si)}</strong> to record your first entry.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.party}</td>
                  <td>{r.description}</td>
                  <td className="num in">
                    {r.direction === 'money_in' ? r.amount.toFixed(2) : ''}
                  </td>
                  <td className="num out">
                    {r.direction === 'money_out' ? r.amount.toFixed(2) : ''}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </CashbookShell>
  );
}
