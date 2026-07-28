# Smart Bank Statement Import — Architecture & Risk Design

> **Status:** Deep plan (canonical) — **SI-1…SI-3 implemented** (staging, match/link, create+undo)  
> **Last updated:** 2026-07-28  
> **Surfaces:** Cashbook **Import bank** + ERP **`/reconciliation`**  
> **Primary audience:** Personal, sole prop (lite/full), small multi-bank owners  
> **AI in v1:** **Not required** (deterministic parse/match first; AI optional later)  
> **Related:** `PRODUCTION_RULES.md`, `ENTITY_TIERS_AND_TAX_ARCHITECTURE.md`, migration `022_statement_import_engine.sql`, package `@bookone/statement-import`

---

## 1. Problem statement

Many personal and sole-prop owners already live in bank Excel:

- Download **monthly** (sometimes yearly) statements from BOC, Commercial, HNB, Sampath, People’s, DFCC, NTB, Seylan, etc.
- Formats differ: column names, debit/credit vs signed amount, header rows, Sinhala labels, multi-sheet workbooks.
- They may hold **several bank accounts** plus cash.
- Manually retyping into BookOne is slow, error-prone, and discourages accurate books.

**Target experience:** User drags one or many Excel/CSV files → system identifies period, bank mapping, and each line → **matches** existing books first → only after clear confirmation creates missing entries → never silently damages GL.

This engine is shared with **ERP bank reconciliation** so we build one financial-grade core, two UX skins (simple cashbook vs full recon).

---

## 2. Product goals (what “done” feels like)

| Goal | Success criteria |
|------|------------------|
| Save time | Drag-drop a month (or folder of months) ends in books that match the bank without retyping |
| Multi-bank | Each import job is bound to **one** liquid account (1100–1199 / cash 1000); many banks supported via settings |
| Format chaos | Auto-detect column map; user can fix once; system **learns** per tenant |
| No duplicates | Same file / same line never posts twice |
| No damage | Existing journals are **linked**, never rewritten; creates only via `recordEntry` |
| Elderly-friendly | Large type, plain Sinhala/English, few steps, “check then OK”, color flags, no jargon |
| Trust | Preview counts before any money moves; undo for creates; full audit trail |
| ERP reuse | Same package + tables power cashbook import and `/reconciliation` |

### Non-goals (v1)

- Open Banking / live bank API feeds (later)
- Auto-post without human confirm
- Editing bank PDF OCR as primary path (Excel/CSV first; PDF later)
- Cross-tenant templates marketplace
- Full AI-driven accounting classification without rules

---

## 3. Industry posture (state of the art applied to BookOne)

Modern ledger products (Xero bank feeds, QuickBooks rules, Plaid+ledger matchers, Wave import) converge on the same pattern. We adopt that **without** depending on bank APIs first:

```text
                  ┌─────────────────────────────────────────┐
                  │  STAGING (statement world)              │
                  │  imports + lines + fingerprints         │
                  │  proposed_action only — no GL yet       │
                  └──────────────────┬──────────────────────┘
                                     │ user approve
                  ┌──────────────────▼──────────────────────┐
                  │  BOOK (GL world)                        │
                  │  link existing tx  OR  recordEntry      │
                  │  never silent journal rewrite           │
                  └─────────────────────────────────────────┘
```

### 3.1 Core principles (non-negotiable)

1. **Match before create** — bank line that already exists in books → link, do not re-enter.  
2. **Staging before GL** — parse/match live only in `bank_statement_*` until approve.  
3. **No silent money** — creates require explicit bulk or line confirm.  
4. **No silent journal edit** — link sets `matched_transaction_id` + reconciliation flag; corrections use reverse+repost (existing cashbook pattern).  
5. **One bank account per import job** — eliminates cross-account pollution.  
6. **Idempotent ingest** — `file_sha256` + line `fingerprint` + unique indexes.  
7. **Period locks respected** — locked months block create/link mutations that change books.  
8. **Tenant isolation** — RLS on all statement tables; `tenant_id` from session only.  
9. **Audit every decision** — who linked/created/skipped/voided, with before/after detail.  
10. **Fail closed** — ambiguous date, multi-candidate match, low confidence → **review**, never auto-create as high confidence.

