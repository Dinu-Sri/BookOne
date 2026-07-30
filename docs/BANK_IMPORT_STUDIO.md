# BookOne Smart Bank Import Studio

> **Status:** Canonical product + engineering spec for bank document import (supersedes SI wizard UX)  
> **Last updated:** 2026-07-30  
> **External research source:** `bookone_smart_bank_import_studio_spec.md`  
> **Legacy engine:** `docs/STATEMENT_IMPORT_ARCHITECTURE.md` (SI-1…SI-4 — keep for rollback)  
> **Feature flag:** `BANK_IMPORT_STUDIO=1` (or tenant later)

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

Upload → Account → Sheet → Table/header → Date → Description → Money mode → Balance column → Review → Fix issues → Balance proof → Save profile → Import → Done → Reconcile

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
| Cashbook route | `/cashbook/import-studio` |
| ERP | `/reconciliation` consumes committed batches |
| Flag | `process.env.BANK_IMPORT_STUDIO === '1'` |

## 8. Phases

| Phase | Scope |
|-------|--------|
| **BIS-0** | This doc + flag + legacy note |
| **BIS-1** | Schema 023 + draft fields |
| **BIS-2** | Inspect + multi-step wizard shell |
| **BIS-3** | Amount rules A–D + validation + balance equation |
| **BIS-4** | Bank-only commit + profile versions + fixtures |
| **BIS-5** | Reconciliation passes 1–3 UI |
| **BIS-6** | Cashbook create rail post-recon |
| **BIS-7+** | Issues UX, overlap, advanced rules, AI assist |

## 9. AI policy

AI may **suggest** mappings or explain matches. AI must **not** finalize debit/credit, override amounts, or auto-post journals.

## 10. Rollout

1. Flag off by default in production until BIS-4 green  
2. Cashbook personal/sole first  
3. Keep `/cashbook/import` legacy path until studio stable  

---

*Implement as a safe normalization layer before reconciliation — not a set of hardcoded bank parsers.*
