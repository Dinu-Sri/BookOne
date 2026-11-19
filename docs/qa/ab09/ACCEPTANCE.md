# AB-09 acceptance matrix

Product **2.11.2**. Base `b7e7499` (v2.11.1). Schema `ab-06.1`. CoreGuard `ab-09`.

| Area | Result | Evidence |
|------|--------|----------|
| Token exchange consume-before-validate | PASS (source + unit) | `redeemOauthCode` SELECT FOR UPDATE, classify, then `used_at IS NULL`; binding mismatch does not burn the code |
| Exact redirect host/path/port | PASS (unit) | `127.0.0.1` ≠ `localhost`; different port/path refused without consume |
| PKCE / expiry / reuse / concurrent | PASS (unit) | PKCE/expiry consume; reuse refused; one concurrent winner |
| Mint not ready | PASS (source) | `mintIsReady()` before redeem; 503 does not consume |
| Consent-only ≠ authenticated | PASS (unit + source) | `Permission granted` / `Token issued` / `Active` / `Revoked`; summary counts `lastUsedAt` only |
| Branded consent Allow/Cancel | PASS (unit + Playwright) | Connect Codex to BookOne; company; account; permission rows; actual flags; 44px Allow; Cancel `access_denied` for validated redirect |
| Untrusted redirect | PASS (unit + Playwright) | Local BookOne error; no redirect to evil host |
| Codex loopback page | DOCUMENTED | Client-owned; BookOne does not theme it |
| Prompts | PASS (unit) | Codex CLI commands on their own lines; Claude `Name: BookOne AgentBridge` once |
| AB-07/AB-08 retained | PASS (source) | discovery, `/authorize` alias, two prompts, Company AgentBridge |
| Live Codex login | LIVE-UNVERIFIED | v2.11.1 retest still `invalid_grant`. This candidate adds a sanitized request-id/reason-enum diagnostic and makes tenant-bound codes win over a hint. It is not a live-tested Codex fix. Independent retry after owner Portainer Re-pull. Do not replay consumed codes. Preserve the saved Codex entry and original grant |

Do not treat this matrix as customer-ready or as a live Codex/Claude connection.
