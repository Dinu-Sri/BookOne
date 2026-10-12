# CHG-20261011-external-qa-handover — independent QA and agent handover

Status: ready-for-QA (documentation-only product change).

- Author: Codex, requested by repository owner, 2026-10-11.
- Product base: `d35ed9209852af3fbcfe140176f2f8e74cae15f7`, branch `master`.
- External QA: https://github.com/Dinu-Sri/bookone-qa; see its STATUS.md and migration/source-inventory.json for extraction/validation state.
- Before: product instructions require the embedded E2E runner and maintain tests/catalog in the product repository; no durable per-task handover contract.
- After: agents create/update change records, send test work to external QA, preserve build-specific evidence and public-data boundaries, and follow a staged cleanup guide.
- Changed surfaces: root AGENTS.md; coding-agent entry points; QA_CHANGE_CONTRACT; REMOVE_INBUILT_E2E; change ledger/template; project/task handover notes.
- No application behaviour, dependencies, schema, data, credentials or runtime interfaces changed in this product update.
- Inbuilt testing cleanup is specified for a later implementation task; no test/runtime files deleted here.
- Validation: documentation links/content and diff reviewed; no ERP browser or database tests required for this documentation-only product update. QA repository tests are reported separately against the pinned source baseline.
- Release enforcement and staging business acceptance remain incomplete; documentation does not create an enforced gate.
- Owner confirmed staging test-data mutation authority and public QA repository visibility. Production remains outside this agent's access.
- Next: implement the cleanup only after preservation/external execution criteria in REMOVE_INBUILT_E2E are met; deepen inherited P0 assertions in QA.
