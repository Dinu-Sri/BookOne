# CHG-20261128-calm-journal-accounts (v2.34.0)

Status: ready for the owner's staging review.

- Author and date: coding agent, 2026-11-28.
- Pushed directly to `master` (owner-approved).
- Source: the owner's calm-screen request for Journal, Accounts and Advances (2026-11-27), plus fixes from the v2.33.0 staging review.

## Staging review of v2.33.0 (ZZ-TEST company)

- Details, Tax, Locations (opened an item: registry Brand and Type selects; Delete and Save location work), Domains (empty state with the add form open) and Backup render as designed.
- **Found and fixed here:**
  - the company role showed in lower case ("owner") and is now capitalised;
  - Backup listed raw table names ("journal lines 48, business documents 1"). It now uses plain counts ("23 transactions, 1 customer or supplier"), skips line tables, and shows at most six;
  - Backup said "No backup yet" in both the badge and the notice. The notice now only gives the instruction.

## Problems found (before)

- **Journal:**
  - four equal stat tiles, with "Integrity OK", "Accounts touched" and "Must equal credits" (rule 7 asks for a statement);
  - a "Ledger audit table" eyebrow and an "Expand rows" badge that did nothing;
  - lowercase `debit` / `credit` badges repeating the Debit and Credit columns;
  - money without fixed decimals;
  - no title or purpose sentence.
- **Accounts:**
  - an "Accounting" eyebrow;
  - " · system" / " · group" appended to names;
  - an Advances button that repeats the sidebar.
- **Advances:** developer wording on the main surface ("Uses the account code the server validates. Card clearing is not listed.", "These examples are non-VAT.").

## Changes

- **Journal:**
  - `ux-head` with a purpose sentence and Activity;
  - entries listed in a card with expandable rows (first open). Each row shows Account name (code), Note, Debit and Credit, plus a Total row;
  - unbalanced rows say "Off by LKR …";
  - a side panel gives the period statement (Entries, Debits, Credits, = Difference ✓) and a one-line verdict;
  - money always has 2 decimals;
  - a plain empty state.
- **Accounts (`coa-manager.tsx`):**
  - `ux-head` with the same "Chart of Accounts" heading and New account (COA-01);
  - a plain sentence;
  - small "Built-in" and "Group" tags;
  - the Advances button removed (it is in the sidebar).
- **Advances (`advances-panel.tsx`):**
  - wording only, because the UI-02 gate pins the layout, `FormBackLink`, `DateField`, `SelectField` and cash picker;
  - the intro, cash help, settle help and empty row say what happens in plain words.
- **Company tabs:** the review fixes above.

## Not changed on purpose

- Simple Entry and Transactions were redesigned in earlier batches.
- The Advances layout is held by the UI-02 gate and the QA layout fixture. Restructuring it needs the QA repository's fixture to change first.

## Rule book checklist

- [x] Purpose sentence and exactly one primary action per view
- [x] No jargon, ids or enums on the main surface
- [x] Sentence case; no eyebrows
- [x] Only applicable actions shown
- [x] Status words plus Badge tone (Balanced / Off by …)
- [x] Sums as a statement; money with 2 decimals
- [x] Empty states say what to do next
- [x] Nothing posted without a person
- [x] No browser pop-ups
- [ ] Checked at 1920, 1366×768 and 390×844: 1920 on staging after deploy
- [x] Registry controls only; COA-01 heading and link kept

## Evidence

- Web typecheck passes.
- Auth tests: 247 (+5 skipped).
- AgentBridge tests: 167.
- Accounting tests: 308.
- CI browser set (including COA-01 and UI-02): 40 of 40.

## Rollback

Revert the commit. There are no data or schema changes.
