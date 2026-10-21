# Incremental UI/UX change guide — BookOne

Effective2026-10-21, owner requested. This extends the existing BookOne design system; it is not a replacement. Existing AGENTS/versioning/security/accounting rules and docs/QA_CHANGE_CONTRACT.md remain in force.

## Existing references first

Read [LIST_TABLE_UX_GUIDE](LIST_TABLE_UX_GUIDE.md), [Simple Entry rationale](SIMPLE_ENTRY_UX_REDESIGN.md) and the relevant [entity UX flows](ENTITY_UX_FLOWS.md). Inspect actual shared components in apps/web/src/components/ui, existing ProductAddSearch/DocumentLinesEditor, globals.css variables/classes and the /design-system source. The showcase contains demo controls and is not proof of production behaviour. Preserve current branding, typography, density, route conventions and working keyboard fast paths.

The QA [design inventory](https://github.com/Dinu-Sri/bookone-qa/blob/024f8c35223a28c0662d469b71cd96579d4ee24d/docs/ux/DESIGN_INVENTORY.md) records15 inspected references and4 unresolved questions against product a4a6d65fa0f8ecc116b728b99d70e86f1b2b577f. This is a source inventory, not a live conformance audit. Reinspect the actual working branch before coding. In this QA session Codebase Memory MCP was unavailable; pinned GitHub tree/files supplied the source evidence. Coding agents with graph tools must still follow their entry-point discovery rules and verify graph freshness.

## Shared acceptance contract

Read the externally maintained [UX companion](https://github.com/Dinu-Sri/bookone-qa/blob/024f8c35223a28c0662d469b71cd96579d4ee24d/docs/ux/README.md), [protocol](https://github.com/Dinu-Sri/bookone-qa/blob/024f8c35223a28c0662d469b71cd96579d4ee24d/docs/ux/PROTOCOL.md), [workbook](https://github.com/Dinu-Sri/bookone-qa/blob/024f8c35223a28c0662d469b71cd96579d4ee24d/docs/ux/WORKBOOK.md) and [coding guide](https://github.com/Dinu-Sri/bookone-qa/blob/024f8c35223a28c0662d469b71cd96579d4ee24d/docs/ux/CODING_GUIDE.md). Record the actual resolved QA commit and ux/workbook.json SHA256 in every relevant CHG. These branch links are integration pointers; immutable run/acceptance references must use exact commits.

The companion defines32 UX rules and48 draft/unbound/not-run workflow templates mapped to the existing business books. It is canonical for these QA expectations; do not copy a second editable rule/scenario catalogue into product. WCAG2.2 A+AA is the accessibility target with criterion-specific applicability/exceptions; no full compliance is claimed from documentation, axe, screenshots or a developer's check alone.

## Mandatory small-change method

1. Identify affected existing guides/components/classes, UX rules and UXW/WB cases before implementation; inspect actual diff and transitive consumers.
2. Capture affected default/error/pending/success and keyboard/narrow baseline states using synthetic data; preserve original bugs and historical documents.
3. Fix the smallest correct layer. Reuse existing primitives; extend a shared primitive compatibly when necessary. Inventory actual consumers before propagating a shared change.
4. Do not install another design kit, reset, palette, typography scale or UI framework for this work. Do not rewrite functioning screens globally. A required accessibility correction uses a narrowly reviewed existing-token/component change with before/after impact.
5. Preserve props/callback contracts, form field names, line identities, source linkage/prices/discounts/tax, saved dates/notes, server validation, permissions, posting semantics and historical print/export. UI polish does not authorize data/schema/accounting changes.
6. Use shared Button/useFormStatus or withFormPending for writes per AGENTS. Never add a submit capture listener or unpaired pending emission. Never equate the overlay's timeout with rollback.
7. Provide meaningful outcome feedback. Verify persisted success before claiming it. Retain all recoverable input after refusal, explain corrections, make critical information persistent and accessible, and inspect persisted state before retrying an uncertain submission.
8. Keep tooltips supplementary and keyboard/touch accessible; essential labels/errors/instructions remain available without hover. Native selects remain allowed where appropriate; catalogue product entry continues using the existing ProductAddSearch contract.
9. Verify row components sum to totals and agree with stored document/print/journal; linked source changes update all facts coherently, including added/split rows. Stop financial posting if the preview is inconsistent.
10. Run required engineering checks plus exact/adjacent business regressions, changed shared consumers, keyboard/narrow and applicable assistive-technology checks. Record actual results and blocked/not-run layers.
11. Update existing guides/showcase only for actual changed shared behaviour, CHG, TASK_LOG and PROJECT_STATUS; link QA companion change and immutable evidence. Developers do not self-close independent QA findings.
12. Roll out by bounded batch with a revert plan. Finish source/retention/financial risks first, then shared accessibility/feedback, then module-by-module touchpoints and deeper audits. No blanket rewrite/migration or deployment across a frozen QA queue.

## Conflicting or missing guidance

UXQ-001: older ENTITY_UX_FLOWS says Sinhala hints appear in brackets; current GlossLabel replaces English. Preserve current behaviour and request a product-owner decision before a separate language change.
UXQ-002: UX_REDESIGN_GUIDE_STATUS references bookone-ux-redesign-guide.md, absent from the inspected tree. Locate or explicitly supersede the missing reference; never invent its contents.
UXQ-003: inherited external24-ui-ux tests are not comprehensive UX acceptance; semantically review before binding new cases.
UXQ-004: compact/no-large-heading styling does not authorize removing meaningful page naming/structure. Preserve compact appearance while meeting accessible semantics.

Exceptions must name rule/cases, owner, rationale, mitigation, expiry/review trigger and acceptance impact. No blanket waiver for money/data/access defects. Material policy changes use existing canonical rulebook review. New or changed UI must meet applicable expectations; untouched legacy gaps stay explicitly prioritized.

## Handoff and enforcement

Use the existing CHG template's UX section. Required evidence includes source-reference choice, exact before/after behaviour, direct/dependent consumers, independently expected/unchanged state, actual test layers, sanitized screenshots where applicable, compatibility and rollout/revert plan. Tests/scenarios/runs stay in QA; engineering code/unit checks remain here.

AGENTS and .claude entry points require this process. These are contributor requirements; they do not install CI, branch protection, automated accessibility tooling or deployment gates. Product release authority is unchanged. This documentation-only change has no VERSION bump because apps/packages/docker/scripts are unchanged. Any subsequent product code commit follows the existing mandatory VERSION rule.