### 3.2 Liability split (us vs customer)

| Risk | Control (BookOne) | Control (user) |
|------|-------------------|----------------|
| Wrong amount posted | Staging + confirm; amount from file immutable in staging; create uses same signed amount | User reviews “New entries” list |
| Duplicate posts | Fingerprint unique; file hash reuse short-circuits | Don’t force re-import after void without reason |
| Wrong bank account | Mandatory bank picker before parse persist | Pick correct account once |
| Date mis-parse (US vs SL) | SL-biased parser + confidence score + flag | Review amber rows |
| Period closed | Server rejects create/link if `period_locks` | Unlock only via recon controls |
| File malware / huge file | Size/type limits, server-side parse only, no client trust of amounts | Upload official bank export |
| Privacy of bank data | Tenant RLS, optional object storage key, no third-party AI send in v1 | Keep exports secure |
| Our support disputes | Import events + raw row JSON retained | Keep original Excel |

**Product disclaimer (wizard footer, not legal advice):**  
“BookOne matches and proposes; you confirm. Bank file remains source of truth for the bank; your books remain source of truth for accounting after you approve.”

---

## 4. End-to-end pipeline

```text
┌──────────┐   ┌──────────┐   ┌───────────┐   ┌─────────┐   ┌──────────┐
│  Ingest  │ → │  Parse   │ → │ Normalize │ → │  Dedup  │ → │  Match   │
│ multi-   │   │ xlsx/csv │   │ dates,    │   │ file +  │   │ books +  │
│ file,    │   │ profile  │   │ signs,    │   │ history │   │ greedy   │
│ hash     │   │ detect   │   │ LKR       │   │ fp      │   │ scores   │
└──────────┘   └──────────┘   └───────────┘   └─────────┘   └────┬─────┘
                                                                  │
                    ┌─────────────────────────────────────────────┘
                    ▼
            ┌──────────────┐    user sees flags
            │ Review UI    │ ← link | create | skip | review | duplicate
            └──────┬───────┘
                   │ Approve
         ┌─────────┴──────────┐
         ▼                    ▼
   Link existing          Create via
   (status=reconciled)    recordEntry
         │                    │
         └────────┬───────────┘
                  ▼
           Audit events + optional undo (void create)
```

### 4.1 Stage detail

| Stage | Input | Output | Failure mode |
|-------|-------|--------|--------------|
| **Ingest** | File(s), bank account id, book_domain, source | `file_sha256`, stored bytes optional, import row `status=parsing` | Reject > max size / wrong mime; identical hash → reopen existing job |
| **Parse** | Bytes + optional profile | Matrix + header row + column map | Empty sheet → warning, no lines |
| **Normalize** | Raw cells | ISO date, amountSigned (+in/−out), direction, balanceAfter, externalRef | Bad date → drop or flag with conf=0 |
| **Dedup** | Lines + DB fingerprints | Unique lines; `proposed_action=duplicate` for known fp | Collision → skip create path |
| **Match** | Canonical lines + book candidates for bank + date window | Scores, candidates[5], proposed_action | Tie → review |
| **Approve** | User selection | Events + GL side effects | Period lock / RLS / balance fail → abort txn |
| **Close** | Import status | `completed` / `partial` / `voided` | Partial keeps unreviewed lines open |

---

## 5. Data model

### 5.1 Tables (migration 022 + existing)

| Table | Role |
|-------|------|
| `bank_statement_imports` | One job per file (or batch parent later); bank, domain, hash, period span, source |
| `bank_statement_lines` | Staging rows; fingerprint; match metadata; proposed/final action |
| `bank_statement_profiles` | System (`tenant_id` null) + tenant-learned column maps |
| `bank_statement_import_events` | Immutable decision log |
| `period_locks` | Existing month locks |
| `accounts` | Liquid accounts (cash/banks) as import target |
| `transactions` + journals | Book world only via `recordEntry` / link |

