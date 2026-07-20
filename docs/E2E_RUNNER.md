# BookOne E2E Runner (separate service)

Browser tests run **outside** the ERP app on their own URL/container so:

- Production web stays lean  
- You can start a full login + navigation suite with an admin email/password  
- Logs + a downloadable report are produced for engineering review  

## Architecture

```
You (admin)
  → http://localhost:3200  (or e2e.yourdomain)
       E2E Runner UI
         → Playwright (Chromium)
              → https://bookone… / staging web (target)
```

| Piece | Role |
|-------|------|
| `apps/web` | Real BookOne app under test |
| `apps/e2e-runner` | QA console + Playwright process |
| Report bundle | `report.md` + `run.log` + Playwright JSON (downloadable) |

## Local (dev)

```bash
# Terminal 1 — BookOne web (example)
cd apps/web && pnpm dev   # or production URL

# Terminal 2 — runner
cd apps/e2e-runner
pnpm install
npx playwright install chromium
pnpm dev
```

Open **http://localhost:3200**

1. Target app URL (e.g. `http://localhost:3000` or staging)  
2. Email + password for a real user  
3. **Start E2E run**  
4. Watch the log  
5. Download **report.md** / **full bundle** when finished  

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `E2E_RUNNER_PORT` | `3200` | Runner HTTP port |
| `E2E_BASE_URL` | `http://localhost:3100` | Default target app |
| `E2E_RUNNER_SECRET` | _(empty)_ | If set, API needs header `x-e2e-secret` or `?secret=` |

## Docker (optional, separate from web)

```bash
# From repo root — build runner image
docker build -t bookone-e2e -f apps/e2e-runner/Dockerfile apps/e2e-runner

docker run --rm -p 3200:3200 \
  -e E2E_BASE_URL=https://bookone.clossyan.com \
  -e E2E_RUNNER_SECRET=choose-a-secret \
  bookone-e2e
```

Do **not** put this service on the public internet without a secret (or VPN / IP allowlist).

## What the suite covers (v1)

1. Login with provided credentials  
2. Accounting routes: `/`, dashboard, transactions, journal, reports, accounts, reconciliation  
3. Parties / sales / purchase / inventory list shells  
4. Public `/docs` without login  

Extend tests under `apps/e2e-runner/tests/`.

## Sharing failures

Download the **full bundle** and share:

- `report.md`  
- `run.log`  
- `results.json`  
- Failure screenshots/traces listed under artifacts  

## Relation to ERP Health Check

| | E2E Runner | ERP Health Check |
|--|------------|------------------|
| UI | Real browser clicks | Server-side suite |
| Needs | Separate runner | Super admin in app |
| Best for | Login, navigation, regressions | Posting/stock math on staging |

Use **both**: Health Check for accounting integrity, E2E for “does the product still load and navigate.”
