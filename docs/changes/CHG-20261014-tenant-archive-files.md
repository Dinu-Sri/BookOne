# CHG-20261014-tenant-archive-files — files pack restore, transformers, backup reminder (v2.5.0)

Status: shipping on master.

- Author/agent and date: Grok coding agent, 2026-10-14.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.0 on `master` after `ff833d8`.
- QA repository revision and companion PR/change ID: [TENANT_BACKUP_ARCHIVE](../TENANT_BACKUP_ARCHIVE.md) phases 3–5. Companion assertions belong in bookone-qa (files pack exportId match, prefix-only storage keys, missing attachment, 30-day reminder, Viewer/Admin denial).
- Intended before/after behaviour with a concrete example:
  - Before: Owner can restore `.bookone-data` into an empty company. Receipts show as Attached even when the S3 object is missing. Files pack apply is refused. `schemaVersion` must equal 1 with no transformer pipeline. Backup page has no last-export reminder.
  - After: Owner uploads the matching `.bookone-files` pack (chunked above 8 MB). Keys rewrite `tenants/{source}/` → `tenants/{target}/` only; extra-user path segments stay. Existing objects are not overwritten. Transactions with a `tenants/` receipt and no object show **Missing attachment**. Backup page reminds after 30 days with no export. `schemaVersion` ≤ current runs transformers (none yet at v1).
- Existing behaviour that must remain correct: data restore empty-gate, UUID remap of FKs, owner-only `company.backup`, Control Room for platform super_admin only, Viewer hard-deny, posting/RLS.
- Actual changed paths/symbols/routes: `rewriteTenantPrefix`, `STORAGE_POINTER_KEYS`, `restoreTenantFilesArchive`, `transformArchiveToCurrent`, POST `/api/company/backup/restore-files`, `FilesRestoreClient`, `getReceiptDownloadUrl` HeadObject, `getArchiveBackupStatus`.
- Business rule/profile/scenario IDs: tenant-archive phases 3–5; files pack must match last data `exportId`; apply once; fill missing objects only.
- Accounting, stock/rental, tenant/access and customer-data effects: no journal writes on files apply. Storage pointers in the data file keep original file UUIDs. Extra memberships still skipped on data restore.
- Migrations, schema/history compatibility and recovery implications: none. Archive `schemaVersion` stays 1. Additive columns still need no transformer. Breaking archive shape must ship a transformer in the same PR as the migration.
- Dependencies, settings/flags, deployment and external-service changes: files restore requires S3/MinIO. Chunks land under `tenants/{id}/_archive/restore-upload/` then are deleted. Portainer Re-pull ON after Docker web image. Quote `v2.5.0 · <sha7>`.
- Independent diff/impact review and uncertainties: v2.4.0 data restores did not store `filesSha256` on the audit row; pairing then uses `exportId` only. Large packs still need Traefik/Cloudflare to allow 4 MB chunk POSTs.
- Checks executed: 2026-10-14 local Windows. Deleted stale `apps/web/.next`. `pnpm lint` (4 tasks), `pnpm typecheck` (6 tasks), `pnpm test` (accounting 71, auth 34 including files pack/golden restore, statement-import 30 pass / 4 skip), `pnpm --dir apps/web build` (Next 15.5.19, `/company/backup` + prepare/download/restore/restore-files). All green. Node v20 vs engines `>=22` warning only.
- Failed/skipped/flaky/blocked/not-run checks and reasons: no live staging mutation. Email cron is not built (no email infra); in-app reminder is the phase 5 deliverable.
- New QA assertions or outstanding work: owner files restore after data restore; refuse mismatched exportId; refuse second files apply; missing attachment on transactions; Backup reminder when never exported.
- Created staging records/cleanup, if any: none in this change.
- Documentation updated: this record, TENANT_BACKUP_ARCHIVE, TASK_LOG, PROJECT_STATUS, ROADMAP_REMAINING.
- Next exact action and responsible role: Docker web image, Portainer Update Re-pull ON; QA pins `v2.5.0 · <sha7>`.