### 5.2 Import job fields (key)

- `bank_account_id` — **required** for new engine  
- `book_domain` — `personal` | `business` | null (company)  
- `file_sha256` — idempotent re-upload  
- `storage_key` — optional R2/MinIO retention of original  
- `period_from` / `period_to` — derived from lines  
- `period` — primary YYYY-MM (dominant month in file; multi-month files allowed with flag)  
- `parser_profile_id` — which map was used  
- `source` — `cashbook` | `erp_recon`  
- `status` — `open` | `parsing` | `ready` | `partial` | `completed` | `voided`

### 5.3 Line fields (key)

- Canonical: date, description, amount (signed), direction, balance_after, external_ref  
- `fingerprint` — unique per tenant among non-voided  
- `match_score`, `match_method`, `match_candidates` (json)  
- `proposed_action` — `link` | `create` | `skip` | `review` | `duplicate`  
- `matched_transaction_id` — book link  
- `created_transaction_id` — if we created  
- `confidence` — composite for UI  
- `status` — workflow: `review` | `matched` | `reconciled` | `unmatched` | `created` | `skipped` | `duplicate`

### 5.4 Fingerprint (v1)

```text
sha256(
  tenantId | bankAccountId | date | amountSigned(2dp) |
  normalize(description) | externalRef?
)
```

`normalize(description)`: lowercase, strip non-alnum except spaces, collapse whitespace.

**Intentional limits:** Same day + amount + near-identical description on same bank collides (good for re-import). True distinct transfers that look identical are rare; external_ref when present separates them. Optional v2: include balance_after if present and unique.

### 5.5 File identity

```text
file_sha256 = sha256(raw bytes)
unique soft key: (tenant_id, bank_account_id, file_sha256) where not voided
```

Re-upload same file → return existing import (or clone review state), do not insert duplicate lines.

---

## 6. Mapping engine (multi-bank Excel)

### 6.1 Why banks differ

| Variation | Example | Handling |
|-----------|---------|----------|
| Debit/Credit columns | Most SL banks | `sign_convention=debit_credit` → amount = credit − debit |
| Single Amount + type | Some exports | signed_amount or type column (v1.1) |
| Header not row 1 | Logos, account block | Scan first 25 rows for header score |
| Sinhala headers | දිනය, විස්තර, මුදල | Key lists include Sinhala |
| DD/MM vs ambiguous | 03/04/2026 | Prefer DD/MM; conf=0.7 if ambiguous |
| Excel serial dates | 45800 | Convert 1899-12-30 epoch |
| Multi-sheet | Summary + Detail | Prefer first sheet with best header score; user can pick sheet |
| Yearly file | 12 months | Allowed; flag “multi-month”; period_from/to span; UI groups by month |
| Running balance | Optional | Stored for continuity checks, not required |

### 6.2 Profile model

```ts
type ParseProfile = {
  name: string;
  bankHint?: string;          // "HNB", "BOC", ...
  columnMap: {
    date?, description?, amount?, debit?, credit?, balance?, ref?
  };
  signConvention: 'signed_amount' | 'debit_credit' | 'credit_debit';
  dateFormatHint?: string;
  skipRows?: number;
  sheetName?: string;
};
```

**Resolution order:**

1. User-forced profile (mapping UI)  
2. Tenant profile with highest `success_count` matching bank_hint / headers  
3. Built-in system profiles (optional curated SL banks over time)  
4. Auto header detect (`detectHeaderAndMap`)

**Learning:** After successful complete import, upsert tenant profile and `success_count++`.

### 6.3 Monthly vs yearly guidance

| Mode | UX | Engine |
|------|----|--------|
| **Recommended: monthly** | Badge: “Easier: one Excel per month per bank” | One import job, one period, cleaner locks |
| **Supported: multi-month / yearly** | Warning: “File spans M months — review by month” | period_from/to; group review; create respects each line’s date lock |

