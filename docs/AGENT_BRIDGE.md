# AgentBridge v1 (AB-06 repair on AB-05)

Unpaid domestic local-currency supplier **service/expense** invoices: connect an authorized Codex or Claude client (or use the browser), store the original, submit facts without BookOne OCR, resolve questions, review BookOne’s calculated effects, approve in the trusted human UI, and receive one durable posted bill.

Feature flags default **off**. Draft-only and posting-disable default **on**. Keep posting disabled until independent QA accepts this candidate and the owner deploys. Existing purchase screens stay usable when AgentBridge is off.

Protocol schema `ab-06.1`. Policy `ab-01.purchase-bill.unpaid-service.v1`. Product version **2.10.0**.

## Supported in this build

- Document Inbox at `/purchase/inbox` (hidden until the company flag is on and the job has `purchase.inbox.read`).
- Agent connections at `/purchase/inbox/connections` (also linked from Purchase settings). The screen shows public MCP/OAuth copy fields for Codex and Claude. It stays reachable when Document Inbox is off. New connections start with `read`, `upload`, `draft`. Post is explicit. Agents cannot mint human approval.
- Shared service in `@bookone/agent-bridge` used by the UI, `/api/agent-bridge/v1/*`, and `/api/agent-bridge/mcp`.
- Posting goes through `createCommercialDocumentWithUser` (the existing unpaid purchase bill path). One bill per approved proposal.
- Agent-first facts: a valid upload without server OCR becomes `awaiting_facts`, not a dead-end failure. `submit_extracted_facts` binds document id, content hash and expected revision. Facts can be edited on draft/validated/awaiting_approval; a new proposal replaces the current one and revokes prior approval. Category label is taken from the selected authorized mapping. Amounts use exact decimals (never Number-invalid→0).
- Two original-file transfer paths:
  1. Bounded `contentBase64` on `submit_document` / `finalize_upload_session`.
  2. `create_upload_session` returns an authenticated BookOne review URL when the chat client cannot forward bytes. The Inbox form finalizes that session (`uploadSession`). Chat attachments are **not** sent to MCP automatically. Same-key uploads claim the tenant-scoped key before writing.
- Batch manifest: one item per file, per-item status, no implicit batch approval.
- Lookups: approved suppliers, expense accounts, own proposals. Ambiguous matches become issues; new suppliers/accounts are not created.
- Strict MCP/API schemas (`additionalProperties: false`). MCP protocol negotiate `2025-03-26` and `2024-11-05`; incompatible versions are rejected.
- OAuth discovery: `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`, `/.well-known/jwks.json`. Authorization code + PKCE S256 + refresh_token for public clients `bookone-codex` and `bookone-claude`. Consent always grants `read upload draft` (never post). Tenant is encoded in the authorization code. MCP 401 includes `WWW-Authenticate` with `resource_metadata`.
- Effective scopes are token scopes INTERSECT current grants for the token subject. Human approval stays session-only.
- Additive migration `046_agent_bridge_facts.sql` (last error/intake mode, upload sessions, batches, facts keys, oauth codes, connection scopes/last used).
- AB-02/AB-03/AB-04 gates retained: fail-closed approval, unique claim, token∩live grants, lost-response reconcile, blob storage-pointer remap, explicit `agent_bridge.approve` / `agent_bridge.post` keys.

## Out of this build

Stock receipts, mixed stock-service, paid/part-paid invoices, foreign currency, payment execution, arbitrary journals, posted rewrites, folder watchers, autonomous posting, creating suppliers/accounts, minting human approval from an agent.

## User path without OCR

1. Upload a PDF/image in Inbox or through MCP `submit_document`.
2. Status becomes **awaiting facts**. The original stays stored. A safe reason is shown when OCR is off.
3. Enter facts in the Inbox form, or have the connected agent call `submit_extracted_facts` against the stored hash and revision.
4. BookOne calculates preview (example VAT-registered: net 1000 + VAT 180 = gross 1180; Dr6800=1000, Dr2300=180, Cr2100=1180).
5. A trusted human with `agent_bridge.approve` approves the exact revision in BookOne.
6. Commit with `agent_bridge.post` posts one bill. Same idempotency key returns the original receipt.

Failed documents can resume through the same facts form. Download the original from `/purchase/inbox/[id]/file`.

## Owner configuration

1. Apply migrations through startup `db:init` (`044`, `045`, `046`). Additive; do not drop prior AgentBridge tables.
2. On **Purchase settings**, enable Document Inbox only on the intended synthetic company. Leave draft-only and posting-disable on until independent QA says otherwise. Do not enable posting on the existing live company in this candidate.
3. Grant `purchase.inbox.*`, `agent_bridge.approve`, and `agent_bridge.post` on Jobs if the tenant was seeded before catalog v2. `allows(key, 'write')` matches those exact catalog action keys (and a persisted `*.write` alias). Viewer stays read-only. Purchase module ceiling still applies.
4. Set `AGENT_BRIDGE_PUBLIC_URL` (or `AUTH_URL`) to the public HTTPS origin so review URLs and OAuth metadata are absolute.
5. MCP signing: `AGENT_BRIDGE_TOKEN_SECRET` or `AUTH_SECRET` is required (no development fallback).
6. Production access tokens: the usual Portainer Re-pull is enough. Compose mounts a named volume at `/var/lib/bookone/secrets`. BookOne generates a PKCS8 RSA key once into `AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE` (default `/var/lib/bookone/secrets/agent_bridge_oauth_signing.pem`) and serves JWKS at `/api/agent-bridge/oauth/jwks` and `/.well-known/jwks.json`. Issuer defaults to `AGENT_BRIDGE_OAUTH_ISSUER` or `AGENT_BRIDGE_PUBLIC_URL` / `AUTH_URL`. FILE still wins; a missing FILE path does not fall back to the env PEM body. BookOne-as-AS will **not** mint HMAC access tokens when `NODE_ENV=production` unless `AGENT_BRIDGE_ALLOW_HMAC=1` is an explicit labelled fixture. Do not enable HMAC on staging as a substitute for RS256. Token exchange reads tenant from the authorization code; `tenant_id` / `AGENT_BRIDGE_OAUTH_TENANT_HINT` remain optional fallbacks. Pre-registered clients only. See `docs/AGENT_BRIDGE_SIGNING_STAGING.md`.
7. Optional live OCR: `AGENT_BRIDGE_OCR_ENDPOINT`, `AGENT_BRIDGE_OCR_KEY`, and `AGENT_BRIDGE_OCR_LIVE=1`. Without opt-in, production `extractorFor()` skips OCR and the document waits for facts. Fixture extractors stay test-only.
8. After restore, MCP connections, upload sessions and oauth codes stay out of the archive. Reauthorize clients. Restored inbox flags stay draft-only and posting-stopped; restored approvals are revoked. DB-backed AgentBridge blobs are counted as stored in company data, not as missing S3.

