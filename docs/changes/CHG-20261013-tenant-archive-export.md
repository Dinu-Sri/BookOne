# CHG-20261013-tenant-archive-export — owner company backup export (phase 1)

Status: shipping on master (v2.3.0).

- Author/agent and date: Grok coding agent, 2026-10-13.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.3.0 on `master` after `a9fb8e0`.
- QA repository revision and companion PR/change ID: [TENANT_BACKUP_ARCHIVE](../TENANT_BACKUP_ARCHIVE.md) phase 1. Companion assertions belong in bookone-qa (owner-only export, Viewer/Admin denial, paired checksums, no password stored, no foreign tenant rows, no `users.password_hash`).
- Intended before/after behaviour with a concrete example:
  - Before: Company nav has no Backup; owners cannot download a portable archive.
  - After: Company owner opens **Company → Backup**, sets a password BookOne does not store, prepares one export, then downloads `{slug}-{date}.bookone-data` and `{slug}-{date}.bookone-files`. Both share `exportId`, `schemaVersion` 1, and each other’s content checksums. Restore controls stay disabled.
- Existing behaviour that must remain correct: posting, RLS, MinIO uploads, signup CoA/job seed, Viewer hard-deny, Admin cannot use company.lifecycle. Physical-goods posting/SKU/approval (v2.2.5) unchanged.
- Actual changed paths/symbols/routes: `packages/db/src/archive/*`, `createTenantArchiveExport`, `/company/backup`, `/api/company/backup/prepare`, `/api/company/backup/download`, `company.backup` permission, nav Backup.
- Business rule/profile/scenario IDs: tenant-archive phase 1 export; empty-gate helper shipped for phase 2 (restore still refused in UI).
- Accounting, stock/rental, tenant/access and customer-data effects: read-only snapshot of the current tenant. No journal, stock, or live-row writes except tenant `audit_log` `tenant.archive.export` and optional encrypted blobs under `tenants/{id}/_archive/`.
- Migrations, schema/history compatibility and recovery implications: none. Archive `schemaVersion` is 1. Encrypted objects under `_archive/` are excluded from the files pack.
- Dependencies, settings/flags, deployment and external-service changes: uses existing `S3_*`. If S3 is unset, the prepared pair is held in process memory for 15 minutes. Portainer Re-pull ON after Docker web image. Quote `v2.3.0 · <sha7>`.
- Independent diff/impact review and uncertainties: large attachment packs over 250 MB uncompressed are refused as a pair. HTTP/browser export on staging after pull. Restore is not in this change.
- Checks executed: 2026-10-13 local Windows. `pnpm lint` (4 tasks), `pnpm typecheck` (6 tasks), `pnpm test` (accounting 71, auth 23 including 8 archive crypto/empty/permission, statement-import 30 pass / 4 skip), `pnpm --dir apps/web build` (Next 15.5.19, `/company/backup` + prepare/download routes). All green. Node v20 vs engines `>=22` warning only.
- Failed/skipped/flaky/blocked/not-run checks and reasons: restore not built. No live staging mutation. Browser click-through waits for Portainer pull of `v2.3.0`.
- New QA assertions or outstanding work: owner prepare+two downloads; Viewer/Admin denied; password never in audit/S3 JSON; data file has invoices/journals and no password hashes; files pack omits `_archive/`; empty helper is true only with zero trading rows.
- Created staging records/cleanup, if any: none in this change.
- Documentation updated: this record, TENANT_BACKUP_ARCHIVE, TASK_LOG, PROJECT_STATUS, ROADMAP_REMAINING, KNOWN_ERRORS if needed.
- Next exact action and responsible role: Docker web image, Portainer Update Re-pull ON; QA pins `v2.3.0 · <sha7>` and adds export scenarios.