We **do not block** yearly files; we **nudge** monthly for reliability and period-close alignment.

### 6.4 Multi-file drop

1. User selects **bank account** once (or per-file if mixed — advanced).  
2. Drop N files → queue of import jobs (or one **batch** parent with N children).  
3. Each file: hash → parse → match independently.  
4. Review UI: tabs or accordion per file; summary tile: matched / new / review / duplicate.  
5. **Approve all safe links** + **Approve creates** as two separate buttons (never one “import everything blindly”).

v1 may ship single-file then multi-file (SI-4); architecture assumes multi-file from day one in schema (`source`, batch metadata json).

---

## 7. Matching engine (accuracy + anti-duplicate)

### 7.1 Candidate set

For each import on bank account B, date range [min−W, max+W]:

- Transactions where `payment_account_id = B` OR transfer legs involving B  
- Same `book_domain` when set  
- Not voided  
- Optional: already reconciled lines still candidates for fingerprint-only duplicate detect

### 7.2 Hard filters

- Amount abs within **0.01** LKR  
- Date within **±2 days** (configurable; banks lag)  
- Direction agreement when known  
- Exclude book ids already greedily claimed in this job  

### 7.3 Soft scoring (v1)

| Signal | Weight (approx) |
|--------|-----------------|
| Amount match (hard gate) | base 0.55 |
| Same calendar day | +0.30 |
| ±1 day | +0.18 |
| ±2 days | +0.08 |
| Description Jaccard tokens | up to +0.15 |
| external_ref in description | +0.10 |

Caps at 1.0.

### 7.4 Decision thresholds

| Condition | proposed_action |
|-----------|-----------------|
| score ≥ 0.92 and clear winner (margin ≥ 0.05) | **link** (auto-propose; still confirm in bulk) |
| score ≥ 0.70 | **review** with candidates shown |
| else | **create** (only if not fingerprint-duplicate) |
| fingerprint exists in prior import / line | **duplicate** |
| dateConfidence < 0.75 | force **review** even if high score |
| two candidates within margin | **review** (never auto-link) |

**Auto-link** means “proposed without manual pick,” not “posted without user.”  
First screen still shows: “We matched 42 lines — Confirm links.”

### 7.5 Continuity / advanced flags

| Flag | Detection | UI |
|------|-----------|-----|
| **DUPLICATE** | fingerprint hit | Grey, locked skip |
| **ALREADY_IN_BOOKS** | high score link | Green |
| **LIKELY_NEW** | create proposal | Blue |
| **AMBIGUOUS** | multi-candidate / low conf | Amber — needs eyes |
| **DATE_RISK** | conf < 0.75 or US/SL ambiguous | Amber calendar icon |
| **BALANCE_BREAK** | if balance_after present: prev ± amount ≠ next | Red optional check |
| **PERIOD_LOCKED** | line date in locked period | Block create; allow link-only if policy permits |
| **OUT_OF_RANGE** | date far from filename/period hint | Amber |
| **TRANSFER_HINT** | description matches other bank / “IFT” / “CEFT” | Suggest bank↔bank move category |
| **FEE_HINT** | small out + “fee/charge” | Suggest bank charges expense |
| **ROUND_AMOUNT** | exact 1000s | info only |
| **SIGN_FLIP_SUSPECT** | profile weak + all signs same side | Force mapping review |

These flags make the UI feel “smart” without AI.

---

## 8. Create path (when books lack the line)

### 8.1 Rules

- Only after user confirms creates (bulk “Add N new entries” or per-line).  
- Always `recordEntry` (or cashbook equivalent) with:
  - date = statement date  
  - amount = abs(amountSigned)  
  - direction from sign  
  - `paymentAccountCode` / id = selected bank  
  - `book_domain` from import  
  - description = bank narrative (truncated)  
  - metadata: `{ source: 'statement_import', importId, lineId, fingerprint }`  