## Environment variables

| Name | Purpose |
|------|---------|
| `AGENT_BRIDGE_PUBLIC_URL` | Public origin for review URLs, OAuth metadata, MCP 401 challenges |
| `AUTH_URL` | Fallback public origin |
| `AGENT_BRIDGE_TOKEN_SECRET` / `AUTH_SECRET` | HMAC fixture signing (tests / labelled non-production) |
| `AGENT_BRIDGE_OAUTH_ISSUER` | Production RS256 issuer (this host origin) |
| `AGENT_BRIDGE_OAUTH_AUDIENCE` | JWT audience override (default `bookone.agent-bridge`) |
| `AGENT_BRIDGE_OAUTH_JWKS_URL` | JWKS URL override (default `{issuer}/api/agent-bridge/oauth/jwks`) |
| `AGENT_BRIDGE_OAUTH_JWKS_JSON` | Optional BookOne-hosted JWKS body (otherwise derived from the signing PEM) |
| `AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE` | Absolute path to a PKCS8 RSA private key. BookOne generates a key there once when the file is missing. When set, a missing file does not fall back to the env PEM body |
| `AGENT_BRIDGE_OAUTH_SIGNING_PEM` | Optional PEM body if no `_FILE` path is set. Do not store this in Git |
| `AGENT_BRIDGE_OAUTH_KID` | JWKS key id (default `bookone-agent-bridge`) |
| `AGENT_BRIDGE_OAUTH_TENANT_HINT` | Optional tenant fallback when a legacy code is not tenant-bound |
| `AGENT_BRIDGE_ALLOW_HMAC` | Labelled production HMAC fixtures (`1`). Off by default in production. Not a live-client pass |
| `AGENT_BRIDGE_OCR_ENDPOINT` / `AGENT_BRIDGE_OCR_KEY` / `AGENT_BRIDGE_OCR_LIVE` | Optional server OCR |
| `AGENT_BRIDGE_STORE` | `memory` only for isolated tests |

## Client setup

- Codex CLI / ChatGPT desktop / IDE: [AGENT_BRIDGE_CODEX.md](AGENT_BRIDGE_CODEX.md)
- Claude web / Desktop custom connector: [AGENT_BRIDGE_CLAUDE.md](AGENT_BRIDGE_CLAUDE.md)

Public client IDs: `bookone-codex`, `bookone-claude`. Default scopes `read upload draft`. Loopback callbacks `http://127.0.0.1/callback` and `http://localhost/callback` (any port). Claude hosted callback `https://claude.ai/api/mcp/auth_callback`. Dynamic client registration is not implemented; pass the pre-registered client id.

## BLOCKED until the owner configures them

| Item | Why |
|------|-----|
| Live Codex surface | Needs a real Codex/ChatGPT account, public HTTPS MCP, OAuth issuer or labelled HMAC, Inbox enabled on a **fresh synthetic** company |
| Live Claude surface | Same, plus Anthropic cloud must reach the host on HTTPS port 443 |
| Production RS256 tokens | Usual Portainer Re-pull. Internal generate-once PEM on the `agent_bridge_signing` volume, or an existing FILE/env PEM. HMAC minting is 503 in production without `AGENT_BRIDGE_ALLOW_HMAC=1` |
| Live OCR/provider smoke | Adapter is implemented; remote smoke needs authorized endpoint/key and `AGENT_BRIDGE_OCR_LIVE=1` |
| Staging financial posting | Existing company Inbox OFF, draft-only ON, posting-stop ON until independent QA |
| Recovery LAST | Encrypted export/restore into an empty target after functional outcomes |
| Portainer webhook | `PORTAINER_WEBHOOK_URL` secret is empty |
| Branch protection | See `docs/AGENT_BRIDGE_BRANCH_PROTECTION.md`. YAML is not proof that GitHub rules are on |

## Rollback

Revert the product commit. Additive `046` columns remain; unused flags are harmless. Do not rewrite posted bills. Code rollback is not a data restore.

## CoreGuard

Scoped AgentBridge suites run as the **AgentBridge CoreGuard** job, including AB-06 independent acceptance (`ab06-independent`, `ab05-acceptance`, `schemas`, `oauth-pkce`). The existing **Lint typecheck build test** quality job stays unconditional and remains a publication ancestor. `build-and-push` needs `[quality, coreguard]`. Playwright is not part of turbo `pnpm test`. Live Codex/Claude, live OCR, production IdP, external MCP client and GitHub protection remain blocked registry entries.

Independent remaining-only QA: `docs/qa/CODING-AGENTBRIDGE-06-QA.md`.
