'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  CheckCircle2,
  Link2,
  Loader2,
  Search,
  SkipForward,
  Unlink,
  Wallet,
} from 'lucide-react';
import {
  confirmStatementLinks,
  getStatementImport,
  manualLinkStatementLine,
  markLinesUnmatched,
  runStatementMatchPass,
  searchBookCandidatesForMatch,
  type MatchCandidateView,
  type StatementImportView,
  type StatementLineView,
} from '@/app/actions/statement-import';
import { StudioShell } from './studio-shell';

type Pass = 'loading' | 'exact' | 'fuzzy' | 'leftover' | 'done';

function formatRs(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}Rs. ${Math.abs(n).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isOpen(l: StatementLineView) {
  return !['reconciled', 'created', 'skipped', 'duplicate'].includes(l.status);
}

function groupForMatch(lines: StatementLineView[]) {
  const exact: StatementLineView[] = [];
  const fuzzy: StatementLineView[] = [];
  const leftover: StatementLineView[] = [];
  const done: StatementLineView[] = [];

  for (const l of lines) {
    if (!isOpen(l)) {
      done.push(l);
      continue;
    }
    if (l.proposedAction === 'link' && l.matchedTransactionId) {
      exact.push(l);
    } else if (l.proposedAction === 'review' || (l.candidates?.length ?? 0) > 0) {
      fuzzy.push(l);
    } else {
      leftover.push(l);
    }
  }
  return { exact, fuzzy, leftover, done };
}

/**
 * BIS-5: After studio import — match bank lines to cashbook (link only, no creates).
 * Pass 1 exact auto-links → Pass 2 fuzzy pick → Pass 3 leftover unmatched.
 */
export function BankMatchWizard({
  importId,
  onDone,
}: {
  importId: string;
  onDone?: () => void;
}) {
  const [view, setView] = useState<StatementImportView | null>(null);
  const [pass, setPass] = useState<Pass>('loading');
  const [fuzzyIdx, setFuzzyIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<MatchCandidateView[]>([]);
  const [pending, startTransition] = useTransition();

  const groups = useMemo(() => (view ? groupForMatch(view.lines) : null), [view]);

  const reload = useCallback(async () => {
    const v = await getStatementImport(importId);
    setView(v);
    return v;
  }, [importId]);

  useEffect(() => {
    let cancelled = false;
    startTransition(() => {
      (async () => {
        setError(null);
        // Always re-score open lines so studio imports get proposals
        const res = await runStatementMatchPass(importId);
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error);
          setPass('done');
          return;
        }
        setView(res.view);
        setInfo(
          `Matched against books: ${res.stats.link} clear · ${res.stats.review} check · ${res.stats.create} no match`,
        );
        const g = groupForMatch(res.view.lines);
        if (g.exact.length > 0) setPass('exact');
        else if (g.fuzzy.length > 0) setPass('fuzzy');
        else if (g.leftover.length > 0) setPass('leftover');
        else setPass('done');
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [importId]);

  // Advance when fuzzy queue becomes empty
  useEffect(() => {
    if (pass === 'fuzzy' && groups && groups.fuzzy.length === 0) {
      if (groups.leftover.length > 0) setPass('leftover');
      else setPass('done');
    }
  }, [pass, groups]);

  function goNextPass(from: Pass, nextView?: StatementImportView | null) {
    const v = nextView ?? view;
    if (!v) {
      setPass('done');
      return;
    }
    const g = groupForMatch(v.lines);
    if (from === 'exact') {
      if (g.fuzzy.length > 0) {
        setFuzzyIdx(0);
        setPass('fuzzy');
      } else if (g.leftover.length > 0) setPass('leftover');
      else setPass('done');
      return;
    }
    if (from === 'fuzzy') {
      if (g.leftover.length > 0) setPass('leftover');
      else setPass('done');
      return;
    }
    setPass('done');
  }

  function confirmExact() {
    if (!view) return;
    setError(null);
    startTransition(() => {
      confirmStatementLinks({ importId: view.id }).then(async (res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setInfo(`Confirmed ${res.linked} clear match${res.linked === 1 ? '' : 'es'}.`);
        const v = await reload();
        goNextPass('exact', v);
      });
    });
  }

  function skipExact() {
    // Leave as proposed — user can confirm later; move to fuzzy
    goNextPass('exact');
  }

  const currentFuzzy = groups?.fuzzy[fuzzyIdx] ?? null;

  function linkFuzzy(transactionId: string) {
    if (!currentFuzzy) return;
    setError(null);
    startTransition(() => {
      manualLinkStatementLine({
        lineId: currentFuzzy.id,
        transactionId,
      }).then(async (res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const v = await reload();
        if (!v) return;
        const g = groupForMatch(v.lines);
        if (g.fuzzy.length === 0) {
          goNextPass('fuzzy', v);
        } else {
          setFuzzyIdx((i) => Math.min(i, g.fuzzy.length - 1));
          setSearchQ('');
          setSearchHits([]);
        }
      });
    });
  }

  function skipFuzzyLine() {
    if (!currentFuzzy || !view) return;
    setError(null);
    startTransition(() => {
      markLinesUnmatched({ importId: view.id, lineIds: [currentFuzzy.id] }).then(async (res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const v = await reload();
        if (!v) return;
        const g = groupForMatch(v.lines);
        if (g.fuzzy.length === 0) goNextPass('fuzzy', v);
        else {
          setFuzzyIdx((i) => Math.min(i, Math.max(g.fuzzy.length - 1, 0)));
          setSearchQ('');
          setSearchHits([]);
        }
      });
    });
  }

  function runSearch() {
    if (!view || !currentFuzzy) return;
    startTransition(() => {
      searchBookCandidatesForMatch({
        importId: view.id,
        lineId: currentFuzzy.id,
        query: searchQ,
        limit: 10,
      }).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setSearchHits(res.candidates);
      });
    });
  }

  function finishLeftover() {
    // Leave unmatched for BIS-6 create later
    setPass('done');
    onDone?.();
  }

  if (pass === 'loading' || !view || !groups) {
    return (
      <StudioShell
        step="import"
        stepIndex={9}
        stepTotal={9}
        title="Matching to books…"
        tone="purple"
        compact
        pending
      >
        <div className="bis-status-ok">
          <Loader2 size={16} className="spin" />
          Comparing bank lines with cashbook entries…
        </div>
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // ─── PASS 1: Exact ───
  if (pass === 'exact') {
    const list = groups.exact;
    return (
      <StudioShell
        step="import"
        stepIndex={9}
        stepTotal={9}
        title="Clear matches"
        tone="green"
        icon={<Link2 size={18} />}
        compact
        pending={pending}
        onBack={undefined}
        onContinue={list.length > 0 ? confirmExact : () => goNextPass('exact')}
        continueLabel={
          list.length > 0
            ? `Confirm ${list.length} match${list.length === 1 ? '' : 'es'}`
            : 'Next'
        }
        continueDisabled={pending}
      >
        <div className="bis-coach green">
          <div className="bis-coach-swatch green" />
          <div>
            <strong>Pass 1 · Exact / strong matches</strong>
            <p>
              Same amount and day (or very close). Confirming only links bank ↔ books — no new
              entries.
            </p>
          </div>
        </div>

        <div className="bis-review-hero">
          <div className="bis-hero-card">
            <span>Clear</span>
            <strong>{list.length}</strong>
          </div>
          <div className="bis-hero-card">
            <span>Check next</span>
            <strong>{groups.fuzzy.length}</strong>
          </div>
          <div className="bis-hero-card">
            <span>No match</span>
            <strong>{groups.leftover.length}</strong>
          </div>
        </div>

        {info ? <p className="bis-match-info">{info}</p> : null}

        <div className="bis-match-list">
          {list.slice(0, 12).map((l) => {
            const book =
              l.candidates.find((c) => c.id === l.matchedTransactionId) ?? l.candidates[0];
            return (
              <div key={l.id} className="bis-match-row ok">
                <div className="bis-match-bank">
                  <span className="d">{l.date}</span>
                  <span className="t">{l.description}</span>
                  <span className={l.amount < 0 ? 'neg' : 'pos'}>{formatRs(l.amount)}</span>
                </div>
                <div className="bis-match-arrow">↔</div>
                <div className="bis-match-book">
                  <span className="d">{book?.date ?? '—'}</span>
                  <span className="t">{book?.description ?? 'Book entry'}</span>
                  <span className="score">
                    {l.matchScore != null ? `${Math.round(l.matchScore * 100)}%` : ''}
                  </span>
                </div>
              </div>
            );
          })}
          {list.length > 12 ? (
            <p className="bis-money-label">+{list.length - 12} more</p>
          ) : null}
          {list.length === 0 ? (
            <div className="bis-status-ok">
              <CheckCircle2 size={16} />
              No clear auto-matches — next we check ambiguous lines.
            </div>
          ) : null}
        </div>

        {list.length > 0 ? (
          <button
            type="button"
            className="bis-btn secondary bis-btn-block"
            disabled={pending}
            onClick={skipExact}
          >
            Skip confirm · review later
          </button>
        ) : null}
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // ─── PASS 2: Fuzzy one-by-one ───
  if (pass === 'fuzzy') {
    if (!currentFuzzy) {
      return (
        <StudioShell
          step="import"
          stepIndex={9}
          stepTotal={9}
          title="Checking…"
          tone="amber"
          compact
          pending
        >
          <div className="bis-status-ok">
            <Loader2 size={16} className="spin" />
            Updating matches…
          </div>
        </StudioShell>
      );
    }
    const total = groups.fuzzy.length;
    const n = Math.min(fuzzyIdx + 1, total);
    const cands =
      searchHits.length > 0
        ? searchHits
        : currentFuzzy.candidates.filter((c) => c.date || c.description);

    return (
      <StudioShell
        step="import"
        stepIndex={9}
        stepTotal={9}
        title="Is this the same entry?"
        tone="amber"
        icon={<Wallet size={18} />}
        compact
        pending={pending}
        onBack={() => setPass(groups.exact.length > 0 ? 'exact' : 'loading')}
        onContinue={() => goNextPass('fuzzy')}
        continueLabel="Skip rest →"
        continueDisabled={pending}
      >
        <div className="bis-resolve-progress">
          <span>
            Check {n} of {total}
          </span>
          <div className="bis-resolve-bar" aria-hidden>
            <i style={{ width: `${(n / Math.max(total, 1)) * 100}%` }} />
          </div>
        </div>

        <div className="bis-coach amber">
          <div className="bis-coach-swatch amber" />
          <div>
            <strong>Pass 2 · Needs your eyes</strong>
            <p>Pick the matching cashbook line, or leave unmatched for later.</p>
          </div>
        </div>

        <div className="bis-match-focus">
          <p className="bis-money-label">Bank line</p>
          <div className="bis-match-row focus">
            <span className="d">{currentFuzzy.date}</span>
            <span className="t">{currentFuzzy.description}</span>
            <span className={currentFuzzy.amount < 0 ? 'neg' : 'pos'}>
              {formatRs(currentFuzzy.amount)}
            </span>
          </div>
        </div>

        <p className="bis-money-label">Possible matches</p>
        <div className="bis-match-cands">
          {cands.length === 0 ? (
            <p className="bis-money-label">No suggestions — search below or skip.</p>
          ) : (
            cands.map((c) => (
              <button
                key={c.id}
                type="button"
                className="bis-match-cand"
                disabled={pending}
                onClick={() => linkFuzzy(c.id)}
              >
                <span className="d">{c.date ?? '—'}</span>
                <span className="t">{c.description ?? 'Book entry'}</span>
                <span className="amt">
                  {c.amountSigned != null ? formatRs(c.amountSigned) : ''}
                  {c.score > 0 ? (
                    <small>{Math.round(c.score * 100)}%</small>
                  ) : null}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="bis-match-search">
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search books by text…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch();
            }}
          />
          <button type="button" className="bis-btn secondary" disabled={pending} onClick={runSearch}>
            <Search size={14} />
            Find
          </button>
        </div>

        <button
          type="button"
          className="bis-btn secondary bis-btn-block"
          disabled={pending}
          onClick={skipFuzzyLine}
        >
          <SkipForward size={14} />
          No match · leave unmatched
        </button>
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // ─── PASS 3: Leftover ───
  if (pass === 'leftover') {
    const list = groups.leftover;
    return (
      <StudioShell
        step="import"
        stepIndex={9}
        stepTotal={9}
        title="Not in books yet"
        tone="purple"
        icon={<Unlink size={18} />}
        compact
        pending={pending}
        onContinue={finishLeftover}
        continueLabel="Done for now"
        continueDisabled={pending}
      >
        <div className="bis-coach">
          <div className="bis-coach-swatch" style={{ background: '#8b5cf6' }} />
          <div>
            <strong>Pass 3 · Unmatched bank lines</strong>
            <p>
              {list.length} line(s) have no book match. Creating cashbook entries is a separate
              step (coming next). Staging stays safe.
            </p>
          </div>
        </div>

        <div className="bis-match-list">
          {list.slice(0, 10).map((l) => (
            <div key={l.id} className="bis-match-row">
              <span className="d">{l.date}</span>
              <span className="t">{l.description}</span>
              <span className={l.amount < 0 ? 'neg' : 'pos'}>{formatRs(l.amount)}</span>
            </div>
          ))}
          {list.length > 10 ? (
            <p className="bis-money-label">+{list.length - 10} more</p>
          ) : null}
        </div>
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // ─── DONE ───
  const linked = groups.done.filter((l) => l.status === 'reconciled' || l.status === 'matched').length;
  const openLeft = groups.exact.length + groups.fuzzy.length + groups.leftover.length;

  return (
    <StudioShell
      step="import"
      stepIndex={9}
      stepTotal={9}
      title="Match complete"
      tone="green"
      icon={<CheckCircle2 size={18} />}
      compact
    >
      <div className="bis-done-card">
        <strong>
          {linked} linked · {openLeft} still open
        </strong>
        <p>
          Bank lines are staged. Linked rows are matched to existing cashbook entries. Open lines
          stay unmatched until you create or match later.
        </p>
      </div>
      {info ? <p className="bis-match-info">{info}</p> : null}
      <div className="bis-done-actions">
        <a className="bis-btn primary" href="/cashbook">
          Back to cashbook
        </a>
        <a className="bis-btn secondary" href="/reconciliation">
          Full reconciliation
        </a>
        <a className="bis-btn secondary" href="/cashbook/import">
          Import another
        </a>
      </div>
      {error ? <p className="bis-error">{error}</p> : null}
    </StudioShell>
  );
}
