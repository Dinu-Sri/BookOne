# CHG-20261021-ux-incremental-contract

Date 2026-10-21; documentation-only adoption requested by owner. Product base `4c3a304e6adc985c591ecb7934382b8929f9b189` (v2.5.19 Light03 picker/split-price already on master). VERSION stays 2.5.19. Final SHA in PR metadata. QA companion [HANDOFF-20261021-ux-workbook](https://github.com/Dinu-Sri/bookone-qa/blob/c318ac38df72888df673e838793c197df5495563/handoffs/HANDOFF-20261021-ux-workbook.md); spec commit `024f8c35223a28c0662d469b71cd96579d4ee24d` (QA PR #52); UX JSON SHA256 `383d18ad74978af67e9e75d855c77c87b45a92beb00c101a3338dd0abd01e57f`. Product PR #6 applied onto master without overwriting Light03 code.

Before: existing design/list/entry/entity/busy guidance plus external QA contract without explicit shared incremental UX integration. After: root AGENTS/.claude require UI_UX_CHANGE_GUIDE; existing LIST_TABLE_UX_GUIDE and QA_CHANGE_CONTRACT/CHG template extended. Existing design system preserved. Light03 CHG records applicable UX/UXW/WB IDs and shared consumers.

Changed paths: AGENTS.md, .claude/CLAUDE.md, docs/UI_UX_CHANGE_GUIDE.md, docs/LIST_TABLE_UX_GUIDE.md, docs/QA_CHANGE_CONTRACT.md, docs/changes/TEMPLATE.md, this CHG, docs/changes/CHG-20261021-light03-picker-split-price.md (additive UX section only), docs/TASK_LOG.md, docs/PROJECT_STATUS.md. No code, dependency, schema, data, flags, VERSION or deployment changes.

UI impact: external 32 rules / 48 draft workflows. Applicable to the already-shipped Light03 candidate: UXW-009, UXW-010, UXW-011; adjacent UXW-002, UXW-004, UXW-006, UXW-012. Inventory shared consumers in the Light03 CHG. Preserve styles/props/fields/source/history/money/access. Docs alone do not repair defects or prove compliance.

Unresolved: UXQ-001 Sinhala bracket vs GlossLabel replacement; UXQ-002 missing original UX_REDESIGN_GUIDE; UXQ-003 inherited 24-ui-ux tests; UXQ-004 compact heading semantics. Named owners/next actions in QA inventory; current behaviour unchanged.

Validation: edited guidance and scope reviewed; external UX authoring 6 and business-library 16 guards passed in QA. Accounting 147 / auth 81 already recorded on v2.5.19; this commit does not re-run them because apps/packages are unchanged. No product build/browser execution claimed. 48 UX workflows remain unrun. Isolated-fault UXW-010 late-response branch remains blocked. No trusted release gate installed.

Rollout: adopted on master v2.5.19 · `4c3a304` without overwriting Light03 code. Critical source/financial/retention fixes already shipped as v2.5.19; shared primitives and deeper audits stay later waves. Light03 fixtures unchanged; independent QA retests that build. Owner standing instruction is to push documentation onto master. Revert this documentation commit if needed; no data rollback.

Next: Independent QA verifies `v2.5.19 · 4c3a304` against Light03 picker/split-price plus recorded UX IDs. Medium prepares a NEW pinned retest manifest. Do not close OBS-M18 from docs. Do not implement D12-008/D12-035/N13-068. Do not credit INV0032. Encrypted backup last.
QA handoff: https://github.com/Dinu-Sri/bookone-qa/blob/c318ac38df72888df673e838793c197df5495563/handoffs/HANDOFF-20261021-ux-workbook.md.

Resolved immutable QA companion commit: 024f8c35223a28c0662d469b71cd96579d4ee24d (PR #52). Publication addendum: c318ac38df72888df673e838793c197df5495563.
