# BookOne v2 — Portainer Stack Setup

> Deploy on your VPS via Portainer. The **web app image is built in GitHub Actions** and pulled from GHCR — the VPS does **not** compile Next.js.

---

## Overview (current flow)

```
git push origin master
    ↓
GitHub Actions: docker-publish.yml
    → docker build (ubuntu-latest + BuildKit cache)
    → push ghcr.io/dinu-sri/bookone-web:latest (+ sha tags)
    ↓
Portainer (GitOps webhook or manual update)
    → pull compose from GitHub
    → docker pull ghcr.io/dinu-sri/bookone-web:latest
    → recreate bookone-web
    → entrypoint: migrate + next start
```

**You should not build the web image on the VPS.** That is what made deploys take ~30 minutes.

| Component | Where it builds |
|-----------|-----------------|
| `bookone-web` | GitHub Actions → GHCR |
| postgres / redis / minio / traefik / cloudflared | Public Docker Hub images (pull only) |

---

## Step 1: Provision VPS

Requirements:

- Ubuntu 22.04 or 24.04  
- 2–4 vCPU, 4–8GB RAM is enough now that builds are off-box  
- Docker + Portainer CE  

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

docker volume create portainer_data
docker run -d -p 8000:8000 -p 9443:9443 --name portainer \
  --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

Access Portainer at `https://VPS_IP:9443`.

---

## Step 2: GHCR package visibility (required once)

After the first successful **Docker Publish** workflow:

1. GitHub → your profile/org → **Packages** → `bookone-web`  
2. **Package settings** → either:
   - **Change visibility → Public** (simplest for Portainer), or  
   - Keep **Private** and add a registry login in Portainer (below)

### If the package stays private

1. Create a GitHub PAT with `read:packages` (and `write:packages` only if needed).  
2. Portainer → **Registries** → **Add registry** → **Custom**  
   - Name: `ghcr`  
   - Registry URL: `ghcr.io`  
   - Username: your GitHub username  
   - Password: the PAT  
3. Ensure the stack / environment can pull with that registry.

---

## Step 3: Create / update Portainer stack

1. **Stacks** → **Add stack** (or edit existing `bookone`)  
2. Name: `bookone`  
3. Build method: **Repository**  
4. Repository URL: `https://github.com/Dinu-Sri/BookOne.git`  
5. Reference: `refs/heads/master`  
6. Compose path: **`docker/docker-compose.prod.yml`**  
7. Enable **GitOps updates** (webhook recommended)  
8. Enable **Re-pull image** / pull latest when stack updates  

**Important:** The web service uses `image:`, not `build:`.  
If Portainer still tries to build, your stack is on an old compose file — re-pull the repo compose.

Optional env to pin a version:

| Variable | Example | Purpose |
|----------|---------|---------|
| `BOOKONE_WEB_IMAGE` | `ghcr.io/dinu-sri/bookone-web:latest` | Default |
| `BOOKONE_WEB_IMAGE` | `ghcr.io/dinu-sri/bookone-web:sha-abc1234` | Rollback / pin |

---

## Step 4: Environment variables

Same as before (DB, auth, Redis, S3/MinIO, tunnel token, etc.). See historical tables below or `.env.example`.

Minimum for web to start:

- `DATABASE_URL`  
- `DB_USER` / `DB_PASSWORD` / `DB_NAME` (postgres service)  
- Auth secrets / URL your app expects  
- `CLOUDFLARE_TUNNEL_TOKEN` if using cloudflared in the stack  

### Database

| Variable | Example |
|----------|---------|
| `DB_USER` | `bookone` |
| `DB_PASSWORD` | strong secret |
| `DB_NAME` | `bookone` |
| `DATABASE_URL` | `postgres://bookone:PASSWORD@postgres:5432/bookone` |

### Redis / S3 / Tunnel

| Variable | Example |
|----------|---------|
| `REDIS_URL` | `redis://redis:6379` |
| `S3_ENDPOINT` | `http://minio:9000` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` | your values |
| `CLOUDFLARE_TUNNEL_TOKEN` | from Zero Trust tunnel |
| `LETSENCRYPT_EMAIL` | for Traefik ACME (if used) |

---

## Step 5: Deploy order

1. Push to `master` (or run **Docker Publish** workflow manually).  
2. Wait for **Docker Publish** to finish green on GitHub Actions.  
3. Confirm package exists: `ghcr.io/dinu-sri/bookone-web:latest`.  
4. In Portainer: **Update the stack** (or let GitOps webhook fire).  
5. Confirm `bookone-web` pulls the new digest and starts.  

Typical time after the image exists: **a few minutes** (pull + migrate + start), not ~30 minutes.

---

## Step 6: Verify

```bash
curl -I https://bookone.clossyan.com
# bookone-web logs should show:
# === BookOne — Startup Init ===
# [1/3] ...
# [3/3] Starting BookOne web...
```

---

## Database migrations (on container start)

`docker/entrypoint.sh` still runs on every web start:

1. Wait for Postgres + `drizzle-kit push`  
2. `scripts/init-db.ts` (SQL migrations + seed)  
3. `next start` on port 3100  

New migration files ship **inside the GHCR image**. You do not need to rebuild on the VPS; you need a **new image** from Actions that includes those files.

---

## GitOps: Auto-deploy on push

1. Portainer stack → **GitOps updates** → copy webhook URL  
2. GitHub → Repo → **Settings → Webhooks** → paste URL, `push` events  
3. Flow becomes: push → Actions builds image → webhook updates stack → pull image  

**Note:** Race condition: webhook may fire before the image finishes publishing. Prefer either:

- Wait for Actions green, then manual **Pull and redeploy**, or  
- Add a small delay / second webhook from the workflow (optional later), or  
- Use a deploy workflow step that calls Portainer’s webhook **after** push succeeds  

Recommended for reliability: **Portainer webhook called at the end of `docker-publish.yml`** (optional secret `PORTAINER_WEBHOOK_URL`).

---

## Optional: trigger Portainer after image push

In GitHub repo secrets, add:

- `PORTAINER_WEBHOOK_URL` — stack webhook URL from Portainer  

The publish workflow can POST to it after a successful push (see workflow file if enabled).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Portainer builds for 30 minutes | Stack still using old compose with `build:`. Update compose path / re-pull git. Web must be `image: ghcr.io/...` only. |
| `pull access denied` for GHCR | Make package public or add GHCR registry credentials in Portainer. |
| App not updating | Confirm Actions published a new digest; force pull (`pull_policy: always`); clear Cloudflare cache if HTML is stale. |
| Wrong services only (no web) | Compose path must be `docker/docker-compose.prod.yml`. |
| Migrate errors | Check `DATABASE_URL` password matches `DB_PASSWORD`. |

---

## Rollback

```bash
# In Portainer stack env:
BOOKONE_WEB_IMAGE=ghcr.io/dinu-sri/bookone-web:sha-<old-short-sha>
# Update stack / recreate web container
```

Find tags under GitHub → Packages → `bookone-web` → Versions.

---

## Quick secrets

```bash
openssl rand -base64 32   # auth / db / cron / minio
```

---

*Last updated: 2026-07-20 — CI builds image; Portainer pulls only.*
