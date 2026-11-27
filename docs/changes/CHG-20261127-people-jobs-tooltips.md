# CHG-20261127-people-jobs-tooltips (v2.31.0)

Status: ready for the owner's staging review.

- Author and date: coding agent, 2026-11-27.
- Pushed directly to `master` (owner-approved).
- Source: the owner's review of v2.30.0:
  - two tooltips appear in the sidebar (the new bubble, then the old browser one);
  - the docs bubble is cropped by the taskbar;
  - Jobs should move into Company Details;
  - Team / Jobs / Groups confuse people: simplify without losing any power.
- Rule book: `docs/UI_DESIGN_RULEBOOK.md`.

## Changes

- **Sidebar.** The native `title` tooltips on menu links and group buttons are removed, so only the icon bubble shows. The bubble measures itself and moves up when it would pass the bottom of the window (the docs button sits at the bottom).
- **Company tabs:** Details · Tax · Brands · Locations · Domains · **People** · **Jobs**.
  - Jobs leaves the menu.
  - The Groups tab is gone: `/company/team/groups` redirects to `/company/team#groups`.
  - The Team page is titled People; its route and `active` label are unchanged.
- **People** (replaces Team and Groups), with the same server actions and permission checks:
  - **Seats and Add a person** in the head. One panel offers two ways to add someone: **Send an invite link** (default; they choose a password) or **Set a password for them** (no email). The job is chosen with `SelectField`, which shows a one-line description of each job.
  - **Everyone in this company:** avatar, name and email, the job as a `SelectField` that saves straight away (`assignJob`), and any extra job. Remove asks first ("can no longer sign in… past work stays… you can restore them"); Restore is shown for removed people. The owner's job is shown, not editable.
  - **Waiting to accept an invite**, with Cancel invite (`revokeInvite`).
  - **Shared extra jobs (groups)**, formerly the Groups screen:
    - New group (name plus extra job);
    - each group as a card with member chips (× takes a person out) and "Add someone";
    - Delete group asks first ("they lose the extra job; their main job does not change").
  - **Access history**, folded.
  - **"How access works" guide:** one job each; jobs set the screens; shared extra jobs for a bit more; the owner can do everything.
- **Jobs:**
  - each job on the left with a plain description (`lib/job-descriptions.ts`, checked against `templates.ts`), a "Changed" badge if customised, and the number of people;
  - on the right, each screen grouped by area in plain names (e.g. "Shop till (POS)", "People and jobs"), with a three-way No access / View / Edit control (radio buttons, `name="perm_<key>"` exactly as the old select);
  - "Set all" per area;
  - Owner/Admin-only rows show a lock and are disabled (not submitted, as before);
  - a sticky Save bar shows unsaved changes, and the "leave without saving?" guard is kept.
- **UI-02:** `team-people-screen.tsx`, `team-jobs-screen.tsx` and `team-groups-screen.tsx` now have no native selects and are removed from `ui-02-baseline.json`, so the baseline shrinks.

## Evidence

- Typecheck passes.
- Auth tests: 246 (+5 skipped), including UI-02 lint with the smaller baseline.
- E2E: UI-NAV-01 and UI-02, 19 of 19.
- Not yet checked: staging (inviting, changing a job, saving a job, groups).

## Rollback

Revert the commit. Server actions and data are unchanged.
