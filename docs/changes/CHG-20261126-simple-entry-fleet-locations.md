# CHG-20261126-simple-entry-fleet-locations — Simple Entry ignores rental fleet bays (v2.17.12)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-26
- Product version and base: 2.17.12 pushed directly to `master` (owner-approved) from `54dff07` / v2.17.11
- QA repository revision and companion PR/change ID: independent staging QA pending; no external UX/UXW/WB ref (defect found during agent staging verification)

## Finding (staging, 2026-11-26)

Migration `022_rental_bookings.sql` (re-run every start) gives every tenant three virtual fleet bays: ONRENT "On rent", REPAIR "Repair", WASH "Wash / turnaround" (`location_type` on_rent / repair / wash). Simple Entry built its Location list from `getCompanySettingsData().locations` without filtering, and the select is `required` whenever the list is non-empty. A fresh company with no real locations could therefore only record a Simple Entry after picking "On rent". The first entry after sign-up worked only because the bays did not exist until the next restart.

The server side was already correct: `resolveDimensions` (`apps/web/src/lib/dimensions.ts`) and the sales/purchase form loader (`lib/module-page-helpers.ts`) exclude fleet bays.

## Change

- `apps/web/src/components/simple-entry/simple-entry-screen.tsx`: the location list goes through the existing `operationalLocations()` (`lib/rental-locations.ts`). With no operational locations the field is hidden and not required; with one it is auto-selected (unchanged behaviour).
- No markup, styling or control change (existing select kept; UI registry untouched). Fleet bays remain in Company → Locations and rental screens. Migration 022 unchanged.
- Shared consumers: only Simple Entry used the unfiltered list for posting; company commerce already disables fleet bays.

## Evidence

- `packages/auth/test/simple-entry-fleet-locations.test.ts` (2): helper drops the three fleet types; source lock that Simple Entry uses it.
- typecheck exit 0; 709 unit tests passed. Staging: see TASK_LOG.
