# GitHub Copilot Instructions for BookOne v2

> These instructions are for GitHub Copilot in VS Code. They sync with AGENTS.md.

## Critical Rules

1. **Production-first mindset.** Never hardcode localhost URLs, local file paths, passwords, API keys, or secrets. Use `process.env.*` for all environment-specific values.

2. **Never bypass tenant isolation.** Every DB query must be tenant-scoped. `tenant_id` comes from the authenticated session, NEVER from client input.

3. **Never delete data — void it.** Set `voided = true` instead of `DELETE`.

4. **Every financial mutation MUST create journal entries.** The `generateJournalEntry()` function must be called on every create/update/void of transactions.

5. **Use database transactions for multi-table mutations.** If one step fails, all roll back.

6. **Schema changes are additive migrations only.** Never modify existing migration files. Create new ones.

7. **Audit everything.** Every financial data mutation goes to `audit_log`.

8. **Respect period locks.** Locked periods cannot be directly edited — use reversals.

## When Making Changes

Document in commit message:
- Does this need new env vars? → Update `.env.example`
- Does this need a DB migration? → Create migration file
- Does this need container rebuild? → Note in PR/commit
- Does this need worker restart? → Note in PR/commit

## Architecture

- Monorepo with Turborepo + pnpm
- `apps/web/` — Next.js 15 App Router
- `packages/db/` — Drizzle ORM schemas
- `packages/accounting/` — Journal engine, inference engine
- `packages/auth/` — Auth.js v5
- `packages/ui/` — shadcn/ui components
- `packages/modules/` — Module registry

## Key Files

- `AGENTS.md` — Canonical instructions (read first)
- `docs/DEPLOYMENT_WORKFLOW.md` — How to deploy
- `docs/PRODUCTION_RULES.md` — Rules that must not be broken
- `docs/KNOWN_ERRORS.md` — Common issues and fixes
- `docs/ARCHITECTURE_PLAN.md` — Full architecture
- `docs/ACCOUNTING_ENGINE_DESIGN.md` — Accounting engine design
