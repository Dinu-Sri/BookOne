# Selective deploys — rebuild only what you changed

Your **4 CPU / 8 GB** VPS is sized to **run** BookOne. Next.js compile happens in GitHub Actions; the VPS **pulls** `ghcr.io/dinu-sri/bookone-web:latest`.

## Principle

| What you changed | Rebuild |
|------------------|---------|
| ERP / cashbook / onboarding / packages | **web only** |
| Docs nginx config | **docs only** (rare) |
| DB schema + ERP | **web** (migrations run in web entrypoint) |
| Browser tests | **bookone-qa** — do not rebuild an ERP e2e image |

Postgres / Redis / Minio / Traefik use public images — they are **not** rebuilt from your code.

---

## Automatic: “when I pull, only build what changed”

Portainer **cannot** decide this by itself — a full stack “Pull and redeploy” rebuilds every service that still has a `build:` block (docs nginx if that profile is on). `web` has no `build:`; it only pulls GHCR.

Use **`scripts/smart-deploy.sh`** on the VPS instead:

```bash
ssh you@vps
cd /path/to/BookOne          # git clone of the repo
git pull origin master
chmod +x scripts/smart-deploy.sh
./scripts/smart-deploy.sh
```

What it does:

1. `git pull`
2. Compares files changed since **last successful deploy** (file `.deploy-last-sha`)
3. Builds only:
   - **web** if `apps/web/**`, `packages/**`, `Dockerfile.web`, lockfiles, …
   - **docs** if docs nginx Dockerfile only
4. Saves new commit SHA so the next pull is incremental

| Flag | Effect |
|------|--------|
| `./scripts/smart-deploy.sh` | Auto from git diff |
| `--force-web` | Always rebuild web |
| `--force-docs` | Always rebuild docs |
| `--force-all` | web + docs |

**Current development focus (entity tiers / cashbook):** almost every commit only touches `apps/web` + `packages` → script rebuilds **web only**.

### Optional: cron or alias after push

```bash
# On VPS crontab every 5 min (or after you push):
*/5 * * * * cd /home/you/BookOne && git pull -q && ./scripts/smart-deploy.sh >> /var/log/bookone-deploy.log 2>&1
```

Or after each laptop push, SSH one line:

```bash
ssh vps 'cd ~/BookOne && git pull && ./scripts/smart-deploy.sh'
```

---

## Approach A — Profiles (turn services on/off)

Staging compose uses **Compose profiles**:

| Profile | Services |
|---------|----------|
| *(empty)* | web + infra only (**fastest daily path**) |
| `docs` | + docs host |
| `full` | docs |

### Portainer env

Stack → Environment variables:

```text
# Daily ERP development (recommended)
# COMPOSE_PROFILES=          ← leave unset or empty

# Need docs host
COMPOSE_PROFILES=docs
```

Redeploy after changing `COMPOSE_PROFILES`.

**Daily ERP work:** stack update pulls **web** from GHCR (and builds docs nginx only if that profile is on). Browser tests run from https://github.com/Dinu-Sri/bookone-qa.

---

## Approach B — Rebuild one service (SSH)

On the VPS, in the Portainer stack project directory (or where compose lives):

```bash
# Only ERP (most common) — pull the GHCR image, do not build on the VPS
docker compose -f docker/docker-compose.staging.yml pull web
docker compose -f docker/docker-compose.staging.yml up -d web
```

Avoid “Pull and redeploy entire stack” unless you mean to refresh infra images too.

---

## Approach C — Development mode (what to rebuild by phase)

| Development focus | COMPOSE_PROFILES | What the VPS does |
|-------------------|------------------|---------|
| Entity tiers / cashbook / ERP | empty or `docs` | pull `web` from GHCR |
| Docs domain only | `docs` | rarely (nginx is tiny) |
| Release / first setup | `full` | pull web + build docs once |

---

## Dockerfile cache (web)

`Dockerfile.web` is layered so:

1. **pnpm install** re-runs only when package.json / lockfile change  
2. **Next build** re-runs when source changes  

That alone cuts many deploys from “full install + build” to “build only”.

---

## Current path (fastest): GHCR pull

GitHub Action **Docker web image** builds `docker/Dockerfile.web` and pushes `ghcr.io/dinu-sri/bookone-web:latest`. Portainer only pulls.

1. Push to `master` (or run the workflow manually).
2. Wait until **Docker web image** is green.
3. Portainer Update with Re-pull ON.

VPS time is image pull + container start + entrypoint (`drizzle-kit push` then `init-db.ts`), not `pnpm install` / `next build`.

If pull returns 401, set the GHCR package Public or add a `read:packages` PAT in Portainer Registries. See `docs/PORTAINER_SETUP.md`.

---

## Checklist

- [ ] Daily: `COMPOSE_PROFILES` empty or `docs` only  
- [ ] Wait for **Docker web image** green, then Portainer Update (Re-pull ON)  
- [ ] Browser tests: bookone-qa, not an ERP e2e image  
