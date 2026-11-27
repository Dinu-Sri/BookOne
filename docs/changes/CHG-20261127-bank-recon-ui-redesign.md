# CHG-20261127-bank-recon-ui-redesign: bank reconciliation screens redesigned (v2.25.0)

Status: ready-for-QA after the v2.25.3 staging review (cheque pair and finish pending deploy).

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

## Follow-up v2.25.1 — CoreGuard after the redesign

CI on `8ffb787` compiled and passed lint, typecheck and unit tests. Two browser checks failed on the new markup:

- **bank-recon:** the finish dialog's `<dt>Difference</dt><dd>LKR 0.00</dd>` read as "DifferenceLKR 0.00". Each summary label now ends with a space, so "Difference LKR 0.00" reads the same as before.
- **custom-bank:** the transfer step used the old native selects and date input on Simple Entry. It now uses the shared helpers: `pickSelect` for From account / To account and `pickDate` (generalised from `pickOpeningDate`) for `#entry-date`.

## Staging review of v2.25.1 and fixes in v2.25.2

I recorded November in Simple Entry using the new controls (6 entries; the date picker refuses future days). BookOne showed the bank at 69,192.50, as expected. I imported the November statement and opened the reconciliation. I checked desktop (1920×855), laptop (1366×768, in a sized frame) and phone (390×844).

What worked:
- the full-height workspace, the balance line (Left to explain 7,600.00 in amber), To do 15 and the pre-selected pair;
- the new plain reason "Same amount and date. The description is different.";
- stage pills; banks listed first; the bank file totals adding up;
- laptop size with no page scroll;
- no sideways scroll on the phone reconcile screen.

Found and fixed:

| # | Finding | Fix |
|---|---|---|
| 1 | **October's waiting items were not carried into November.** The 30 Oct deposit (20,000) and cheque 001002 (12,500) showed as *Bank only*, so a user would add them again (double counting). Unfinished waiting items would also never reappear. | `priorBookStates` reads earlier reconciliations of the same bank account. Entries matched or added there (`settled`) are never offered again (matching and Search). Entries left waiting (`waiting`) are loaded whatever their date, get a score lift (`CARRIED_BOOST` 0.15, reason "This was waiting to clear last month and has now reached the bank."), and stay on the list as BookOne only ("Waiting to clear since an earlier month") until matched. |
| 2 | Cheque 001003 (bank 5 Nov, BookOne 3 Nov, same number in both) was not suggested. The bank reference never reached the matcher (score 0.69 < 0.70). | The bank line's `externalRef` is passed to the matcher (+0.10 when the BookOne description contains it). The window is 7 days: 3–7 days apart earns no date credit, so it needs a reference, a similar description or the carried lift. BookOne candidates load ±7 days. `matchLine` keeps its 2-day default for other callers. |
| 3 | The reconcile page overflowed by about 20 px ("Before you can finish…" line, "Detailed view" cut off). | Detailed view moved into the header; the blocker line is removed (the To do count says what is left, and blockers stay in the finish dialog); the height is adjusted. |
| 4 | Phone: the two lists collapsed to zero height in the stacked layout. | Stacked layouts give each list its own height (46 vh); the cashbook shell uses the same rule. |
| 5 | Home at 1366 px: the table scrolled sideways next to the guide. On phone the page was 684 px wide (table header). | Three columns: "Bank account and month", Status with progress under it, Left to explain, plus the action. Rows become cards under 640 px. |
| 6 | Home had empty space under a finished list. | "What's next" card per bank with nothing open: "Commercial Bank is reconciled to 31 October 2026. Next: the November 2026 statement…" plus **Import November**. |
| 7 | Import, one-question steps: the content sat at the top and Next at the bottom of an empty card; the drop zone was shorter than intended; the Next button was green instead of the brand blue. | A centred compact card with its buttons attached, a taller drop zone, the empty footer hidden, and primary buttons in `--brand`. |
| 8 | The column check was cramped (5 columns in 400 px, sideways scroll), and the stage showed "Check & save" while checking columns. | 440 px panel; the "Original" column is hidden (the file preview shows it); `map` → Columns stage. |
| 9 | Totals: uppercase tiles repeating figures, unpadded numbers ("164,422.5"), technical row counts. | Tiles hidden. The sum is a four-line statement with 2 decimals (Starting balance / + Money in / − Money out / = Closing balance). Row counts are plain and only non-zero ("10 input rows · 9 ready · 1 balance row left out"). The account shows by name. |
| 10 | Save dialog and saved screen jargon ("1100 Bank… input rows. Cashbook stays the same until you match later"; four equal buttons). | "Save 9 bank lines for Commercial Bank (1100), … Nothing is added to your books yet; you match them next." The saved screen has **Reconcile now** plus quiet links (All reconciliations, Import another file, Dashboard). |

