'use client';

import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import {
  commitStudioImport,
  createStudioDraft,
  previewStudioTransform,
  saveStudioDraftStep,
  type StudioDraftView,
  type StudioPreviewPayload,
} from '@/app/actions/bank-import-studio';
import type { LiquidAccount } from '@/app/actions/cashbook-banks';
import type { AmountMode, AmountRules, StudioMapping } from '@bookone/statement-import';
import { SheetGrid, type SheetHighlight } from './sheet-grid';
import { StudioShell, type StudioStepId } from './studio-shell';

type Phase =
  | 'upload'
  | 'account'
  | 'sheet'
  | 'table'
  | 'date'
  | 'description'
  | 'money'
  | 'review'
  | 'done';

type MoneyPick = 'out' | 'in' | 'amount' | 'type' | 'balance' | null;

function formatRs(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}Rs. ${Math.abs(n).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const STEP_META: Record<Phase, { step: StudioStepId; index: number }> = {
  upload: { step: 'upload', index: 1 },
  account: { step: 'account', index: 2 },
  sheet: { step: 'sheet', index: 3 },
  table: { step: 'table', index: 4 },
  date: { step: 'date', index: 5 },
  description: { step: 'description', index: 6 },
  money: { step: 'money', index: 7 },
  review: { step: 'review', index: 8 },
  done: { step: 'import', index: 9 },
};

/**
 * Two-column studio: Excel grid + short step questions with live highlights.
 */
export function BankImportStudioWizard({
  banks,
  source = 'cashbook',
  bookDomain,
  si = false,
  initialDraft = null,
}: {
  banks: LiquidAccount[];
  source?: 'cashbook' | 'erp_recon';
  bookDomain?: 'personal' | 'business' | null;
  si?: boolean;
  initialDraft?: StudioDraftView | null;
}) {
  const bankOnly = useMemo(
    () => banks.filter((b) => b.kind === 'bank' || b.kind === 'card' || b.code === '1000'),
    [banks],
  );
  const [phase, setPhase] = useState<Phase>(() => {
    if (!initialDraft) return 'upload';
    if (!initialDraft.bankAccountId) return 'account';
    return 'sheet';
  });
  const [draft, setDraft] = useState<StudioDraftView | null>(initialDraft);
  const [file, setFile] = useState<File | null>(null);
  const [bankId, setBankId] = useState(
    initialDraft?.bankAccountId ?? bankOnly.find((b) => b.kind === 'bank')?.id ?? '',
  );
  const [sheetName, setSheetName] = useState<string | null>(
    (initialDraft?.draftPayload?.sheetName as string) ??
      initialDraft?.inspection?.bestSheetName ??
      null,
  );
  const [mapping, setMapping] = useState<StudioMapping | null>(null);
  const [preview, setPreview] = useState<StudioPreviewPayload | null>(null);
  const [moneyPick, setMoneyPick] = useState<MoneyPick>('out');
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [saveProfile, setSaveProfile] = useState(true);
  const [importedCount, setImportedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const idempotencyRef = useRef(`studio-${Date.now()}`);

  const meta = STEP_META[phase];

  const runPreview = useCallback(
    (f: File, bank: string, sheet: string, map: StudioMapping | null, open = '', close = '') => {
      const fd = new FormData();
      fd.set('file', f);
      fd.set('bankAccountId', bank);
      fd.set('sheetName', sheet);
      if (map) fd.set('mappingJson', JSON.stringify(map));
      if (open) fd.set('openingBalance', open);
      if (close) fd.set('closingBalance', close);
      return previewStudioTransform(fd);
    },
    [],
  );

  const highlight: SheetHighlight = useMemo(() => {
    if (!mapping || !preview) return { clickMode: 'none' };
    const roles: SheetHighlight['colRoles'] = {};
    const cols: number[] = [];
    const rows: number[] = [];

    if (phase === 'table') {
      rows.push(mapping.headerRowIndex);
      return {
        rows,
        dimAboveRow: mapping.headerRowIndex,
        clickMode: 'row',
        onRowClick: (abs) => {
          const next = { ...mapping, headerRowIndex: abs };
          setMapping(next);
          if (file && bankId && sheetName) {
            startTransition(() => {
              runPreview(file, bankId, sheetName, next).then((res) => {
                if (res.ok) {
                  setPreview(res.preview);
                  setMapping({
                    ...res.preview.suggested,
                    headerRowIndex: abs,
                    dateCol: next.dateCol >= 0 ? next.dateCol : res.preview.suggested.dateCol,
                    descriptionCol:
                      next.descriptionCol >= 0
                        ? next.descriptionCol
                        : res.preview.suggested.descriptionCol,
                    amountRules: next.amountRules.mode
                      ? next.amountRules
                      : res.preview.suggested.amountRules,
                  });
                }
              });
            });
          }
        },
      };
    }

    if (phase === 'date') {
      cols.push(mapping.dateCol);
      roles[mapping.dateCol] = 'date';
      rows.push(mapping.headerRowIndex);
      return {
        cols,
        rows,
        colRoles: roles,
        dimAboveRow: mapping.headerRowIndex,
        clickMode: 'column',
        onColClick: (c) => setMapping({ ...mapping, dateCol: c }),
      };
    }

    if (phase === 'description') {
      cols.push(mapping.descriptionCol);
      roles[mapping.descriptionCol] = 'desc';
      rows.push(mapping.headerRowIndex);
      return {
        cols,
        rows,
        colRoles: roles,
        dimAboveRow: mapping.headerRowIndex,
        clickMode: 'column',
        onColClick: (c) => setMapping({ ...mapping, descriptionCol: c }),
      };
    }

    if (phase === 'money' || phase === 'review') {
      const ar = mapping.amountRules;
      if (ar.mode === 'debit_credit') {
        if (ar.moneyOutCol != null) {
          cols.push(ar.moneyOutCol);
          roles[ar.moneyOutCol] = 'out';
        }
        if (ar.moneyInCol != null) {
          cols.push(ar.moneyInCol);
          roles[ar.moneyInCol] = 'in';
        }
      } else {
        if (ar.amountCol != null) {
          cols.push(ar.amountCol);
          roles[ar.amountCol] = 'amount';
        }
        if (ar.mode === 'amount_with_type' && ar.typeCol != null) {
          cols.push(ar.typeCol);
          roles[ar.typeCol] = 'type';
        }
      }
      if (mapping.balanceCol != null) {
        cols.push(mapping.balanceCol);
        roles[mapping.balanceCol] = 'balance';
      }
      rows.push(mapping.headerRowIndex);
      return {
        cols,
        rows,
        colRoles: roles,
        dimAboveRow: mapping.headerRowIndex,
        clickMode: phase === 'money' ? 'column' : 'none',
        onColClick: (c) => {
          if (phase !== 'money') return;
          const ar2 = { ...mapping.amountRules };
          if (moneyPick === 'out') ar2.moneyOutCol = c;
          else if (moneyPick === 'in') ar2.moneyInCol = c;
          else if (moneyPick === 'amount') ar2.amountCol = c;
          else if (moneyPick === 'type') ar2.typeCol = c;
          else if (moneyPick === 'balance') {
            setMapping({ ...mapping, balanceCol: c });
            return;
          }
          setMapping({ ...mapping, amountRules: ar2 });
        },
      };
    }

    return { clickMode: 'none' };
  }, [mapping, preview, phase, moneyPick, file, bankId, sheetName, runPreview]);

  function upload(chosen: File) {
    setError(null);
    setFile(chosen);
    const fd = new FormData();
    fd.set('file', chosen);
    fd.set('source', source);
    if (bookDomain) fd.set('bookDomain', bookDomain);
    if (bankId) fd.set('bankAccountId', bankId);

    startTransition(() => {
      createStudioDraft(fd).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setDraft(res.draft);
        setSheetName(res.draft.inspection?.bestSheetName ?? null);
        idempotencyRef.current = `studio-${res.draft.id}`;
        if (res.draft.bankAccountId) {
          setBankId(res.draft.bankAccountId);
          setPhase('sheet');
        } else {
          setPhase('account');
        }
      });
    });
  }

  function continueAccount() {
    if (!draft || !bankId) {
      setError('Select a bank');
      return;
    }
    setError(null);
    startTransition(() => {
      saveStudioDraftStep({
        importId: draft.id,
        expectedDraftVersion: draft.draftVersion,
        wizardStep: 'sheet',
        patch: { bankAccountId: bankId },
      }).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setDraft({
          ...draft,
          bankAccountId: bankId,
          draftVersion: res.draftVersion,
          wizardStep: 'sheet',
        });
        setPhase('sheet');
      });
    });
  }

  function continueSheet() {
    if (!draft || !sheetName || !file || !bankId) {
      setError('Select a sheet');
      return;
    }
    setError(null);
    startTransition(() => {
      runPreview(file, bankId, sheetName, null).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setPreview(res.preview);
        setMapping(res.preview.suggested);
        saveStudioDraftStep({
          importId: draft.id,
          expectedDraftVersion: draft.draftVersion,
          wizardStep: 'table',
          patch: { sheetName, mapping: res.preview.suggested },
        }).then((s) => {
          if (!s.ok) {
            setError(s.error);
            return;
          }
          setDraft((d) =>
            d
              ? {
                  ...d,
                  draftVersion: s.draftVersion,
                  wizardStep: 'table',
                  draftPayload: { ...d.draftPayload, sheetName },
                }
              : d,
          );
          setPhase('table');
        });
      });
    });
  }

  function goNextFromTable() {
    setPhase('date');
  }

  function goNextFromDate() {
    if (!mapping || mapping.dateCol < 0) {
      setError('Tap a column on the sheet');
      return;
    }
    setError(null);
    setPhase('description');
  }

  function goNextFromDesc() {
    if (!mapping || mapping.descriptionCol < 0) {
      setError('Tap a column on the sheet');
      return;
    }
    setError(null);
    // Set sensible money pick default for mode
    const m = mapping.amountRules.mode;
    setMoneyPick(m === 'debit_credit' ? 'out' : 'amount');
    setPhase('money');
  }

  function goNextFromMoney() {
    if (!file || !bankId || !sheetName || !mapping) return;
    setError(null);
    startTransition(() => {
      runPreview(file, bankId, sheetName, mapping, openingBalance, closingBalance).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setPreview(res.preview);
        setPhase('review');
      });
    });
  }

  function doCommit() {
    if (!draft || !file || !bankId || !mapping || !sheetName) return;
    const t = preview?.transform;
    if (t && t.errorCount > 0) {
      setError(`Fix ${t.errorCount} problem(s) first`);
      return;
    }
    if (t && !t.balanceCheck.ok) {
      setError(t.balanceCheck.message);
      return;
    }
    if (!window.confirm('Import bank lines only? Books stay unchanged until reconciliation.')) {
      return;
    }

    const fd = new FormData();
    fd.set('importId', draft.id);
    fd.set('file', file);
    fd.set('bankAccountId', bankId);
    fd.set('sheetName', sheetName);
    fd.set('mappingJson', JSON.stringify(mapping));
    fd.set('saveProfile', saveProfile ? '1' : '0');
    fd.set(
      'profileName',
      `${bankOnly.find((b) => b.id === bankId)?.shortName ?? 'Bank'} layout`,
    );
    fd.set('idempotencyKey', idempotencyRef.current);
    if (openingBalance) fd.set('openingBalance', openingBalance);
    if (closingBalance) fd.set('closingBalance', closingBalance);

    setError(null);
    startTransition(() => {
      commitStudioImport(fd).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setImportedCount(res.lineCount);
        setPhase('done');
      });
    });
  }

  function updateMode(mode: AmountMode) {
    if (!mapping) return;
    setMapping({
      ...mapping,
      amountRules: { ...mapping.amountRules, mode },
    });
    setMoneyPick(mode === 'debit_credit' ? 'out' : 'amount');
  }

  const sheetPane =
    preview?.sheetGrid && phase !== 'upload' && phase !== 'account' && phase !== 'sheet' && phase !== 'done' ? (
      <SheetGrid
        grid={preview.sheetGrid}
        startRow={preview.sheetGridStartRow}
        totalRows={preview.sheetRowCount}
        highlight={highlight}
        fileLabel={file?.name ?? draft?.fileName}
      />
    ) : null;

  // ─── UPLOAD ───
  if (phase === 'upload') {
    return (
      <StudioShell
        step={meta.step}
        stepIndex={meta.index}
        stepTotal={9}
        title="Upload bank file"
        compact
        pending={pending}
      >
        <div
          className={`bis-drop ${dragOver ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) upload(f);
          }}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          {pending ? <Loader2 className="spin" size={28} /> : <FileSpreadsheet size={28} />}
          <strong>Drop Excel / CSV</strong>
          <small>or click to choose</small>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.tsv,.txt"
            hidden
            disabled={pending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = '';
            }}
          />
        </div>
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // ─── ACCOUNT ───
  if (phase === 'account' && draft) {
    return (
      <StudioShell
        step={meta.step}
        stepIndex={meta.index}
        stepTotal={9}
        title="Which bank?"
        compact
        pending={pending}
        onBack={() => setPhase('upload')}
        onContinue={continueAccount}
        continueDisabled={!bankId}
      >
        <div className="bis-cards">
          {bankOnly.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`bis-card ${bankId === b.id ? 'active' : ''}`}
              onClick={() => setBankId(b.id)}
            >
              <strong>{b.shortName}</strong>
              <span>{b.code}</span>
            </button>
          ))}
        </div>
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // ─── SHEET ───
  if (phase === 'sheet' && draft?.inspection) {
    return (
      <StudioShell
        step={meta.step}
        stepIndex={meta.index}
        stepTotal={9}
        title="Which sheet?"
        compact
        pending={pending}
        onBack={() => setPhase(bankId ? 'upload' : 'account')}
        onContinue={continueSheet}
        continueDisabled={!sheetName}
      >
        <div className="bis-cards">
          {draft.inspection.sheets.map((s) => (
            <button
              key={s.name}
              type="button"
              className={`bis-card ${sheetName === s.name ? 'active' : ''}`}
              onClick={() => setSheetName(s.name)}
            >
              <strong>{s.name}</strong>
              <span>
                ~{s.probableTransactionCount} lines
                {s.dateFrom ? ` · ${s.dateFrom}` : ''}
              </span>
            </button>
          ))}
        </div>
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // ─── TABLE ───
  if (phase === 'table' && mapping) {
    return (
      <StudioShell
        step={meta.step}
        stepIndex={meta.index}
        stepTotal={9}
        title="Tap header row"
        sheet={sheetPane}
        pending={pending}
        onBack={() => setPhase('sheet')}
        onContinue={goNextFromTable}
      >
        <p className="bis-tip">Blue row = column names. Tap another row to change.</p>
        <p className="bis-tip muted">Row {mapping.headerRowIndex + 1} selected</p>
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // ─── DATE ───
  if (phase === 'date' && mapping) {
    return (
      <StudioShell
        step={meta.step}
        stepIndex={meta.index}
        stepTotal={9}
        title="Tap date column"
        sheet={sheetPane}
        pending={pending}
        onBack={() => setPhase('table')}
        onContinue={goNextFromDate}
      >
        <p className="bis-tip">Yellow column = date. Tap a column letter or any cell in it.</p>
        <p className="bis-tip muted">
          {preview?.columns.find((c) => c.index === mapping.dateCol)?.label ?? `Col ${mapping.dateCol + 1}`}
        </p>
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // ─── DESCRIPTION ───
  if (phase === 'description' && mapping) {
    return (
      <StudioShell
        step={meta.step}
        stepIndex={meta.index}
        stepTotal={9}
        title="Tap details column"
        sheet={sheetPane}
        pending={pending}
        onBack={() => setPhase('date')}
        onContinue={goNextFromDesc}
      >
        <p className="bis-tip">Green column = description / particulars.</p>
        <p className="bis-tip muted">
          {preview?.columns.find((c) => c.index === mapping.descriptionCol)?.label ??
            `Col ${mapping.descriptionCol + 1}`}
        </p>
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // ─── MONEY ───
  if (phase === 'money' && mapping) {
    const mode = mapping.amountRules.mode as AmountMode;
    return (
      <StudioShell
        step={meta.step}
        stepIndex={meta.index}
        stepTotal={9}
        title="How is money shown?"
        sheet={sheetPane}
        pending={pending}
        onBack={() => setPhase('description')}
        onContinue={goNextFromMoney}
        continueLabel="Review"
      >
        <div className="bis-mode-row">
          {(
            [
              ['debit_credit', 'Out + In cols'],
              ['amount_with_type', 'Amount + DR/CR'],
              ['signed_amount', 'One amount ±'],
              ['embedded_indicator', 'Amount has DR'],
            ] as const
          ).map(([m, lab]) => (
            <button
              key={m}
              type="button"
              className={`bis-chip ${mode === m ? 'active' : ''}`}
              onClick={() => updateMode(m)}
            >
              {lab}
            </button>
          ))}
        </div>

        <p className="bis-tip">Then tap columns on the sheet:</p>
        <div className="bis-mode-row">
          {mode === 'debit_credit' ? (
            <>
              <button
                type="button"
                className={`bis-chip role-out ${moneyPick === 'out' ? 'active' : ''}`}
                onClick={() => setMoneyPick('out')}
              >
                Out col
              </button>
              <button
                type="button"
                className={`bis-chip role-in ${moneyPick === 'in' ? 'active' : ''}`}
                onClick={() => setMoneyPick('in')}
              >
                In col
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`bis-chip role-amount ${moneyPick === 'amount' ? 'active' : ''}`}
                onClick={() => setMoneyPick('amount')}
              >
                Amount
              </button>
              {mode === 'amount_with_type' ? (
                <button
                  type="button"
                  className={`bis-chip role-type ${moneyPick === 'type' ? 'active' : ''}`}
                  onClick={() => setMoneyPick('type')}
                >
                  DR/CR
                </button>
              ) : null}
            </>
          )}
          <button
            type="button"
            className={`bis-chip role-balance ${moneyPick === 'balance' ? 'active' : ''}`}
            onClick={() => setMoneyPick('balance')}
          >
            Balance?
          </button>
        </div>

        <ul className="bis-map-summary">
          {mode === 'debit_credit' ? (
            <>
              <li>
                Out → col {((mapping.amountRules.moneyOutCol ?? -1) + 1) || '—'}
              </li>
              <li>
                In → col {((mapping.amountRules.moneyInCol ?? -1) + 1) || '—'}
              </li>
            </>
          ) : (
            <>
              <li>
                Amount → col {((mapping.amountRules.amountCol ?? -1) + 1) || '—'}
              </li>
              {mode === 'amount_with_type' ? (
                <li>
                  DR/CR → col {((mapping.amountRules.typeCol ?? -1) + 1) || '—'}
                </li>
              ) : null}
            </>
          )}
          {mapping.balanceCol != null ? <li>Balance → col {mapping.balanceCol + 1}</li> : null}
        </ul>
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // ─── REVIEW ───
  if (phase === 'review' && preview?.transform && mapping) {
    const t = preview.transform;
    const canImport = t.errorCount === 0 && t.balanceCheck.ok && t.readyCount > 0;
    return (
      <StudioShell
        step={meta.step}
        stepIndex={meta.index}
        stepTotal={9}
        title="Check amounts"
        sheet={sheetPane}
        pending={pending}
        onBack={() => setPhase('money')}
        onContinue={doCommit}
        continueLabel="Import"
        continueDisabled={!canImport || pending}
      >
        <div className="bis-mini-stats">
          <div>
            <span>Lines</span>
            <strong>{t.readyCount + t.warningCount}</strong>
          </div>
          <div className="in">
            <span>In</span>
            <strong>{formatRs(t.totals.totalMoneyIn)}</strong>
          </div>
          <div className="out">
            <span>Out</span>
            <strong>{formatRs(t.totals.totalMoneyOut)}</strong>
          </div>
        </div>

        {t.errorCount > 0 ? (
          <p className="bis-error">{t.errorCount} problems — go Back and fix columns</p>
        ) : (
          <p className="bis-tip ok">✓ Ready · books not changed yet</p>
        )}

        <div className="bis-sample-list">
          {t.samplePreview.slice(0, 6).map((l) => (
            <div key={l.rowNumber} className="bis-sample-row">
              <span className="d">{l.date}</span>
              <span className="t">{l.description}</span>
              <span className={l.signedAmount < 0 ? 'neg' : 'pos'}>{formatRs(l.signedAmount)}</span>
            </div>
          ))}
        </div>

        <div className="bis-two-col tight">
          <label className="bis-field">
            <span>Open bal.</span>
            <input
              inputMode="decimal"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder="optional"
            />
          </label>
          <label className="bis-field">
            <span>Close bal.</span>
            <input
              inputMode="decimal"
              value={closingBalance}
              onChange={(e) => setClosingBalance(e.target.value)}
              placeholder="optional"
            />
          </label>
        </div>
        {(openingBalance || closingBalance) && file && bankId && sheetName ? (
          <button
            type="button"
            className="bis-link"
            onClick={() => {
              startTransition(() => {
                runPreview(file, bankId, sheetName, mapping, openingBalance, closingBalance).then(
                  (res) => {
                    if (res.ok) setPreview(res.preview);
                    else setError(res.error);
                  },
                );
              });
            }}
          >
            Recheck balance
          </button>
        ) : null}
        {!t.balanceCheck.ok ? <p className="bis-error">{t.balanceCheck.message}</p> : null}

        <label className="bis-check">
          <input
            type="checkbox"
            checked={saveProfile}
            onChange={(e) => setSaveProfile(e.target.checked)}
          />
          <span>Remember setup</span>
        </label>
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // ─── DONE ───
  if (phase === 'done') {
    return (
      <StudioShell
        step="import"
        stepIndex={9}
        stepTotal={9}
        title="Imported"
        compact
      >
        <p className="bis-tip ok">
          {importedCount} bank lines saved. Ledger unchanged.
        </p>
        <a className="bis-btn primary" href="/cashbook" style={{ display: 'inline-flex', textDecoration: 'none' }}>
          Cashbook
        </a>
        <p className="bis-tip muted">
          <a href="/reconciliation">Reconciliation</a>
          {' · '}
          <button type="button" className="bis-link" onClick={() => window.location.reload()}>
            Another file
          </button>
        </p>
      </StudioShell>
    );
  }

  return (
    <StudioShell step="upload" stepIndex={1} stepTotal={9} title="…" compact>
      {pending ? <Loader2 className="spin" /> : null}
      {error ? <p className="bis-error">{error}</p> : null}
    </StudioShell>
  );
}
