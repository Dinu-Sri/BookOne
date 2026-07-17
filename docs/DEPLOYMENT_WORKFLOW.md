# BookOne v2 — Deployment Workflow

**How code goes from local VS Code → GitHub → production VPS via Portainer**

---

## Infrastructure

| Component | Location | Notes |
|-----------|----------|-------|
| **Domain** | `bookone.clossyan.com` | Managed via Cloudflare |
| **Tunnel** | Cloudflare Tunnel (`cloudflared`) | Routes traffic to VPS without opening ports |
| **VPS** | Linux (Ubuntu 22.04+) | Docker + Portainer CE |
| **Reverse Proxy** | Traefik (in Docker) | Auto-SSL via Let's Encrypt, routes to containers |
| **App Container** | `bookone-web` | Next.js (standalone output) |
| **DB Container** | `bookone-postgres` | PostgreSQL 16 |
| **Cache Container** | `bookone-redis` | Redis 7 |
| **Storage Container** | `bookone-minio` | MinIO S3-compatible |

---

## Deployment Method: Portainer GitOps (Direct from GitHub Repo)

```
Developer pushes to GitHub master branch
    ↓
GitHub sends webhook to Portainer (or Portainer polls on schedule)
    ↓
Portainer pulls latest from GitHub, rebuilds Docker images, redeploys stack
    ↓
Traefik detects new container, routes traffic
    ↓
Cloudflare Tunnel → Traefik → Next.js container → bookone.clossyan.com
```

**Key:** You do NOT need a container registry (Docker Hub, GHCR). Portainer builds images directly from the `Dockerfile` in the repo. The `docker-compose.prod.yml` uses `build:` directives, not pre-built images.

### Portainer Stack Configuration

1. Stack type: **Repository**
2. Repository URL: `https://github.com/Dinu-Sri/BookOne.git`
3. Reference: `refs/heads/master`
4. Compose path: `docker/docker-compose.prod.yml`
5. Environment variables: Set in Portainer stack UI (see `docs/PORTAINER_SETUP.md`)

See **[PORTAINER_SETUP.md](./PORTAINER_SETUP.md)** for the complete step-by-step guide with all 20+ environment variables.

---

## Deployment Steps (Checklist)

### Pre-Deploy (Local)

```bash
# 1. Install dependencies
pnpm install

# 2. Lint
pnpm lint

# 3. Type check
pnpm typecheck

# 4. Build
pnpm build

# 5. Test
pnpm test

# 6. E2E (optional, before major releases)
pnpm test:e2e
```

### Deploy

```bash
# 1. Commit and push
git add -A
git commit -m "type: description"
git push origin master

# 2. Trigger Portainer redeploy (auto via webhook, or manual)
#    - Go to Portainer → Stacks → bookone → Redeploy

# 3. Verify
curl -I https://bookone.clossyan.com
# Should return HTTP 200

# 3b. Run the app smoke test
# See docs/PRODUCTION_SMOKE_TEST.md

# 4. Check logs
ssh user@vps
docker compose -f /opt/bookone/docker/docker-compose.prod.yml logs -f --tail=50
```

### Post-Deploy (schema changes)

**No manual migrate step.** On every `bookone-web` container start, `docker/entrypoint.sh` runs:

1. `pnpm --filter @bookone/db db:migrate` (`drizzle-kit push`)
2. `pnpm exec tsx scripts/init-db.ts` (all `packages/db/migrations/*.sql` + seed)

After a Portainer GitOps pull/rebuild, check web logs for `Migrations ok` and `Init complete`.

Only if logs show a DB error (wrong `DATABASE_URL`, etc.) fix env and redeploy the web service.

### Post-Deploy (if new env vars)

```bash
# 1. Update .env on VPS
ssh user@vps
nano /opt/bookone/.env

# 2. Restart container
docker compose -f docker/docker-compose.prod.yml restart web
```

---

## Environment Variables (VPS)

The `.env` file on the VPS at `/opt/bookone/.env` contains all production secrets. Template in `.env.example` (this repo). NEVER commit actual values.

---

## Cloudflare Tunnel

Cloudflare Tunnel runs as a separate Docker container (`cloudflared`) on the VPS. It creates a secure tunnel from Cloudflare's edge to the Traefik reverse proxy.

```
Internet → Cloudflare → cloudflared tunnel → Traefik → bookone-web:3000
```

The tunnel configuration maps `bookone.clossyan.com` to the internal Traefik service.

---

## Backup Strategy

| What | How | Frequency |
|------|-----|-----------|
| PostgreSQL | `pg_dump` → MinIO bucket | Daily (cron) |
| Uploaded files | MinIO mirror to secondary bucket | Daily |
| Docker configs | Git repo (already backed up) | On push |

### Manual Backup

```bash
ssh user@vps
docker compose -f docker/docker-compose.prod.yml exec postgres \
  pg_dump -U bookone bookone > /opt/backups/bookone_$(date +%Y%m%d).sql
```

### Restore

```bash
ssh user@vps
docker compose -f docker/docker-compose.prod.yml exec -T postgres \
  psql -U bookone bookone < /opt/backups/bookone_20260614.sql
```

---

## Rollback Procedure

```bash
# 1. Revert commit locally
git revert <bad-commit-hash>
git push origin main

# 2. Redeploy via Portainer

# 3. If database migration was part of the bad change:
ssh user@vps
cd /opt/bookone
docker compose -f docker/docker-compose.prod.yml exec web pnpm db:rollback
```

---

*Last updated: 2026-06-14*
