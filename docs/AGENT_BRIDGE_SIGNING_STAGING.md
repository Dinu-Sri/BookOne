# Staging AgentBridge signing — operator steps

18 November 2026. Target: `bookone_stage` at https://bookone.clossyan.com. This enables BookOne to issue verifiable agent-login tokens. It is not OCR configuration and does not enable financial posting.

Owner deploys. Do not paste a private key into Git, issues, logs, or chat. The public JWKS URL is safe to share.

## What this candidate adds

- `docker/docker-compose.staging.yml` forwards `AGENT_BRIDGE_PUBLIC_URL`, `AGENT_BRIDGE_OAUTH_ISSUER`, `AGENT_BRIDGE_OAUTH_KID`, optional `AGENT_BRIDGE_OAUTH_SIGNING_PEM`, and `AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE`.
- A read-only bind mount of the host PEM into `/run/secrets/agent_bridge_oauth_signing.pem` (web runs as UID **1001**).
- Application support for `AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE` (absolute path). Existing multiline `AGENT_BRIDGE_OAUTH_SIGNING_PEM` still works. When the file path is set, a missing file does **not** fall back to the env PEM body.
- HMAC stays off. Do not set `AGENT_BRIDGE_ALLOW_HMAC`. Do not change `AUTH_SECRET`. Do not enable company Inbox/posting flags. Do not delete volumes. Do not replace the entrypoint.

## 1. Create the host key **before** updating the stack

A missing bind-mount path is created as a **directory**. The PEM must already be a regular file.

On the staging Docker host, as the deployment operator:

```bash
sudo mkdir -p /opt/bookone/secrets
sudo test ! -e /opt/bookone/secrets/agent_bridge_oauth_signing.pem
sudo openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
  -out /opt/bookone/secrets/agent_bridge_oauth_signing.pem
sudo chown 1001:1001 /opt/bookone/secrets/agent_bridge_oauth_signing.pem
sudo chmod 0400 /opt/bookone/secrets/agent_bridge_oauth_signing.pem
sudo test -f /opt/bookone/secrets/agent_bridge_oauth_signing.pem
```

`openssl genpkey` writes PKCS8 PEM. Generate **once**. Keep the same file across container restarts. Do not print, copy, or commit the file.

If a directory already exists at that path from an earlier failed mount:

```bash
sudo rm -rf /opt/bookone/secrets/agent_bridge_oauth_signing.pem
```

Then create the file again with the commands above.

## 2. Portainer stack variables (non-secret)

Portainer → environment → stack **bookone_stage** (Compose path `docker/docker-compose.staging.yml`). Add these. Do not replace existing database/auth/storage settings.

| Variable | Staging value |
| --- | --- |
| `AGENT_BRIDGE_PUBLIC_URL` | `https://bookone.clossyan.com` |
| `AGENT_BRIDGE_OAUTH_ISSUER` | `https://bookone.clossyan.com` |
| `AGENT_BRIDGE_OAUTH_KID` | `bookone-staging-agentbridge-01` |

Leave unset:

- `AGENT_BRIDGE_ALLOW_HMAC`
- `AGENT_BRIDGE_OAUTH_SIGNING_PEM` (prefer the mounted file)
- OCR keys

Optional overrides (defaults in Compose are already correct):

| Variable | Default |
| --- | --- |
| `AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE` | `/run/secrets/agent_bridge_oauth_signing.pem` |
| `AGENT_BRIDGE_OAUTH_SIGNING_PEM_HOST` | `/opt/bookone/secrets/agent_bridge_oauth_signing.pem` |

## 3. Deploy the reviewed image

1. Merge/ff this candidate to `master` only after review.
2. Wait for GitHub Action **Docker web image** to go green for that SHA (`ghcr.io/dinu-sri/bookone-web:latest`).
3. Portainer **Update the stack**. Use **Re-pull ON** for that new web image. Keep all data volumes.
4. Existing company Inbox/posting flags stay unchanged.

## 4. Public check (safe to share)

Open https://bookone.clossyan.com/api/agent-bridge/oauth/jwks

Success: HTTP 200 JSON with a nonempty `keys` array. Each key has `kty: RSA`, `use: sig`, `alg: RS256`, `kid: bookone-staging-agentbridge-01`, plus public `n` and `e` only. It must not contain private RSA fields (`d`, `p`, `q`, …) or a PEM body.

Same document is also at https://bookone.clossyan.com/.well-known/jwks.json

Then tell QA the live sidebar stamp (`vMAJOR.MINOR.PATCH · sha7`) and that JWKS is ready. Independent QA verifies metadata and OAuth/PKCE/refresh/revocation with an authorized synthetic company. Real Codex/Claude sessions are a separate acceptance, not this setup.
