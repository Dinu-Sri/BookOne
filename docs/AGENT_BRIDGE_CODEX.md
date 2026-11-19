# Connect Codex to BookOne AgentBridge

Status of this guide: **IMPLEMENTED + LIVE-UNVERIFIED**. Protocol, PKCE, RS256 mint, discovery and MCP tool contracts are tested in-repo. A real Codex CLI / ChatGPT desktop / IDE session against a deployed host was **not** completed in the AB-06 coding session. Do not treat this file as a live-client pass.

Vendor docs used while writing (2026-11-17): [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp). Codex CLI, the IDE extension and the ChatGPT desktop app share `~/.codex/config.toml`. ChatGPT **web** uses plugins, not this local file.

## What BookOne exposes

| Item | Value |
|------|--------|
| MCP URL | `https://<public-host>/api/agent-bridge/mcp` |
| Protected resource metadata | `https://<public-host>/.well-known/oauth-protected-resource/api/agent-bridge/mcp` |
| Authorization server metadata | `https://<public-host>/.well-known/oauth-authorization-server` |
| Authorization | `https://<public-host>/api/agent-bridge/oauth/authorize` (issuer `/authorize` is an alias) |
| Pre-registered client id | `bookone-codex` (public, PKCE S256, no secret) |
| Default scopes | `read upload draft` |
| Callback | `http://127.0.0.1/callback` or `http://127.0.0.1:<port>/callback/<id>` |
| Protocol | MCP `2025-03-26` (also accepts `2024-11-05`) |

`<public-host>` is the deployed origin (`https://bookone.clossyan.com` after the owner deploys this candidate). Local `pnpm dev` is not staging acceptance.

## Operator prerequisites (exact remaining actions)

1. Deploy this candidate. Do **not** enable Inbox or posting on the existing live company.
2. Create or select a **fresh synthetic** company. Turn Document Inbox on there. Leave draft-only and posting-disable on until independent QA authorizes a posting check.
3. Set `AGENT_BRIDGE_PUBLIC_URL` to that HTTPS origin.
4. Production tokens: usual Portainer Re-pull. BookOne generates a persistent PKCS8 key on first use (see `docs/AGENT_BRIDGE_SIGNING_STAGING.md`). Copy **Connect with Codex** from Company → AgentBridge (`/company/agent-bridge`). **Do not** set `AGENT_BRIDGE_ALLOW_HMAC=1` on staging as a substitute.
5. Tenant is encoded in the authorization code. `AGENT_BRIDGE_OAUTH_TENANT_HINT` / `tenant_id` are optional fallbacks only for legacy unbound codes. A tenant-bound code wins over a hint. Authorize persists the exact loopback `redirect_uri` Codex requested (`127.0.0.1` stays `127.0.0.1` through Next.js URL parsing). Token exchange keeps exact `redirect_uri` matching. After a failed login, Company → AgentBridge shows a sanitized last-attempt reason and request id (never the code, verifier, or tokens).
6. A human BookOne user with Inbox write signs in during the browser consent step. Consent grants read/upload/draft only.

BookOne does not implement Dynamic Client Registration. Always pass `--oauth-client-id bookone-codex`.

## Codex CLI (intended live surface)

```bash
codex mcp add bookone --url https://<public-host>/api/agent-bridge/mcp --oauth-client-id bookone-codex
codex mcp login bookone --scopes read,upload,draft
```

Sign in to BookOne in the browser, allow Codex, return to the CLI. BookOne owns the consent page (`Connect Codex to BookOne`). After Allow, the browser hits Codex’s loopback callback (`http://127.0.0.1:<port>/callback/<id>`). The “Authentication complete. You may close this window.” page is served by Codex on your computer, not by BookOne. BookOne does not theme that page. Retry always starts a fresh authorization; do not reuse a consumed code.

In the Codex TUI run `/mcp` and confirm `bookone` is connected. Then:

```text
Connect to BookOne AgentBridge. Call get_capabilities and get_policy_context.
I have an unpaid domestic supplier service invoice. If you cannot read the file bytes,
call create_upload_session and give me the BookOne review URL. Do not claim a chat
attachment reached BookOne. After the original is stored, submit_extracted_facts
with supplier, invoice number, date, unpaid, service_expense, net/tax/gross in minor
units, and the stored content hash. Then get_preview. Do not call grant_approval.
Ask me to approve in BookOne.
```

Equivalent `~/.codex/config.toml`:

```toml
[mcp_servers.bookone]
url = "https://<public-host>/api/agent-bridge/mcp"

[mcp_servers.bookone.oauth]
client_id = "bookone-codex"
callback_url = "http://127.0.0.1/callback"
```

Optional: `codex mcp login bookone --no-browser` if the terminal has no local browser; paste the full redirect URL back.

## ChatGPT desktop app / IDE extension

1. Settings → MCP servers → Add server → Streamable HTTP.
2. URL: `https://<public-host>/api/agent-bridge/mcp`.
3. Authenticate. BookOne consent must show read/upload/draft only.
4. Restart. Type `/mcp`.

These surfaces share the CLI config after `codex mcp add`.

## File transfer limitation

Codex may have the bytes on disk. If the client can read them, use `submit_document` with `filename`, `mime` and `contentBase64` (never a filesystem path or URL). If it cannot forward bytes, BookOne returns `create_upload_session.reviewUrl`. Open that URL while signed in, attach the original, then resume with `submit_extracted_facts`. Chat attachments are not automatically available to MCP.

## Disconnect

- Codex: `codex mcp logout bookone` (or remove the server) **and** Revoke access on Company → AgentBridge.
- Revoke in BookOne immediately invalidates the connection even if the client still holds a token.

## What this session verified vs what it did not

| Check | Result |
|-------|--------|
| PKCE S256, public client, localhost callback | IMPLEMENTED+TESTED (`oauth-pkce`) |
| Discovery metadata + WWW-Authenticate | IMPLEMENTED+TESTED (unit) / LIVE-UNVERIFIED on the public host |
| MCP initialize, tools/list, schema reject of unknown fields | IMPLEMENTED+TESTED (synthetic protocol client) |
| Real Codex CLI OAuth consent, file transfer, disconnect | EXTERNALLY BLOCKED — no vendor account in this session |

A synthetic protocol client is not a Codex pass.
