# CHG-20261127-shell-company-tabs-reverse (v2.29.0)

Status: ready for the owner's staging review. This is batch 1 of the owner's request for calm screens across Accounting, Company and Control Room.

- Author and date: coding agent, 2026-11-27.
- Pushed directly to `master` (owner-approved).
- Rule book: `docs/UI_DESIGN_RULEBOOK.md`.

## Changes

- **Sidebar hints.**
  - Resting the pointer on a menu icon (group or item; not the text or the row) shows a short bubble: the item name and one plain sentence. The texts are in `lib/nav-hints.ts`. Example: Reconciliation, "Check your bank statement against your books."
  - The icon turns brand blue and grows slightly. Reduced motion is respected.
  - The bubble reuses the status-help bubble style, rendered in a portal so the sidebar scroll never clips it.
- **Documentation** moved out of the Accounting menu to a book button beside the version number (bottom left). Hover shows "Documentation" and what it is. It keeps the accessible name "Documentation (opens in a new tab)".
- **Company Details is a tabbed screen:** Details · Tax · Brands · Locations · Domains · Team · Groups.
  - The shell draws the tab strip on any of these pages.
  - Tax Info, Brands, Locations, Domain Verification, Team and Groups leave the menu.
  - The menu keeps Company Details highlighted on every tab.
  - Each tab shows only if the job can open it.
  - Routes, page access checks and `active` labels are unchanged, so permission redirects work as before.
- **Commerce Integrations is renamed Commerce API** in the menu, screen permission label, page title, docs, product field help and the two e2e heading checks, plus the commerce-gate test. Stored permissions use keys (`company.commerce`), so no grants change.
- **Menu icons:** Print designs uses a printer, AgentBridge a bot, Commerce API a plug.
- **Transactions → Reverse** now opens a dialog before anything happens. The dialog shows:
  - the entry (description, party, date, amount);
  - **What happens:**
    - a new entry dated today for the same amount the opposite way;
    - balances go back to how they were before the entry;
    - nothing is deleted; the entry is marked Reversed and the new one Reversal;
    - when the entry was reconciled, the reversal appears in the next bank reconciliation;
  - **If you change your mind:** a reversal cannot be reversed again (server rule `A reversing entry cannot be reversed again`); record the entry again in Simple Entry.

  "Reverse entry" calls the same server action, then shows a toast and refreshes the list.

## Evidence

- Typecheck passes.
- Auth tests: 246 (+5 skipped), including the UI-NAV-01 contract (no secondary text in menu rows).
- UI-NAV-01 e2e: 11 of 11.
- Not yet checked: staging.

## Rollback

Revert the commit.
