# CoreGuard

CoreGuard is BookOne's financial integrity system. It makes it impossible, or immediately visible, when the books are wrong, whoever caused it.

**Read first:** [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) (v2.1, approved). It is the single CoreGuard spec and replaces every earlier one. Rule Zero at the top of [AGENTS.md](../../AGENTS.md) makes it binding for every change.

## Parts

| Part | What it is | Where it runs |
| --- | --- | --- |
| Database guards | Triggers that refuse bad writes (unbalanced, edits to posted rows, closed months, cross-company, duplicates) | PostgreSQL, migrations `060`–`067` |
| Posting service | `packages/ledger-core`, the one writer of ledger, stock and allocations | Web app |
| Sentinel | Read-only checks that recompute every important number a second way | `coreguard` container |
| Lab | Golden datasets, guard/flow/property/detector tests | CI and staging `coreguard` container |
| Guardrails | Rule Zero, CI gate, ratchets, waivers, CODEOWNERS | Repository and CI |
| Health check screen | Control Room → Health check (super admin) | Web app |

## Key files

- [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) — steps 0–12, reference, SQL (Appendix A), test record (Appendix B).
- [FINANCIAL_SURFACE.md](FINANCIAL_SURFACE.md) — paths whose changes need a "CoreGuard impact" section in the CHG.
- [../changes/TEMPLATE.md](../changes/TEMPLATE.md) — CHG template with the CoreGuard impact section.
- `waivers/CGW-NNNN.md` — owner-approved waivers (§6.6), added when needed.

## Status

Step 0 (Rule Zero and governance) is done in product 2.35.2. Later steps land one PR each, in order (§5).

## The earlier pilot lane

Before this guide, `pnpm coreguard:pilot` (`scripts/coreguard/*`, CI "Docker web image") ran a scoped pilot: a fixture oracle, permission contracts, a service/database slice and a Chromium slice (custom bank, bank-recon), plus the AgentBridge registry in `packages/agent-bridge/src/coreguard.ts`. It stays in place as-is; Step 1 uses it as a "Done when" check. Run it against a disposable database such as `bookone_test` (never staging or production); the full instructions are in [PILOT.md](PILOT.md). Its notes are in [coverage-matrix.md](coverage-matrix.md) and [setup-order.md](setup-order.md), and its fixtures in [fixtures/](fixtures/).
