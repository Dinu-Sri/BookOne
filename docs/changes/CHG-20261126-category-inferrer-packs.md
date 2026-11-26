# CHG-20261126-category-inferrer-packs — category guesses follow the workspace chart (v2.17.9)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-26
- Product version (`VERSION` file) and base SHA / branch/PR: 2.17.9 pushed directly to `master` (owner-approved) from `37c3ae7` / v2.17.8
- QA repository revision and companion PR/change ID: independent staging QA pending

## Finding

`inferCategory()` (`packages/accounting/src/inference/category-inferrer.ts`) only knew the company chart. Personal and sole-prop workspaces are seeded with the personal pack, where codes 6300/6500/6600 are Food & Household / Healthcare / Education. Postings resolve by code, so in a personal or sole-prop workspace:

- "office supplies", "stationery", "printer" → 6500 **Healthcare**
- "salary", "wages" paid → 6300 **Food & Household**
- "bank charges" → 6600 **Education**
- personal workspaces could also be offered codes their chart lacks (4000, 5000, 5100, 6000), which fail to resolve at posting.

Follow-up named in CHG-20261125-coa-links-additive-push §1.

## Change

- `inferCategory(description, party, direction, override?, entityKind?)`: `categoryPackFor(entityKind)` picks personal (`personal`, `pending`), `sole_prop` or company (default, unchanged behaviour when no kind is passed).
- Rules carry optional `packs`. Company-only: 6300 salary, 6500 office supplies, 6600 bank charges. Personal/sole-prop: 6300 food/groceries, 6500 doctor/pharmacy/medical, 6600 school/tuition/books, and business costs without a household account (office supplies, salary, bank charges) → 6800 General Expense.
- A rule is skipped when its code is not in the workspace chart; names come from that chart.
- `SimpleEntry.entityKind` (optional) is passed by `recordEntry`; `previewCategory` reads the tenant's `entity_kind`, so the preview label and the posted account agree.

Not changed: company workspaces whose 6 posted accounts still carry personal names (CHG-20261125 §1) keep those names; rename them on Chart of Accounts.

## Evidence

- `packages/accounting/test/category-inferrer-packs.test.ts` (8): company mappings unchanged; personal/pending/sole-prop never map business costs to household accounts; household rules; personal never gets a code outside its chart; sole-prop keeps 6000/5000; every pack-scoped rule targets a code in its chart; posting engine debits 6800 for personal office supplies.
- typecheck exit 0; 704 unit tests passed.
- Staging: see TASK_LOG entry for the post-deploy check.

## Follow-up v2.17.10 — category name is the tenant's own account name

- Before: rules return pack names. Postings resolve by code to the tenant's account, which can carry another name (user rename, or the 6 posted company accounts that kept personal names). Simple Entry then showed "Office Supplies Expense" while debiting the tenant's 6500 "Healthcare", and `transactions.category_name` / the audit row stored the pack name.
- After: `categoryWithAccountName()` (accounting) replaces the name with the tenant's live account name for that code; `tenantAccountName()` (`apps/web/src/lib/tenant-account-name.ts`) reads it. Applied in `previewCategory` and in `recordEntry` before the transaction and audit rows are written. Code, confidence and source are unchanged.
- Tests: +2 in `category-inferrer-packs.test.ts` (name swap, no mutation, blank names ignored; source lock that both actions apply it). Typecheck exit 0; 706 unit tests passed.
- Staging data was wiped on 2026-11-26 at the owner's request (backup `zz_backups/pre-wipe-20261126.dump` in the postgres volume), so no existing transactions needed a name backfill there.

## Follow-up v2.17.11 — journal line memo uses the tenant name too

- Staging check of v2.17.10 (fresh ZZ-TEST company, 6500 renamed "ZZ Stationery & Printing", Simple Entry "office supplies" LKR 1,500): preview, `transactions.category_name` and the audit row showed the tenant name and the debit hit 6500, but the debit journal line memo still read "Office Supplies Expense" because the journal is generated inside `inferTransaction` before the rename.
- After: `recordEntry` regenerates the journal with `generateJournal(transaction)` when the name changed. Lines, accounts and amounts are unchanged; only the category memo differs.
- Tests: +1 (regenerated memo carries the tenant name; source lock on the regenerate call). 707 unit tests passed; typecheck exit 0.