- Category inference:
  - **Cashbook lite:** default “Uncategorized bank” / user-picked default expense/income; optional quick category after.  
  - **ERP:** use existing inference lightly; prefer “Suspense / Uncategorized” over wrong CoA.  
- **Never invent parties** without confirm.  
- **Transfers:** if user marks transfer-to-other-bank, use existing bank↔bank move path.

### 8.2 Undo

- “Undo import creates” voids transactions created by this import (`created_transaction_id` set), reverse journals, void import lines back to review or void whole import.  
- Links: unlink only (clear match), do not void original tx.

### 8.3 What we never do

- Delete historical transactions because statement disagrees  
- Overwrite amounts on matched books  
- Auto-void user entries  
- Post into locked period  

---

## 9. Shared architecture (cashbook + ERP recon)

```text
packages/statement-import/     pure TS: parse, normalize, fingerprint, match, templates
apps/web/.../actions/
  statement-import.ts          server: ingest, persist, match query, approve link/create
components/
  statement-import/            shared wizard pieces (dropzone, map preview, line table)
  cashbook/                    thin shell: bank picker + simple language
  reconciliation/              full shell: period close + same engine
```

| Concern | Cashbook UX | ERP recon UX |
|---------|-------------|--------------|
| Entry point | Tile “Import bank” / ⋮ menu | `/reconciliation` wizard |
| Language | Simple + Sinhala gloss | Accounting terms OK |
| Default action emphasis | “Match what you already wrote; add the rest” | Full match + period close |
| Create | Cash categories / simple in-out | CoA-aware optional |
| Period lock | Soft warn | Full lock controls |

**Replace** client-only CSV parse in `bank-reconciliation-wizard.tsx` with server `parseStatementFile` + shared match.

---

## 10. Security, privacy, financial risk controls

### 10.1 Application security

| Control | Implementation |
|---------|----------------|
| AuthZ | `requireTenantContext`; role can restrict create if needed |
| Tenant | RLS on imports/lines/profiles/events; never accept tenant_id from client |
| File type | Allow `.xlsx`, `.xls`, `.csv`, `.txt` only; magic-byte soft check |
| Size | e.g. max 8–15 MB per file; max rows 5_000–10_000 v1 |
| Parse location | **Server only** for authoritative amounts (client preview optional later) |
| Storage | Optional encrypted object storage; default process-and-discard raw after parse if storage off |
| Injection | Treat all cells as data; never eval; sanitize description for display |
| Rate limit | Per-tenant import rate (anti-abuse) |
| XSS | React escape; strip HTML from bank text |

### 10.2 Financial integrity (developer safeguard)

| Control | Why |
|---------|-----|
| DB transaction around approve batches | No partial money without audit |
| Unique fingerprint index | DB enforces no double line |
| Journal balance via engine | Production rule 10 |
| Soft-void only | Production rule 3 |
| Audit log + import events | Production rule 7 |
| Idempotent approve | Re-click “Confirm” no double create (check line status + created_transaction_id) |
| Feature flag | `statement_import` module/flag for staged rollout |
| Metrics | counts of create/link/review/duplicate; error rates |

### 10.3 Customer safeguard (UX + process)

- Clear summary **before** approve:  
  `Matched 40 · New 8 · Need check 3 · Already imported 2`  
- Color + icon + short Sinhala/English labels  
- “Nothing is saved to your books until you press Confirm”  
- Separate buttons: Confirm matches | Add new entries | Skip rest  
- Downloadable exception report (CSV of review/unmatched)  
- Retain original file hash so support can verify “what was uploaded”  

### 10.4 Operational risk

- Migrations **additive only** (022 pattern)  
- Old recon wizard remains until cutover behind flag  
- Canary: personal/sole first, company recon second  
- Rollback: disable flag; staging data remains harmless  

---

## 11. UX design (elderly-friendly, low anxiety)

### 11.1 Happy path (3 screens)

