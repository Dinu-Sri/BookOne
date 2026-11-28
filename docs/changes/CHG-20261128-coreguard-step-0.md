# CHG-20261128-coreguard-step-0 — CoreGuard Step 0: Rule Zero and governance

Status: ready-for-QA (docs only; PR open).

- Author/agent and date: Claude Code (Opus 5.5), 2026-11-28.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.35.1 → **2.35.2**; base `fce061d`; branch `coreguard/step-0-rule-zero`; one PR per step as required by guide §1.1 (final SHA in PR metadata).
- QA repository revision and companion PR/change ID: none for Step 0. Guide §6.11 business rules are added in bookone-qa before the step that implements them (BR-6 before Step 2).
- Intended before/after behaviour with a concrete example: before, agent files told agents to "void" ledger rows and said Control Room health-check runners are removed. After, Rule Zero is the first section of `AGENTS.md` and the first paragraph of every agent entry file: a change to money, stock, tax, ledger or periods needs CoreGuard rules and tests before code; ledger rows are corrected only with a reversal; a read-only CoreGuard monitor is allowed. No app behaviour changes.
- Existing behaviour that must remain correct: all product code, schema and CI unchanged. The pilot lane (`pnpm coreguard:pilot`) and its contract test still read `docs/coreguard/README.md`, `coverage-matrix.md` and fixtures.
- Actual changed paths/symbols/routes:
  - `AGENTS.md` — Rule Zero block (§6.10) inserted as the first section, above "External QA and coding-agent memory".
  - `.claude/CLAUDE.md`, `.github/copilot-instructions.md`, `.github/instructions/codebase-workflow.instructions.md` (after its `applyTo` front matter), `ai/start-session.prompt.md` — short Rule Zero line as first paragraph.
  - `.cursor/rules/rule-zero.mdc` — **new**, adapted: the owner asked for Rule Zero in `.cursor` and other agent files; `.cursor/` had only an untracked `mcp.json`, so an `alwaysApply` Cursor rule with the short line was added. The untracked `.zed/rules.md` was given the same line locally but is not committed (untracked local editor config, not created by this change).
  - `.github/copilot-instructions.md` — Critical Rule 3 → "Ledger rows are never deleted or voided. Correct with a reversal."; Rule 4 → "All ledger writes go through `packages/ledger-core`."
  - `ai/start-session.prompt.md` — health-check-runner sentence replaced by the CoreGuard monitor sentence (the rest of that sentence about test consoles/reset/demo seed kept).
  - `docs/PRODUCTION_RULES.md` — Rule 0 added; Rules 3, 8, 10 rewritten as the guide says.
  - `docs/QA_CHANGE_CONTRACT.md` — item 8 "CoreGuard impact section" in "Required on every development task".
  - `docs/changes/TEMPLATE.md` — CoreGuard impact section (§6.10).
  - `docs/coreguard/IMPLEMENTATION_GUIDE.md` — the v2.1 guide, byte-identical in content to `coreguard-implementation-pack/COREGUARD_IMPLEMENTATION_GUIDE.md` (CRLF line endings).
  - `docs/coreguard/FINANCIAL_SURFACE.md` — the §6.5 list.
  - `docs/coreguard/README.md` — replaced with a one-page overview pointing to the guide. Adapted: the existing contract test `packages/auth/test/coreguard-custom-bank-contract.test.ts` requires the README to mention `pnpm coreguard:pilot` and `bookone_test`, so the overview keeps a short "earlier pilot lane" paragraph, and the old README moved unchanged to `docs/coreguard/PILOT.md`.
  - `.github/CODEOWNERS` — **new**, §6.10 content.
  - `VERSION`, `docs/TASK_LOG.md`, `docs/PROJECT_STATUS.md`.
- Business rule/profile/scenario IDs: none in Step 0.
- Accounting, stock/rental, tenant/access and customer-data effects: none (docs and repository governance only).
- Migrations, schema/history compatibility and recovery implications: none.
- Dependencies, settings/flags, deployment and external-service changes: `CODEOWNERS` takes effect for review requests only once the owner turns on code-owner review (owner action B3, Step 6).
- Independent diff/impact review and uncertainties:
  - Relation to the existing CoreGuard: the pilot lane (`scripts/coreguard/*`, `pnpm coreguard:pilot`, Playwright set in "Docker web image") and the AgentBridge registry `packages/agent-bridge/src/coreguard.ts` (`COREGUARD_VERSION = 'ab-11'`) predate the guide. Step 0 leaves them untouched. The guide keeps `pnpm coreguard:pilot` as a Step 1 "Done when" check and places new code in `packages/coreguard` / `apps/coreguard` from Step 3. The pilot's `COREGUARD_VERSION` name will need reconciling with the guide's `COREGUARD_VERSION` (§6.6) at Step 3.
  - Golden datasets: the task said they are in `packages/coreguard/golden`; in this checkout they exist only in the untracked `coreguard-implementation-pack/packages/coreguard/golden` (12 companies). Step 0 doesn't list them; they will be copied unchanged when `packages/coreguard` is created (Step 3/9).
  - `AGENTS.md` still says "Control Room Health Check is an empty placeholder" in the External QA section. Rule Zero overrides it; the line is left for Step 5, which builds the screen.
- Checks executed:
  - `node verify0.mjs` (scratch script comparing each file against §6.10/§6.5 text extracted from the guide): **16/16 pass** — Rule Zero is the first `##` section of AGENTS.md; short line in all 5 entry files; copilot rules 3/4; start-session sentence (old sentence gone); PRODUCTION_RULES 0/3/8/10; QA contract item; TEMPLATE section; guide identical to pack; surface list; README → guide; CODEOWNERS identical.
  - `pnpm --filter @bookone/auth exec vitest run test/coreguard-custom-bank-contract.test.ts`: 3/3 pass (the only test that reads changed docs).
- Failed/skipped/flaky/blocked/not-run checks and reasons: full `pnpm test`, pilot and Playwright lanes not run locally (no code changed); CI on the PR runs them. No guards/flows/golden exist yet (Steps 2, 3, 9). No staging browser check (no UI change).
- New QA assertions or outstanding work; changed expectations and owner decision: owner decision 2026-11-28 (Rule Zero). No expectation changed.
- Created staging records/cleanup, if any: none.
- Documentation updated: listed above.
- Next exact action and responsible role: agent — Step 1 (make the existing writers guard-ready) after this PR merges.

## Step 0 "Done when" (guide §5)

| Item | Result |
| --- | --- |
| Every listed file contains the exact text from §6.10 | Done — verified 16/16 by script (see Checks) |
| CHG record and `VERSION` bump are done | Done — this file; `VERSION` 2.35.2 |

## CoreGuard impact (required when the diff touches the financial surface)
- Financial surface files touched: none (docs, agent files, CODEOWNERS only).
- Behaviour before → after (one example in LKR): no app behaviour change.
- Guards/checks that cover this (IDs): none — governance only.
- Guards/checks added or changed (ID, revision, severity), or "none — covered by: …": none.
- Golden events added/changed (scenario@version, event IDs); expected values supplied by (name, date): none.
- Properties added/changed: none.
- Red evidence (lab output showing the new rule failing before the implementation): not applicable (no rule implemented).
- Green evidence (lab run on the final commit; certificate status): not applicable; no lab yet.
- Waivers used (CGW-…, expiry): none.
- CoreGuard version: none → none (`packages/coreguard` starts at 2.0.0 in Step 3).

## UI/UX impact

Not applicable: the diff has no UI files.
