# CHG-20261128-calm-control-room (v2.35.0)

Status: ready for the owner's staging review.

- Author and date: coding agent, 2026-11-28.
- Pushed directly to `master` (owner-approved).
- Source: the owner's calm-screen request for Control Room (2026-11-27). This is the last screen group in that request.

## Staging review of v2.34.0 (ZZ-TEST company)

- **Journal:** the expandable entries show name (code), note, debit, credit and total. The side statement shows Entries 8, Debits = Credits LKR 224,130.00, Difference LKR 0.00 ✓.
- **Accounts:** the calm head and Built-in tags render.
- **Backup:** shows plain counts ("1 customer or supplier, 23 transactions, …").
- **Fixed here:** the Accounts head sat directly on the filters; it now has a 14 px gap.

## Problems found (before)

- **Overview:**
  - no title;
  - four stat tiles, including "App env Production · 0 staging · 6 prod tenants";
  - raw audit actions (`tenant.update`) and long locale timestamps;
  - lowercase `active` badges;
  - slugs under every name;
  - three quick-link buttons repeating the sidebar.
- **Companies:** no title; four native selects; "posted production" and "active active" (badge plus the same word); slugs.
- **Access:** no title; role shown as a "posted Super_admin" / "active Admin" badge pair; slugs.
- **Health check:** a placeholder card titled "ERP Health Check".

## Changes

- **New `lib/platform-labels.ts`:**
  - `companyStatusWord` (Active / Suspended / Archived with tones);
  - `environmentWord` (Live / Test (staging));
  - `planWord`;
  - `platformEventWord` (Company created, Company details changed, Company suspended / restored, Company type changed, Module switched, Modules reset to plan);
  - `shortDateTime` (Colombo time).
- **Overview:**
  - `ux-head` with New company;
  - Recent companies as clickable rows (type, plan, status word);
  - Recent changes in plain words with the company and a short time;
  - a side statement (Active, Suspended, = All companies);
  - one line saying which server this is;
  - links to Modules, Access and Health check.
- **Companies:**
  - `ux-head` with New company;
  - registry `SearchField` and four `SelectField` filters in plain words;
  - one status badge per row; Server as Live / Test; ISO dates;
  - Previous / Next paging;
  - URL filter sync is unchanged.
- **Access:**
  - `ux-head` and registry `SearchField`;
  - role in words, with a "Platform admin" badge only for super admins;
  - home company with an "Archived" tag;
  - slugs removed.
- **Health check:** `ux-head` plus an honest empty state.
- **Preserved:** the `isPlatformAdmin` / `redirect('/')` / `listPlatformCompanies(` guards (tenant-scope test), plus every route and filter parameter.
- UI-02 baseline shrinks: `companies-list.tsx` no longer has raw selects (4).

## Rule book checklist

- [x] Purpose sentence and exactly one primary action per view
- [x] No ids, slugs or enums on the main surface
- [x] Sentence case
- [x] Only applicable actions shown (duplicate quick links removed)
- [x] Status words plus Badge tone; one badge per status
- [x] Sums as a statement
- [x] Empty states say what to do next
- [x] Nothing changed without a person
- [x] No browser pop-ups
- [ ] Checked at 1920, 1366×768 and 390×844: 1920 on staging after deploy
- [x] Registry controls only

## Evidence

- Web typecheck passes.
- Auth tests: 247 (+5 skipped).
- AgentBridge tests: 167.
- CI browser set: 40 of 40.

## Rollback

Revert the commit. There are no data or schema changes.
