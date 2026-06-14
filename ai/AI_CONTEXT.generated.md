# BookOne v2 — AI Context (Auto-Generated)

> This file is auto-generated for AI assistants to understand the project context quickly.
> Updated: 2026-06-14

---

## Project Summary

BookOne v2 is a multi-tenant SaaS accounting and ERP application built with:
- **Frontend:** Next.js 15 (App Router), React, TypeScript, shadcn/ui, Tailwind CSS
- **Backend:** Server Actions, tRPC, Next.js API routes
- **Database:** PostgreSQL 16 with Row-Level Security (RLS)
- **ORM:** Drizzle ORM
- **Auth:** NextAuth.js v5 (Auth.js)
- **Infra:** Docker, Portainer, Cloudflare Tunnel, Traefik
- **Monitoring:** Sentry, PostHog

## Key Architecture Decisions

1. **Multi-tenancy:** Shared PostgreSQL + RLS on `tenant_id`
2. **Module system:** Feature flags in `tenant_modules` table, per-module schema namespaces
3. **Accounting engine:** Simple 4-direction UI → professional double-entry journal
4. **Deployment:** GitHub → Portainer webhook → Docker Compose on VPS → Cloudflare Tunnel

## Directory Structure

```
apps/web/          — Next.js UI + API
packages/db/       — Drizzle schemas + migrations
packages/accounting/ — Journal engine, inference engine, reports
packages/auth/     — Auth.js configuration
packages/ui/       — Shared components
packages/modules/  — Module registry
docker/            — Dockerfile + compose files
docs/              — Architecture + deployment docs
old-project/       — Archived v1.x PHP codebase (reference only)
```

## Current State

- Phase: Pre-development / planning
- No running application yet
- Schema not yet implemented
- VPS not yet provisioned

## Key Files for Agents

- `AGENTS.md` — Canonical instructions (MUST READ FIRST)
- `.github/copilot-instructions.md` — Copilot-specific rules
- `docs/ARCHITECTURE_PLAN.md` — Full technology stack plan
- `docs/ACCOUNTING_ENGINE_DESIGN.md` — Accounting engine design
- `docs/DEPLOYMENT_WORKFLOW.md` — Deployment process
- `docs/PRODUCTION_RULES.md` — Unbreakable rules
- `docs/KNOWN_ERRORS.md` — Error reference
- `docs/TASK_LOG.md` — Progress tracking
- `ai/start-session.prompt.md` — Prompt for new AI sessions
