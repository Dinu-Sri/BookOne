# CHG-20261127-bank-recon-ui-redesign: bank reconciliation screens redesigned (v2.25.0)

Status: in progress (first pass; screen review on staging follows).

- Author/agent and date: coding agent, 2026-11-27
- Product version and base: 2.25.0, pushed directly to `master` (owner-approved), based on `f6924fd` / v2.24.1
- Source: owner, "fix the remaining issues too… deep study of each UI of bank reconciliation and make them beautiful and balanced, easy to understand, minimalistic… fully fill the screen, minimum scrolling". No QA finding and no external UX/UXW/WB ID. Prior QA reference: Dinu-Sri/bookone-qa PR #129 at `91d7ce8e698517b2c50daeeb552ecd56104f5741`. The QA UX companion was not re-pinned for this pass; the design inventory reference stays `024f8c35223a28c0662d469b71cd96579d4ee24d`.
- Follows `docs/UI_UX_CHANGE_GUIDE.md`: existing tokens (Inter, `--ink`, `--line`, `--brand`, status colours, radii), registry controls (`SelectField`, `DateField`, `TextField`, `SearchField`), shared `Button` / `Badge` / `ConfirmDialog` / `withFormPending`. No new palette, type scale or kit. Scope is the bank reconciliation module plus Simple Entry's native controls.

## Study (v2.24.0 on staging, test company ZZ-TEST Bank Recon)

- **Home:**
  - a long subtitle and a second jargon sentence ("Import files are evidence");
  - a full-width search box for one row;
  - an "Imported bank files" table competing with the main list;
  - a large empty area;
  - no guidance for new users.
- **Import:**
  - "1/9" dots;
  - a 300 px coach panel with clipped tables;
  - uppercase instructions (`.bis-money-label`);
  - single steps in a 520 px card leaving the screen empty;
  - the file preview paged at 12 rows;
  - a date-format sample using a date not in the file ("2026-11-03 STAYS 2026-11-03");
  - cash and card accounts mixed in with banks.
- **Reconcile:**
  - page scroll plus inner list scroll;
  - six equal statistic chips with uppercase labels;
  - every row repeating its hint ("Matched · Matched — links two existing records");
  - the action bar below the fold;
  - a "Classic workbench" link;
  - period "3–31 Oct" for an October statement;
  - strong one-to-one suggestions labelled "More than one possible BookOne entry, or the match is unclear";
  - search listing already-matched entries.
- **Finish dialog:** a bullet list of six numbers.
- **Simple Entry:** six native `<select>` and one native date input (UI-02 baseline).

## Changes

**Reconcile workspace** (`reconciliation-compare.tsx`, `.brc-v2`):
- fills the window under the top bar (`.brc-page`, main app only; the cashbook shell keeps natural flow);
- header with an icon back link, bank and month, one sentence, **Confirm sure matches (n)** and **Review & finish**;
- **balance line**: Bank closing, BookOne balance and Waiting to clear, then **Left to explain** large, green with a tick at 0 and amber otherwise, plus one sentence on the rule;
- **To do / Done / All** filter (To do by default; All once reconciled) and a progress bar;
- two lists filling the remaining height, one line per row (date, description, status, amount), hint as a tooltip only;
- **action dock** always visible, describing the selection in one sentence with only the actions that apply:
  - Confirm match;
  - Waiting to clear;
  - for bank-only lines: Search BookOne, Category, Create in BookOne;
- search results inside the dock;
- reconciled months show a Report link;
- "Classic workbench" is renamed "Detailed view";
- the finish dialog shows the same sum as a statement, with Difference as the total line.

**Home** (`reconciliation-inbox.tsx`, `.rin`):
- title, one sentence and **Import bank statement**;
- "Your reconciliations" with an "n to finish" count;
- a cleaner table (Bank account, Period, Status, Progress, Left to explain, and **Continue** in primary colour when work is left);
- imported files folded into a "Imported statement files (n)" disclosure;
- a "How it works" panel with 4 numbered steps, guide and practice file links;
- `SearchField` only when there are more than 6 reconciliations.

**Import** (`studio-shell.tsx`, `studio-wizard.tsx`, `.bis-page`):
- fills the window;
- named stages **Upload · Account · Columns · Check & save** replace the nine dots and "1/9";
- 420 px guide panel with its body scrolling and its footer pinned;
- the file preview fills the left side, 25 rows per page;
- the upload step gets a large drop zone (keyboard Enter/Space opens the picker), "Where do I get it?" help and a practice file;
- the account step lists banks first, then "Other money accounts";
- instructions are in sentence case;
- date formats are described in words.

**Server** (`bank-reconciliation.ts`):
- suggested matches carry a specific reason: "Same amount, 1 day apart. Banks often record payments a day or two later." / "n BookOne entries have this amount…" / "Same amount and date. The description is different." / "Similar amount and date…";
- a one-month statement period reads "October 2026";
- Search BookOne leaves out entries already matched or excluded in the session.

**Simple Entry:** Money in type, Document type, Brand, Location, From/Paid account and Payment method use `SelectField`, and Date uses `DateField` (the max today rule kept). The UI-02 baseline entries for `simple-entry-screen.tsx` and `reconciliation-compare.tsx` are removed (now 0).

## Compatibility

- Kept test hooks and names:
  - test IDs `brc-summary`, `brc-difference`, `brc-bank-pane`, `brc-book-pane`, `brc-confirm-match`, `brc-review-finish`, `brc-finish-review`, `brc-search`, `recon-inbox-difference`;
  - the `bis-*` test IDs;
  - headings "Bank statement", "BookOne records", "Upload bank file", "Which account is this statement for?", "Bank file saved", "Save bank lines?";
  - buttons Confirm match, Waiting to clear, Search BookOne, Create in BookOne, Create entry, Review & finish, Finish reconciliation;
  - status texts Possible match, Bank only, BookOne only, Matched, Waiting to clear;
  - toasts.
- The dock never repeats the "Possible match" text, so the CoreGuard pill counts are unchanged.
- Shared consumers: `ReconciliationInbox` and `ReconciliationCompare` are also used on the cashbook routes (same props). `StudioShell` and `sheet-grid` are shared with the cashbook import, which gets the named stages and 25 rows. Its layout CSS is untouched except `.bis-money-label` sentence case.
- Preserved:
  - matching, posting (Create still needs the user's category and confirm), outstanding items, finish rules and permissions;
  - Simple Entry field values, validation and posting.

## Evidence

- Typecheck passes.
- Unit tests: auth 246 (+5 skipped), with the UI-02 lint at the lower baseline.
- Staging screen review at desktop, laptop and narrow widths follows in this record after deploy.

## Rollback

Revert the commit. CSS is in appended blocks (`.brc-v2`, `.rin`, `.bis-page`), and there is no data change.
