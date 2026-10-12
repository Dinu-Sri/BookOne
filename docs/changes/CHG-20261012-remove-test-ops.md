# CHG-20261012-remove-test-ops — remove Control Room test tools and leftover E2E docs

Status: implemented.

- Author/agent and date: Grok coding agent, 2026-10-12, requested by repository owner after staging rebuild.
- Product base SHA and branch/PR: `fe0c495` on `master`.
- QA repository revision: none required for this product-ops cleanup. Denial tests S-0031–S-0033 remain in bookone-qa.
- Intended before/after behaviour with a concrete example:
  - Before: Control Room Health Check posted journals/stock; Audit page; company reset; demo seed APIs; signup as company owner never saw Control Room.
  - After: Health Check page is an empty placeholder. Audit page, reset buttons, demo seed routes/scripts, and `docs/REMOVE_INBUILT_E2E.md` / `docs/E2E_*.md` / `PRODUCTION_SMOKE_TEST.md` are gone. `PLATFORM_ADMIN_EMAIL` grants Control Room (`super_admin`) on signup and login.
- Existing behaviour that must remain correct: login, Control Room companies/modules/access, sales/purchase/inventory, `/ops/logs`, MinIO, migrations (including `019_health_check_staging.sql` left in history; tables not dropped).
- Actual changed paths:
  - Added: `packages/auth/src/platform-admin-email.ts`
  - Auth: `packages/auth/src/session.ts`, `packages/auth/src/index.ts`, `apps/web/src/lib/platform-admin.ts`
  - Empty placeholder: `apps/web/src/app/control-room/health-check/page.tsx`
  - Nav/UI: `bookone-shell.tsx`, `control-room/page.tsx`, `company-form.tsx`
  - Deleted: `apps/web/src/app/actions/health-check.ts`, `rental-health.ts`, `reset-company.ts`; `health-check-panel.tsx`; `company-master-reset-button.tsx`; `company-reset-button.tsx`; `control-room/audit/page.tsx`; `api/platform/seed-rental-demo`; `api/platform/cleanup-companies`; `lib/platform-cleanup.ts`; `scripts/seed-demo-products.ts`, `seed-demo-sales-docs.ts`, `generate-demo-product-images.ts`; `docs/E2E_*.md`, `REMOVE_INBUILT_E2E.md`, `PRODUCTION_SMOKE_TEST.md`
  - Env: `.env.example`, `docker/docker-compose.staging.yml`, `docker/docker-compose.prod.yml`, Portainer docs, `AGENTS.md`
- Business rule/profile/scenario IDs: none.
- Accounting, stock/rental, tenant/access and customer-data effects: no posting. Access: listed emails become platform super-admin. Tenant audit log writes in team/import remain.
- Migrations: none. Rollback is git revert. Do not DROP `health_check_runs`.
- Dependencies, settings/flags, deployment: new env `PLATFORM_ADMIN_EMAIL` (comma-separated). Must set it in Portainer or Control Room stays hidden for new signups.
- Independent review: schema files for health-check remain unused by UI; historical SQL kept.
- Checks: product grep for deleted routes/imports is clean. Package unit tests not re-run for this UI/ops delete. Browser not-run until Portainer rebuilds web.
- Next action: owner sets `PLATFORM_ADMIN_EMAIL` in Portainer (the email used to create the company), Update with Re-pull OFF (web rebuild). Log out and in.
