# CoreGuard pilot lane

Single local and CI command for the integrated BookOne lane:

```bash
pnpm coreguard:pilot
```

The runner pushes the Drizzle schema, applies SQL migrations, seeds disposable companies, runs fixture/service tests, optionally drives the real app in Chromium, then deletes the seed. It pins the product `VERSION`, git SHA, latest SQL migration, and fixture `custom-bank.v1`. This matches the web image startup (`drizzle-kit push --force` then `scripts/init-db.ts`) and never uses the Clossyan demo seed.

## Disposable targets

Set `DATABASE_URL` to a **test** database. The default local `bookone` database is refused.

```bash
createdb bookone_test
# PowerShell
$env:DATABASE_URL = "postgres://bookone:bookone@localhost:5432/bookone_test"
$env:AUTH_SECRET = "test-secret-for-ci-only"
$env:AUTH_URL = "http://127.0.0.1:3000"
$env:BETTER_AUTH_URL = "http://127.0.0.1:3000"
pnpm coreguard:pilot
```

Allowed database names match `test`, `pilot`, `coreguard`, or `ci`. Hosts must be local (`localhost`, `127.0.0.1`, `postgres`, `db`). Staging/production hosts and remote object storage are refused. If `S3_ENDPOINT` is set it must be local MinIO; the bucket must be a test name such as `bookone-test`.

## Browser

Without `COREGUARD_PILOT_BROWSER=1` the runner still migrates, seeds, and runs oracle/contract/postgres tests. Set the flag (CI does) to build `apps/web` and drive Chromium through `playwright.coreguard.config.ts`. Local re-runs may set `COREGUARD_SKIP_WEB_BUILD=1` only after a successful same-session `next build`; CI always builds.

Seed passwords live only in gitignored `.local/coreguard-run.json`.

## Layers

| Layer | Command | What it proves |
| --- | --- | --- |
| Fixture oracle | always | Independent integer-cent expected values |
| Permission/isolation contracts | always | Owner write, Viewer read-only, 11xx Simple Entry tenders, CI wiring |
| Service/database | `COREGUARD_PILOT=1` | Create 1101, opening 300, transfer 100, journal class, company isolation |
| Browser | `COREGUARD_PILOT_BROWSER=1` | Same slice through the real app |

A required missing result is **blocked**. First failures are kept. This lane does not certify live tenant CoA, live Codex/Claude, or encrypted restore.

See [coverage-matrix.md](coverage-matrix.md) and [setup-order.md](setup-order.md).
