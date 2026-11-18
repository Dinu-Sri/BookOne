# Staging AgentBridge signing — operator steps

18 November 2026. Target: `bookone_stage` at https://bookone.clossyan.com. This enables BookOne to issue verifiable agent-login tokens. It is not OCR configuration and does not enable financial posting.

Owner deploys through the usual Portainer update (Re-pull ON after the Docker web image is green). Do not paste a private key into Git, issues, logs, or chat. The public JWKS URL is safe to share.

## What this candidate adds

- Staging/prod Compose default the public URL and issuer to `https://bookone.clossyan.com`.
- A named volume `agent_bridge_signing` is mounted at `/var/lib/bookone/secrets` (web runs as UID **1001**).
- On first JWKS or token request, BookOne generates a PKCS8 RSA key once into `AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE` and reuses that file across container restarts. FILE still wins. A missing FILE path does **not** fall back to the env PEM body.
- HMAC stays off. Do not set `AGENT_BRIDGE_ALLOW_HMAC`. Do not change `AUTH_SECRET`. Do not enable company Inbox/posting flags. Do not delete volumes. Do not replace the entrypoint.
- Connection details for Codex and Claude are copied from `/purchase/inbox/connections` (also linked from Purchase settings). That screen stays reachable when Document Inbox is off.

## 1. Usual Portainer update

No host PEM file is required. A missing host bind-mount is no longer the default (a missing bind path used to become a directory and left JWKS empty).

1. Wait for GitHub Action **Docker web image** to go green for this SHA (`ghcr.io/dinu-sri/bookone-web:latest`).
2. Portainer **Update the stack**. Use **Re-pull ON** for that new web image. Keep all data volumes, including `agent_bridge_signing` once it exists.
3. Existing company Inbox/posting flags stay unchanged.

Optional non-secret stack values (Compose already defaults them):

| Variable | Staging default |
| --- | --- |
| `AGENT_BRIDGE_PUBLIC_URL` | `https://bookone.clossyan.com` |
| `AGENT_BRIDGE_OAUTH_ISSUER` | `https://bookone.clossyan.com` |
| `AGENT_BRIDGE_OAUTH_KID` | `bookone-staging-agentbridge-01` |
| `AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE` | `/var/lib/bookone/secrets/agent_bridge_oauth_signing.pem` |

Leave unset:

- `AGENT_BRIDGE_ALLOW_HMAC`
- `AGENT_BRIDGE_OAUTH_SIGNING_PEM` (the volume file is preferred)
- OCR keys

## 2. Optional operator-provided host key

Only if you already created a host PKCS8 file and want to keep using it: set `AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE` to that absolute container path and add a **file** bind mount yourself. Generate **once**. Do not print, copy, or commit the file. Do not bind-mount a path that does not yet exist (Docker would create a directory).

## 3. Public check (safe to share)

Open https://bookone.clossyan.com/api/agent-bridge/oauth/jwks

Success: HTTP 200 JSON with a nonempty `keys` array. Each key has `kty: RSA`, `use: sig`, `alg: RS256`, the configured kid, plus public `n` and `e` only. It must not contain private RSA fields (`d`, `p`, `q`, …) or a PEM body.

Same document is also at https://bookone.clossyan.com/.well-known/jwks.json

Inside BookOne, open **Purchase settings → Connect Codex or Claude** (`/purchase/inbox/connections`). Copy the public URL, issuer, JWKS, MCP URL, and client ids. There is no client secret.

Then tell QA the live sidebar stamp (`vMAJOR.MINOR.PATCH · sha7`) and that JWKS is ready. Independent QA verifies metadata and OAuth/PKCE/refresh/revocation with an authorized synthetic company. Real Codex/Claude sessions are a separate acceptance, not this setup.

Turn Document Inbox on only for that synthetic company before a client can finish consent. Leave draft-only and posting-stop on until independent QA authorizes posting.
