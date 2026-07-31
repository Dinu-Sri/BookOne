# BookOne Smart Bank Import Studio

> **Status:** **Final default** bank import path for cashbook (`/cashbook/import`)  
> **Last updated:** 2026-07-31  
> **Status note:** Studio path BIS-0…7 complete (import → match → create + hardening)  
> **External research source:** `bookone_smart_bank_import_studio_spec.md`  
> **Legacy SI notes:** `docs/STATEMENT_IMPORT_ARCHITECTURE.md`  
> **Feature flag:** none — always on

---

## 1. Problem

Sri Lankan banks (30+) export Excel/CSV in inconsistent layouts. A single-screen auto-map importer produced wrong amounts and weak trust. Users need a **guided, fail-safe studio** that normalizes bank data **before** reconciliation and **before** any ledger create.

## 2. Layering (non-negotiable)

```text
File → Studio (map + validate) → Normalized bank transactions (staging)
     → Reconciliation (match books)
     → Optional create via recordEntry (cashbook only, explicit)
```

| Stage | Writes journals? | Purpose |
|-------|------------------|---------|
| Import Studio | **No** | Reliable bank-side staging |
| Reconciliation | **No** (link only) | Match bank ↔ books |
| Create unmatched | **Yes** (confirm) | Fill cashbook gaps |

## 3. UX principles

1. One decision per screen  
2. Suggest → show 3–5 sample values → user confirms  
3. Plain language: Money In / Money Out / Needs Review  
4. Safe failure better than silent success  
5. Known format → 2–3 screens; unknown → full guided path  
6. Save & Exit drafts; Back never destroys work  
7. Cashbook design guide: large type, 44px targets, Sinhala gloss  

### Wizard steps (skip when high confidence)

Upload → Account → Sheet → Table/header → Date → Description → Money mode → **Resolve labels (one by one)** → Review → Save profile → Import → Done → Reconcile

**Resolve labels:** each unique unknown DR/CR-style token is shown once with sample rows. User picks Money Out / Money In / Skip rows. Choice is written into `amountRules.moneyOutTokens` / `moneyInTokens` / `ignoreMoneyLabels` and re-previewed before the next label.

## 4. Amount modes (structured rules, no eval)

| Mode | Meaning |
|------|---------|
| A | Separate Money Out + Money In columns |
| B | Signed single amount |
| C | Amount + DR/CR column |
| D | DR/CR inside amount text |
| E | Transaction-type column |
| F | Advanced rule builder (later) |

Unknown money labels are **blocking errors**.

## 5. Validation gates before commit

- File readable, not password-protected  
- Required date + description + signed amount  
- Unknown direction blocked  
- Statement equation when opening/closing known:  
  `opening + money_in − money_out = closing` (± tolerance, default 0)  
- Exact file hash duplicate blocked  
- Unresolved row errors block commit  

## 6. Profiles

- Parent profile per tenant + bank account  
- **Versioned** rules; never edit approved in place  
- Structure fingerprint → Exact / Safe / Review / Incompatible  
- SL presets are starters only (`packages/statement-import/src/sl-bank-presets.ts`)  

## 7. BookOne implementation map

| Spec | Location |
|------|----------|
| Package core | `packages/statement-import` → inspect/transform/validate/profile/reconcile |
| Schema | Migration `023_bank_import_studio.sql` + `packages/db/src/schema/reconciliation.ts` |
| Server actions | `apps/web/src/app/actions/bank-import-studio.ts` |
| Wizard UI | `apps/web/src/components/bank-import-studio/*` |
| Cashbook import | `/cashbook/import` (studio — staging only) |
| Recon inbox | `/cashbook/bank-imports` · `/reconciliation` — **sessions** (bank + period) |
| Workbench | `/cashbook/recon/[sessionId]` · `/reconciliation/session/[sessionId]` |
| Compat | `/cashbook/match?importId=` → creates/opens session |
| Spec | `docs/BANK_RECONCILIATION_WORKBENCH.md` |
| Engine | One: studio stage → session/cases → confirm (no silent GL) |

