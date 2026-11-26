# CHG-20261126-qa-retest-fixes — QA retest 26 Nov fixes (v2.18.0)

Status: ready-for-QA (independent retest required; findings stay open until QA closes them).

- Author/agent and date: coding agent, 2026-11-26
- Product version and base: 2.18.0, pushed directly to `master` (owner-approved), based on `e2e04d2` / v2.17.12
- QA references: handoff `handoffs/CODING-20261126-QA-RETEST.md` and run `runs/RUN-20261126-blockers-agentbridge-commerce.md` in Dinu-Sri/bookone-qa, PR #129, pinned at `91d7ce8e698517b2c50daeeb552ecd56104f5741` (branch `claude/project-thread-dl3xqg`). Findings QA-1126-01 to QA-1126-15. No UX/UXW/WB ref.

## Changes by finding

| ID | Fix |
|----|-----|
| 01 P1 | OAuth consent POST redirects (Allow and Cancel) use **303 See Other**, so the client callback gets a GET. `/.well-known/oauth-protected-resource` now publishes the same `scopes_supported` as the authorization server (`read upload draft`); post and commerce scopes are granted by the Owner in Company → AgentBridge, not by OAuth. |
| 02 P1 | `createDiscountFromForm`, `updateDiscountFromForm`, `setDiscountActiveFromForm` and `archiveDiscountFromForm` check `sales.discounts.write` before writing. The list hides New/Edit/Deactivate/Archive for read-only jobs; the new/edit pages redirect them. |
| 03 P1 | `createCompanyDomain` and `verifyCompanyDomain` check `company.domains.write` before any DNS lookup or write, and write audit rows. The page is read-only for others. |
| 04 P1 | The party picker submits a hidden `partyId`; posting resolves by id. `ensureParty` matches legal **or display** name when only a name is given (AgentBridge bills, POS, other name-only callers); a legal-name match wins; several display-name matches are refused with "pick the party from the list". Repair: an Owner/Admin sees "Possible duplicate parties" on Customers/Vendors for parties that posting auto-created (audit note "Created party via ensureParty.") whose name is another party's display name. **Merge** moves `business_documents.party_id`, `party_advances.party_id` and `inventory_products.preferred_vendor_id` to the original and voids the copy, with audit rows. Posted journals, amounts and `transactions.party` text are not rewritten. |
| 05 P2 | Every write action in `bank-import-studio.ts`, `bank-reconciliation.ts`, `statement-import.ts` and `reconciliation.ts` returns "You do not have permission to do that." without `accounting.reconciliation.write`. Actions that post or reverse journals (`createCaseEntry`, `confirmTransferCase`, `confirmStatementCreates`, `undoStatementCreates`) also need Simple Entry or Cashbook write. `archiveProductFromForm`, `restoreProductFromForm` and `deleteProductFromForm` now check inventory module write. Read paths (`getOrCreateSessionFromImport`, lists) are unchanged. |
| 06 P2 | The Company (Pvt Ltd) onboarding card no longer promises stock/POS: "Company books — sales, purchase, banking, tax. Stock and POS are added on a higher plan." The Inventory-off message tells the Owner the plan is the cause and how to upgrade, instead of "set in Control Room". Commerce Integrations shows that Inventory is required and refuses to create a connection without it. **Plan defaults are unchanged** (product decision for the owner). |
| 07 P2 | Intake (browser upload, MCP `submit_document`, `finalize_upload_session`) refuses bytes already received in a non-rejected document with `DUPLICATE_DOCUMENT`: "This file was already received on <date> (document X, status Y)…". `allowDuplicate: true` (MCP) or the "Upload anyway as a separate document" checkbox (browser, shown after the refusal) keeps a copy. The inbox list marks "possible duplicate". |
| 08 P2 | Any commit result that is not `posted` redirects with a message (`lib/agent-bridge-commit-outcome.ts`); a failed post stores its reason on the document (`lastErrorMessage`). The detail page shows "Agent posting is stopped…" or "draft-only mode…" before commit. Preview warns when the supplier invoice number already has a bill for that supplier (legal or display name), saying commit will be refused when duplicate blocking is on. |
| 09 P3 | Form actions for Company details, Tax, financial year, brands, locations, company create, POS registers, VAT/sales settings, AgentBridge settings/inbox upload/approve/commit redirect to `?flash=denied_write` instead of throwing an HTTP 500 (`requireWriteOrRedirect`). `mintInboxToken` returns `{ error }`. |
| 10 P3 | Approval line reads "Approved by <name> · expires <local time>" (company timezone, default Asia/Colombo). |
| 11 P3 | MCP schema errors and unknown tools return `INVALID_ARGUMENT`, not `STALE_REVISION`. |
| 12 P3 | Creating a commerce connection requires a stock location (server and form); turning posting on requires one too. |
| 13 P3 | A malformed or unknown commerce token answers "The commerce token is invalid, revoked or expired." A missing header still says a token is required. |
| 14 P3 | Balance sheet (and P&L) sections list accounts in code order (numeric-aware). Inventory keeps code **5100** (asset in the default chart since launch); renumbering is not part of this change. |
| 15 P3 | Sign-up message follows the server: "Account created. You can sign in now." when no verification is enforced (no session token means verification is required, and the old message is kept). |

## Shared consumers and preserved behaviour

- `lib/access.ts` gains `requireWriteOrRedirect`, `writeDeniedMessage`, `withFlash`, `isPermissionError`; `lib/module-access.ts` gains `requireModuleWriteOrRedirect`. `assertPermission` is unchanged.
- `PartyNameFields` (8 consumers) keeps its name-based select and adds only a hidden `partyId`; typing a new name still creates a party. No new UI primitives; the duplicates card and inbox controls use existing `Card`/`Button`. Native select and date inputs were not added.
- Owner and Admin behaviour unchanged apart from the new messages and the merge card.

## Evidence

- New: `packages/auth/test/qa-1126-permission-gates.test.ts` (17): Viewer/Cashier lack and Owner holds the gated keys; every gated action checks before writing; 303 redirects; party resolution and merge; commit messages; approver name; sign-up copy.
- New: `packages/agent-bridge/test/qa-1126-retest.test.ts` (4): scope metadata parity, duplicate file via MCP, failed post keeps its reason, INVALID_ARGUMENT.
- New: `packages/accounting/test/statement-order.test.ts`; commerce invalid-token assertions in `orders.test.ts`.
- Updated source locks: `pos-register-write-auth`, `tenant-scope-after-require` (still refused before mutating); `service.test` duplicate scan (now opt-in).
- `pnpm typecheck` 8/8; unit tests 731 passed (24 commerce, 298 accounting, 44 statement-import, 203 auth, 162 agent-bridge).
- Not covered here: live replay as Viewer/Cashier and the real Claude connector. Those are QA retest items. Retest checklist item 5 (inventory-enabled commerce flows) needs a company on Growth/Pro.
