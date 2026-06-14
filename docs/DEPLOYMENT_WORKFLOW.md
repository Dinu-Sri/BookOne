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

## Deployment Method: GitOps Webhook

```
Developer pushes to GitHub main
    ↓
GitHub sends webhook to VPS
    ↓
Portainer redeploys stack (pulls latest, rebuilds if needed)
    ↓
Traefik detects new container, routes traffic
    ↓
Cloudflare Tunnel → Traefik → Next.js container
```

### Portainer Stack Configuration

Stack is defined in `docker/docker-compose.prod.yml` and managed as a **Portainer Stack** pointed at the GitHub repo.

### Alternative: Manual Pull (if webhook fails)

```bash
ssh user@vps
cd /opt/bookone
git pull origin main
docker compose -f docker/docker-compose.prod.yml up -d --build
```

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
git push origin main

# 2. Trigger Portainer redeploy (auto via webhook, or manual)
#    - Go to Portainer → Stacks → bookone → Redeploy

# 3. Verify
curl -I https://bookone.clossyan.com
# Should return HTTP 200

# 4. Check logs
ssh user@vps
docker compose -f /opt/bookone/docker/docker-compose.prod.yml logs -f --tail=50
```

### Post-Deploy (if schema changes)

```bash
# Run migrations on VPS
ssh user@vps
cd /opt/bookone
docker compose -f docker/docker-compose.prod.yml exec web pnpm db:migrate
```

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
