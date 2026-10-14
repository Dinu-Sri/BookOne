# CHG-20261014-archive-backup-owner-integrity — BUG-0021 owner-only backup + restore integrity (v2.5.4)

Status: ready-for-QA.

- Author/agent and date: Grok coding agent, 2026-10-14.
- Product version (`VERSION` file) and base SHA / branch/PR: 2.5.4 on `master` after `5becb2d`.
- QA repository revision and companion PR/change ID: [HANDOFF-20261014-backup-plan](https://github.com/Dinu-Sri/bookone-qa/blob/main/handoffs/HANDOFF-20261014-backup-plan.md) (bookone-qa merge `bf95c9a`, impl `a9d3cdd`). BUG-0021 / S-0764. Restore scenarios S-0781/82, S-0787, S-0793/94 remain QA-owned.
- Intended before/after behaviour with a concrete example:
  - Before: with `rbacEnforced:false`, primary company Admin resolved `company.backup.read/write` via `fallbackFullAccess` before `privilegedLevel`. Data restore checked journals and trial hash only. Files restore wrote `tenant.archive.restore.files` even when objects were invalid. Missing `filesSha256` on a v2.4.0 restore audit was treated as a skipped checksum compare.
  - After: privileged keys (backup, lifecycle, reset, team) skip RBAC-off full-access. Admin is denied backup in both RBAC modes even with extra Owner, grant, or allow-override. Owner still exports. Admin still has financial writes and team.people/jobs when RBAC is off. Data restore refuses stock/layer and posted AR/AP vs 1300/2100 mismatches before commit. Files pack is marked complete only when `skippedInvalid === 0`. v2.4.0 restores without `filesSha256` pair by `exportId` only (`pairing: 'legacy-export-id'`), which is not checksum proof.
- Existing behaviour that must remain correct: Viewer hard-deny, Owner backup, Control Room for platform super_admin only, physical-goods BUG-0018/19/20, journals balanced, trial hash, empty-gate, UUID remap, fill-missing S3 objects, Viewer/Admin HTTP Owner guard in `requireArchiveOwner`.
- Actual changed paths/symbols/routes: `resolveLevel` / `fallbackFullAccess` skip for `isPrivilegedKey`; `stockMatchesLayers`, `arApMatchesDocuments`; `assertFilesPackMatchesDataRestore` returns `checksum` | `legacy-export-id`; `assertFilesApplyComplete`; `restoreTenantDataArchive`; `restoreTenantFilesArchive`.
- Business rule/profile/scenario IDs: S-0764 BUG-0021; S-0763 Viewer backup; S-0781/82 restore integrity; S-0787 pair checksum / legacy; S-0793/94 files pack completeness.
- Accounting, stock/rental, tenant/access and customer-data effects: restore still writes only inside an empty tenant after advisory lock. Injected stock or AR/AP inconsistency returns `{ok:false}` with no insert. Invalid files objects never complete the pack. Extra Owner job/grant/override cannot lift Admin backup.
- Migrations, schema/history compatibility and recovery implications: none. Archive `schemaVersion` stays 1. v2.4.0 data restores without `filesSha256` remain restorable by exportId.
- Dependencies, settings/flags, deployment and external-service changes: Portainer Re-pull ON after Docker web image. Quote `v2.5.4 · <sha7>`.
- Independent diff/impact review and uncertainties: `requireArchiveOwner` still independently requires primary Owner, so Admin HTTP prepare/download/restore was not proven even while the resolver was wrong. Restore of a live A→empty-B journey is still unverified. Partial S3 puts of valid objects before an invalid object remain as fill-missing; the pack is not marked complete.
- Checks executed: 2026-10-14 local Windows. `pnpm lint` (4 tasks), `pnpm typecheck` (6 tasks), `pnpm test` (accounting 71, auth 41 including BUG-0021 both-mode Admin deny + stock/AR-AP + files complete/legacy pairing, statement-import 30 pass / 4 skip), `pnpm --dir apps/web build` (Next 15.5.19, `/company/backup` + prepare/download/restore/restore-files). All green. Node v20 vs engines `>=22` warning only.
- Failed/skipped/flaky/blocked/not-run checks and reasons: no live staging mutation. Isolated restore-integrity and Owner export → new empty company remain QA next.
- New QA assertions or outstanding work: pin `v2.5.4 · <sha7>`; rerun archive helper S-0764 (expect pass); S-0781/82 inject stock/AR-AP faults; S-0787 checksum vs legacy-export-id; S-0793/94 invalid objects do not complete; then A→empty-B browser restore. Do not reopen BUG-0010–0020.
- Created staging records/cleanup, if any: none in this change.
- Documentation updated: this record, TENANT_BACKUP_ARCHIVE, TASK_LOG, PROJECT_STATUS.
- Next exact action and responsible role: Docker web image green, Portainer Update Re-pull ON; QA pins the new stamp and runs restore-integrity then the Owner A→empty-B journey.
