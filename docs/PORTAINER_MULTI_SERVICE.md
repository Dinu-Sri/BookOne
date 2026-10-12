# Portainer multi-service deploy (web + docs)

**One GitHub monorepo · one Portainer stack · selective app images (staging).**

> **Selective rebuilds / profiles:** see [`DEPLOY_SELECTIVE_BUILDS.md`](./DEPLOY_SELECTIVE_BUILDS.md). Browser tests live in https://github.com/Dinu-Sri/bookone-qa.

---

## Architecture

```
GitHub Dinu-Sri/BookOne (master)
        │
        ▼  Portainer stack pull (full repo once)
        │
        ├── build Dockerfile.web   → bookone-*-web   (ERP, no Chromium)
        └── build Dockerfile.docs  → bookone-*-docs  (static docs)
```

| Env | Compose file | Services |
|-----|--------------|----------|
| **Staging** | `docker/docker-compose.staging.yml` | web + docs + postgres + redis + minio + traefik + cloudflared |
| **Production** | `docker/docker-compose.prod.yml` | web + docs + postgres + redis + minio + traefik + cloudflared |

### Cloudflare SSL hostname rules (important)

Cloudflare **Universal SSL** (free) only covers:

- `clossyan.com`
- `*.clossyan.com` → e.g. `bookone.clossyan.com`

It does **not** cover nested hosts like `docs.bookone.clossyan.com` → browser error:

`ERR_SSL_VERSION_OR_CIPHER_MISMATCH`

| Use on staging (clossyan.com) | Avoid on free SSL |
|-------------------------------|-------------------|
| `bookone.clossyan.com` | `docs.bookone.clossyan.com` |
| `bookone-docs.clossyan.com` | `app.staging.bookone.…` multi-level |

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

---

## Staging environment variables (Portainer → Stack → Env)

### Hosts & URLs (new — required for multi-service)

| Variable | Example staging value | Purpose |
|----------|----------------------|---------|
| `WEB_HOST` | `bookone.clossyan.com` | Traefik Host rule for ERP |
| `DOCS_HOST` | `bookone-docs.clossyan.com` | Traefik Host rule for docs |
| `AUTH_URL` | `https://bookone.clossyan.com` | Auth callback base (must match browser URL) |
| `BETTER_AUTH_URL` | `https://bookone.clossyan.com` | Same as AUTH_URL if using Better Auth |
| `DOCS_APP_URL` | `https://bookone.clossyan.com` | “Open app” link on docs site |

### What each hostname must serve

| Host | Must hit container | You should see |
|------|--------------------|----------------|
| `bookone.clossyan.com` | **web** | ERP login / app |
| `bookone-docs.clossyan.com` | **docs** (nginx → web Fumadocs) | Same BookOne Docs UI as `/docs` on the app |

Retired: `bookone-e2e.clossyan.com` / inbuilt `/e2e`. Remove that tunnel hostname when ready. Tests run from bookone-qa.

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

### Services that use which env

| Env group | web | docs |
|-----------|:---:|:---:|
| DB / Redis / S3 / Auth | ✅ | — |
| `WEB_HOST` / AUTH_URL | ✅ | — |
| `DOCS_HOST` / DOCS_APP_URL | — | ✅ |
| Tunnel token | cloudflared | |

Docs images do **not** need `DATABASE_URL`. Browser-test credentials belong in bookone-qa, not this stack.

---

## Production Portainer stack (`bookone.lk` later)

| Field | Value |
|-------|--------|
| Compose path | `docker/docker-compose.prod.yml` |
| `WEB_HOST` | `app.bookone.lk` (or apex) |
| `DOCS_HOST` | `docs.bookone.lk` |
| `AUTH_URL` / `BETTER_AUTH_URL` | `https://app.bookone.lk` |
| `DOCS_APP_URL` | `https://app.bookone.lk` |

Until cutover you can keep production compose pointing at `bookone.clossyan.com` via the same `WEB_HOST` / `DOCS_HOST` vars.

---

## What to do after a code push

1. Push to `master`.
2. Portainer pulls repo (GitOps or manual **Pull and redeploy**).
3. Rebuild images:
   - **ERP change only** → rebuild **web** (fast, no Chromium).
   - **Docs content only** → rebuild **docs**.
4. Open:
   - App: `https://bookone.clossyan.com`
   - Docs: `https://bookone-docs.clossyan.com`
   - Browser tests: https://github.com/Dinu-Sri/bookone-qa against the named candidate

---

## Build-time vs pull (reminder)

| Step | Scope |
|------|--------|
| Git pull | Whole monorepo (once per stack update) |
| `docker build web` | ERP only, **no Chromium** |
| `docker build docs` | Nginx proxy → web Fumadocs (same UI as `/docs`) |

Main system build time stays low because **web does not install Chromium**.

---

## Cloudflare Tunnel checklist

**Recommended — one Public Hostname per service:**

| Public hostname | Type | URL |
|-----------------|------|-----|
| `bookone.clossyan.com` | HTTP | `http://web:3100` |
| `bookone-docs.clossyan.com` | HTTP | `http://docs:80` |

Remove `bookone-e2e.clossyan.com` when the inbuilt runner container is stopped. cloudflared must share Docker network `bookone_network` with web/docs (compose already does).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Wrong host 404 | Check Traefik labels vs `WEB_HOST` / `DOCS_HOST` |
| `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` on `docs.bookone.clossyan.com` | Nested subdomain — free Cloudflare SSL does not cover it. Use `bookone-docs.clossyan.com` instead |
| Auth redirects wrong | `AUTH_URL` / `BETTER_AUTH_URL` must match public HTTPS app URL |
| Docs “Open app” wrong | Set `DOCS_APP_URL` |
| Web image still huge / slow | Confirm stack uses new `Dockerfile.web` (no chromium `apk`) |

---

## Local smoke of Dockerfiles (optional)

```bash
# From monorepo root
docker build -f docker/Dockerfile.web -t bookone-web:local .
docker build -f docker/Dockerfile.docs --build-arg DOCS_APP_URL=http://localhost:3100 -t bookone-docs:local .
```
