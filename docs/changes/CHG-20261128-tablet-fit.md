# CHG-20261128-tablet-fit (v2.35.1)

Status: ready for the owner's staging review.

- Author and date: coding agent, 2026-11-28.
- Pushed directly to `master` (owner-approved).
- **Owner decision (2026-11-28):** phone sizes are not required; screens must work on a tablet. Rule book rule 10 and the review checklist now use tablet 768×1024 instead of phone 390×844.

## Staging review of v2.35.0

- Control Room Overview, Companies and Access render as designed at 1920.
- Tablet check: every redesigned page was loaded in a 768×1024 frame on staging, and the page width was measured. There are 18 pages:
  - Sales, Purchase, Inventory and Rental settings;
  - Details, Tax, Brands, Locations, Domains, Backup and Jobs;
  - Journal, Accounts and Advances;
  - Control Room Overview, Companies, Access and Modules.

## Problems found

| Page | Problem at 768 |
|---|---|
| Advances | Scrolled sideways (1018 px). The open-advances table stretched its grid column. |
| Control Room → Modules | Scrolled sideways (1095 px). The module matrix stretched the page grid. |
| Journal | Each entry's amount and Balanced badge were cut off on the right. The row grid needs about 666 px. |

## Changes (CSS only)

- `.workspace.ux-page > *`, `.adv-stack > *` and `.ux-main > *` get `min-width: 0`, so wide tables scroll inside their `.table-wrap`. The Advances markup is unchanged (UI-02 gate).
- Journal rows use flexible columns. Under 1200 px the type, amount and badge wrap below the entry name.
- **Verified on staging before shipping:** the CSS was injected into 768 px frames.
  - Advances and Modules measure 768 px wide (no sideways scroll).
  - The Journal badge's right edge is at 567 px (fully visible).

## Evidence

- UI-02 and DB-01 browser tests: 15 of 15.
- Typecheck passes.

## Rollback

Revert the commit.
