# AB-10 acceptance matrix

Product **2.11.3**. Base `45d1f2f` (v2.11.2). Schema `ab-06.1`. CoreGuard `ab-10`.

| Area | Result | Evidence |
|------|--------|----------|
| Next.js nested callback rewrite | PASS (installed Next 15.5.19 NextRequest) | `nextUrl` / `request.url` turn `127.0.0.1` into `localhost`; Fetch Request URL keeps `127.0.0.1` |
| Authorize GET form value | PASS (HTTP + NextRequest) | Hidden `redirect_uri` is the original loopback URI |
| Sign-in `/login?from=` | PASS (HTTP + NextRequest) | Location keeps `127.0.0.1`; NextURL `from=` is rewritten; browser search keeps the original host |
| POST persist then token | PASS (HTTP) | Token succeeds with stored host; `localhost` vs `127.0.0.1` is `invalid_grant` without consume |
| Localhost / IPv6 / ports / paths | PASS (NextRequest + allowlist) | Each host is stored independently; path and port are kept |
| Cancel / untrusted redirect | PASS (HTTP) | Cancel returns `access_denied` to the original loopback; evil host stays on BookOne |
| Exact redirect / PKCE / reuse | PASS (unit + HTTP) | `stored === presented` unchanged; wrong verifier consumes; reuse refused |
| Live Codex login | LIVE-UNVERIFIED | Independent retry after owner Portainer Re-pull with a new code. Do not replay `4b22d15c` |

Do not treat this matrix as customer-ready or as a live Codex/Claude connection.
