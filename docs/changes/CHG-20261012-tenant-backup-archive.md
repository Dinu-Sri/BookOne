# CHG-20261012-tenant-backup-archive — tenant portable backup/restore (design freeze)

Status: planned.

- Author/agent and date: Grok coding agent, 2026-10-12, requested by repository owner after staging cleanup.
- Product base SHA and branch/PR: `5b71d06` on `master`.
- QA repository revision: none yet. Companion scenarios to add in bookone-qa when phase 1 ships (export) and phase 2 (restore empty-only).
- Intended before/after behaviour with a concrete example:
  - Before: no owner-held company archive; only operator `pg_dump` notes in DEPLOYMENT_WORKFLOW.
  - After (design): owner downloads paired `.bookone-data` + `.bookone-files`; restore only into an operationally empty new tenant; invoice rows in data file; S3 blobs in files pack. **Code not implemented in this change.**
- Existing behaviour that must remain correct: login, posting, RLS, MinIO uploads, signup CoA/job seed, Control Room. No schema drop.
- Actual changed paths: `docs/TENANT_BACKUP_ARCHIVE.md`; this record; TASK_LOG; PROJECT_STATUS; ROADMAP pointer.
- Business rule/profile/scenario IDs: to be assigned in bookone-qa at implementation (empty-gate denial, paired checksum, remap, missing files).
- Accounting, stock/rental, tenant/access and customer-data effects: none until restore exists. Restore will remap UUIDs, replace seed CoA, require balanced journals.
- Migrations: none in this change. Archive `schemaVersion` will track future additive migrations.
- Dependencies, settings/flags, deployment: none yet. Files pack will need chunked upload (Traefik/Cloudflare body limits).
- Independent review: empty predicate must ignore signup seed; extra auth users skipped in v1.
- Checks: documentation only. Browser/unit not-run.
- Next exact action: phase 1 export implementation when owner asks to build; operator confirms off-site pg_dump + MinIO replica on the VPS in parallel.
