# Development-agent handover to external QA

Effective 2026-10-11. Canonical QA repository: **https://github.com/Dinu-Sri/bookone-qa** (public, owner-requested). Product source remains in BookOne. Tests, scenario definitions, assertion reviews, run history and QA progress belong in bookone-qa. Secrets and sensitive evidence remain private.

## Required on every development task

1. Read root AGENTS.md and current docs/PROJECT_STATUS.md, then the relevant business/architecture guidance. Use Codebase Memory MCP first for code discovery; verify the graph revision and use the pinned checkout if stale/incomplete.
2. Before implementation, create `docs/changes/CHG-YYYYMMDD-short-slug.md` using `docs/changes/TEMPLATE.md`. Declare intended before/after behaviour, affected rules/scenarios, and changes to money, stock, access, data, configuration and dependencies. Use a unique slug when agents work concurrently.
3. Keep that record current as scope changes. Record actual changed paths/symbols, migrations, new flags, compatibility implications, preserved behaviour, tests and outstanding questions. Source code is not its own business specification.
4. Propose corresponding QA changes in bookone-qa, referencing the same change ID and product PR/base SHA. Preserve existing `S-NNNN` scenario IDs; obtain the next unused ID from the current QA catalog rather than an old copied counter. Do not keep a second maintained catalog in BookOne.
5. Run appropriate checks and attach exact commands, outcome counts, environment/build/QA revision and evidence links. Quote the on-screen sidebar stamp (`vMAJOR.MINOR.PATCH · sha7`) from [docs/VERSIONING.md](VERSIONING.md). Missing credentials, failed setup, skips, flaky retries and unrun tests must be explicit. No successful UI-save, exit code or catalog-ID count establishes financial correctness by itself.
6. Update docs/TASK_LOG.md with a dated completion/handover entry and docs/PROJECT_STATUS.md with the current summary and next action. Update authoritative architecture/user docs when behaviour changes. Preserve old entries; clearly supersede stale guidance.
7. In the product PR description, link the change record and QA companion PR/run. Because a commit cannot contain its own final SHA, write the base SHA in the file and put final product/QA SHAs in PR metadata and the external run manifest after commit.

## Minimum impact analysis

Always include mandatory core regression plus affected and dependent workflows. Inspect the actual diff; an agent's summary can be incomplete. Shared accounting, authentication, tenant context, DB helpers, settings, form submission, imports, schema and deployment changes require broader coverage. Unknown impact expands the scope.

- Financial changes: independent expected accounts/amounts/tax/dates, balanced persisted journals, AR/AP reconciliation, atomicity, idempotency/retries, reversals and period locks.
- Inventory/rental changes: quantity and value conservation, product-type distinctions, availability/concurrency, dispatch/return/wash/repair, deposits and refunds.
- Access changes: real foreign-tenant objects, distinct roles, server-side action/API denial, session revocation, location/module/entity scope and file/export access.
- Data/schema changes: additive reviewed migrations, prior-version upgrade fixtures, historical preservation, schema completion and recovery compatibility. Code rollback is not data rollback.
- UI changes: execute affected and adjacent user journeys in a browser through the external QA harness or the available authorized browser tooling. Verify saved state and business outcomes; record tool/runtime and evidence.

## Prevent regression by changed expectations

Never change expected accounting/security outcomes just to make new code pass. Explain intended requirement changes and obtain rule-owner review. A new P0 business/data/security behaviour needs outcome assertions before release; a backlog entry alone is not acceptance. Every prior pass is bound to its original product/QA/schema/config/fixture fingerprint.

QA failures belong to product, harness, environment or an unresolved requirement. Record the classification and evidence; never swallow errors or relabel unavailable assertions as passed. Fixes require the original reproduction and adjacent regressions to pass on the new version.

## Public records and environment

The owner confirms `https://bookone.clossyan.com` contains testing data and authorizes changes there. This overrides older documentation calling this host production. Production access is not provided to the QA agent. Always identify the actual target before operations; sandbox external notifications/payments and coordinate resets with active runs.

Public records must use synthetic data and sanitized summaries. Never publish passwords, cookies, tokens, connection strings, real bank statements, customer data, raw browser traces, backups or sensitive screenshots. Use ignored local/private artifact storage and refer to redacted evidence.

## Transition and enforcement status

The inbuilt `/e2e` runner was removed from BookOne (Wave 1b). New test maintenance belongs in the external QA repository. The extraction does not yet certify all inherited tests, staging acceptance or a production release gate.

The owner must wire trusted external QA status checks to branch protection and deployment promotion. Until implemented, report that gates are advisory. Do not claim that this documentation alone prevents release. Product build/lint/typecheck and schema readiness still belong to engineering even when executable QA tests live externally.

## Canonical business rulebook (2026-10-14)

The single maintained intended-behaviour reference is https://github.com/Dinu-Sri/bookone-qa/blob/main/docs/rulebook/README.md; readable rules are RULES.md in that directory and the structured source is rules/rulebook.json. QA companion PR: https://github.com/Dinu-Sri/bookone-qa/pull/16.

Before coding, identify applicable stable rule IDs/revisions and rulebook version/Git SHA/JSON hash in the CHG record. Applicable Sri Lankan law and the eligible accounting framework take precedence; current implementation is descriptive evidence, not its own expected result. Initial professional product defaults were delegated by the owner and remain independently expert-pending. Read RF-01–10 in the QA review queue for unresolved applicability and conflicting contracts.

Do not copy a second editable rulebook here, silently change adopted rules/settings or rewrite old assertions/results to match code. Material policy changes use the QA RULE_CHANGE template, responsible rule-owner review, independent worked examples, effective dates and compatibility/migration assessment. New-company defaults do not silently change existing companies or issued facts. Tests and full current-build acceptance remain independent from documentation or code review.
