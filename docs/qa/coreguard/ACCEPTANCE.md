# Pilot CoreGuard custom-bank acceptance

Status: ready-for-QA. This is not live-tenant CoA or live Codex/Claude acceptance.

- Product version: **2.13.3** on `feat/v2133-pilot-coreguard-custom-bank` from origin/master `5a96baf6691809fcbced7c246bdc25307d379fb7` (v2.13.2).
- Command: `pnpm coreguard:pilot` against disposable `bookone_test`. CI step **Pilot custom-bank** in Docker web image CoreGuard job.
- Fixture: `docs/coreguard/fixtures/custom-bank.v1.json`.

## Independent expected values (integer cents)

| Event | 1101 | 1100 | Spendable 10xx+11xx | External money in/out |
| --- | ---: | ---: | ---: | ---: |
| After create | 0 | 0 | 0 | 0 / 0 |
| After opening 2026-01-15 | 30000 | 0 | 30000 | 0 / 0 |
| After transfer 2026-01-16 | 20000 | 10000 | 30000 | 0 / 0 |

Opening Dr 1101 300 / Cr 3000 300. Transfer 100 from 1101 to 1100. Journal of the transfer is `internal_transfer`. Opening is `funding`. Viewer cannot create accounts or record Simple Entry.

## Layers

- Fixture oracle: `packages/accounting/test/coreguard-custom-bank-oracle.test.ts`
- Contracts: `packages/auth/test/coreguard-allowlist.test.ts`, `coreguard-custom-bank-contract.test.ts`
- Service/database: `packages/auth/test/coreguard-custom-bank-postgres.test.ts` (skipped unless `COREGUARD_PILOT=1` or `COREGUARD_REQUIRE_POSTGRES=1`)
- Browser: `apps/web/e2e/coreguard-custom-bank.spec.ts` via `playwright.coreguard.config.ts`. Local `pnpm coreguard:pilot` with `COREGUARD_PILOT_BROWSER=1` PASS: Owner custom-bank 11.0s, Viewer 2.2s (2 passed).

## Confirmed product fix retained

Simple Entry From/To tenders used a hardcoded `1000/1100/1200/1300` list, so custom bank 1101 could not be chosen. The filter now uses `isLiquidTenderCode` and still includes 1300 for invoice/bill settlement.

## Not run / blocked

See [coverage-matrix.md](../../coreguard/coverage-matrix.md). Encrypted restore is LAST. Live Codex/Claude stay blocked. POS and rental stay visible and not-run.

Keep existing company flags. Preserve the saved Codex `bookone` entry and original grant. Do not replay consumed codes `4b22d15c` or `7bf93de1`.
