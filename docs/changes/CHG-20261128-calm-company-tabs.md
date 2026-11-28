# CHG-20261128-calm-company-tabs (v2.33.0)

Status: ready for the owner's staging review.

- Author and date: coding agent, 2026-11-28.
- Pushed directly to `master` (owner-approved).
- Source: the owner's calm-screen request for Company details, Tax info, Brands, Locations, Domain verification and Backup (2026-11-27).

## Staging check of v2.32.0 (ZZ-TEST company)

- Sales, Purchase, Inventory and Rental settings render with the sticky Save header and bar.
- Save round trip on Sales: turned "Enforce customer credit limits" on, saved from the header, reloaded and it stayed on; turned it back off and saved (restored).
- Not checked: phone width. The browser window is maximised and would not resize; the 640 px rules are in CSS.

## Problems found (before)

- **Company details:** one long two-column form with Save at the bottom; the slug shown next to every company.
- **Tax info:** it asks for an invoice prefix, bill prefix, default tax rate and tax basis. Nothing reads these fields. New documents take their numbers and VAT rate from Sales settings (`commercial-docs.ts` uses `ss.invoicePrefix`), so the fields mislead.
- **Brands and Locations:**
  - every saved item was an open edit form, so the page was a wall of inputs;
  - native selects;
  - a badge showing the raw location type (`branch`).
- **Domains:** the long verification token was always shown; the status was the raw enum (`pending`).
- **Backup:** restore forms always open, next to backup, even for companies that cannot be restored.

## Changes

- **Company details:**
  - `SettingsForm` with sections: Name and registration, Contact, Address, Country and currency;
  - the "Your companies" side card has Switch per company and "Open now" for the current one;
  - "Add a company" is folded, with registry fields.
- **Tax info:**
  - Registration numbers (TIN, VAT, SVAT, tax office) come first;
  - the four unused fields are folded under "Older numbering fields", with a note pointing to Sales settings. They are still posted and saved, so no data is lost.
- **Brands and Locations:**
  - each item is a folded row (name, code, type label, brand) that opens to its edit form;
  - "Add a brand" and "Add a location" are folded, and open when the list is empty;
  - registry `TextField` / `TextAreaField` / `SelectField` replace the native inputs;
  - delete checks, the blocker dialog and `data-testid="delete-location"` are unchanged.
- **Domains:**
  - each domain shows Verified or Waiting for DNS;
  - a TXT record table with Copy buttons for the name and value, hidden once verified;
  - a 3-step guide;
  - "Add a domain" is folded.
- **Backup:**
  - "Make a backup" card with a status badge (Last backup / Backup due / No backup yet) and the reminder;
  - "Restore from a backup" is folded (open for an empty company) as two named steps;
  - a 3-step guide;
  - the backup client components are unchanged.
- **Kit:** `TextRow` gains `type`; new `CopyButton`.
- Removed `app/company/_components.tsx`, which nothing used any more.
- UI-02 baseline shrinks: `_components.tsx` and `brand-location-forms.tsx` are removed (3 raw selects).

## Rule book checklist

- [x] Purpose sentence and exactly one primary action per view
- [x] No jargon, ids or enums on the main surface (slug and raw type removed; token folded behind Copy)
- [x] Sentence case
- [x] Only applicable actions shown; add forms, restore and old fields folded
- [x] Status words plus Badge tone
- [x] Empty states invite the first action
- [x] Nothing posted without a person
- [x] No browser pop-ups; long forms keep Save visible
- [ ] Checked at 1920, 1366×768 and 390×844: 1920 to do on staging after deploy; phone not possible in the maximised window
- [x] Registry controls only; field names and test ids unchanged

## Evidence

- Web typecheck passes.
- Auth tests: 247 (+5 skipped), including UI-02 and tenant scope.
- AgentBridge tests: 167.
- CI browser set: 40 of 40.

## Rollback

Revert the commit. There are no data or schema changes.
