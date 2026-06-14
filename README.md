# BookOne v2

> Multi-tenant SaaS Accounting & ERP  
> **Stack:** Next.js 15 · TypeScript · PostgreSQL 16 · Drizzle ORM · shadcn/ui  
> **Domain:** [bookone.clossyan.com](https://bookone.clossyan.com)

---

## What Is BookOne?

BookOne is a multi-tenant accounting application designed for **non-accountants**. Business owners record transactions in simple language ("I sold painting supplies for LKR 15,000") — the engine maps these to professional double-entry accounting behind the scenes.

Accountants can switch to **Professional Mode** to see the full chart of accounts, journal entries, and reports.

## Features

- 🤖 **Simple Entry Mode** — 4 buttons: Money In, Money Out, Move Money, Invoice/Bill
- 📊 **Professional Mode** — Full double-entry journal, P&L, Balance Sheet, Cash Flow
- 🏢 **Multi-Tenant** — PostgreSQL Row-Level Security isolates tenant data
- 📦 **Modular ERP** — Activate modules per tenant (Inventory, Tax, POS, CRM, HR)
- 🤖 **AI Assistant** — OCR receipts, smart category suggestions
- 🌍 **International** — Multi-currency, i18n (EN, SI, TA, ZH)
- 📱 **Mobile-First** — Works on any device

## Quick Start (Local Dev)

```bash
# Prerequisites
# - Node.js 20+
# - pnpm 9+
# - Docker Desktop

# 1. Clone & install
git clone <repo-url> bookone
cd bookone
pnpm install

# 2. Configure
cp .env.example .env
# Edit .env with your local settings

# 3. Start services
docker compose -f docker/docker-compose.yml up -d

# 4. Run migrations
pnpm db:migrate

# 5. Seed test data (optional)
pnpm db:seed

# 6. Start dev server
pnpm dev
# → http://localhost:3000
```

## Deployment

See [`docs/DEPLOYMENT_WORKFLOW.md`](docs/DEPLOYMENT_WORKFLOW.md) for production deployment to VPS via Portainer + Cloudflare Tunnel.

## Architecture

See [`docs/ARCHITECTURE_PLAN.md`](docs/ARCHITECTURE_PLAN.md) for the full technology stack and design decisions.

See [`docs/ACCOUNTING_ENGINE_DESIGN.md`](docs/ACCOUNTING_ENGINE_DESIGN.md) for the accounting engine design.

## Documentation

| Doc | Purpose |
|-----|---------|
| `AGENTS.md` | Canonical AI agent instructions |
| `docs/DEPLOYMENT_WORKFLOW.md` | Production deployment steps |
| `docs/PRODUCTION_RULES.md` | Rules that must never be broken |
| `docs/KNOWN_ERRORS.md` | Common errors and fixes |
| `docs/TASK_LOG.md` | Progress tracking |
| `docs/ARCHITECTURE_PLAN.md` | Full architecture |
| `docs/ACCOUNTING_ENGINE_DESIGN.md` | Accounting engine design |
| `ai/start-session.prompt.md` | AI session starter prompt |

## License

Proprietary. All rights reserved.