Tests: `packages/statement-import/test/match-carry.test.ts` (4):
- a cheque 2 days later with its number is suggested;
- 3+ days with nothing in common is not;
- a carried waiting deposit is suggested;
- the default 2-day window is unchanged.

Totals: statement-import 48, auth 246 (+5 skipped), typecheck passing.

## Staging run of November on v2.25.2 and fixes in v2.25.3

November was worked in the redesigned workspace after a fresh re-import. Results:

- The carried October items were suggested with the reason "This was waiting to clear last month and has now reached the bank."
- Six suggested matches were confirmed.
- Cheque 001004 (26 Nov) was marked waiting to clear.
- Service charges 350 and SMS 50 were created; both had **6600 · Bank Charges** suggested.
- Left to explain reached **LKR 0.00**:
  - BookOne 68,792.50;
  - waiting −8,000.00;
  - bank 76,792.50.
- One pair was still open: bank "CHEQUE 001003" (5 Nov) against BookOne "Office rent November cheque 001003" (3 Nov). It is blocked by finding 1 below, so it is not finished until v2.25.3 is live.

| # | Finding | Fix |
|---|---|---|
| 1 | **A Bank-only line could not be matched by hand.** After a bank line and a BookOne entry were picked, the dock said "The amounts agree…" but showed Create/Search instead of **Confirm match** (picking from Search BookOne only selected the entry). | The create actions apply only while no BookOne entry is selected (`createRow` is null when `selectedBook.length > 0`), so the pair shows Confirm match. |
| 2 | Detailed view → Find returned nothing for that cheque. Its search hid every entry in any open case, including the open BookOne-only row the entry was waiting in. | `searchGroupBookCandidates` keeps entries whose only case is an unconfirmed `outstanding_book`, hides entries settled in other months, and includes waiting items carried from an earlier month. `confirmGroupMatch` loads the same set and closes the BookOne-only row the entry leaves. |
| 3 | A waiting item carried from an earlier month (outside the ±7-day window) could not be matched by hand in either view. | `matchBankToBook` and `confirmGroupMatch` load `priorBookStates().waiting`; an entry already matched in another month is refused. |
| 4 | The bank reference (cheque number) was not saved on import (`external_ref` null on staging), so the v2.25.2 reference credit never applied to imported files. | Both statement-line inserts in `bank-import-studio.ts` save `externalRef` (≤100 characters). |
| 5 | Import wording: the totals warning box listed the left-out balance row again. | "Ready to save. Nothing is in your books yet."; the warnings box is titled "Worth a look (you can still save)" and leaves out `excluded_summary`. |
| 6 | One-question import steps: the card stretched to the full height (column flex), and the column check wrapped its action column. | `.bis-workspace.single` is a row flex with an auto-height card; the action column does not wrap. The "Import another file" link-button aligns with the other links. |

Tests: typecheck passes; auth has 246 passing (+5 skipped).

To do after deploy: match cheque 001003 in the workspace, then Review & finish, and check the report and the home "What's next" card.
