# AgentBridge Foundation (AB-01)

Unpaid domestic local-currency supplier **service/expense** invoices: upload → extraction → questions → server preview → human approval of the exact revision → one purchase bill.

Feature flags default **off**. Draft-only and posting-disable default **on**. Existing purchase screens stay usable when AgentBridge is off or the OCR provider is missing. Keep posting disabled until the repaired build passes independent qualification.

## Supported in this build

- Document Inbox at `/purchase/inbox` (hidden until the company flag is on and the job has `purchase.inbox.read`).
- Shared service in `@bookone/agent-bridge` used by the UI, `/api/agent-bridge/v1/*`, and `/api/agent-bridge/mcp`.
- Posting goes through `createCommercialDocumentWithUser` (the existing unpaid purchase bill path).
- Local HMAC fixture tokens (`ab1.body.sig`) for MCP/API tests. Audience `bookone.agent-bridge`. These fixtures are not production OAuth.
- Production OAuth/OIDC via `AGENT_BRIDGE_OAUTH_ISSUER` and JWKS (`RS256`). Not registered until the owner configures an IdP.
- MCP protocol `2025-03-26` over HTTP JSON-RPC.
- Human approval is session-only. An agent connection cannot mint approval even with approve scope.
- Concurrent commits for one proposal use a PostgreSQL unique claim (`045_agent_bridge_claim.sql`) plus the ERP idempotency table.

## Out of this build

Stock receipts, payments, foreign currency, arbitrary journals, posted rewrites, folder watchers, autonomous posting.

## Owner configuration

1. Apply migration `044_agent_bridge.sql` (startup `db:init` already walks `packages/db/migrations`).
2. On **Purchase settings**, enable Document Inbox. Leave draft-only and posting-disable on for the first week.
3. Grant `purchase.inbox.*`, `agent_bridge.approve`, and `agent_bridge.post` on Jobs if the tenant was seeded before catalog v2. New seeds from catalog v2 grant purchasing write plus accountant/owner/admin approve/post.
4. Optional live OCR: set `AGENT_BRIDGE_OCR_ENDPOINT`, `AGENT_BRIDGE_OCR_KEY`, and `AGENT_BRIDGE_OCR_LIVE=1`. The HTTP adapter forwards attachment bytes and MIME. Without opt-in the runtime stays unconfigured. Tests use the labelled fixture extractor or a local HTTP contract server.
5. MCP: `AGENT_BRIDGE_TOKEN_SECRET` or `AUTH_SECRET` is required (no development fallback). Production OAuth is **not** registered until `AGENT_BRIDGE_OAUTH_ISSUER` / JWKS are set.
6. After restore, MCP connections are excluded from the archive. Reauthorize clients; do not reuse old tokens.

## BLOCKED until the owner configures them

| Item | Why |
|------|-----|
| Live OCR/provider smoke | Adapter is implemented; remote smoke needs authorized endpoint/key and `AGENT_BRIDGE_OCR_LIVE=1` |
| Production IdP / OAuth MCP | Local HMAC fixture only until issuer/JWKS are registered |
| External MCP client smoke | No third-party client credential |
| Portainer webhook | `PORTAINER_WEBHOOK_URL` secret is empty |
| Branch protection | See `docs/AGENT_BRIDGE_BRANCH_PROTECTION.md`. YAML is not proof that GitHub rules are on |

## Rollback

Drop `agent_bridge_*` tables. Flags unused after revert are harmless. Do not rewrite posted bills.

## CoreGuard

Scoped AgentBridge suites run as the **AgentBridge CoreGuard** job. The existing **Lint typecheck build test** quality job stays unconditional and remains a publication ancestor. `build-and-push` needs `[quality, coreguard]`. Playwright is not part of turbo `pnpm test`.