1. **Choose bank** — big cards for each saved bank; “Add bank” if missing.  
2. **Drop files** — large drop zone; “Excel from your bank (month is easiest)”.  
3. **Review & confirm** — three groups only:  
   - Green: Already in books (match)  
   - Blue: New — will add if you confirm  
   - Amber: Please check  

Avoid exposing: fingerprint, Jaccard, CoA codes (ERP advanced toggle).

### 11.2 Mapping rescue (only when needed)

If auto-map confidence low:

- Show first 5 data rows as table  
- “Which column is Date?” dropdowns (large)  
- Live preview of interpreted amounts  
- Save as “My HNB format”  

### 11.3 Copy examples

- “We found 48 lines from 01–31 July for HNB Savings.”  
- “40 already match your cashbook. 6 look new. 2 need your eyes.”  
- “Confirm matches” / “Add 6 new” / “I’ll fix the 2 first”

### 11.4 Accessibility

- Touch targets ≥ 44px  
- High contrast status chips  
- Keyboard: confirm focus order  
- Optional Sinhala gloss (existing SI gloss pattern)

---

## 12. Is AI needed?

### Recommendation: **No for v1. Yes optional for SI-5.**

| Job | Deterministic enough? | AI value |
|-----|----------------------|----------|
| Read Excel cells | Yes (xlsx) | None |
| Find header row / columns | Yes (header scoring + learn profiles) | Medium if exotic PDF layouts |
| Date/amount parse | Yes (SL-biased rules) | Low |
| Match to books | Yes (amount+date+token score) | Low–medium for narrative fuzzy |
| Categorize new spends | Partial (rules + keywords) | **High later** |
| PDF statement OCR | No | High later |

**Why delay AI:**

1. Financial liability: LLM mis-map of debit/credit is catastrophic; rules are testable.  
2. Privacy: bank narratives should not leave tenant boundary without explicit opt-in.  
3. Cost/latency at multi-tenant scale.  
4. Older users trust “we compared amounts and dates” more than “AI guessed.”

**When to add AI (SI-5, optional, opt-in):**

- Header/layout assist when auto-detect fails (suggest column map; human still confirms).  
- Suggest category for **creates** only after human approved the amount/date.  
- Never let AI alone set amount, date, or post journals.  
- Prefer **on-prem/self-hosted or tenant-scoped** provider; no raw file to third party without consent.  
- If using SpaceXAI/OpenAI: send **header row + 3 sample rows redacted**, not full statements, for map assist only.

---

## 13. Package & code map

### 13.1 `@bookone/statement-import` (pure)

| Module | Responsibility |
|--------|----------------|
| `parse.ts` | xlsx/csv → matrix → canonical lines |
| `normalize.ts` | amount, date (SL bias), debit/credit |
| `fingerprint.ts` | line + file hashes |
| `templates.ts` | header detect, generic profiles |
| `match.ts` | scoring, matchAll greedy |
| `types.ts` | shared contracts |
| `test/*` | fixtures for SL-like banks |

### 13.2 Server actions (to implement / complete)

```text
previewStatementImport(file, bankAccountId, bookDomain)
  → parse + match, no persist (or ephemeral)

commitStatementImport(...)
  → persist import + lines (staging only)

confirmStatementLinks(importId, lineIds?)
  → set matched_transaction_id, status reconciled, events

confirmStatementCreates(importId, lineIds?, defaults)
  → recordEntry each, set created_transaction_id, events

skipStatementLines / voidStatementImport
saveStatementProfile
```

### 13.3 UI components

- `StatementDropzone`  
- `BankAccountPicker`  
- `ColumnMapEditor` (rescue)  
- `StatementReviewTable` (grouped)  
- `ImportSummaryBar`  
- Cashbook tile + ERP wizard wrappers  

---

## 14. Phased delivery

