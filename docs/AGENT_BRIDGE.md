# AgentBridge Foundation (AB-01)

Unpaid domestic local-currency supplier **service/expense** invoices: upload → extraction → questions → server preview → human approval of the exact revision → one purchase bill.

Feature flags default **off**. Draft-only and posting-disable default **on**. Existing purchase screens stay usable when AgentBridge is off or the OCR provider is missing.

## Supported in this build

- Document Inbox at `/purchase/inbox` (hidden until the company flag is on and the job has `purchase.inbox.read`).
- Shared service in `@bookone/agent-bridge` used by the UI, `/api/agent-bridge/v1/*`, and `/api/agent-bridge/mcp`.
- Posting goes through `createCommercialDocumentWithUser` (the existing unpaid purchase bill path).
- Local HMAC fixture tokens (`ab1.body.sig`) for MCP/API tests. Audience `bookone.agent-bridge`.
- MCP protocol `2025-03-26` over HTTP JSON-RPC.

## Out of this build

Stock receipts, payments, foreign currency, arbitrary journals, posted rewrites, folder watchers, autonomous posting.

## Owner configuration

1. Apply migration `044_agent_bridge.sql` (startup `db:init` already walks `packages/db/migrations`).
2. On **Purchase settings**, enable Document Inbox. Leave draft-only and posting-disable on for the first week.
3. Grant `purchase.inbox.*`, `agent_bridge.approve`, and `agent_bridge.post` on Jobs if the tenant was seeded before catalog v2. New seeds from catalog v2 grant purchasing write plus accountant/owner/admin approve/post.
4. Optional live OCR: `AGENT_BRIDGE_OCR_ENDPOINT` and `AGENT_BRIDGE_OCR_KEY`. Without them the live adapter returns `PROVIDER_UNCONFIGURED`. Tests use the labelled fixture extractor.
5. Optional MCP: `AGENT_BRIDGE_TOKEN_SECRET` (falls back to `AUTH_SECRET`). Production OAuth/OIDC is **not** registered in this change.

## BLOCKED until the owner configures them

| Item | Why |
|------|-----|
| Live OCR/provider smoke | No `AGENT_BRIDGE_OCR_ENDPOINT` / `AGENT_BRIDGE_OCR_KEY` in this workspace |
| Production IdP / OAuth MCP | Local HMAC fixture only |
| External MCP client smoke | No third-party client credential |
| Portainer webhook | `PORTAINER_WEBHOOK_URL` secret is empty |
| Branch protection | YAML is not proof that GitHub rules are on |

## Rollback

Drop `agent_bridge_*` tables. Flags unused after revert are harmless. Do not rewrite posted bills.

## CoreGuard

Scoped AgentBridge suites run as the **AgentBridge CoreGuard** job. The existing **Lint typecheck build test** quality job stays unconditional and remains a publication ancestor. `build-and-push` needs `[quality, coreguard]`. Playwright is not part of turbo `pnpm test`.