## 8. Phases

| Phase | Scope |
|-------|--------|
| **BIS-0** | This doc + flag + legacy note | **Done** |
| **BIS-1** | Schema 023 + draft fields | **Done** |
| **BIS-2** | Inspect + multi-step wizard shell | **Done** |
| **BIS-3** | Amount rules A–D + validation + balance equation | **Done** |
| **BIS-4** | Bank-only commit + profile versions + fixtures | **Done** |
| **BIS-4.1** | Coach UI, sheet grid, fix-problems, viewport fit | **Done** |
| **BIS-4.2** | Issue-by-issue unknown label wizard (Out/In/Skip) | **Done** |
| **BIS-5** | Reconciliation passes 1–3 UI (match after import) | **Done** |
| **BIS-6** | Cashbook create rail for unmatched (explicit confirm) | **Done** |
| **BIS-7** | Hardening: overlap, password Excel, continuity, more presets | **Done** |
| **Later** | Advanced rule builder (mode F), AI suggest-only assist | Optional |

### BIS-5 Match UI

| Pass | What | Writes journals? |
|------|------|------------------|
| 1 Exact | Auto-proposed links (score ≥ ~0.9) → Confirm all | **No** (link only) |
| 2 Fuzzy | One-by-one pick from candidates / search | **No** |
| 3 Leftover | Unmatched bank lines listed | **No** |
| 4 Create | Select lines → category defaults → confirm → `recordEntry` | **Yes** (explicit) |

- Route: `/cashbook/match?importId=…` (also list recent imports)
- Engine: `runStatementMatchPass` → `matchAll` vs cashbook book candidates
- Studio **Done** primary CTA → Match to books
- Confirm links: `confirmStatementLinks` / `manualLinkStatementLine`
- Create: `confirmStatementCreates` (defaults Other expense 6800 / Other income 4300)
- Undo: `undoStatementCreates` (reverse journals)

### BIS-6 Create rail

1. After match leftover, **Add N to cashbook**  
2. Tick lines, pick default categories for money out / money in  
3. Browser confirm → posts via `recordEntry` only  
4. **Undo creates** reverses journals from this import  

### BIS-7 Hardening (complete)

| Item | Behaviour |
|------|-----------|
| **Password Excel** | Detect OLE-encrypted `.xlsx`; clear “export without password” message |
| **Fingerprint overlap** | Same bank line already imported → status `duplicate`, not re-staged as new |
| **Period overlap / gap** | Warnings when new file overlaps or leaves a gap after prior import |
| **Running balance** | Balance column continuity → warning issues (`balance_break`) |
| **SL presets** | Extra banks: Pan Asia, Union, Amana, Cargills, HDFC, SDB (+ existing majors) |
| **Exact file hash** | Same file+bank returns existing draft / blocks double-commit |

### Complete product path

```text
Upload → map → resolve labels → review (hardening warnings)
  → save bank lines → Bank imports hub
  → match (exact / fuzzy / leftover) → create unmatched (confirm)
```

### Where to find imports

| Who | Open | Then |
|-----|------|------|
| Personal / sole prop | Cashbook → **Bank imports** (home tile or ⋮ menu) | Continue → match workbench |
| Full ERP | Sidebar **Reconciliation** | Same hub + same match engine |
| After import | **Match to books** or **All bank imports** | Same |

### Optional later

- Advanced amount rule builder (mode F)  
- AI **suggest** mappings only (never finalize DR/CR or post journals)

## 9. AI policy

AI may **suggest** mappings or explain matches. AI must **not** finalize debit/credit, override amounts, or auto-post journals.

## 10. Deploy (single pull)

1. Pull latest `master`  
2. Run migrations **022** and **023**  
3. Rebuild web — no env flags required  
4. Cashbook → **Import bank** → guided studio  

---

*Implement as a safe normalization layer before reconciliation — not a set of hardcoded bank parsers.*
