# CHG-20261128-closed-months-picker — Closed months: picker never blank after closing

Status: ready-for-QA.

- Author/agent and date: Claude Code (Opus 5.5), 2026-11-28.
- Product version and base: 2.36.0 → **2.36.1**; base `9ede47f`; follow-up to [CHG-20261128-coreguard-step-2](CHG-20261128-coreguard-step-2.md) found in its staging smoke test.
- Before/after: closing October 2026 removed it from the "Month to close" list and the picker showed "Select…". Now it moves to the newest open month before the one just closed (September 2026).
- Changed paths: `apps/web/src/components/accounts/closed-months.tsx` (an effect keeps the chosen month in the open list).
- Existing behaviour kept: close/reopen actions, confirm and reason dialogs, permissions; no server, schema or ledger change.
- Accounting/stock/access/data effects: none.
- Checks: `tsc --noEmit` (apps/web) clean. Browser re-check on staging after deploy.
- Failed/skipped: none.

## CoreGuard impact (required when the diff touches the financial surface)
- Financial surface files touched: none (UI component only).
- Behaviour before → after (one example in LKR): no money effect.
- Guards/checks that cover this (IDs): G05 and `coreguard.lock_period` unchanged.
- Guards/checks added or changed: none — covered by: G05.
- Golden events added/changed: none. Properties: none. Waivers: none.
- Red/green evidence: not applicable (no rule change).
- CoreGuard version: 2.0.0 → 2.0.0.

## UI/UX impact
- Screen: Accounts → Closed months. Registry `SelectField` unchanged; only its initial/next value. Rule book: rule 9 (pre-fill the obvious).