| Phase | Name | Deliverable | Risk reduction |
|-------|------|-------------|----------------|
| **SI-0** | ADR | This document | Shared understanding |
| **SI-1** | Foundation | Package + migration 022 + schema export + server parse path | No GL risk |
| **SI-2** | Match UI | Persist staging, candidate review, link confirm | Match-only value |
| **SI-3** | Create + undo | recordEntry creates, void undo, period lock | Controlled money in |
| **SI-4** | Multi-file + profiles | Batch drop, learned maps, multi-month grouping | Scale of real owners |
| **SI-5** | Optional AI assist | Layout/category suggestions, never auto-post | Opt-in only |

### SI-1 exit criteria

- [x] Architecture doc  
- [x] Migration 022 + Drizzle schema  
- [x] Package parse/match/fingerprint tests  
- [x] Workspace install of package + web dependency  
- [x] Server action parse path (no GL write)  
- [x] Cashbook “Import bank” entry (wizard shell)  
- [ ] Feature flag (optional — shipped on for cashbook/ERP)  

### SI-2 exit criteria

- [x] Match against real cashbook txs for selected bank  
- [x] Confirm links only  
- [x] ERP wizard uses same path for CSV/XLSX  

### SI-3 exit criteria

- [x] Create with confirm + undo  
- [x] Period lock blocks  
- [x] Import events complete  

### SI-4 exit criteria

- Multi-file batch  
- Profile learning  
- Balance continuity flag optional  

---

## 15. Testing strategy

| Layer | Cases |
|-------|-------|
| Unit | Date SL bias, debit/credit sign, fingerprint stability, match thresholds, header detect |
| Fixture files | Synthetic BOC/HNB-like sheets (no real customer PII) |
| Integration | Import → link → re-import same file → zero new lines |
| Integration | Import → create → re-import → all duplicate |
| Integration | Locked period → create rejected |
| E2E | Cashbook: drop sample, confirm match, confirm create |
| E2E | ERP recon period + import |
| Security | Cross-tenant import id rejected |
| Chaos | Empty sheet, wrong bank, corrupted xlsx, 0-byte, 20k rows |

---

## 16. Observability & support

- Structured log: importId, tenantId, rowCount, matchRate, createCount, duration  
- Sentry: parse exceptions (no raw PII in message if possible)  
- Admin/support: by import id, show events + hash (not necessarily full file)  
- Metric alerts: sudden spike in creates vs links (possible map bug)  

---

## 17. Open decisions (defaults recommended)

| Decision | Recommendation |
|----------|----------------|
| Store original file? | Optional; hash always; store if R2 configured |
| Max rows | 5_000 v1, raise later |
| Auto-link without button? | No — bulk confirm always |
| Yearly files | Allowed + multi-month warning |
| Transfer auto-detect | Flag only v1; user confirms move |
| Category on create | Default uncategorized / user default |
| Multi-currency | Out of scope (LKR first) |
| PDF | Out of scope until SI-5+ |

---

## 18. Summary one-pager

**What users do:** Pick bank → drop Excel(s) → review green/blue/amber → Confirm matches → Add new.

**What system does:** Parse any reasonable bank layout → fingerprint → match books → stage → only on confirm, link or `recordEntry`.

**What system never does:** Silent journal rewrite, silent create, cross-bank mix in one job, ignore period locks, trust client-only amounts for posting.

**AI:** Not needed for v1; optional later for layout/category assist with human gate.

**Architecture:** One pure package + staging tables + shared wizard core → cashbook simplicity and ERP recon power.

---

## 19. Implementation checklist (engineering)

1. Keep migration 022 additive; run on staging first.  
2. Finish `@bookone/statement-import` registration in workspace + lockfile.  
3. Server actions: preview/commit/confirm with `withTenantContext` + zod limits.  
4. Wire cashbook Import bank UX (simple).  
5. Refactor ERP `BankReconciliationWizard` off client CSV to shared engine.  
6. Tests green; feature flag default on for non-prod, staged prod.  
7. Docs for users: “How to download monthly Excel from your bank.”  

---

*This document is the canonical plan for Smart Bank Statement Import. Implementation phases SI-1+ must not violate §3 principles or `PRODUCTION_RULES.md`.*
