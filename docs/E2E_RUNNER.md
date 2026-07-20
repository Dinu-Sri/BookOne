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

## One-time setup (server / local)

The web app spawns tests from `apps/e2e-runner`. Install browsers once on the machine that runs Next:

```bash
cd apps/e2e-runner
npm install
npx playwright install chromium
```

In Docker, that path is inside the web image (`/app/apps/e2e-runner`). If runs fail with “browser not found”, install Chromium in the image or on the host.

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
