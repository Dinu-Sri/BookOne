# CHG-20261118-local-sinhala-font — Self-host Noto Serif Sinhala so Production Check can build (v2.8.2)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-11-18.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.8.2 on master from origin/master merge of PR https://github.com/Dinu-Sri/BookOne/pull/19 (`756f9fbc3442f7526690c8eba82c51325114a12f` / tree `52bdf5d0c4582458017ca58f70b59be9894ba350` / v2.8.1). UI-NAV-01 list clipping stays; tiles stay removed.
- QA repository revision and companion PR/change ID: Production Check run `44234985424` failed on the PR #19 master merge. Independent remaining-only AgentBridge mission stays `docs/qa/CODING-AGENTBRIDGE-06-QA.md`. Keep existing company Inbox OFF, draft-only ON, posting-stop ON. Do not replay CONT11, POS 118, Mission2, or consumed v2.7.3/v2.7.4/v2.8.0 clocks.
- Intended before/after behaviour with a concrete example: `pnpm build` / Production Check no longer calls Google Fonts CSS at compile time. Sinhala gloss labels still use `--font-si` / `.si-text` from a committed Noto Serif Sinhala variable woff2. `/.well-known/jwks.json` still serves the same GET as `/api/agent-bridge/oauth/jwks` and declares `runtime = 'nodejs'` locally so Next.js can see the export.
- Existing behaviour that must remain correct: AB-06 gates, unpaid-service v1 scope, flags default off, list clipping, HMAC fail-closed in production, JWKS checklist when no signing PEM.
- Actual changed paths/symbols/routes: `apps/web/src/app/layout.tsx` `localFont`; `apps/web/src/fonts/NotoSerifSinhala-sinhala-wght.woff2` + `OFL.txt`; `apps/web/src/app/.well-known/jwks.json/route.ts` local `runtime`; `apps/web/src/app/globals.css` comment; `packages/auth/test/local-sinhala-font.test.ts`.
- Business rule/profile/scenario IDs: GitHub Production Check compile follow-up after v2.8.1 merge.
- Accounting, stock/rental, tenant/access and customer-data effects: none. Font loading and JWKS route export only.
- Migrations, schema/history compatibility and recovery implications: none.
- Dependencies, settings/flags, deployment and external-service changes: none. Flags stay off. Build no longer depends on fonts.googleapis.com. OFL-1.1 font files are vendored.
- Independent diff/impact review and uncertainties: Docker web image on the same merge SHA already succeeded (run `44234985572`); this candidate exists because Production Check `next/font/google` crashed on extensionless `/l/font?kit=` CSS (Next.js issue 99114). Gloss visual identity is the same family/weights; live browser stamp after Portainer Re-pull is a new SHA.
- Checks executed: `pnpm --filter @bookone/auth test` 16 files / 126 passed / 1 skipped (live PG claim without `DATABASE_URL`; new local-sinhala-font 2 passed). `pnpm --filter @bookone/web build` compiled successfully on Next.js 15.5.19 (139 routes; `/.well-known/jwks.json` present; no `next/font` error).
- Failed/skipped/flaky/blocked/not-run checks and reasons: live OCR, real Codex/Claude, staging financial posting, recovery LAST, isolated staging browser, GitHub branch protection stay BLOCKED. Mixed-TENDER split not claimed.
- New QA assertions or outstanding work: independent Medium review of the new SHA; keep posting disabled until qualification. After Docker web image is green, owner Portainer Re-pull ON. Then independent new clock for posting / real Codex/Claude / recovery LAST.
- Created staging records/cleanup, if any: none. Flag off. Staging unchanged until owner deploys.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: Push to master so Production Check and Docker web image run. Owner Portainer Re-pull ON after both are green. Leave Inbox/posting off. Recovery LAST. BookOne is not customer-ready.

Final product/QA SHAs belong in PR metadata after commit.

## UI/UX impact and existing-design compatibility

- Existing design guide/component/CSS references: `.si-text` / `--font-si` in `globals.css`, `gloss-label.tsx`, cashbook Sinhala toggle. Same Noto Serif Sinhala family, weights 400–700, `display: swap`, CSS variable on `<html>`/`<body>`.
- Exact external QA commit: pending independent QA of this SHA.
- Before/after: Sinhala gloss still renders through `.si-text`; build no longer fetches Google Fonts. JWKS discovery path unchanged.
- Direct screens: root layout (all pages). Transitive: any `.si-text` gloss. `/.well-known/jwks.json` export shape only.
- Desktop/narrow/keyboard: no layout/token change.
- Small rollout: revert this commit; v2.8.1 remains on git history. No migration.
- QA companion: Production Check failure `44234985424`; AgentBridge remaining-only `docs/qa/CODING-AGENTBRIDGE-06-QA.md`.
