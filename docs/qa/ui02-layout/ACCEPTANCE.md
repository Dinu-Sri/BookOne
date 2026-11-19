# UI-02 follow-up layout acceptance

Product **2.13.1**. Base `870ccfa` (v2.13.0). Layout and grouping only. Shared SearchField / SelectField / DateField / TextField / FormShell stay. COA-01 posting and CATALOG_VERSION 2 stay.

| Screen | Before (v2.13.0) | After (this candidate) | Evidence |
|---|---|---|---|
| `/accounts` | Search/New account higher than Class/Status; Balance heading left of numbers; title+secondary in a second band | Title + New account; labelled Search/Class/Status share a control baseline; secondary Opening/Import/Export/Advances grouped; Balance `th-num` / `td-num` | `before-accounts-1366x768.png`, `after-accounts-1920x1080.png`, `after-accounts-1366x768.png`, `after-accounts-768x1024.png`, `after-accounts-390x844.png`, `after-accounts-1366-collapsed.png` |
| `/accounts/new` | Fields stretch full width; Suggest code isolated; Institution/Last digits equal tracks; footer tight to the edge | FormShell `form` 42rem; identity Code + Suggest; Institution flexible / Last digits 7.5rem; header/body/footer 18px gutters | `before-new-1366x768.png`, `after-new-*.png` |
| `/accounts/[id]` | Facts in two far columns; Balance buried; dual Back; Save name | Identity (name, code, status, balance) + Open ledger; compact facts; labelled edit; one top Back; Save details | `before-detail-1366x768.png`, `after-detail-*.png` |
| `/accounts/opening` | Date centred/full width; duplicate labels; Debit/Credit shifted; totals left; empty header action cell | Compact `opening-date`; shared `--opening-tracks`; desktop header labels; row names stay accessible; totals under amount columns; post reason beside Post | `before-opening-1366x768.png`, `after-opening-*.png`, `after-opening-zoom200.png` |
| `/accounts/import` | Wide textarea; long plain guidance; Dry-run/Import disconnected from results | Guidance → CSV editor → review panel → footer | `before-import-1366x768.png`, `after-import-*.png` |
| `/advances` | Date lower than Amount; empty allocate tall and repeated; list pushed below both forms | Kind\|party then amount\|date; list after Issue; compact empty allocate; Issued/Remaining `th-num` | `before-advances-1366x768.png`, `after-advances-*.png` |

Geometry (Playwright fixture + shipped CSS):

- Desktop 1366×768 Search/Class/Status control bottoms within 2 CSS pixels
- Opening date label x equals trigger x; Advances Amount and Date tops within 2px
- Opening header column x/width match the first editor row
- 390×844 new-account document width does not exceed the viewport; table overflow stays in `.table-wrap`
- 200% zoom keeps opening date and Add line visible

Shared CSS consumers checked in source: DateField compact (period selector), legacy Simple Entry `.date-field:not(.date-quick)`, global `.party-toolbar` (other lists), nested `.party-form-footer` (party/product/company forms). This matrix is not live-tenant CoA acceptance.
