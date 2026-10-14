# CHG-20261014-tenant-archive-backup-nosuchkey — Backup page NoSuchKey crash (v2.5.1)

Status: shipping on master.

- Author/agent and date: Grok coding agent, 2026-10-14.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.1 on `master` after `fb78e45`.
- QA repository revision and companion PR/change ID: follow-up to [CHG-20261014-tenant-archive-files](CHG-20261014-tenant-archive-files.md). Staging digest `182952617`.
- Intended before/after behaviour with a concrete example:
  - Before: Company → Backup throws a server exception (`NoSuchKey`, digest 182952617) when MinIO has no `tenants/{id}/_archive/latest.json` (or list of tenant objects fails). The page is a blank error.
  - After: Missing archive objects are treated as “no prepared download”. The Backup page still renders export, restore, reminder, and attachments controls.
- Existing behaviour that must remain correct: data restore empty-gate, files pack apply, owner-only backup, RLS, posting.
- Actual changed paths/symbols/routes: `s3KeyExists`, `readStored`, `listTenantObjectKeys`, `getArchiveBackupStatus` in `apps/web/src/lib/tenant-archive.ts`.
- Business rule/profile/scenario IDs: Backup page must open for an owner whether or not a prepared pair is still in the bucket.
- Accounting, stock/rental, tenant/access and customer-data effects: none. Read-only S3 list/get on the current tenant prefix.
- Migrations, schema/history compatibility and recovery implications: none.
- Dependencies, settings/flags, deployment and external-service changes: Portainer Re-pull ON after Docker web image. Quote `v2.5.1 · <sha7>`.
- Independent diff/impact review and uncertainties: Next.js App Router can surface AWS `NoSuchKey` as an RSC digest even when a later `catch` would return null; existence is checked with ListObjects before GetObject.
- Checks executed: 2026-10-14 local Windows. Deleted stale `apps/web/.next`. `pnpm --dir apps/web lint` (tsc) green. `pnpm --dir packages/auth test` 34 pass.
- Failed/skipped/flaky/blocked/not-run checks and reasons: no live staging mutation in this change.
- New QA assertions or outstanding work: owner opens `/company/backup` with no prepared pair and sees the form, not an Application error.
- Created staging records/cleanup, if any: none.
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: Docker web image, Portainer Update Re-pull ON; confirm `v2.5.1 · <sha7>` and Backup page loads.
