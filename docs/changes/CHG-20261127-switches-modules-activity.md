# CHG-20261127-switches-modules-activity (v2.30.0)

Status: ready for the owner's staging review. This is batch 2 of the calm-screens rollout (Accounting, Company, Control Room).

- Author and date: coding agent, 2026-11-27.
- Pushed directly to `master` (owner-approved).
- Rule book: `docs/UI_DESIGN_RULEBOOK.md`.

## Changes

- **Yes/no options are switches app-wide.** Every `label.party-check` checkbox now looks like the AgentBridge switch. This covers:
  - Sales, Purchase and Rental settings;
  - products, customers and suppliers;
  - discounts, event hire, Simple Entry and Commerce options.

  It is CSS only: the native checkbox, its name, value, keyboard and tests are unchanged. The focus ring is kept, the disabled state is dimmed and reduced motion is respected.
- **Control Room → Modules:**
  - each company × module cell is a live switch (`setPlatformModule`, platform-admin only);
  - it saves straight away, shows a toast, and on failure goes back with the error;
  - it is audited as `tenant.modules.toggle`, with before and after;
  - the page has a head: "Turn a module on or off for any company with one switch…";
  - column names come from the module catalogue;
  - per-company Edit stays.
- **Activity:**
  - title and one sentence;
  - columns When (day and time) / Who / What happened / Record;
  - action words "Added", "Changed", "Removed", "Voided", "Reversed" instead of CREATE and so on;
  - event text in plain words, e.g. "Engine inference: confidence=0.9, source=rule - 6000" becomes "Category picked by a rule (90% sure) · 6,000.00", and "(no journal)" becomes "(no accounting entry yet)";
  - snake_case words are spaced;
  - record IDs are shown on hover;
  - the "Back / Journal" button is replaced by an "Open journal" button in the head.
- **Transactions:**
  - title with the period and one sentence;
  - entry count and a **New entry** button;
  - Status column with one word (Reconciled / Not reconciled), plus Locked, Reversed or Reversal only when they apply (no "Open" badge).
- **Calm CSS:**
  - table headers and eyebrows in sentence case app-wide;
  - the "Back / Company" and "Back / Journal" buttons are hidden on pages that are now in the menu or the Company tabs (the bar is hidden when that button was its only content).

## Evidence

- Typecheck passes.
- Auth tests: 246 (+5 skipped), including UI-02 lint.
- E2E: UI-02, COA-01 and Dashboard DB-01, 17 of 17.
- Not yet checked: staging.

## Rollback

Revert the commit. There is no data change. Module switches write the same `tenants.modules` field as the edit form.
