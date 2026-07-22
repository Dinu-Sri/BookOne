# Portainer multi-service deploy (web + docs + e2e)

**One GitHub monorepo · one Portainer stack · three app images (staging).**

---

## Architecture

```
GitHub Dinu-Sri/BookOne (master)
        │
        ▼  Portainer stack pull (full repo once)
        │
        ├── build Dockerfile.web   → bookone-*-web   (ERP, no Chromium)
        ├── build Dockerfile.docs  → bookone-*-docs  (static docs)
        └── build Dockerfile.e2e   → bookone-*-e2e   (Playwright)  [staging only]
```

| Env | Compose file | Services |
|-----|--------------|----------|
| **Staging** | `docker/docker-compose.staging.yml` | web + docs + e2e + postgres + redis + minio + traefik + cloudflared |
| **Production** | `docker/docker-compose.prod.yml` | web + docs + postgres + redis + minio + traefik + cloudflared (**no e2e**) |

### Cloudflare SSL hostname rules (important)

Cloudflare **Universal SSL** (free) only covers:

- `clossyan.com`
- `*.clossyan.com` → e.g. `bookone.clossyan.com`

It does **not** cover nested hosts like `docs.bookone.clossyan.com` → browser error:

`ERR_SSL_VERSION_OR_CIPHER_MISMATCH`

| Use on staging (clossyan.com) | Avoid on free SSL |
|-------------------------------|-------------------|
| `bookone.clossyan.com` | `docs.bookone.clossyan.com` |
| `bookone-docs.clossyan.com` | `e2e.bookone.clossyan.com` |
| `bookone-e2e.clossyan.com` | `app.staging.bookone.…` multi-level |

On a **dedicated zone** `bookone.lk`, first-level names are fine: `docs.bookone.lk`, `app.bookone.lk`.

---

## Staging Portainer stack

| Field | Value |
|-------|--------|
| Stack name | `bookone-staging` (or keep `bookone` if this is your only stack) |
| Build method | **Repository** |
| Repository URL | `https://github.com/Dinu-Sri/BookOne.git` |
| Reference | `refs/heads/master` |
| **Compose path** | **`docker/docker-compose.staging.yml`** |
| GitOps | Enable auto-update / webhook as you prefer |

### Staging hostnames (Cloudflare Tunnel)

Add public hostnames → same tunnel → Traefik on the VPS:

| Hostname | Service |
|----------|---------|
| `bookone.clossyan.com` | web `:3100` |
| `bookone-docs.clossyan.com` | docs `:80` |
| `bookone-e2e.clossyan.com` | e2e `:3200` |

---

## Staging environment variables (Portainer → Stack → Env)

### Hosts & URLs (new — required for multi-service)

| Variable | Example staging value | Purpose |
|----------|----------------------|---------|
| `WEB_HOST` | `bookone.clossyan.com` | Traefik Host rule for ERP |
| `DOCS_HOST` | `bookone-docs.clossyan.com` | Traefik Host rule for docs |
| `E2E_HOST` | `bookone-e2e.clossyan.com` | Traefik Host rule for E2E UI |
| `AUTH_URL` | `https://bookone.clossyan.com` | Auth callback base (must match browser URL) |
| `BETTER_AUTH_URL` | `https://bookone.clossyan.com` | Same as AUTH_URL if using Better Auth |
| `DOCS_APP_URL` | `https://bookone.clossyan.com` | “Open app” link on docs site |
| `E2E_BASE_URL` | `https://bookone.clossyan.com` | Default target when E2E run starts (user can override in UI) |

### Database (web only)

| Variable | Example |
|----------|---------|
| `DB_USER` | `bookone` |
| `DB_PASSWORD` | strong secret |
| `DB_NAME` | `bookone` |
| `DATABASE_URL` | `postgres://bookone:PASSWORD@postgres:5432/bookone` |

### Auth / app secrets (web only)

| Variable | Notes |
|----------|--------|
| `AUTH_SECRET` or `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional |
| `CRON_SECRET` | Cron endpoints |

### Redis / S3 / MinIO

| Variable | Example |
|----------|---------|
| `REDIS_URL` | `redis://redis:6379` |
| `S3_ENDPOINT` | `http://minio:9000` |
| `S3_ACCESS_KEY` | MinIO user |
| `S3_SECRET_KEY` | MinIO password |
| `S3_BUCKET` | `bookone` |
| `S3_FORCE_PATH_STYLE` | `true` |

### Optional product

