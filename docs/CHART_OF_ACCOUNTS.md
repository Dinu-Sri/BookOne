# Chart of Accounts (COA-01)

Product version: 2.12.0. Additive migration `049_chart_of_accounts.sql`. Permission catalog stays at v2. Account writes reuse `accounting.accounts.read` / `accounting.accounts.write`. Personal Cashbook banks reuse `accounting.cashbook.write`. Advances reuse `sales.payments.write`, `purchase.payments.write`, and `accounting.simple_entry.write`. AgentBridge scopes are unchanged: account creation, mapping, advances, payments, and journals stay human UI.

Canonical QA rulebook lives in [bookone-qa](https://github.com/Dinu-Sri/bookone-qa). Relevant contracts: BR-ACC-01–08, BR-SEC-01/02, BR-DAT-01/03, RB-PAY-02, RB-ACC-01, RB-INV-04, plus archive restore LAST. This document records the product contract. Independent QA still reviews the candidate on staging.

## What this change does

Every business company can maintain its own chart: create, rename, archive, reactivate, import metadata, export, and post one balanced opening. Custom banks (1101–1199) and petty cash (1001–1099) are classified as liquid tenders. Customer / supplier / staff advances post real journals and allocations. Creating an account starts at zero; opening balances are a separate preview-then-post.

This is not FX revaluation, consolidation, a payroll engine, automatic depreciation, or unrestricted AI journals. Fixed-asset, loan, tax, and accum-depreciation *types* exist as accounts. Their automation engines are not implemented. Taxable advances are refused until a sourced VAT contract exists. The worked examples below are non-VAT.

## Authoritative model

One `accounts` table. Semantic metadata is the durable source for behaviour; codes are company identifiers.

| Field | Role |
| --- | --- |
| `id` | Stable immutable account id |
| `code` | Unique per tenant, case-insensitive, including archived |
| `name` | Unique among active non-voided rows |
| `type` | Root class: asset / liability / equity / revenue / expense |
| `normalSide` | Derived from class and contra. Not a free-form user choice |
| `subtype` | cash, bank, card_clearing, receivable, supplier_advance, staff_advance, customer_advance, inventory, payable, deposit, tax, equity, sales, expense, group, … |
| `liquidity` | cash / bank / card_clearing / none |
| `cashFlowClass` | operating / investing / financing / none |
| `controlRole` | ar, ap, vat_*, inventory, grni, cogs, sales, advances, cash, bank, … |
| `isGroup` | Non-posting heading. Children roll up once |
| `isSystem` | Seeded control. Protected from destructive archive after use |
| `version` | Optimistic concurrency |
| `institution` / `lastDigits` | Display-only bank labels. Never a login |

Family fallback when metadata is empty (unit tests and legacy rows): `10xx` cash, `11xx` bank, `12xx` card clearing. Stored metadata wins.

Spendable cash (dashboard DB01-CB) = liquidity cash or bank, with code-family fallback `10xx`+`11xx`. Cash universe (DB01-NCM / DB01-CC) also includes `12xx`. AR, income, and other assets are never tenders.

### Seeded controls (preserved ids/codes)

Cash 1000, bank 1100, card 1200, AR 1300, supplier advances 1350, staff advances 1360, AP 2100, GRNI 2150, output VAT 2200, input VAT 2300, deposits 2400, customer advances 2410, equity 3000, drawings 3100, sales 4000, sales returns 4100, COGS 5000, inventory 5100. Existing custom 1101–1199 banks migrate to `subtype=bank`, `liquidity=bank`.

Deposits (2400) stay distinct from customer advances (2410).

## Lifecycle

- **Create:** wizard template, suggested code, optional manual code, unique code/name, idempotent unique-violation receipt. Balance is zero.
- **Edit:** name/description/institution. Class, subtype, normal side, liquidity, control role, and group flag lock after journals or children exist. Code change is blocked after journals.
- **Archive:** blocked on nonzero balance, open advances, children, or used system controls. Archived rows stay in history and cannot take new postings or tenders. Reactivation is audited.
- **Reports** show the current name. Posted journal lines keep their original memo/account id.

No merge/delete of used accounts. Owner does not bypass period locks or accounting invariants.

## UI

Accounting → Chart of Accounts (`/accounts`). New account `/accounts/new` (optional `?template=bank`). Opening `/accounts/opening`. CSV `/accounts/import`. Advances `/advances`. Business `/cashbook/settings` redirects to `/accounts?focus=bank`. Personal Cashbook settings stay in the personal shell.

Permissions: Viewer can read. Owner/Accountant write. UI never replaces server `assertPermission`.

## Banks, cash, and Pilot-01 regressions

Independent oracles (not hardcoded `['1000','1100']`):

1. Dr 1101 = 300 / Cr 3000 = 300 → cash and bank **300**.
2. Cr 1100 = 100 / Dr 1101 = 100 in one journal → internal transfer, external outflow **0**, total cash unchanged.
3. Cash↔bank, custom↔custom, reverse, and mixed journals: only all-cash-universe debit+credit journals are internal transfers.

Eligible active liquid accounts appear in receipts, vendor payments, cash purchases, expenses, transfers, POS, bank import, and reconciliation. Archived/foreign/denied ids are refused server-side.

## Advances (non-VAT)

| Kind | Issue | Apply / settle | Unused |
| --- | --- | --- | --- |
| Customer | Dr cash / Cr 2410 | Dr 2410 / Cr 1300 + settlement allocation | Refund Dr 2410 / Cr cash |
| Supplier | Dr 1350 / Cr cash | Dr 2100 / Cr 1350 + allocation | Return Dr cash / Cr 1350 |
| Staff | Dr 1360 / Cr cash | Expense Dr 6800 / Cr 1360 | Return Dr cash / Cr 1360 |

Worked examples:

- Customer: receive 1000, apply 400 → invoice settled 400, advance remaining 600. No sales revenue on receipt or application.
- Supplier: pay 1000, apply 400 → AP settled 400, advance asset 600.
- Staff: issue 1000, expense 400, return 100 → remaining 500, expense 400, cash net out 900.

Taxable advances return `TAXABLE_ADVANCE_REFUSAL` before posting. Idempotency keys, optimistic `version`, period locks, and party-kind checks apply. Application requires an eligible same-party document.

## Opening balances and CSV

Opening: independently balanced preview, fingerprint unique among posted runs, one auditable journal. Unbalanced, group, negative, and dual debit+credit lines are refused.

CSV import is metadata only (dry-run then create). Formula-safe export prefixes `=`, `+`, `-`, `@`. Monetary openings never ride on the name/type form.

## Archive / restore

Dump and restore include `party_advances`, `party_advance_allocations`, `opening_balance_runs`, `opening_balance_lines` after parties / journals / documents / allocations. New tables have RLS. Restore LAST into an empty target. Isolated recovery is not claimed from this source check.

## Permissions matrix

| Action | Key | Owner | Accountant | Viewer |
| --- | --- | --- | --- | --- |
| List / export chart | `accounting.accounts.read` | yes | yes | yes |
| Create / edit / archive / opening / CSV | `accounting.accounts.write` | yes | yes | no |
| Personal cashbook bank | `accounting.cashbook.write` | personal shell | personal shell | no |
| Customer advance | `sales.payments.write` | yes | yes | no |
| Supplier advance | `purchase.payments.write` | yes | yes | no |
| Staff advance | `accounting.simple_entry.write` | yes | yes | no |

Catalog version remains 2. Child routes `/accounts/new`, `/accounts/opening`, `/accounts/import`, `/advances` alias `accounting.accounts`. Nav label Advances copies Accounts access.

## AgentBridge

Existing read/upload/draft grants do not create accounts, change mappings, issue advances, or post journals. Authorized account lookup still uses liquid/control classification so agents can see permitted choices. No new account-management MCP tools.

## Upgrade and rollback

049 is additive (`ADD COLUMN IF NOT EXISTS`, unique indexes, new tables, classify trigger, reject-group-posting trigger). Existing account ids, journals, and grants stay. Rollback is restore LAST / revert the VERSION 2.12.0 commit after an owner decision; dropping the new columns is not a live path.

## Known limits

- No FX, consolidation, payroll deduction, depreciation run, or taxable-advance VAT.
- Isolated restore LAST is required before recovery claims.
- Playwright COA-01 is a labelled HTML fixture, not a live-tenant Owner session.
- Dashboard compact DB-02 overview is unchanged aside from including custom 10xx/11xx in cash totals.
