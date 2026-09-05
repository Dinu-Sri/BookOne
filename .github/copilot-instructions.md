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

9. **UI verification is `pnpm agent:browse`.** Playwright logs in like a person (credentials in gitignored `.local/debug-accounts.json`). After any screen change, browse the route, read `.local/agent-browse/<run>/final.png`, and do not claim the UI works from curl or a code-only read. Full contract: **AGENTS.md → Agent UI testing**. Never print or commit passwords.

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

## Codebase Memory MCP

**MANDATORY: use Codebase Memory MCP graph tools FIRST — before reading files or making code changes.**

This rule applies to every request involving this codebase.

Always call `list_projects` first when you do not already know the project name, then use the `display_name` or exact `name` returned by that tool.

```json
// Step 0 — discover project names
mcp_codebase-memo_list_projects()

// Step 1 — use the project identifier returned above
mcp_codebase-memo_get_architecture({ "project": "<display_name>" })
```

### Workflow

1. Call `list_projects` to discover the correct project name.
2. Call `get_architecture(project)` to understand the codebase structure.
3. Use `search_graph` to find relevant symbols, `trace_call_path` for call chains.
4. Use `get_code_snippet` to read specific function implementations.
5. Only use `read_file` when you need exact raw content to edit a specific line.

### Available Tools (14 MCP tools)

**Indexing:**
- `index_repository(repo_path)` — Index a repository into the knowledge graph
- `list_projects` — List all indexed projects with node/edge counts
- `delete_project(project)` — Remove a project and all its graph data
- `index_status(project)` — Check indexing status

**Querying:**
- `search_graph(name_pattern, name_scope, label, file_pattern, exclude_file_pattern)` — Structured search by label, name/qualified_name, include/exclude file globs
- `trace_call_path(function_name, direction, depth)` — BFS call chain traversal
- `detect_changes(project)` — Map git diff to affected symbols + risk
- `query_graph(query)` — Execute Cypher-like graph queries (read-only)
- `get_graph_schema(project)` — Node/edge counts, relationship patterns
- `get_code_snippet(qualified_name)` — Read source code for a function
- `get_architecture(project)` — Codebase overview: languages, packages, routes, hotspots
- `search_code(pattern, project)` — Grep-like text search within indexed files
- `manage_adr(action)` — CRUD for Architecture Decision Records
- `ingest_traces(traces)` — Ingest runtime traces to validate HTTP edges
