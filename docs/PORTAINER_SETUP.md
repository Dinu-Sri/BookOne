# BookOne v2 — Portainer Stack Setup

> **How to deploy on your VPS via Portainer using the GitHub repo and environment variables.**

---

## Overview

The deployment flow:

```
GitHub Repo (Dinu-Sri/BookOne, master branch)
    ↓  Portainer pulls docker-compose.prod.yml directly from repo
    ↓  Traefik routes bookone.clossyan.com → Next.js container
    ↓  Cloudflared tunnel → Cloudflare → public internet
```

**You do NOT need to build Docker images on GitHub Actions.** Portainer builds them directly from the repo. This is simpler and avoids needing a container registry.

---

## Step 1: Provision VPS

Requirements:
- Ubuntu 22.04 or 24.04
- 4 vCPU, 8GB RAM, 50GB SSD (minimum)
- Docker + Portainer CE installed

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Portainer CE
docker volume create portainer_data
docker run -d -p 8000:8000 -p 9443:9443 --name portainer \
  --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest

# Access Portainer at https://VPS_IP:9443
```

---

## Step 2: Create Portainer Stack

In Portainer:
1. Go to **Stacks** → **Add stack**
2. Name: `bookone`
3. Build method: **Repository**
4. Repository URL: `https://github.com/Dinu-Sri/BookOne.git`
5. Repository reference: `refs/heads/master`
6. Compose path:
   - **Staging (web + docs + e2e):** `docker/docker-compose.staging.yml`
   - **Production (web + docs only):** `docker/docker-compose.prod.yml`
7. Enable **GitOps updates** (auto-pull on webhook)

> **Multi-service hosts & env tables:** see [`PORTAINER_MULTI_SERVICE.md`](./PORTAINER_MULTI_SERVICE.md).

---

## Step 3: Environment Variables (Add in Portainer Stack)

Below each variable, I explain what it is and how to get/generate it.

### Database

| Variable | Value | How to Get |
|----------|-------|------------|
| `DB_HOST` | `postgres` | Internal Docker service name |
| `DB_PORT` | `5432` | Default |
| `DB_USER` | `bookone` | Choose a username |
| `DB_PASSWORD` | `your-strong-password` | Generate: `openssl rand -base64 32` |
| `DB_NAME` | `bookone` | Choose a database name |
| `DATABASE_URL` | `postgres://bookone:your-strong-password@postgres:5432/bookone` | Build from above values |

### Authentication

| Variable | Value | How to Get |
|----------|-------|------------|
| `BETTER_AUTH_SECRET` | `output-of-openssl` | Generate: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `https://bookone.clossyan.com` | Your domain |
| `GOOGLE_CLIENT_ID` | `...apps.googleusercontent.com` | Google Cloud OAuth client |
| `GOOGLE_CLIENT_SECRET` | `...` | Google Cloud OAuth client secret |

### Redis

| Variable | Value | How to Get |
|----------|-------|------------|
| `REDIS_URL` | `redis://redis:6379` | Internal Docker service name |

### File Storage (MinIO / S3)

| Variable | Value | How to Get |
|----------|-------|------------|
| `S3_ENDPOINT` | `http://minio:9000` | Internal Docker service name |
| `S3_ACCESS_KEY` | `minioadmin` | Change in production! |
| `S3_SECRET_KEY` | `minioadmin` | Change in production! `openssl rand -base64 32` |
| `S3_BUCKET` | `bookone` | Bucket will be auto-created |

### AI Assistant (OpenAI)

| Variable | Value | How to Get |
|----------|-------|------------|
| `OPENAI_API_KEY` | `sk-...` | Get from https://platform.openai.com/api-keys |
| `OPENAI_MODEL` | `gpt-4o-mini` | Cost-effective default |

### Observability

| Variable | Value | How to Get |
|----------|-------|------------|
| `SENTRY_DSN` | `https://...@sentry.io/...` | Create project at https://sentry.io |
| `NEXT_PUBLIC_POSTHOG_KEY` | `phc_...` | Create project at https://app.posthog.com |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://app.posthog.com` | Or `https://eu.posthog.com` for EU |