| Variable | Notes |
|----------|--------|
| `OPENAI_API_KEY` | AI features |
| `SENTRY_DSN` | Errors |
| `NEXT_PUBLIC_POSTHOG_KEY` | Analytics |
| `RESEND_API_KEY` | Email |
| `LETSENCRYPT_EMAIL` | Traefik ACME (if used) |
| `CLOUDFLARE_TUNNEL_TOKEN` | cloudflared service |
| `BUILD_DATE` | Optional bust cache (`date +%s`) |

### E2E service only (optional)

| Variable | Notes |
|----------|--------|
| `E2E_ADMIN_EMAIL` | Super-admin for Control Room scenarios |
| `E2E_ADMIN_PASSWORD` | Same |

**No `E2E_ALLOW_FULL` / staging host gates** — UI passes URL + credentials per run.

### Services that use which env

| Env group | web | docs | e2e |
|-----------|:---:|:---:|:---:|
| DB / Redis / S3 / Auth | ✅ | — | — |
| `WEB_HOST` / AUTH_URL | ✅ | — | — |
| `DOCS_HOST` / DOCS_APP_URL | — | ✅ | — |
| `E2E_HOST` / E2E_BASE_URL | — | — | ✅ |
| Tunnel token | cloudflared | | |

Docs and e2e images do **not** need `DATABASE_URL`.

---

## Production Portainer stack (`bookone.lk` later)

| Field | Value |
|-------|--------|
| Compose path | `docker/docker-compose.prod.yml` |
| `WEB_HOST` | `app.bookone.lk` (or apex) |
| `DOCS_HOST` | `docs.bookone.lk` |
| `AUTH_URL` / `BETTER_AUTH_URL` | `https://app.bookone.lk` |
| `DOCS_APP_URL` | `https://app.bookone.lk` |
| E2E service | **Not in prod compose** — run against staging |

Until cutover you can keep production compose pointing at `bookone.clossyan.com` via the same `WEB_HOST` / `DOCS_HOST` vars.

---

## What to do after a code push

1. Push to `master`.
2. Portainer pulls repo (GitOps or manual **Pull and redeploy**).
3. Rebuild images:
   - **ERP change only** → rebuild **web** (fast, no Chromium).
   - **Docs content only** → rebuild **docs**.
   - **E2E tests only** → rebuild **e2e** (heavy, has browsers).
4. Open:
   - App: `https://bookone.clossyan.com`
   - Docs: `https://bookone-docs.clossyan.com`
   - E2E: `https://bookone-e2e.clossyan.com` → target URL + credentials → Start

---

## Build-time vs pull (reminder)

| Step | Scope |
|------|--------|
| Git pull | Whole monorepo (once per stack update) |
| `docker build web` | ERP only, **no Chromium** |
| `docker build docs` | Static HTML from `content/docs` |
| `docker build e2e` | Playwright image + tests only |

Main system build time drops because **web no longer installs Chromium**.

---

## Cloudflare Tunnel checklist

1. Tunnel already routes to Traefik (or to host ports).
2. Public hostnames:
   - `bookone.clossyan.com` → `http://bookone-staging-traefik:80` or your Traefik entry  
     (or service URL as you already use)
3. Add:
   - `bookone-docs.clossyan.com`
   - `bookone-e2e.clossyan.com`
4. DNS CNAME each hostname to the tunnel.

If Traefik is on the Docker network, route tunnel to Traefik HTTP entrypoint; Host headers select the service.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Wrong host 404 | Check Traefik labels vs `WEB_HOST` / `DOCS_HOST` / `E2E_HOST` |
| `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` on `docs.bookone.clossyan.com` | Nested subdomain — free Cloudflare SSL does not cover it. Use `bookone-docs.clossyan.com` instead |
| Auth redirects wrong | `AUTH_URL` / `BETTER_AUTH_URL` must match public HTTPS app URL |
| E2E can’t reach app | Set `E2E_BASE_URL=https://bookone.clossyan.com` (public), not only `http://web:3100` if browser needs public cookies |
| Docs “Open app” wrong | Set `DOCS_APP_URL` |
| Web image still huge / slow | Confirm stack uses new `Dockerfile.web` (no chromium `apk`) |

---

## Local smoke of Dockerfiles (optional)

```bash
# From monorepo root
docker build -f docker/Dockerfile.web -t bookone-web:local .
docker build -f docker/Dockerfile.docs --build-arg DOCS_APP_URL=http://localhost:3100 -t bookone-docs:local .
docker build -f docker/Dockerfile.e2e -t bookone-e2e:local .
```
