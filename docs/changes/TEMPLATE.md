# CHG-YYYYMMDD-short-slug — title

Status: planned / implementing / ready-for-QA / blocked / verified.

- Author/agent and date:
- Product version (`VERSION` file) and base SHA / branch/PR:
- QA repository revision and companion PR/change ID:
- Intended before/after behaviour with a concrete example:
- Existing behaviour that must remain correct:
- Actual changed paths/symbols/routes:
- Business rule/profile/scenario IDs:
- Accounting, stock/rental, tenant/access and customer-data effects:
- Migrations, schema/history compatibility and recovery implications:
- Dependencies, settings/flags, deployment and external-service changes:
- Independent diff/impact review and uncertainties:
- Checks executed: exact command, environment/version, result counts and evidence link:
- Failed/skipped/flaky/blocked/not-run checks and reasons:
- New QA assertions or outstanding work; changed expectations and owner decision:
- Created staging records/cleanup, if any:
- Documentation updated:
- Next exact action and responsible role:

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.


## UI/UX impact and existing-design compatibility (required when applicable)

- Existing design guide/component/CSS references; reason for reusing/extending them (new or changed UI must name [UI_CONTROL_REGISTRY](../UI_CONTROL_REGISTRY.md) primitives):
- Exact external QA commit and ux/workbook.json SHA256; UX/UXW/WB IDs/revisions:
- Before/after behaviour; independent expected/unchanged example:
- Direct screens and transitive shared consumers; applicable states/roles/entities/settings:
- Preserved field/line/source identity, money/stock/history/print and server permissions:
- Desktop/narrow/keyboard/reader evidence; baseline/after sanitized screenshots:
- Exact and adjacent regressions; actual engineering checks and missing layers:
- Conflict/exception owner, rationale, mitigation, expiry and acceptance impact:
- Small rollout batch/revert plan; any schema/data implications explicitly reviewed:
- QA companion change/run and independent review link (or pending):

If not applicable, state why based on actual diff. Do not treat completing this section as product compliance or release approval.


## CoreGuard impact (required when the diff touches the financial surface)
- Financial surface files touched:
- Behaviour before → after (one example in LKR):
- Guards/checks that cover this (IDs):
- Guards/checks added or changed (ID, revision, severity), or "none — covered by: …":
- Golden events added/changed (scenario@version, event IDs); expected values supplied by (name, date):
- Properties added/changed:
- Red evidence (lab output showing the new rule failing before the implementation):
- Green evidence (lab run on the final commit; certificate status):
- Waivers used (CGW-…, expiry):
- CoreGuard version: before → after
