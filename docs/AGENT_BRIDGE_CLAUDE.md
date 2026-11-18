# Connect Claude to BookOne AgentBridge

Status of this guide: **IMPLEMENTED + LIVE-UNVERIFIED**. Protocol, PKCE, RS256 mint, discovery and MCP tool contracts are tested in-repo. A real Claude web / Desktop / Cowork custom-connector session against a deployed host was **not** completed in the AB-06 coding session. Do not treat this file as a live-client pass.

Vendor docs used while writing (2026-11-17): [Custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## What BookOne exposes

| Item | Value |
|------|--------|
| MCP URL | `https://<public-host>/api/agent-bridge/mcp` |
| Protected resource metadata | `https://<public-host>/.well-known/oauth-protected-resource` |
| Authorization server metadata | `https://<public-host>/.well-known/oauth-authorization-server` |
| Pre-registered client id | `bookone-claude` (public, PKCE S256, no client secret) |
| Default scopes | `read upload draft` |
| Hosted callback | `https://claude.ai/api/mcp/auth_callback` |
| Protocol | MCP `2025-03-26` (also accepts `2024-11-05`) |

Claude custom connectors are reached from **Anthropic’s cloud**, not from the user’s laptop. The BookOne host must be public HTTPS on port **443**. Private/VPN origins will not connect. Local MCP via `claude_desktop_config.json` is a different mechanism and is not this remote connector.

## Operator prerequisites (exact remaining actions)

1. Deploy this candidate. Do **not** enable Inbox or posting on the existing live company.
2. Create or select a **fresh synthetic** company. Turn Document Inbox on there. Leave draft-only and posting-disable on until independent QA authorizes a posting check.
3. Set `AGENT_BRIDGE_PUBLIC_URL` to that HTTPS origin (port 443).
4. Production tokens: set `AGENT_BRIDGE_OAUTH_SIGNING_PEM` (PKCS8 RSA) and `AGENT_BRIDGE_OAUTH_ISSUER` to this HTTPS origin. JWKS is derived automatically. **Do not** set `AGENT_BRIDGE_ALLOW_HMAC=1` on staging as a substitute. Without signing PEM (or labelled HMAC), `/api/agent-bridge/oauth/token` returns **503** in production.
5. Tenant is encoded in the authorization code. `AGENT_BRIDGE_OAUTH_TENANT_HINT` / `tenant_id` are optional fallbacks for legacy codes.
6. Allow Anthropic IP ranges if a firewall sits in front of BookOne.
7. A human BookOne user with Inbox write signs in during the browser consent step. Consent grants read/upload/draft only.

BookOne does not implement Dynamic Client Registration. In Claude choose **Use your own OAuth client** with client id `bookone-claude` and **no secret**.

## Claude web / Pro / Max (intended live surface)

1. Open [Customize → Connectors](https://claude.ai/customize/connectors).
2. Add custom connector → Web.
3. Name: `BookOne AgentBridge`.
4. URL exactly: `https://<public-host>/api/agent-bridge/mcp`.
5. Authentication: **Sign in when needed**.
6. OAuth client: **Use your own OAuth client**. Client ID `bookone-claude`. Leave secret empty. Redirect already registered: `https://claude.ai/api/mcp/auth_callback`.
7. Add, then Connect. Sign in to BookOne and Allow Claude.
8. Enable the connector for the conversation from **+ → Connectors**.

Team/Enterprise owners add the connector under Organization settings first; members then Connect with their own BookOne login.

## Claude Desktop / Cowork

Remote custom connectors still originate from Anthropic’s servers. Use the same public HTTPS MCP URL. Do not point Claude at `http://localhost`.

## Example prompt

```text
Use the BookOne AgentBridge connector. Call get_capabilities.
I will upload an unpaid domestic supplier service invoice in BookOne if you cannot
see the file bytes. Call create_upload_session and give me the review URL.
Do not pretend this chat attachment reached BookOne. After I attach the original,
submit_extracted_facts against that document id, content hash and revision.
Then get_preview. Never call grant_approval. I will approve in BookOne.
```

## File transfer limitation

Claude chat attachments are **not** forwarded to BookOne MCP. Always use `create_upload_session` and the returned review URL, or upload directly at `/purchase/inbox`. After the original is stored, `submit_extracted_facts` sends structured facts only.

## Disconnect

- Claude: Remove or disconnect the connector in Customize → Connectors **and** Revoke on `/purchase/inbox/connections`.
- Revoke in BookOne immediately invalidates the connection.

## What this session verified vs what it did not

| Check | Result |
|-------|--------|
| PKCE S256, public client, Claude callback allow-list | IMPLEMENTED+TESTED (`oauth-pkce`) |
| Discovery metadata + WWW-Authenticate | IMPLEMENTED+TESTED (unit) / LIVE-UNVERIFIED on the public host |
| MCP initialize, tools/list, schema reject of unknown fields | IMPLEMENTED+TESTED (synthetic protocol client) |
| Real Claude connector OAuth consent, upload-session fallback, disconnect | EXTERNALLY BLOCKED — no vendor account in this session |

A synthetic protocol client is not a Claude pass.
