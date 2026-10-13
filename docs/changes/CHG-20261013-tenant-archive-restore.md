# CHG-20261013-tenant-archive-restore — data restore into empty company + Control Room nav (v2.4.0)

Status: shipping on master.

- Author/agent and date: Grok coding agent, 2026-10-13.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.4.0 on `master` after `6b784ba`.
- QA repository revision and companion PR/change ID: [TENANT_BACKUP_ARCHIVE](../TENANT_BACKUP_ARCHIVE.md) phase 2. Companion assertions belong in bookone-qa (empty-gate, UUID remap, owner-only, Viewer/Admin denial, journal integrity, Control Room children for platform super_admin).
- Intended before/after behaviour with a concrete example:
  - Before: Company → Backup restore is visible and disabled. Platform super_admin sees a Control Room accordion with no children because Overview/Companies/Modules/Access/ERP Health Check are not in SCREEN_DEFS and default to access none.
  - After: Owner of an operationally empty company uploads `{slug}-{date}.bookone-data` plus the archive password. Restore remaps UUIDs into the current tenant, replaces signup CoA/jobs, rolls back on failure. A company with invoices/journals/stock is refused. Control Room children show for `platformRole === super_admin` only (company Admin job still has no Control Room).
- Existing behaviour that must remain correct: export pair, Viewer hard-deny, owner-only `company.backup`, RLS, posting, physical-goods SKU/atomicity. Files pack apply is still later (phase 3).
- Actual changed paths/symbols/routes: `keepNavItem`, `CONTROL_ROOM_NAV_LABELS`, `restoreTenantDataArchive`, `remapArchiveTables`, POST `/api/company/backup/restore`, `RestoreClient`.
- Business rule/profile/scenario IDs: tenant-archive phase 2 restore; empty-gate copy from spec; Control Room is platform super_admin, not company Admin.
- Accounting, stock/rental, tenant/access and customer-data effects: writes only inside an empty tenant after advisory lock. Extra archive memberships skipped; restorer stays owner. Journals must balance; trial-balance hash must match the export. Source `tenant_id` is never reused.
- Migrations, schema/history compatibility and recovery implications: none. `schemaVersion` 1 only. Failed restore rolls back; signup seed remains.
- Dependencies, settings/flags, deployment and external-service changes: server action / upload body limit 40mb. Portainer Re-pull ON after Docker web image. Quote `v2.4.0 · <sha7>`.
- Independent diff/impact review and uncertainties: large data files may still hit Traefik/Cloudflare limits. Attachments remain missing until phase 3 files pack. Restore of a live company is refused on purpose.
- Checks executed: 2026-10-13 local Windows. Deleted stale `apps/web/.next` (PageProps). `pnpm lint` (4 tasks), `pnpm typecheck` (6 tasks), `pnpm test` (accounting 71, auth 29 including archive remap/nav, statement-import 30 pass / 4 skip), `pnpm --dir apps/web build` (Next 15.5.19, `/company/backup` + prepare/download/restore). All green. Node v20 vs engines `>=22` warning only.
- Failed/skipped/flaky/blocked/not-run checks and reasons: files pack restore not built. No live staging mutation in this change.
- New QA assertions or outstanding work: owner restore into empty company; refuse non-empty; Viewer/Admin denied; remapped tenant id; extra users skipped; Control Room Overview/Companies/Modules/Access/ERP Health Check visible for platform super_admin.
- Created staging records/cleanup, if any: none in this change.
- Documentation updated: this record, TENANT_BACKUP_ARCHIVE, TASK_LOG, PROJECT_STATUS, ROADMAP_REMAINING.
- Next exact action and responsible role: Docker web image, Portainer Update Re-pull ON; QA pins `v2.4.0 · <sha7>`.
