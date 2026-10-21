# BookOne coding-agent entry point

Read root AGENTS.md, docs/VERSIONING.md and docs/QA_CHANGE_CONTRACT.md first. Maintain a docs/changes record, TASK_LOG and PROJECT_STATUS. **Before every product commit, bump repo-root `VERSION` (`pnpm version:bump -- patch|minor|major`) and include it in the commit.** Canonical tests and QA history: https://github.com/Dinu-Sri/bookone-qa. The root instructions govern conflicts with older testing guidance.

Client writes that should show **Working… please wait** must use `withFormPending` (or shared `Button type="submit"` on a server-action form). Do not add a document `submit` listener. See AGENTS.md **Form busy overlay**.

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


## Existing UI/UX compatibility — mandatory

Before UI/UX changes read docs/UI_UX_CHANGE_GUIDE.md and root AGENTS's incremental UI/UX section. Extend existing LIST_TABLE_UX_GUIDE, CSS variables and shared components; no replacement design system. CHG must identify external UX/UXW/WB refs and pinned QA revision/hash, shared consumers, preserved business/history/access behaviour and actual exact/adjacent evidence. Preserve failures; report blocked layers; do not self-close independent QA findings.

