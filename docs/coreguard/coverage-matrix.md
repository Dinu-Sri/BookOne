# Pilot CoreGuard coverage matrix

Identity is pinned per run: product `VERSION`, git SHA, latest `packages/db/migrations/*.sql`, fixture `custom-bank.v1`. Report browser, service/database, and fixture-only results separately. Required missing results are **blocked**.

| Module / journey | Layer | Status | Evidence |
| --- | --- | --- | --- |
| Custom bank 1101 create, zero opening | browser + service/database + fixture | required | `pnpm coreguard:pilot`; fixture `custom-bank.v1` |
| Opening 300 vs equity 3000 on 2026-01-15 | browser + service/database + fixture | required | same; opening event counted separately from transfer |
| Internal transfer 100 (1101 → 1100) on 2026-01-16 | browser + service/database + fixture | required | balances 200 / 100; spendable 300; external flow 0 |
| Viewer read-only CoA | browser + contract | required | no New account; `/accounts/new` has no Create account |
| Company isolation (alpha vs beta) | service/database | required | tenant B has no 1101 |
| Disposable target allowlist | fixture | required | refuses `bookone` db, clossyan, remote R2 |
| Chart CSV dry-run + opening rehearsal | fixture | required | `coreguard-setup-order.test.ts`; [setup-order.md](setup-order.md) |
| Sales settlement | — | not-run | later increment |
| Purchase settlement | — | not-run | later increment |
| Sales / purchase returns | — | not-run | later increment |
| Stock valuation | — | not-run | later increment |
| Bank reconciliations | — | not-run | later increment |
| Partial payment / refusal | — | not-run | later increment |
| Customer / supplier / staff advances | fixture (COA-01) | partial | COA-01 advance unit tests; full pilot journeys later |
| POS | — | not-run | kept visible; not in this pilot slice |
| Rental | — | not-run | kept visible; not in this pilot slice |
| AgentBridge unpaid domestic LKR service/expense bill | fixture / MemoryStore | required | `invoice-intake.v1.json`; `coreguard-invoice-intake.test.ts`; AB-05 |
| Live Codex / Claude invoice client | client | blocked | CoreGuard `codex-claude-live-clients` |
| Live OCR provider | provider | blocked | CoreGuard `live-ocr-provider` |
| Encrypted archive restore into a fresh company | recovery | LAST | not executed in this candidate; unit pointers stay in `archive-restore-pointers` |

Company flags stay as last observed on staging: Inbox on / draft-only off / posting-stop on. This matrix is not live-tenant acceptance.
