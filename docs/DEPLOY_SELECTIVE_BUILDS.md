# Selective deploys — rebuild only what you changed

Your **4 CPU / 8 GB** VPS is fine for running BookOne and for building **one** service.  
30–40 minutes happens when Portainer rebuilds **everything** (especially **e2e** Playwright).

## Principle

| What you changed | Rebuild |
|------------------|---------|
| ERP / cashbook / onboarding / packages | **web only** |
| E2E runner tests / `/e2e` console UI | **e2e only** |
| Docs nginx config | **docs only** (rare) |
| DB schema + ERP | **web** (migrations run in web entrypoint) |
| Nothing in e2e | **Do not rebuild e2e** |

Postgres / Redis / Minio / Traefik use public images — they are **not** rebuilt from your code.

---

## Automatic: “when I pull, only build what changed”

Portainer **cannot** decide this by itself — a full stack “Pull and redeploy” rebuilds every service that has a `build:` block.

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
   - **e2e** if `apps/e2e-runner/**` or `Dockerfile.e2e`
   - **docs** if docs nginx Dockerfile only
4. Saves new commit SHA so the next pull is incremental

| Flag | Effect |
|------|--------|
| `./scripts/smart-deploy.sh` | Auto from git diff |
| `--force-web` | Always rebuild web |
| `--force-e2e` | Always rebuild e2e |
| `--force-all` | Everything |

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
| `e2e` | + Playwright e2e host |
| `full` | docs + e2e |

### Portainer env

Stack → Environment variables:

```text
# Daily ERP development (recommended)
# COMPOSE_PROFILES=          ← leave unset or empty

# Need docs host
COMPOSE_PROFILES=docs

# Need E2E host for a test day
COMPOSE_PROFILES=docs,e2e

# Everything
COMPOSE_PROFILES=full
```

Redeploy after changing `COMPOSE_PROFILES`.

**Daily ERP work:** no e2e profile → stack update only builds **web** (and docs if enabled).  
**E2E day:** set `e2e` once, rebuild e2e, then leave the container running and only rebuild **web** for app fixes.

---

## Approach B — Rebuild one service (SSH)

On the VPS, in the Portainer stack project directory (or where compose lives):

```bash
# Only ERP (most common)
docker compose -f docker/docker-compose.staging.yml build web
docker compose -f docker/docker-compose.staging.yml up -d web

# Only E2E (when you changed apps/e2e-runner)
docker compose -f docker/docker-compose.staging.yml --profile e2e build e2e
docker compose -f docker/docker-compose.staging.yml --profile e2e up -d e2e
```

Avoid “Pull and redeploy entire stack” with rebuild-all unless you mean it.

---

## Approach C — Development mode (what to rebuild by phase)

| Development focus | COMPOSE_PROFILES | Rebuild |
|-------------------|------------------|---------|
| Entity tiers / cashbook / ERP | empty or `docs` | `web` only |
| Playwright / e2e console | add `e2e` | `e2e` when e2e code changes; `web` when app under test changes |
| Docs domain only | `docs` | rarely (nginx is tiny) |
| Release / first setup | `full` | all once |

---

## Dockerfile cache (web)

`Dockerfile.web` is layered so:

1. **pnpm install** re-runs only when package.json / lockfile change  
2. **Next build** re-runs when source changes  

That alone cuts many deploys from “full install + build” to “build only”.

---

## Optional later (fastest)

Build images in **GitHub Actions** → push GHCR → Portainer **only pulls**.  
Then VPS deploys are 1–3 minutes. Use when daily deploys matter more than simpler GitOps.

Until then: **profiles + rebuild one service + layered Dockerfile** is the right approach for your 4c/8G box.

---

## Checklist

- [ ] Daily: `COMPOSE_PROFILES` empty or `docs` only  
- [ ] Do not rebuild e2e unless `apps/e2e-runner` or e2e Dockerfile changed  
- [ ] Prefer `docker compose build web && up -d web` over full stack rebuild  
- [ ] Keep 8 GB RAM free of other heavy builds during `web` build  
