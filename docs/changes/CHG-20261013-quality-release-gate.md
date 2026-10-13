# CHG-20261013-quality-release-gate — fix quality errors and block GHCR on required checks

Status: shipping on master (v2.2.1).

- Author/agent and date: Grok coding agent, 2026-10-13.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.2.1 on `master` after `6a48cee`.
- QA repository revision and companion PR/change ID: bookone-qa [HANDOFF-20261013-v2-2-0-next](https://github.com/Dinu-Sri/bookone-qa/blob/main/handoffs/HANDOFF-20261013-v2-2-0-next.md), [RUN-08](https://github.com/Dinu-Sri/bookone-qa/blob/main/runs/RUN-20261013-v2-2-0-retest-08.md), BUG-0008. QA Batch A 14 pass / 1 fail (A-014).
- Intended before/after behaviour with a concrete example:
  - Production Check 271 quality job failed TypeScript at Lint while Docker web image 12 still published `sha-6a48cee`. After: `pnpm lint` / `typecheck` / `build` / `test` succeed, and **Docker web image** `build-and-push` `needs: [quality]` where that same-workflow job runs the four unmasked commands. Manual `workflow_dispatch` also runs quality first. No `always()` / `failure()` on the publisher.
  - Failed, cancelled, skipped, missing, or timed-out quality blocks publication because GitHub skips dependents when a needed job is not success, and the publisher has no bypass `if`.
- Existing behaviour that must remain correct: GHCR image name `ghcr.io/dinu-sri/bookone-web:latest`, Portainer Re-pull ON, Tests still run in Production Check, Viewer/cash-sale/reversal paths unchanged, no WEB_IMAGE env, no tenant backup.
- Actual changed paths/symbols/routes: `.github/workflows/docker-web.yml`; type fixes in docs/search source, cashbook, product form/units, inventory, record-entry Zod issues, reconciliation `z.record`, team preview level, TenantLite.landingHref, discount picker, statement preview union, document print party name, auth `react` dependency, modules real `tsc`; `packages/auth/test/release-gate-workflow.test.ts`.
- Business rule/profile/scenario IDs: BUG-0008, A-013, A-014.
- Accounting, stock/rental, tenant/access and customer-data effects: none. Type/shape alignment only.
- Migrations, schema/history compatibility and recovery implications: none.
- Dependencies, settings/flags, deployment and external-service changes: `@bookone/auth` depends on `react` (already imported `cache` from `react`). GHCR publish is gated on same-workflow lint+typecheck+build+test including `workflow_dispatch`. This workflow does not wait on bookone-qa; release certification still needs same-SHA external QA. Owner can add bookone-qa as a GitHub required check for branch protection separately.
- Independent diff/impact review and uncertainties: A-014 currently recognizes same-workflow ancestors only; this change matches that adapter. Isolated negative fixtures live in `release-gate-workflow.test.ts` (nonpublishing). No failing image was deployed to demonstrate the gate. External QA runtime permission/tenant isolation/concurrency remain QA work.
- Checks executed: `pnpm lint` pass; `pnpm typecheck` pass; `pnpm test` pass (auth 12 including 4 gate tests, accounting 66, statement-import 26 passed / 4 skipped); `pnpm build` pass (turbo 5 packages, Next.js compiled, 127 static pages).
- Failed/skipped/flaky/blocked/not-run checks and reasons: no live staging mutation. No `pnpm agent:browse` (UI types only). Controlled failing GHCR publish not run against the real registry.
- New QA assertions or outstanding work: retest A-014 on the new SHA; confirm Docker web image is red when quality fails and green only when all four commands pass, including a manual dispatch. QA continues real-server permission, tenant isolation, concurrent reversal, then Batch B.
- Created staging records/cleanup, if any: none.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS, DEPLOYMENT_WORKFLOW, KNOWN_ERRORS.
- Next exact action and responsible role: wait for **Docker web image** green on the new SHA, then Portainer Update Re-pull ON; QA quotes `v2.2.1 · <sha7>` and retests A-014.
