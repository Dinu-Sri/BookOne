'use client';

import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Columns3,
  ExternalLink,
  FileSpreadsheet,
  LayoutList,
  Loader2,
  MousePointerClick,
  Rows3,
  SkipForward,
  Wallet,
  X,
} from 'lucide-react';
import {
  commitStudioImport,
  createStudioDraft,
  previewStudioTransform,
  saveStudioDraftStep,
  type StudioDraftView,
  type StudioPreviewPayload,
} from '@/app/actions/bank-import-studio';
import type { LiquidAccount } from '@/app/actions/cashbook-banks';
// Client-safe entry only — main package pulls node:crypto (breaks next build)
import {
  collectUnknownMoneyLabels,
  type AmountMode,
  type AmountRules,
  type StudioLine,
  type StudioMapping,
  type UnknownLabelIssue,
} from '@bookone/statement-import/client';
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
  | 'resolve'
  | 'review'
  | 'done';

type LabelChoice = 'out' | 'in' | 'ignore';

type MoneyPick = 'out' | 'in' | 'amount' | 'type' | 'balance' | null;

function formatRs(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}Rs. ${Math.abs(n).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Clear fix guidance for the review problems modal */
function fixGuideForIssue(type: string): { how: string; steps: string[] } {
  switch (type) {
    case 'unknown_label':
      return {
        how: 'Bank used a money code we do not know yet (not plain DR/CR).',
        steps: [
          'Tap “Resolve labels one by one”.',
          'For each code, choose Money out, Money in, or Skip those rows.',
          'We re-check the file after each choice.',
        ],
      };
    case 'invalid_date':
    case 'ambiguous_date':
      return {
        how: 'Some rows have a missing or unclear date.',
        steps: [
          'Tap Fix → Date step.',
          'Tap the correct date column on the sheet (yellow).',
          'If the bank uses DD/MM, keep that column; skip junk header rows if needed.',
        ],
      };
    case 'both_in_out':
      return {
        how: 'A row has values in both Money out and Money in columns.',
        steps: [
          'Tap Fix → Money step.',
          'Confirm Out and In columns are not the same column.',
          'Or re-map layout to Amount + type if the bank uses DR/CR.',
        ],
      };
    case 'money_setup':
    case 'unknown_direction':
    case 'empty_amount':
      return {
        how: 'Money columns are not set up correctly for this layout.',
        steps: [
          'Tap Fix → Money step.',
          'Pick the layout that matches your file (Out+In, Amount+type, …).',
          'Tap the correct columns on the sheet, then Review again.',
        ],
      };
    case 'balance_mismatch':
      return {
        how: 'Opening + money in − money out does not equal closing.',
        steps: [
          'Open “Opening / closing balance” on Review.',
          'Clear both fields if you are not sure, or correct the numbers.',
          'Fix any red problem rows first if amounts look wrong.',
        ],
      };
    case 'duplicate_row':
      return {
        how: 'Two rows look identical (same date, amount, description).',
        steps: [
          'Check the sheet for repeated lines.',
          'Save good lines only to skip duplicates, or fix the file and re-import.',
        ],
      };
    case 'repeated_header':
    case 'excluded_summary':
      return {
        how: 'Header or summary rows are mixed into the data.',
        steps: [
          'Tap Fix → header step.',
          'Select the true column-name row (blue).',
          'Review again — summary rows are skipped automatically when possible.',
        ],
      };
    default:
      return {
        how: 'This row could not be read safely.',
        steps: [
          'Use Fix to jump to the related mapping step.',
          'Or “Save good lines only” to import the rest without this row.',
        ],
      };
  }
}

const STEP_META: Record<Phase, { step: StudioStepId; index: number }> = {
  upload: { step: 'upload', index: 1 },
  account: { step: 'account', index: 2 },
  sheet: { step: 'sheet', index: 3 },
  table: { step: 'table', index: 4 },
  date: { step: 'date', index: 5 },
  description: { step: 'description', index: 6 },
  money: { step: 'money', index: 7 },
  resolve: { step: 'review', index: 8 },
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
  const isErp = source === 'erp_recon';
  const hubAfterImport = isErp ? '/reconciliation' : '/cashbook/bank-imports';
  const matchBase = isErp ? '/reconciliation' : '/cashbook/match';
  const homeAfterImport = isErp ? '/dashboard' : '/cashbook';
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
  const [importedId, setImportedId] = useState<string | null>(null);
  const [importNotes, setImportNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  /** One-by-one unknown-label queue (issue wizard) */
  const [resolveQueue, setResolveQueue] = useState<UnknownLabelIssue[]>([]);
  const [resolveIdx, setResolveIdx] = useState(0);
  /** Full problems + fix steps modal on review */
  const [problemsOpen, setProblemsOpen] = useState(false);
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

  const errorRowNumbers = useMemo(() => {
    if (!preview?.transform?.lines) return [] as number[];
    // StudioLine.rowNumber is 1-based spreadsheet style (header+data offset)
    // Convert to 0-based abs index: rowNumber - 1
    return preview.transform.lines
      .filter((l) => l.validationStatus === 'error')
      .map((l) => l.rowNumber - 1);
  }, [preview]);

  const currentResolveIssue = resolveQueue[resolveIdx] ?? null;

  const resolveErrorRows = useMemo(() => {
    if (!preview?.transform?.lines || !currentResolveIssue) return [] as number[];
    return preview.transform.lines
      .filter(
        (l) =>
          l.validationStatus === 'error' &&
          l.unknownLabel === currentResolveIssue.label,
      )
      .map((l) => l.rowNumber - 1);
  }, [preview, currentResolveIssue]);

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

    if (phase === 'money' || phase === 'review' || phase === 'resolve') {
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
      const errRows =
        phase === 'resolve'
          ? resolveErrorRows
          : phase === 'review'
            ? errorRowNumbers
            : undefined;
      return {
        cols,
        rows,
        errorRows: errRows,
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
  }, [
    mapping,
    preview,
    phase,
    moneyPick,
    file,
    bankId,
    sheetName,
    runPreview,
    errorRowNumbers,
    resolveErrorRows,
  ]);

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

  function enterResolveWizard(lines: StudioLine[]) {
    const queue = collectUnknownMoneyLabels(lines);
    if (queue.length === 0) {
      setResolveQueue([]);
      setResolveIdx(0);
      setPhase('review');
      return;
    }
    setResolveQueue(queue);
    setResolveIdx(0);
    setPhase('resolve');
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
        const unknowns = collectUnknownMoneyLabels(res.preview.transform.lines);
        if (unknowns.length > 0) {
          setResolveQueue(unknowns);
          setResolveIdx(0);
          setPhase('resolve');
        } else {
          setResolveQueue([]);
          setResolveIdx(0);
          setPhase('review');
        }
      });
    });
  }

  function importBlockReason(opts?: { allowSkipErrors?: boolean }): string | null {
    const t = preview?.transform;
    if (!t) return 'Still reading the file…';
    if (t.readyCount <= 0) return 'No valid lines yet — fix date or money columns below.';
    if (t.errorCount > 0 && !opts?.allowSkipErrors) {
      const top = t.issues.find((i) => i.severity === 'error');
      return top
        ? `${t.errorCount} problem line(s): ${top.title}`
        : `${t.errorCount} problem line(s) — use Fix below or save good lines only.`;
    }
    if (
      !t.balanceCheck.ok &&
      openingBalance.trim() !== '' &&
      closingBalance.trim() !== ''
    ) {
      return 'Opening/closing balance do not match. Clear those fields or fix lines.';
    }
    return null;
  }

  /** Map issue type → which step to open for fixing */
  function stepForIssue(type: string): Phase {
    if (type === 'invalid_date' || type === 'ambiguous_date') return 'date';
    if (type === 'unknown_label') return 'resolve';
    if (
      type === 'both_in_out' ||
      type === 'unknown_direction' ||
      type === 'money_setup' ||
      type === 'empty_amount'
    )
      return 'money';
    if (type === 'repeated_header' || type === 'excluded_summary') return 'table';
    if (type === 'balance_mismatch') return 'review';
    return 'money';
  }

  function goFixIssue(type: string) {
    setError(null);
    if (type === 'unknown_label' && preview?.transform?.lines) {
      enterResolveWizard(preview.transform.lines);
      return;
    }
    const next = stepForIssue(type);
    if (next === 'money') {
      const m = mapping?.amountRules.mode;
      setMoneyPick(m === 'debit_credit' ? 'out' : 'amount');
    }
    setPhase(next);
  }

  /** Apply Money Out / Money In / Ignore to one unknown label, re-preview, next issue. */
  function applyLabelResolution(label: string, choice: LabelChoice) {
    if (!file || !bankId || !sheetName || !mapping) return;
    setError(null);
    const ar: AmountRules = { ...mapping.amountRules };
    if (choice === 'out') {
      const list = [...(ar.moneyOutTokens ?? [])];
      if (!list.some((t) => t.toLowerCase() === label.toLowerCase())) list.push(label);
      ar.moneyOutTokens = list;
      // Ensure it is not also ignored / in
      ar.ignoreMoneyLabels = (ar.ignoreMoneyLabels ?? []).filter(
        (t) => t.toLowerCase() !== label.toLowerCase(),
      );
      ar.moneyInTokens = (ar.moneyInTokens ?? []).filter(
        (t) => t.toLowerCase() !== label.toLowerCase(),
      );
    } else if (choice === 'in') {
      const list = [...(ar.moneyInTokens ?? [])];
      if (!list.some((t) => t.toLowerCase() === label.toLowerCase())) list.push(label);
      ar.moneyInTokens = list;
      ar.ignoreMoneyLabels = (ar.ignoreMoneyLabels ?? []).filter(
        (t) => t.toLowerCase() !== label.toLowerCase(),
      );
      ar.moneyOutTokens = (ar.moneyOutTokens ?? []).filter(
        (t) => t.toLowerCase() !== label.toLowerCase(),
      );
    } else {
      const list = [...(ar.ignoreMoneyLabels ?? [])];
      if (!list.some((t) => t.toLowerCase() === label.toLowerCase())) list.push(label);
      ar.ignoreMoneyLabels = list;
      ar.moneyOutTokens = (ar.moneyOutTokens ?? []).filter(
        (t) => t.toLowerCase() !== label.toLowerCase(),
      );
      ar.moneyInTokens = (ar.moneyInTokens ?? []).filter(
        (t) => t.toLowerCase() !== label.toLowerCase(),
      );
    }
    const nextMap: StudioMapping = { ...mapping, amountRules: ar };
    setMapping(nextMap);
    startTransition(() => {
      runPreview(file, bankId, sheetName, nextMap, openingBalance, closingBalance).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setPreview(res.preview);
        const remaining = collectUnknownMoneyLabels(res.preview.transform.lines);
        if (remaining.length === 0) {
          setResolveQueue([]);
          setResolveIdx(0);
          setPhase('review');
        } else {
          setResolveQueue(remaining);
          setResolveIdx(0);
        }
      });
    });
  }

  function doCommit(opts?: { skipErrorLines?: boolean }) {
    if (!draft || !file || !bankId || !mapping || !sheetName) return;
    const block = importBlockReason({ allowSkipErrors: opts?.skipErrorLines });
    if (block) {
      setError(block);
      return;
    }
    const t = preview?.transform;
    const good = t ? t.readyCount + t.warningCount : 0;
    const bad = t?.errorCount ?? 0;
    const msg = opts?.skipErrorLines && bad > 0
      ? `Save ${good} good line(s) and skip ${bad} problem line(s)? Cashbook stays unchanged.`
      : 'Save bank lines only? Your cashbook stays the same until you match later.';
    if (!window.confirm(msg)) return;

    const fd = new FormData();
    fd.set('importId', draft.id);
    fd.set('file', file);
    fd.set('bankAccountId', bankId);
    fd.set('sheetName', sheetName);
    fd.set('mappingJson', JSON.stringify(mapping));
    fd.set('saveProfile', saveProfile ? '1' : '0');
    fd.set('skipErrorLines', opts?.skipErrorLines ? '1' : '0');
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
        setImportedId(res.importId);
        setImportNotes(
          [
            res.duplicateCount > 0
              ? `${res.duplicateCount} already-imported line(s) marked duplicate (not re-saved as new).`
              : '',
            ...(res.warnings ?? []).slice(0, 4),
          ].filter(Boolean),
        );
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
        title="Find the header"
        tone="blue"
        icon={<Rows3 size={18} />}
        sheet={sheetPane}
        pending={pending}
        onBack={() => setPhase('sheet')}
        onContinue={goNextFromTable}
      >
        <div className="bis-coach blue">
          <div className="bis-coach-swatch blue" />
          <div>
            <strong>Blue row = column names</strong>
            <p>Tap any row number on the left sheet.</p>
          </div>
        </div>
        <div className="bis-selected-pill blue">
          <MousePointerClick size={14} />
          Row {mapping.headerRowIndex + 1} selected
        </div>
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // ─── DATE ───
  if (phase === 'date' && mapping) {
    const lab = preview?.columns.find((c) => c.index === mapping.dateCol)?.label;
    return (
      <StudioShell
        step={meta.step}
        stepIndex={meta.index}
        stepTotal={9}
        title="Which column is the date?"
        tone="yellow"
        icon={<Calendar size={18} />}
        sheet={sheetPane}
        pending={pending}
        onBack={() => setPhase('table')}
        onContinue={goNextFromDate}
      >
        <div className="bis-coach yellow">
          <div className="bis-coach-swatch yellow" />
          <div>
            <strong>Yellow = date</strong>
            <p>Tap column 1, 2, 3… on the sheet.</p>
          </div>
        </div>
        <div className="bis-selected-pill yellow">
          Col {mapping.dateCol + 1}
          {lab ? ` · ${lab}` : ''}
        </div>
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // ─── DESCRIPTION ───
  if (phase === 'description' && mapping) {
    const lab = preview?.columns.find((c) => c.index === mapping.descriptionCol)?.label;
    return (
      <StudioShell
        step={meta.step}
        stepIndex={meta.index}
        stepTotal={9}
        title="Which column is the details?"
        tone="green"
        icon={<LayoutList size={18} />}
        sheet={sheetPane}
        pending={pending}
        onBack={() => setPhase('date')}
        onContinue={goNextFromDesc}
      >
        <div className="bis-coach green">
          <div className="bis-coach-swatch green" />
          <div>
            <strong>Green = details</strong>
            <p>Particulars / narration / description.</p>
          </div>
        </div>
        <div className="bis-selected-pill green">
          Col {mapping.descriptionCol + 1}
          {lab ? ` · ${lab}` : ''}
        </div>
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
        tone="amber"
        icon={<Wallet size={18} />}
        sheet={sheetPane}
        pending={pending}
        onBack={() => setPhase('description')}
        onContinue={goNextFromMoney}
        continueLabel="Review"
      >
        <div className="bis-money-box">
          <p className="bis-money-label">1. Pick layout</p>
          <div className="bis-mode-row">
            {(
              [
                ['debit_credit', 'Out + In', 'Two amount columns'],
                ['amount_with_type', 'Amount + type', 'e.g. DR / CR'],
                ['signed_amount', 'One amount ±', 'Minus = out'],
                ['embedded_indicator', 'DR in amount', '5,000 DR'],
              ] as const
            ).map(([m, lab, hint]) => (
              <button
                key={m}
                type="button"
                className={`bis-mode-card ${mode === m ? 'active' : ''}`}
                onClick={() => updateMode(m)}
              >
                <strong>{lab}</strong>
                <span>{hint}</span>
              </button>
            ))}
          </div>

          <p className="bis-money-label">2. Tap columns on the sheet</p>
          <div className="bis-mode-row">
            {mode === 'debit_credit' ? (
              <>
                <button
                  type="button"
                  className={`bis-chip role-out ${moneyPick === 'out' ? 'active' : ''}`}
                  onClick={() => setMoneyPick('out')}
                >
                  Money out
                </button>
                <button
                  type="button"
                  className={`bis-chip role-in ${moneyPick === 'in' ? 'active' : ''}`}
                  onClick={() => setMoneyPick('in')}
                >
                  Money in
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
                    DR / CR
                  </button>
                ) : null}
              </>
            )}
            <button
              type="button"
              className={`bis-chip role-balance ${moneyPick === 'balance' ? 'active' : ''}`}
              onClick={() => setMoneyPick('balance')}
            >
              Balance (opt.)
            </button>
          </div>

          <div className="bis-map-cards">
            {mode === 'debit_credit' ? (
              <>
                <span className="bis-map-card out">
                  Out · Col{' '}
                  {mapping.amountRules.moneyOutCol != null
                    ? mapping.amountRules.moneyOutCol + 1
                    : '—'}
                </span>
                <span className="bis-map-card in">
                  In · Col{' '}
                  {mapping.amountRules.moneyInCol != null
                    ? mapping.amountRules.moneyInCol + 1
                    : '—'}
                </span>
              </>
            ) : (
              <>
                <span className="bis-map-card amount">
                  Amount · Col{' '}
                  {mapping.amountRules.amountCol != null
                    ? mapping.amountRules.amountCol + 1
                    : '—'}
                </span>
                {mode === 'amount_with_type' ? (
                  <span className="bis-map-card type">
                    DR/CR · Col{' '}
                    {mapping.amountRules.typeCol != null
                      ? mapping.amountRules.typeCol + 1
                      : '—'}
                  </span>
                ) : null}
              </>
            )}
            {mapping.balanceCol != null ? (
              <span className="bis-map-card bal">Balance · Col {mapping.balanceCol + 1}</span>
            ) : null}
          </div>
        </div>
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // ─── RESOLVE (one label at a time) ───
  if (phase === 'resolve' && mapping && preview?.transform) {
    const issue = currentResolveIssue;
    const totalIssues = resolveQueue.length;
    const issueNum = Math.min(resolveIdx + 1, Math.max(totalIssues, 1));
    const sampleLines = issue
      ? preview.transform.lines
          .filter(
            (l) => l.validationStatus === 'error' && l.unknownLabel === issue.label,
          )
          .slice(0, 4)
      : [];

    return (
      <StudioShell
        step={meta.step}
        stepIndex={meta.index}
        stepTotal={9}
        title={
          issue
            ? `What is “${issue.label}”?`
            : 'Resolve unknown labels'
        }
        tone="amber"
        icon={<Wallet size={18} />}
        sheet={sheetPane}
        pending={pending}
        onBack={() => setPhase('money')}
        onContinue={() => {
          if (preview?.transform) {
            const remaining = collectUnknownMoneyLabels(preview.transform.lines);
            if (remaining.length === 0) setPhase('review');
            else {
              setResolveQueue(remaining);
              setResolveIdx(0);
            }
          } else setPhase('review');
        }}
        continueLabel={totalIssues === 0 ? 'Review' : 'Skip rest → Review'}
        continueDisabled={pending}
      >
        {issue ? (
          <div className="bis-resolve-panel">
            <div className="bis-resolve-progress">
              <span>
                Label {issueNum} of {totalIssues}
              </span>
              <div className="bis-resolve-bar" aria-hidden>
                <i style={{ width: `${(issueNum / Math.max(totalIssues, 1)) * 100}%` }} />
              </div>
            </div>

            <div className="bis-coach amber">
              <div className="bis-coach-swatch amber" />
              <div>
                <strong>
                  “{issue.label}” on {issue.count} row{issue.count === 1 ? '' : 's'}
                </strong>
                <p>
                  Red rows on the sheet use this bank code. Choose once — applies to all of them.
                </p>
              </div>
            </div>

            <div className="bis-label-badge" title={issue.label}>
              {issue.label}
            </div>

            {sampleLines.length > 0 ? (
              <div className="bis-problem-lines">
                <p className="bis-money-label">Examples on sheet</p>
                {sampleLines.map((l) => (
                  <div key={l.rowNumber} className="bis-sample-row err">
                    <span className="d">R{l.rowNumber}</span>
                    <span className="t">{l.description || '—'}</span>
                    <span className="neg">{issue.label}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <p className="bis-money-label">This label means…</p>
            <div className="bis-resolve-actions">
              <button
                type="button"
                className="bis-resolve-choice out"
                disabled={pending}
                onClick={() => applyLabelResolution(issue.label, 'out')}
              >
                <strong>Money out</strong>
                <span>Paid / debit / withdrawal</span>
              </button>
              <button
                type="button"
                className="bis-resolve-choice in"
                disabled={pending}
                onClick={() => applyLabelResolution(issue.label, 'in')}
              >
                <strong>Money in</strong>
                <span>Received / credit / deposit</span>
              </button>
              <button
                type="button"
                className="bis-resolve-choice skip"
                disabled={pending}
                onClick={() => applyLabelResolution(issue.label, 'ignore')}
              >
                <SkipForward size={14} />
                <strong>Skip these rows</strong>
                <span>Do not import them</span>
              </button>
            </div>
            {error ? <p className="bis-error">{error}</p> : null}
          </div>
        ) : (
          <div className="bis-status-ok">
            <CheckCircle2 size={16} />
            No unknown labels left
          </div>
        )}
      </StudioShell>
    );
  }

  // ─── REVIEW ───
  if (phase === 'review' && preview?.transform && mapping) {
    const t = preview.transform;
    const block = importBlockReason();
    const canImportAll = !block;
    const canImportGoodOnly = t.readyCount > 0;
    const errorIssues = t.issues.filter((i) => i.severity === 'error');
    const unknownLabelCount = collectUnknownMoneyLabels(t.lines).length;
    const allProblemLines = t.lines.filter((l) => l.validationStatus === 'error');
    const problemLinesPreview = allProblemLines.slice(0, 3);

    return (
      <>
        <StudioShell
          step={meta.step}
          stepIndex={meta.index}
          stepTotal={9}
          title="Ready to save?"
          tone="purple"
          icon={<Columns3 size={18} />}
          sheet={sheetPane}
          pending={pending}
          onBack={() => {
            setProblemsOpen(false);
            const unknowns = collectUnknownMoneyLabels(t.lines);
            if (unknowns.length > 0) {
              setResolveQueue(unknowns);
              setResolveIdx(0);
              setPhase('resolve');
            } else {
              setPhase('money');
            }
          }}
          onContinue={() => doCommit()}
          continueLabel="Save bank lines"
          continueDisabled={!canImportAll || pending}
          continueHint={canImportAll ? null : block}
        >
          <div className="bis-review-hero">
            <div className="bis-hero-card">
              <span>Good</span>
              <strong>{t.readyCount + t.warningCount}</strong>
            </div>
            <div className="bis-hero-card in">
              <span>Money in</span>
              <strong>{formatRs(t.totals.totalMoneyIn)}</strong>
            </div>
            <div className="bis-hero-card out">
              <span>Money out</span>
              <strong>{formatRs(t.totals.totalMoneyOut)}</strong>
            </div>
          </div>

          {t.errorCount > 0 ? (
            <div className="bis-fix-panel">
              <div className="bis-fix-head">
                <strong>{t.errorCount} problem line(s)</strong>
                <span>Red on sheet · open details to fix safely</span>
              </div>
              <button
                type="button"
                className="bis-btn primary bis-btn-block"
                disabled={pending}
                onClick={() => setProblemsOpen(true)}
              >
                <ExternalLink size={14} />
                View all problems & how to fix
              </button>
              {unknownLabelCount > 0 ? (
                <button
                  type="button"
                  className="bis-btn secondary bis-btn-block"
                  disabled={pending}
                  onClick={() => enterResolveWizard(t.lines)}
                >
                  Resolve {unknownLabelCount} label{unknownLabelCount === 1 ? '' : 's'}
                  <ArrowRight size={14} />
                </button>
              ) : null}
              {problemLinesPreview.length > 0 ? (
                <div className="bis-problem-lines">
                  {problemLinesPreview.map((l) => (
                    <div key={l.rowNumber} className="bis-sample-row err">
                      <span className="d">R{l.rowNumber}</span>
                      <span className="t" title={l.validationMessages.join('; ')}>
                        {l.description || l.validationMessages[0] || '—'}
                      </span>
                    </div>
                  ))}
                  {allProblemLines.length > 3 ? (
                    <p className="bis-money-label">+{allProblemLines.length - 3} more in details</p>
                  ) : null}
                </div>
              ) : null}
              {canImportGoodOnly ? (
                <button
                  type="button"
                  className="bis-btn secondary bis-btn-block"
                  disabled={pending}
                  onClick={() => doCommit({ skipErrorLines: true })}
                >
                  Save {t.readyCount + t.warningCount} good lines only
                </button>
              ) : null}
            </div>
          ) : (
            <div className="bis-status-ok">
              <CheckCircle2 size={16} />
              Looks good · cashbook not changed yet
            </div>
          )}

          {(preview.hardeningWarnings?.length ?? 0) > 0 ||
          t.issues.some((i) => i.severity === 'warning') ? (
            <div className="bis-harden-warn">
              <p className="bis-money-label">Checks (not blocking)</p>
              <ul>
                {(preview.hardeningWarnings ?? []).slice(0, 4).map((w) => (
                  <li key={w}>{w}</li>
                ))}
                {t.issues
                  .filter((i) => i.severity === 'warning')
                  .slice(0, 3)
                  .map((i) => (
                    <li key={i.type}>
                      {i.count}× {i.title}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          {t.errorCount === 0 ? (
            <details className="bis-advanced">
              <summary>Sample good lines ({t.samplePreview.length})</summary>
              <div className="bis-sample-list">
                {t.samplePreview.slice(0, 4).map((l) => (
                  <div key={l.rowNumber} className="bis-sample-row">
                    <span className="d">{l.date}</span>
                    <span className="t">{l.description}</span>
                    <span className={l.signedAmount < 0 ? 'neg' : 'pos'}>
                      {formatRs(l.signedAmount)}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          <details className="bis-advanced">
            <summary>Opening / closing balance (optional)</summary>
            <div className="bis-two-col tight">
              <label className="bis-field">
                <span>Open</span>
                <input
                  inputMode="decimal"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  placeholder="optional"
                />
              </label>
              <label className="bis-field">
                <span>Close</span>
                <input
                  inputMode="decimal"
                  value={closingBalance}
                  onChange={(e) => setClosingBalance(e.target.value)}
                  placeholder="optional"
                />
              </label>
            </div>
          </details>

          <label className="bis-check">
            <input
              type="checkbox"
              checked={saveProfile}
              onChange={(e) => setSaveProfile(e.target.checked)}
            />
            <span>Remember this bank layout</span>
          </label>
          {error ? <p className="bis-error">{error}</p> : null}
        </StudioShell>

        {problemsOpen ? (
          <div
            className="bis-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bis-problems-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) setProblemsOpen(false);
            }}
          >
            <div className="bis-modal">
              <div className="bis-modal-head">
                <div>
                  <h2 id="bis-problems-title">{t.errorCount} problem line(s)</h2>
                  <p>Each issue type with steps. Red rows are highlighted on the sheet.</p>
                </div>
                <button
                  type="button"
                  className="bis-modal-close"
                  aria-label="Close"
                  onClick={() => setProblemsOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="bis-modal-body">
                {errorIssues.length === 0 ? (
                  <p className="bis-money-label">No grouped issues — see rows below.</p>
                ) : (
                  errorIssues.map((i) => {
                    const guide = fixGuideForIssue(i.type);
                    const rows = allProblemLines
                      .filter((l) =>
                        l.validationMessages.some((m) =>
                          m.toLowerCase().includes(
                            i.type === 'unknown_label'
                              ? 'unknown money'
                              : i.title.toLowerCase().slice(0, 12),
                          ),
                        ) ||
                        (i.type === 'unknown_label' && Boolean(l.unknownLabel)) ||
                        (i.type === 'invalid_date' &&
                          l.validationMessages.some((m) => m.toLowerCase().includes('date'))),
                      )
                      .slice(0, 12);
                    const rowFallback =
                      rows.length > 0
                        ? rows
                        : allProblemLines.slice(0, 8);
                    return (
                      <div key={i.type} className="bis-modal-issue">
                        <div className="bis-modal-issue-head">
                          <strong>
                            {i.count}× {i.title}
                          </strong>
                          {i.sample ? <span>e.g. {i.sample}</span> : null}
                        </div>
                        <p className="bis-money-label" style={{ margin: 0 }}>
                          {guide.how}
                        </p>
                        <ol className="bis-modal-steps">
                          {guide.steps.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ol>
                        {rowFallback.length > 0 ? (
                          <div className="bis-modal-rows">
                            {rowFallback.map((l) => (
                              <div key={l.rowNumber} className="bis-sample-row err">
                                <span className="d">R{l.rowNumber}</span>
                                <span className="t" title={l.validationMessages.join('; ')}>
                                  {l.description || '—'}
                                  {l.unknownLabel ? ` · ${l.unknownLabel}` : ''}
                                </span>
                                <span className="neg">
                                  {l.validationMessages[0]?.slice(0, 28) ?? 'error'}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          className="bis-fix-btn"
                          onClick={() => {
                            setProblemsOpen(false);
                            goFixIssue(i.type);
                          }}
                        >
                          {i.type === 'unknown_label' ? 'Resolve labels' : 'Go fix this'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="bis-modal-foot">
                {unknownLabelCount > 0 ? (
                  <button
                    type="button"
                    className="bis-btn primary"
                    onClick={() => {
                      setProblemsOpen(false);
                      enterResolveWizard(t.lines);
                    }}
                  >
                    Resolve labels
                  </button>
                ) : null}
                {canImportGoodOnly ? (
                  <button
                    type="button"
                    className="bis-btn secondary"
                    onClick={() => {
                      setProblemsOpen(false);
                      doCommit({ skipErrorLines: true });
                    }}
                  >
                    Save good lines only
                  </button>
                ) : null}
                <button
                  type="button"
                  className="bis-btn secondary"
                  onClick={() => setProblemsOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  // ─── DONE ───
  if (phase === 'done') {
    return (
      <StudioShell
        step="import"
        stepIndex={9}
        stepTotal={9}
        title="Bank file saved"
        tone="green"
        icon={<CheckCircle2 size={18} />}
        compact
      >
        <div className="bis-done-card">
          <strong>{importedCount} lines saved</strong>
          <p>
            Stored as bank statement data only. Next: match to existing cashbook entries (no new
            journals yet).
          </p>
          {importNotes.length > 0 ? (
            <ul className="bis-done-notes">
              {importNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="bis-done-actions">
          <a
            className="bis-btn primary"
            href={
              importedId ? `${matchBase}?importId=${importedId}` : hubAfterImport
            }
          >
            Match to books
          </a>
          <a className="bis-btn secondary" href={hubAfterImport}>
            All bank imports
          </a>
          <a className="bis-btn secondary" href={homeAfterImport}>
            {isErp ? 'Dashboard' : 'Back to cashbook'}
          </a>
          <button type="button" className="bis-btn secondary" onClick={() => window.location.reload()}>
            Import another file
          </button>
        </div>
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
