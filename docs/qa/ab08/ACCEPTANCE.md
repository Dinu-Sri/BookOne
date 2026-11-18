# AB-08 acceptance matrix

Product **2.11.0**. Base `58eea1a` (v2.10.2). Schema `ab-06.1`. CoreGuard `ab-08`.

| Area | Result | Evidence |
|------|--------|----------|
| Company nav AgentBridge | PASS (source + unit) | `nav-suites.ts`, `ui-nav-01.test.ts` keeps item when Inbox is off |
| Canonical `/company/agent-bridge` | PASS (source + Playwright markup) | heading, settings, two prompts, clients, technical details |
| Inbox off still reachable | PASS (source) | nav filter hides Document Inbox only; AgentBridge stays |
| Legacy `/purchase/inbox/connections` | PASS (source) | redirects to `/company/agent-bridge` |
| Upload-session URLs | PASS (source) | still `/purchase/inbox?uploadSession=`; not redirected |
| Settings persist / unsaved | PASS (source) | client dirty notice; save posts existing flag names; redirect `?saved=1` |
| Opening/copy does not change flags | PASS (source) | page loads flags; copy is clipboard only |
| Two prompt contracts | PASS (unit + Playwright) | Codex `bookone-codex`, Claude `bookone-claude`, MCP `https://bookone.clossyan.com/api/agent-bridge/mcp`, scopes read/upload/draft, no secrets |
| Permissions | PASS (source + catalog) | settings `company.purchase_settings.write`; revoke `purchase.inbox.write`; href alias; no new keys |
| AB-07 discovery/login | PASS (retained) | middleware public paths, `/authorize` alias, oauth-codex-login 6 passed |
| Claude live client | LIVE-UNVERIFIED | prompt snapshot is not an interoperability pass. Claude Code documented as unverified |
| Rendering 375 / 1440 | PASS (Playwright) | stacked vs side-by-side; screenshots `docs/qa/ab08/agent-bridge-375.png`, `agent-bridge-1440.png` |
| Copy a11y | PASS (source) | `aria-live` copy status and select-fallback |
| Failure states | PASS (unit) | missing HTTPS origin → Unavailable; no signing → Setup needed; empty clients explains copy ≠ connected |
| Regression | PASS locally | `@bookone/agent-bridge` 22 files / 104 passed; Playwright connect 5 passed; auth nav+permissions 13 passed |

AB-07 status: implemented on master v2.10.2 and retained. Real `codex mcp login bookone` against staging remains LIVE-UNVERIFIED until owner Portainer Re-pull of this image (or 2.10.2) and an independent retry of the saved connector.

Do not treat this matrix as customer-ready or as a live Codex/Claude connection.
