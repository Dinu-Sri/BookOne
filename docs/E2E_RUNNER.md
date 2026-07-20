# BookOne E2E at `/e2e`

Browser tests are started from the **main BookOne app** at:

```
https://YOUR-BOOKONE-HOST/e2e
```

Examples:

- Local: `http://localhost:3000/e2e` (or whatever port `next dev` uses)  
- Production/staging: `https://bookone.clossyan.com/e2e`  

No BookOne login is required to open `/e2e`.  
No runner secret.

## How to run a suite

1. Open **`/e2e`** in the browser.  
2. **Target app URL** defaults to the same site (you can leave it).  
3. Enter a **BookOne user email + password**.  
4. Click **Start E2E run**.  
5. Watch the log.  
6. When finished, download **report.md** / **log** / **full bundle**.

Playwright uses those credentials to sign in at `/login` and walk core screens.

## Browsers

| Environment | Browser |
|-------------|---------|
| **Docker / Portainer image** | Alpine **system Chromium** is installed in `Dockerfile.web` and wired via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` |
| **Local `next dev`** | Run once: `cd apps/e2e-runner && pnpm exec playwright install chromium` |

If a run log says `Executable doesn't exist at .../ms-playwright/...`, the container image is old — **rebuild** the web image after pulling the Chromium Dockerfile change (not only restart).

## API (no secret)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/e2e/runs` | Start run `{ email, password, baseUrl? }` |
| `GET` | `/api/e2e/runs/:id` | Status + log |
| `GET` | `/api/e2e/runs/:id/report` | Download report.md |
| `GET` | `/api/e2e/runs/:id/log` | Download log |
| `GET` | `/api/e2e/runs/:id/download` | Full bundle |

## Security note

`/e2e` is public so you can start runs without logging into the shell. Anyone who can reach the URL can attempt runs with credentials they already know. Prefer staging, or put `/e2e` behind your VPN/firewall if needed.

## Optional standalone runner

`apps/e2e-runner` can still run on port 3200 (`pnpm --dir apps/e2e-runner dev`) for local isolation. Day-to-day use is **`/e2e` on the main app**.
