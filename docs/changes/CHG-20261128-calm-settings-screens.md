# CHG-20261128-calm-settings-screens (v2.32.0)

Status: ready for the owner's staging review.

- Author and date: coding agent, 2026-11-28.
- Pushed directly to `master` (owner-approved).
- Source: the owner's calm-screen request for Sales, Purchase and Inventory settings (2026-11-27), plus the owner's v2.31.2 feedback that long forms must keep Save visible.

## Staging check of v2.31.2

Checked on staging (ZZ-TEST company, nothing saved):
- changing a permission shows "You have unsaved job changes." in the sticky bottom bar, and Save job turns primary in the sticky header;
- choosing another job shows the BookOne dialog "Leave without saving?" with Keep editing / Leave without saving, not a browser pop-up;
- leaving takes about a second for the server to render the next job. The clicked job now highlights at once and the matrix dims while it loads (`useTransition`).

## Problems found (before)

- Settings were long two-column grids of native selects and checkboxes, with Save at the very bottom.
- Engineering wording on the main surface: "GRNI", "Dr Inventory 5100 / Cr GRNI 2150", "COGS", "AP", "TAX INVOICE", ALL-CAPS-like labels, and option text written as definitions.
- Every section had a back-arrow header and a right-aligned label instead of a title.
- The POS register list used a native select per row and archived a till with no confirmation, although archiving cannot be undone.

## Changes

- **New `components/settings/settings-kit.tsx`:**
  - `SettingsForm`: one card, a sticky header (title plus Save) and a sticky bar ("You have unsaved changes." / "No unsaved changes."), plus read-only mode.
  - `SettingsSection` groups the rows.
  - Rows: `SwitchRow` (posts `name=on`, like the old checkbox), `SelectRow` (registry `SelectField` with a hidden input), and `TextRow` (registry `TextField`).
  - `FormSelect`, for plain forms.
  - `ConfirmSubmitButton` (asks with `askConfirm` first).
- **The four pages are rebuilt** with the kit, a `ux-head` purpose sentence and a "Good to know" guide aside:

  | Page | Rebuilt as |
  |---|---|
  | Inventory | Costing and Stock below zero, with descriptions on the options |
  | Purchase | Checks on supplier bills (5 switches) and Defaults for new bills |
  | Rental | Rate units, When to invoice, Deposits, Double bookings and returns, then the Hire bays card |
  | Sales | VAT, New invoices, Invoice numbers and Quotation numbers (with the "next number looks like" preview in the section line), then Shop tills |

- **Sales, Shop tills:**
  - the per-row print mode uses `FormSelect`;
  - "Manual" is now called "Preview only", with its meaning given;
  - Archive asks first: "It disappears from the POS and cannot be brought back…";
  - the add form is folded in "Add a till", with registry fields and an Active switch.
- **Preserved:**
  - every field name and server action;
  - `jobCanWrite(tenant, 'Sales Settings')`, `canWrite ? saveSalesSettingsFromForm`, `Add register` and read-only mode;
  - the AgentBridge link on Purchase settings;
  - hire bay creation;
  - the "keep one active register" server rule.
- UI-02 baseline shrinks: the inventory, purchase, rental and sales pages no longer have raw selects (13 removed).

## Rule book checklist

- [x] Purpose sentence and exactly one primary action per view (Save, sticky)
- [x] No jargon, ids or enums on the main surface; account codes follow names
- [x] Sentence case; no uppercase labels
- [x] Only applicable actions shown; the add-till form is folded
- [x] Status words plus Badge tone (Active / Off)
- [x] Sums as a statement (not applicable)
- [x] Empty, finished and error states say what to do next (unchanged server errors)
- [x] Nothing posted, published or approved without a person
- [x] No browser pop-ups; long forms keep Save visible
- [ ] Checked at 1920, 1366×768 and 390×844: to do on staging after deploy
- [x] Registry controls only; field names unchanged

## Evidence

- Web typecheck passes.
- Auth tests: 247 (+5 skipped), including UI-02 and POS write auth.
- AgentBridge tests: 167.
- CI browser set (AgentBridge-01, connect and consent, UI-NAV-01, DB-01, COA-01, UI-02): 40 of 40.
- Not yet checked: staging rendering.

## Rollback

Revert the commit. There are no data or schema changes.