### Cron / Scheduled Jobs

| Variable | Value | How to Get |
|----------|-------|------------|
| `CRON_SECRET` | `output-of-openssl` | Generate: `openssl rand -base64 32` |

### Email (Resend)

| Variable | Value | How to Get |
|----------|-------|------------|
| `RESEND_API_KEY` | `re_...` | Get from https://resend.com |
| `EMAIL_FROM` | `BookOne <noreply@bookone.clossyan.com>` | Your sender address |

### TLS / Let's Encrypt

| Variable | Value | How to Get |
|----------|-------|------------|
| `LETSENCRYPT_EMAIL` | `your-email@gmail.com` | Your email for Let's Encrypt notifications |

### Cloudflare Tunnel

| Variable | Value | How to Get |
|----------|-------|------------|
| `CLOUDFLARE_TUNNEL_TOKEN` | `eyJ...` | Get from Cloudflare Zero Trust → Tunnels → Create Tunnel |

---

## Step 4: Set Up Cloudflare Tunnel

1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/)
2. **Networks** → **Tunnels** → **Create a tunnel**
3. Name: `bookone`
4. Choose **Docker** as environment — copy the token (That's your `CLOUDFLARE_TUNNEL_TOKEN`)
5. **Public Hostname** tab:
   - Subdomain: `bookone`
   - Domain: `clossyan.com`
   - Type: `HTTP`
   - URL: `traefik:80`
6. Save — now `bookone.clossyan.com` tunnels to your VPS

**Important:** The `docker-compose.prod.yml` already has the `cloudflared` service configured. You just need to set `CLOUDFLARE_TUNNEL_TOKEN` in the Portainer stack environment.

---

## Step 5: Deploy

1. In Portainer, click **Deploy the stack**
2. Wait for all services to show **Running** (green)
3. Check logs if anything fails: Portainer → Stacks → bookone → click a container → Logs

---

## Step 6: Verify

```bash
# Check if the app responds
curl -I https://bookone.clossyan.com
# Should return HTTP 200

# Check Traefik dashboard (optional)
curl http://VPS_IP:8080
```

---

## Database migrations (automatic on every web start)

You do **not** need to SSH and run migrations manually.

When Portainer pulls / rebuilds and the `bookone-web` container starts, `docker/entrypoint.sh` runs automatically:

1. **Wait for Postgres**
2. **`drizzle-kit push`** — applies Drizzle schema (tables/columns from `packages/db/src/schema`)
3. **`scripts/init-db.ts`** — applies every `packages/db/migrations/*.sql` only (RLS + schema SQL). **No demo seed.**
4. **Start Next.js** on port 3100

In Portainer → Containers → `bookone-web` → **Logs**, you should see:

```
=== BookOne — Startup Init ===
[1/3] Waiting for Postgres & pushing Drizzle schema...
[2/3] SQL migrations — no seed...
Applied 012_sales_tax_invoice.sql.
Migrations complete (no seed data).
[3/3] Starting BookOne web...
```

Re-applying migrations is safe: SQL uses `IF NOT EXISTS` / policy checks.

**Requirement:** GitOps must **rebuild** the web image (not only restart an old image). In the stack, keep “Re-pull image” / rebuild from Dockerfile enabled so new migration files are inside the image.

---

## GitOps: Auto-Deploy on Push

Portainer can auto-update when you push to GitHub:

1. In Portainer, go to your `bookone` stack
2. Enable **GitOps updates**
3. Copy the **Webhook URL**
4. Go to GitHub → Repo → Settings → Webhooks → Add webhook
5. Paste the webhook URL, content type: `application/json`
6. Just the `push` event
7. Now every `git push origin master` triggers Portainer to pull + redeploy!

---

## Quick Reference: Generate All Secrets

Run these commands and copy the outputs:

```bash
# Auth secret
openssl rand -base64 32

# DB password
openssl rand -base64 32

# MinIO secret key
openssl rand -base64 32

# Cron secret
openssl rand -base64 32
```

---

*Last updated: 2026-06-14*
