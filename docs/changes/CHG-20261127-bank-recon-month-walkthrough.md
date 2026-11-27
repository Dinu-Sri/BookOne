# CHG-20261127-bank-recon-month-walkthrough: bank reconciliation fixed for new companies and made plain (v2.24.0)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-27
- Product version and base: 2.24.0, pushed directly to `master` (owner-approved), based on `8a34adf` / v2.23.2
- Source: owner asked to "properly test and understand our bank reconciliation… create synthetic bank statement, import it and reconcile… for a month… make it full simple… even for a person who does not know accounting". No QA finding and no external UX/UXW/WB ID. Prior QA reference: Dinu-Sri/bookone-qa PR #129 at `91d7ce8e698517b2c50daeeb552ecd56104f5741`.
- Spec: `docs/BANK_RECONCILIATION_WORKBENCH.md` §1.1 (Import → Reconcile → Done; ordinary users do not need debit/credit).

## How it was tested (staging, browser, v2.23.1)

- **Company:** new test company "ZZ-TEST Bank Recon" (owner's staging login), bank account 1100 Commercial Bank.
- **Opening balance:** 250,000.00 on 1 Oct 2026 (Accounts → Opening balances).
- **Ten Simple Entry records for October**, 4 in and 6 out, two of them at month end: a cheque not yet presented and a deposit in transit. BookOne bank balance afterwards: 176,410.00, as expected.
- **Synthetic statement** `docs/qa/bank-recon-demo/commercial-bank-oct-2026.csv`, also published as `/samples/sample-bank-statement-october-2026.csv`. It has 12 lines with running balances checked, closing 164,422.50, and includes 4 bank-only lines (interest 412.50, service charges 350, SMS fee 50, AIA standing order 4,500) and one customer receipt booked a day later by the bank.
- **Import:** columns were detected automatically and the totals were correct (in 106,162.50, out 191,740.00, closing 164,422.50). 12 lines were saved.
- **Reconcile:**
  - 8 suggested matches confirmed;
  - 4 bank-only lines created (interest → Other Income; charges → Bank Charges, chosen by hand; insurance → Insurance Expense, chosen by hand);
  - 2 BookOne-only lines marked waiting to clear (net +7,500).
- **Result before the fix:** everything was explained, yet the screen showed "Difference LKR 250,000.00" and **Review & finish** never appeared.

## Findings and changes

| # | Finding | Change |
|---|---|---|
| 1 | **BookOne closing ignored the opening balance** (−73,590.00 instead of 176,410.00). `bookBalanceThrough` summed cashbook `transactions` rows whose single payment account is the bank. A multi-line journal such as the opening-balance journal (and manual journals) has no single payment account, so it was skipped. A new company could never finish a reconciliation. | `bookBalanceThrough` now sums the bank account's **ledger lines** (`journal_lines` joined to non-voided `journal_entries` up to the period end), the same figure as Accounts. CoreGuard's seeded ledger posts journals, so its oracle is unchanged. |
| 2 | Simple Entry guessed "Staff salaries October" as General Expense (30%). The rule matched only "salary". | `/\bsalar(y\|ies)\b/` in the company, household and income rules. |
| 3 | The reconciliation screen always defaulted new bank lines to 6800 General Expense / 4300 Other Income, even for "SERVICE CHARGES" or "SMS ALERT CHARGES". A beginner accepts the default. | Each bank-only row carries `suggestedCategory` from the shared `inferCategory` rules on the company's own chart, and the Create picker starts there. New rules: SMS alert, ledger, cheque-book and commission fees (Bank Charges), and interest received (Other Income). Household charts keep General Expense, because 6600 means Education there. |
| 4 | Jargon in the import flow: "Same Smart Bank Import Studio as cashbook. Staging only — match after save", "Which bank?" listing short names, an all-caps instruction, "Statement equation", "Statement arithmetic difference". | Plain text: "Upload the statement you downloaded from your bank… Nothing changes in your books until you confirm", "Which account is this statement for?" with the account's full name, "Your bank file adds up", "Starting balance + money in − money out = closing balance", "Difference inside the file · OK". The numbers, `data-testid`s and row counts are unchanged. |
| 5 | The reconciliation summary read "BookOne X − waiting items Y should equal bank Z. Remaining difference D". | "Goal: BookOne's balance X, minus items still waiting to clear Y, equals the bank's closing balance Z. Left to explain: D." |
| 6 | The Create confirmation said "Post −LKR 350.00 as expense 6600 · Bank Charges. This creates a journal." | "Add LKR 350.00 money out to BookOne as 6600 · Bank Charges, dated like the bank line. It is recorded in your books." Same change on the guided screen. |
| 7 | The Opening balances screen gave no example and expected users to know debit and credit. | Plain intro plus a bank example (bank Debit, 3000 Owner Equity Credit, statement's first date). |
| 8 | Simple Entry kept the previous "Entry recorded. Journal #…" note while the next entry was typed. | The note clears as soon as the next entry is typed. |
| 9 | There was no beginner guide. | New `/docs/accounting/bank-reconciliation`: the four kinds of item, one-time setup, 5 monthly steps, the full October worked example with the sample file, and what to do when the difference is not 0. The Reconciliation page links to it. |

Noted, not changed in this record (later work):
- Simple Entry still uses a native date input and native selects (legacy screen).
- The import side panel is narrow, and the "2026-11-03 STAYS 2026-11-03" date-format sample uses a date not in the file.
- The bank account picker also offers Cash on Hand and Card Clearing (they are valid cash-book accounts).
- The session period shows "3–31 Oct" (from the first movement line) instead of the statement's 1–31 Oct.
- Search results list already-matched entries.
- Strong one-to-one matches with a one-day date shift are labelled "More than one possible BookOne entry, or the match is unclear".

## UI/UX compatibility

- Wording only on existing screens (`studio-wizard.tsx`, `reconciliation-compare.tsx`, `reconciliation-guided.tsx`, `app/reconciliation/page.tsx`, `coa-opening.tsx`, `simple-entry-screen.tsx`). No layout, control or CSS changes and no new controls. The registry `SelectField` / `DateField` are untouched. Existing `data-testid`s, numbers and row-count tokens are kept. The CoreGuard heading assertion moves to "Which account is this statement for?".
- Shared consumers: the category rules (`@bookone/accounting` `inferCategory`) are used by Simple Entry, AgentBridge drafts and now reconciliation. Only additive patterns were added and the plural fix. Household packs are guarded.
- Preserved: matching, outstanding items, posting (still the user's explicit Create with a chosen category), permissions and the audit trail. Book balance is now ledger-based for every session; sessions whose book side was only cashbook rows show the same value.

## Evidence

- Staging browser run above (v2.23.1): the remaining difference was exactly 250,000.00, which proves finding 1.
- `packages/accounting/test/category-inferrer-bank-words.test.ts` (4): plural salaries, bank-fee wording, household guard, insurance and interest.
- `packages/auth/test/bank-recon-book-balance.test.ts` (3): ledger source of the book balance, the suggested category wiring, plain wording and the guide.
- Unit totals: accounting 302, auth 246 (+5 skipped), statement-import 44. Web typecheck passes.
- To do after deploy: reopen the ZZ-TEST October session. Expect BookOne 171,922.50, waiting 7,500.00, bank 164,422.50, left to explain 0.00, and **Review & finish** available. Recorded in TASK_LOG once seen.

## Rollback

Revert the commit. There is no migration. The book balance goes back to the cashbook-only figure.

## Staging verification (v2.24.0) and follow-up v2.24.1

- After deploy, the ZZ-TEST October session shows: BookOne 171,922.50, waiting to clear 7,500.00, bank 164,422.50, **left to explain 0.00**. **Review & finish** opened with matched 8 and added 4. **Finish reconciliation** worked and the Reconciliation list shows *Commercial Bank · 1100 · 3–31 Oct 2026 · Reconciled · 14/14 · Rs. 0.00*.
- `/docs/accounting/bank-reconciliation` returns 200.
- **v2.24.1:** the sample statement linked from the public guide (`/samples/…`) redirected to login. The middleware now treats `/samples/` as public; it holds static sample files only.
