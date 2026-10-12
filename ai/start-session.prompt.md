# Start a BookOne development session

Read AGENTS.md, docs/PROJECT_STATUS.md and docs/QA_CHANGE_CONTRACT.md. Then read only relevant business/architecture docs. BookOne is a running product; older planning-only descriptions are obsolete.

Use Codebase Memory MCP first and verify the source revision. Create or resume a docs/changes/CHG-YYYYMMDD-short-slug.md record before implementation. Preserve tested behaviour, financial history, tenant isolation and additive migrations.

The external QA repository is https://github.com/Dinu-Sri/bookone-qa. Read its STATUS.md and the relevant rules/scenarios; submit corresponding QA changes and pin product/QA versions. Previous passing results do not certify new changes.

The owner identifies https://bookone.clossyan.com as staging containing disposable testing data and authorizes changes there. Production is outside the QA agent's access. Keep secrets and raw evidence out of public Git.

For inbuilt test cleanup, follow docs/REMOVE_INBUILT_E2E.md; do not delete tests/interfaces until preservation and external validation criteria are met.

At handover, update the change record, docs/TASK_LOG.md and docs/PROJECT_STATUS.md with exact changed paths, checked versions, tests executed, failed/skipped/not-run checks, evidence, blockers and next action.
