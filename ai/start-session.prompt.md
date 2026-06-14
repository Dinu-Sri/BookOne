# Start Session Prompt — BookOne v2

> Copy this entire prompt at the start of a new AI chat session to load all context.

---

You are working on **BookOne v2**, a multi-tenant SaaS accounting and ERP application built with Next.js 15, TypeScript, PostgreSQL 16 with RLS, Drizzle ORM, shadcn/ui, Tailwind CSS, deployed on a Linux VPS via Docker/Portainer/Cloudflare Tunnel at `bookone.clossyan.com`.

## Before writing any code, read these files in order:

1. **`AGENTS.md`** (root) — Canonical agent instructions, production rules, architecture overview
2. **`.github/copilot-instructions.md`** — Copilot-specific rules (synced from AGENTS.md)
3. **`docs/ARCHITECTURE_PLAN.md`** — Full technology stack, multi-tenancy, scaling, module system
4. **`docs/ACCOUNTING_ENGINE_DESIGN.md`** — Simple entry → professional accounting engine design
5. **`docs/DEPLOYMENT_WORKFLOW.md`** — How to deploy (Portainer, Cloudflare Tunnel, GitOps)
6. **`docs/PRODUCTION_RULES.md`** — Rules that must never be broken
7. **`docs/KNOWN_ERRORS.md`** — Common issues and fixes
8. **`docs/TASK_LOG.md`** — Current progress and next steps
9. **`ai/AI_CONTEXT.generated.md`** — Auto-generated project summary

## Then, understand the context:

- **Project phase:** Pre-development / planning. No running code yet. Monorepo scaffolded.
- **Old codebase:** Archived in `old-project/` — PHP v1.4.0 accounting app. Reference for porting logic.
- **Key constraint:** The accounting engine (`packages/accounting/`) must be correct — it's double-entry with journal validation.
- **Deployment:** GitHub push → Portainer webhook → VPS redeploy → Cloudflare Tunnel to domain.

## Rules for this session:

1. Never hardcode localhost, secrets, or file paths. Use `process.env.*`
2. Never bypass tenant isolation. All queries must be tenant-scoped.
3. Never DELETE data — void it.
4. All financial mutations create journal entries and audit log entries.
5. Schema changes are additive migrations only.
6. After making changes, tell me what needs to be done for deployment (env vars, migration, rebuild, restart).

## Project structure (monorepo with Turborepo + pnpm):

```
apps/web/           — Next.js App Router
packages/db/        — Drizzle schemas + migrations
packages/accounting/ — Journal engine + inference engine
packages/auth/      — Auth.js v5
packages/ui/        — shadcn/ui components
packages/modules/   — Module registry
docker/             — Docker configs
docs/               — Documentation
old-project/        — Archived v1.x PHP (reference)
```

Let's begin.
