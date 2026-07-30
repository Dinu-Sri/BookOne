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
 * Smart Bank Import Studio — BIS-2/3/4
 * Upload → Account → Sheet → Table → Date → Description → Money → Review → Commit (bank only)
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
  /** Keep file in browser for preview/commit (not stored in DB). */
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

  function patchDraft(step: string, patch: Record<string, unknown>, next: Phase) {
    if (!draft) return;
    startTransition(() => {
      saveStudioDraftStep({
        importId: draft.id,
        expectedDraftVersion: draft.draftVersion,
        wizardStep: step,
        patch,
      }).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setDraft({
          ...draft,
          draftVersion: res.draftVersion,
          wizardStep: step,
          bankAccountId:
            typeof patch.bankAccountId === 'string' ? patch.bankAccountId : draft.bankAccountId,
          draftPayload: { ...draft.draftPayload, ...patch },
        });
        setPhase(next);
      });
    });
  }

  function continueAccount() {
    if (!draft || !bankId) {
      setError(si ? 'බැංකුව තෝරන්න.' : 'Select a bank account.');
      return;
    }
    setError(null);
    patchDraft('sheet', { bankAccountId: bankId }, 'sheet');
  }

  function continueSheet() {
    if (!draft || !sheetName || !file || !bankId) {
      setError(si ? 'පත්‍රය තෝරන්න.' : 'Select the sheet with transactions.');
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
                  draftPayload: { ...d.draftPayload, sheetName, mapping: res.preview.suggested },
                }
              : d,
          );
          setPhase('table');
        });
      });
    });
  }

  function refreshPreview(nextMap: StudioMapping, nextPhase?: Phase) {
    if (!file || !bankId || !sheetName) return;
    setError(null);
    startTransition(() => {
      runPreview(file, bankId, sheetName, nextMap, openingBalance, closingBalance).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setPreview(res.preview);
        setMapping(nextMap);
        if (nextPhase) setPhase(nextPhase);
      });
    });
  }

  function continueTable() {
    if (!mapping) return;
    refreshPreview(mapping, 'date');
  }

  function continueDate() {
    if (!mapping || mapping.dateCol < 0) {
      setError(si ? 'දින තීරුව තෝරන්න.' : 'Choose the date column.');
      return;
    }
    setPhase('description');
  }

  function continueDescription() {
    if (!mapping || mapping.descriptionCol < 0) {
      setError(si ? 'විස්තර තීරුව තෝරන්න.' : 'Choose the description column.');
      return;
    }
    setPhase('money');
  }

  function continueMoney() {
    if (!mapping || !file || !bankId || !sheetName) return;
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
    if (preview && preview.transform.errorCount > 0) {
      setError(
        si
          ? 'ගැටලු නිවැරදි කරන්න.'
          : `Fix ${preview.transform.errorCount} problem(s) before import.`,
      );
      return;
    }
    if (preview && !preview.transform.balanceCheck.ok) {
      setError(preview.transform.balanceCheck.message);
      return;
    }
    if (
      !window.confirm(
        si
          ? 'Statement එක import කරන්නද? ගිණුම් entries ස්වයංක්‍රීයව නොවෙනස් වේ.'
          : 'Import this statement? This does not change accounting entries automatically.',
      )
    ) {
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

  function updateAmountRules(patch: Partial<AmountRules>) {
    if (!mapping) return;
    const amountRules = { ...mapping.amountRules, ...patch };
    const next = { ...mapping, amountRules };
    setMapping(next);
  }

  const columns = preview?.columns ?? [];
  const t = preview?.transform;

  // ─── UPLOAD ───
  if (phase === 'upload') {
    return (
      <StudioShell
        step={meta.step}
        stepIndex={meta.index}
        stepTotal={9}
        title={si ? 'බැංකු statement එක උඩුගත කරන්න' : 'Upload your bank statement'}
        subtitle={
          si
            ? 'Excel හෝ CSV. මාසික ගොනු ලේසියි. ගිණුම් පොත මෙතැනින් වෙනස් නොවේ.'
            : 'Excel or CSV from your bank. Monthly is easiest. This does not change your books.'
        }
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
          {pending ? <Loader2 className="spin" size={32} /> : <FileSpreadsheet size={32} />}
          <strong>{si ? 'ගෙනැවිත් දමන්න හෝ තෝරන්න' : 'Drop file here or choose'}</strong>
          <small>Excel or CSV, up to 20 MB</small>
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
        title={si ? 'මෙය කුමන බැංකු ගිණුමද?' : 'Which bank account is this statement for?'}
        subtitle={draft.fileName}
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
    const inspection = draft.inspection;
    return (
      <StudioShell
        step={meta.step}
        stepIndex={meta.index}
        stepTotal={9}
        title={
          inspection.sheets.length > 1
            ? si
              ? 'කුමන sheet එකේ transactions තිබේද?'
              : 'Which sheet contains the transactions?'
            : si
              ? 'Transaction sheet තහවුරු කරන්න'
              : 'Confirm the transaction sheet'
        }
        subtitle={draft.fileName}
        pending={pending}
        onBack={() => setPhase(bankId ? 'upload' : 'account')}
        onContinue={continueSheet}
        continueDisabled={!sheetName}
      >
        <div className="bis-cards">
          {inspection.sheets.map((s) => (
            <button
              key={s.name}
              type="button"
              className={`bis-card ${sheetName === s.name ? 'active' : ''}`}
              onClick={() => setSheetName(s.name)}
            >
              <strong>{s.name}</strong>
              <span>
                {s.probableTransactionCount} possible
                {s.dateFrom ? ` · ${s.dateFrom} → ${s.dateTo}` : ''}
              </span>
              <em className={`bis-conf ${s.confidence}`}>{s.confidence}</em>
            </button>
          ))}
        </div>
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // ─── TABLE / HEADER ROW ───
  if (phase === 'table' && mapping && preview) {
    return (
      <StudioShell
        step={meta.step}
        stepIndex={meta.index}
        stepTotal={9}
        title={si ? 'තීරු නම් ඇති පේළිය කුමක්ද?' : 'Which row has the column names?'}
        subtitle={si ? 'Highlight කළ පේළිය header එකයි.' : 'The highlighted row should be the header.'}
        pending={pending}
        onBack={() => setPhase('sheet')}
        onContinue={continueTable}
      >
        <label className="bis-field">
          <span>{si ? 'Header පේළිය' : 'Header row number'}</span>
          <select
            value={mapping.headerRowIndex}
            onChange={(e) => {
              const headerRowIndex = Number(e.target.value);
              const next = { ...mapping, headerRowIndex };
              setMapping(next);
              if (file && bankId && sheetName) {
                startTransition(() => {
                  runPreview(file, bankId, sheetName, next).then((res) => {
                    if (res.ok) {
                      setPreview(res.preview);
                      // Keep user's header choice; merge suggested amount if empty
                      setMapping({
                        ...res.preview.suggested,
                        headerRowIndex,
                        dateCol: mapping.dateCol >= 0 ? mapping.dateCol : res.preview.suggested.dateCol,
                        descriptionCol:
                          mapping.descriptionCol >= 0
                            ? mapping.descriptionCol
                            : res.preview.suggested.descriptionCol,
                      });
                    }
                  });
                });
              }
            }}
          >
            {Array.from({ length: Math.min(40, (preview.headerPreviewRows.length || 1) + 20) }, (_, i) => (
              <option key={i} value={i}>
                Row {i + 1}
              </option>
            ))}
          </select>
        </label>
        <div className="bis-table-wrap">
          <table className="bis-mini-table">
            <tbody>
              {preview.headerPreviewRows.map((row, ri) => {
                const absRow = Math.max(0, mapping.headerRowIndex - 2) + ri;
                const isHeader = absRow === mapping.headerRowIndex;
                return (
                  <tr key={ri} className={isHeader ? 'is-header' : ''}>
                    <td className="num">{absRow + 1}</td>
                    {row.map((c, ci) => (
                      <td key={ci}>{c}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
        title={si ? 'Transaction date තීරුව කුමක්ද?' : 'Which column shows the transaction date?'}
        subtitle={si ? 'උදාහරණ බලන්න.' : 'Look at the sample values.'}
        pending={pending}
        onBack={() => setPhase('table')}
        onContinue={continueDate}
      >
        <div className="bis-cards">
          {columns.map((c) => (
            <button
              key={c.index}
              type="button"
              className={`bis-card ${mapping.dateCol === c.index ? 'active' : ''}`}
              onClick={() => setMapping({ ...mapping, dateCol: c.index })}
            >
              <strong>{c.label}</strong>
              <span>{c.samples.slice(0, 3).join(' · ') || '—'}</span>
            </button>
          ))}
        </div>
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
        title={si ? 'විස්තර තීරුව කුමක්ද?' : 'Which column best describes each transaction?'}
        pending={pending}
        onBack={() => setPhase('date')}
        onContinue={continueDescription}
      >
        <div className="bis-cards">
          {columns.map((c) => (
            <button
              key={c.index}
              type="button"
              className={`bis-card ${mapping.descriptionCol === c.index ? 'active' : ''}`}
              onClick={() => setMapping({ ...mapping, descriptionCol: c.index })}
            >
              <strong>{c.label}</strong>
              <span className="bis-sample-clamp">{c.samples.slice(0, 2).join(' · ') || '—'}</span>
            </button>
          ))}
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
        title={
          si
            ? 'මුදල් යන / එන ආකාරය කෙසේද?'
            : 'How does this statement show money going out and coming in?'
        }
        subtitle={si ? 'නිවැරදි තේරීම වැදගත්ය.' : 'Choosing wrong would reverse every amount.'}
        pending={pending}
        onBack={() => setPhase('description')}
        onContinue={continueMoney}
        continueLabel={si ? 'සමාලෝචනය' : 'Review statement'}
      >
        <div className="bis-cards">
          {(
            [
              ['debit_credit', 'Separate Money Out and Money In columns', 'Withdrawal | Deposit'],
              ['signed_amount', 'One amount with + and −', '-5,000.00 / 20,000.00'],
              ['amount_with_type', 'Amount + DR/CR label column', '5,000.00 | DR'],
              ['embedded_indicator', 'DR/CR written inside the amount', '5,000.00 DR'],
            ] as const
          ).map(([m, label, ex]) => (
            <button
              key={m}
              type="button"
              className={`bis-card ${mode === m ? 'active' : ''}`}
              onClick={() => updateAmountRules({ mode: m })}
            >
              <strong>{label}</strong>
              <span>{ex}</span>
            </button>
          ))}
        </div>

        {mode === 'debit_credit' ? (
          <div className="bis-two-col">
            <label className="bis-field">
              <span>Money Out (Debit)</span>
              <select
                value={mapping.amountRules.moneyOutCol ?? ''}
                onChange={(e) =>
                  updateAmountRules({
                    moneyOutCol: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              >
                <option value="">—</option>
                {columns.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="bis-field">
              <span>Money In (Credit)</span>
              <select
                value={mapping.amountRules.moneyInCol ?? ''}
                onChange={(e) =>
                  updateAmountRules({
                    moneyInCol: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              >
                <option value="">—</option>
                {columns.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {(mode === 'signed_amount' ||
          mode === 'amount_with_type' ||
          mode === 'embedded_indicator') && (
          <label className="bis-field">
            <span>Amount column</span>
            <select
              value={mapping.amountRules.amountCol ?? ''}
              onChange={(e) =>
                updateAmountRules({
                  amountCol: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            >
              <option value="">—</option>
              {columns.map((c) => (
                <option key={c.index} value={c.index}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {mode === 'amount_with_type' ? (
          <label className="bis-field">
            <span>DR/CR label column</span>
            <select
              value={mapping.amountRules.typeCol ?? ''}
              onChange={(e) =>
                updateAmountRules({
                  typeCol: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            >
              <option value="">—</option>
              {columns.map((c) => (
                <option key={c.index} value={c.index}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {mode === 'signed_amount' ? (
          <label className="bis-field">
            <span>Negative values mean</span>
            <select
              value={mapping.amountRules.negativeMeansOut === false ? 'in' : 'out'}
              onChange={(e) =>
                updateAmountRules({ negativeMeansOut: e.target.value === 'out' })
              }
            >
              <option value="out">Money Out</option>
              <option value="in">Money In</option>
            </select>
          </label>
        ) : null}

        {mode === 'amount_with_type' || mode === 'embedded_indicator' ? (
          <label className="bis-field">
            <span>DR means</span>
            <select
              value={mapping.amountRules.drMeansOut === false ? 'in' : 'out'}
              onChange={(e) => updateAmountRules({ drMeansOut: e.target.value === 'out' })}
            >
              <option value="out">Money Out</option>
              <option value="in">Money In</option>
            </select>
          </label>
        ) : null}

        <label className="bis-field">
          <span>{si ? 'ශේෂ තීරුව (විකල්ප)' : 'Running balance column (optional)'}</span>
          <select
            value={mapping.balanceCol ?? ''}
            onChange={(e) =>
              setMapping({
                ...mapping,
                balanceCol: e.target.value === '' ? null : Number(e.target.value),
              })
            }
          >
            <option value="">— not used —</option>
            {columns.map((c) => (
              <option key={c.index} value={c.index}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // ─── REVIEW ───
  if (phase === 'review' && t && mapping) {
    const canImport = t.errorCount === 0 && t.balanceCheck.ok && t.readyCount > 0;
    return (
      <StudioShell
        step={meta.step}
        stepIndex={meta.index}
        stepTotal={9}
        title={si ? 'Statement එක සමාලෝචනය කරන්න' : 'Review your statement'}
        subtitle={file?.name}
        pending={pending}
        onBack={() => setPhase('money')}
        onContinue={doCommit}
        continueLabel={si ? 'Import කරන්න' : 'Import statement'}
        continueDisabled={!canImport || pending}
      >
        <div className="bis-summary-grid">
          <div className="bis-sum-card">
            <span>Transactions</span>
            <strong>{t.readyCount + t.warningCount}</strong>
          </div>
          <div className="bis-sum-card in">
            <span>Money In</span>
            <strong>{formatRs(t.totals.totalMoneyIn)}</strong>
          </div>
          <div className="bis-sum-card out">
            <span>Money Out</span>
            <strong>{formatRs(t.totals.totalMoneyOut)}</strong>
          </div>
          <div className="bis-sum-card">
            <span>Period</span>
            <strong className="small">
              {t.totals.periodFrom ?? '—'} → {t.totals.periodTo ?? '—'}
            </strong>
          </div>
        </div>

        <div className="bis-status-row">
          <span className="ok">✓ {t.readyCount} ready</span>
          {t.warningCount > 0 ? <span className="warn">! {t.warningCount} review</span> : null}
          {t.errorCount > 0 ? <span className="err">× {t.errorCount} problems</span> : null}
        </div>

        {t.issues.length > 0 ? (
          <ul className="bis-issues">
            {t.issues.map((i) => (
              <li key={i.type} className={i.severity}>
                <strong>
                  {i.count}× {i.title}
                </strong>
                {i.sample ? <span> e.g. {i.sample}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="bis-two-col">
          <label className="bis-field">
            <span>Opening balance (optional)</span>
            <input
              inputMode="decimal"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder="125000.00"
            />
          </label>
          <label className="bis-field">
            <span>Closing balance (optional)</span>
            <input
              inputMode="decimal"
              value={closingBalance}
              onChange={(e) => setClosingBalance(e.target.value)}
              placeholder="210500.00"
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
            Recheck statement balance
          </button>
        ) : null}

        <p className={t.balanceCheck.ok ? 'bis-hint' : 'bis-error'}>{t.balanceCheck.message}</p>

        <div className="bis-table-wrap">
          <table className="bis-mini-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Dir</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {t.samplePreview.map((l) => (
                <tr key={l.rowNumber}>
                  <td>{l.date}</td>
                  <td className="desc">{l.description}</td>
                  <td>{l.direction === 'in' ? 'In' : l.direction === 'out' ? 'Out' : '?'}</td>
                  <td className={`num ${l.signedAmount < 0 ? 'neg' : 'pos'}`}>
                    {formatRs(l.signedAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label className="bis-check">
          <input
            type="checkbox"
            checked={saveProfile}
            onChange={(e) => setSaveProfile(e.target.checked)}
          />
          <span>{si ? 'මෙම setup එක ඊළඟට මතක තබන්න' : 'Remember this setup for next time'}</span>
        </label>

        <p className="bis-note">
          {si
            ? 'Import කිරීමෙන් bank transactions පමණක් එකතු වේ — ledger entries ස්වයංක්‍රීය නොවේ.'
            : 'Import adds bank transactions for reconciliation only — it will not change accounting entries automatically.'}
        </p>
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
        title={si ? 'Statement import විය' : 'Statement imported'}
        subtitle={`${importedCount} bank transactions`}
      >
        <div className="bis-stub">
          <p>
            {si
              ? 'Bank lines staging එකේ ඇත. Ledger තවම වෙනස් වී නැත. ඊළඟට reconciliation.'
              : 'Bank lines are staged. Your ledger was not changed. Next: match to your books (reconciliation).'}
          </p>
          <p>
            <a className="bis-btn primary" href="/cashbook" style={{ display: 'inline-flex', textDecoration: 'none' }}>
              {si ? 'Cashbook වෙත' : 'Back to cashbook'}
            </a>
          </p>
          <p className="bis-note">
            <a href="/reconciliation">Go to reconciliation</a>
            {' · '}
            <button type="button" className="bis-link" onClick={() => window.location.reload()}>
              Import another
            </button>
          </p>
        </div>
      </StudioShell>
    );
  }

  return (
    <StudioShell step="upload" stepIndex={1} stepTotal={9} title="Loading…">
      {pending ? <Loader2 className="spin" /> : null}
      {error ? <p className="bis-error">{error}</p> : null}
    </StudioShell>
  );
}
