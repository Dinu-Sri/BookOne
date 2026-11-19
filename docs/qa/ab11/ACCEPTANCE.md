# AB-11 acceptance matrix

Product **2.11.4**. Base `2edf473` (v2.11.3). Schema `ab-06.1`. CoreGuard `ab-11`.

| Area | Result | Evidence |
|------|--------|----------|
| Live Codex initialize `2025-06-18` | PASS (HTTP + NextRequest) | Same payload as Codex 0.167.0-alpha.4.1 returns `protocolVersion: 2025-06-18`, `serverInfo`, tools-only capabilities |
| Older supported versions | PASS (HTTP) | `2025-03-26` and `2024-11-05` are echoed |
| Unknown requested version | PASS (HTTP + JSON-RPC) | `1999-01-01` negotiates to `2025-06-18`; no `UNSUPPORTED_PROTOCOL` |
| Missing / malformed initialize | PASS (HTTP) | Missing version defaults to `2025-06-18`; non-string is `-32602 INVALID_PARAMS` |
| `notifications/initialized` | PASS (HTTP) | JSON-RPC notification returns HTTP 202 and an empty body |
| `tools/list` and read-only calls | PASS (HTTP) | `get_capabilities` / `get_policy_context` return structured content; scopes stay `read,upload,draft`; posting-stop stays on |
| `MCP-Protocol-Version` header | PASS (HTTP + NextRequest) | Missing header assumes `2025-03-26`; unsupported header is HTTP 400 |
| Batches / resources / prompts / GET | PASS (HTTP) | Array body is 400; `resources/list` and `prompts/list` are `-32601`; authenticated GET is 405 |
| OAuth callback / PKCE / exact redirect | unchanged | AB-10 tests retained |
| Live Codex inventory | LIVE-UNVERIFIED | Independent retry after owner Portainer Re-pull on the existing authorized connector. Do not replay `7bf93de1` |

Do not treat this matrix as customer-ready or as a live Codex/Claude tool inventory.
