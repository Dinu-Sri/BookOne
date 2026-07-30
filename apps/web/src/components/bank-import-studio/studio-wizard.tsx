'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import {
  createStudioDraft,
  saveStudioDraftStep,
  type StudioDraftView,
} from '@/app/actions/bank-import-studio';
import type { LiquidAccount } from '@/app/actions/cashbook-banks';
import { StudioShell, type StudioStepId } from './studio-shell';

type Phase = 'upload' | 'account' | 'sheet' | 'done_stub';

/**
 * BIS-2 shell: Upload → Account → Sheet.
 * Later steps (table/date/money/review/commit) land in BIS-3/4.
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
  const [bankId, setBankId] = useState(
    initialDraft?.bankAccountId ?? bankOnly.find((b) => b.kind === 'bank')?.id ?? '',
  );
  const [sheetName, setSheetName] = useState<string | null>(
    (initialDraft?.draftPayload?.sheetName as string) ??
      initialDraft?.inspection?.bestSheetName ??
      null,
  );
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function upload(file: File) {
    setError(null);
    const fd = new FormData();
    fd.set('file', file);
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
      setError(si ? 'බැංකුව තෝරන්න.' : 'Select a bank account.');
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
    if (!draft || !sheetName) {
      setError(si ? 'පත්‍රය තෝරන්න.' : 'Select the sheet with transactions.');
      return;
    }
    setError(null);
    startTransition(() => {
      saveStudioDraftStep({
        importId: draft.id,
        expectedDraftVersion: draft.draftVersion,
        wizardStep: 'table',
        patch: { sheetName },
      }).then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setDraft({
          ...draft,
          draftVersion: res.draftVersion,
          wizardStep: 'table',
          draftPayload: { ...draft.draftPayload, sheetName },
        });
        setPhase('done_stub');
      });
    });
  }

  const inspection = draft?.inspection;
  const shellStep: StudioStepId =
    phase === 'upload' ? 'upload' : phase === 'account' ? 'account' : phase === 'sheet' ? 'sheet' : 'table';

  if (phase === 'upload') {
    return (
      <StudioShell
        step="upload"
        stepIndex={1}
        stepTotal={9}
        title={si ? 'බැංකු statement එක උඩුගත කරන්න' : 'Upload your bank statement'}
        subtitle={
          si
            ? 'බැංකුවෙන් බාගත කළ Excel හෝ CSV. මාසික ගොනු ලේසියි.'
            : 'Excel or CSV from your bank. Monthly files are easiest.'
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
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
          }}
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
        <p className="bis-note">
          {si
            ? 'මෙය ඔබේ ගිණුම් පොත වෙනස් නොකරයි. පළමුව statement එක නිවැරදිව කියවයි.'
            : 'This does not change your books. First we read the statement safely.'}
        </p>
      </StudioShell>
    );
  }

  if (phase === 'account' && draft) {
    return (
      <StudioShell
        step="account"
        stepIndex={2}
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
        {inspection?.detectedAccountHints?.length ? (
          <p className="bis-hint">
            {si ? 'ගොනුවේ හමු වූ අංක:' : 'Numbers found in file:'}{' '}
            {inspection.detectedAccountHints.map((h) => `••••${h.slice(-4)}`).join(', ')}
          </p>
        ) : null}
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  if (phase === 'sheet' && draft && inspection) {
    const multi = inspection.sheets.length > 1;
    return (
      <StudioShell
        step="sheet"
        stepIndex={3}
        stepTotal={9}
        title={
          multi
            ? si
              ? 'කුමන sheet එකේ transactions තිබේද?'
              : 'Which sheet contains the transactions?'
            : si
              ? 'Transaction sheet තහවුරු කරන්න'
              : 'Confirm the transaction sheet'
        }
        subtitle={draft.fileName}
        pending={pending}
        onBack={() => setPhase(draft.bankAccountId ? 'upload' : 'account')}
        onContinue={continueSheet}
        continueDisabled={!sheetName}
        continueLabel={si ? 'ඉදිරියට' : 'Continue'}
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
                {s.probableTransactionCount} possible transactions
                {s.dateFrom ? ` · ${s.dateFrom} → ${s.dateTo}` : ''}
              </span>
              <em className={`bis-conf ${s.confidence}`}>{s.confidence}</em>
            </button>
          ))}
        </div>
        {inspection.warnings.map((w) => (
          <p key={w} className="bis-hint">
            {w}
          </p>
        ))}
        {error ? <p className="bis-error">{error}</p> : null}
      </StudioShell>
    );
  }

  // Stub until BIS-3/4 complete remaining steps
  return (
    <StudioShell
      step={shellStep}
      stepIndex={4}
      stepTotal={9}
      title={si ? 'ඊළඟ පියවර සූදානම් වෙමින්' : 'Next steps coming in this release'}
      subtitle={
        draft
          ? `${draft.fileName} · draft saved (${draft.wizardStep ?? 'table'})`
          : undefined
      }
      onBack={() => setPhase('sheet')}
    >
      <div className="bis-stub">
        <p>
          {si
            ? 'Upload, bank account, සහ sheet තේරීම සුරකින ලදී. Date, money mapping, balance check, සහ safe import ඊළඟ build එකේ.'
            : 'Upload, account, and sheet selection are saved as a draft. Date, money mapping, balance proof, and bank-only import land in the next studio builds (BIS-3/4).'}
        </p>
        <ul>
          <li>Draft id: {draft?.id}</li>
          <li>Version: {draft?.draftVersion}</li>
          <li>Sheet: {sheetName}</li>
          <li>
            {si
              ? 'Ledger තවම වෙනස් වී නැත — නිවැරදියි.'
              : 'Your ledger has not been changed — by design.'}
          </li>
        </ul>
      </div>
    </StudioShell>
  );
}
