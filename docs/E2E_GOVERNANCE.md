# BookOne E2E governance — keep tests aligned with the product

**Purpose:** When the product changes, the E2E system has a clear **current level** and a **next level**, so we never lose track of what is covered vs what must be added.

---

## Two clocks (do not mix them)

| Clock | What it is | Source of truth |
|-------|------------|-----------------|
| **Product / app version** | Features shipped in BookOne | Git commits, releases, modules |
| **E2E level** | Maturity of automated checks against that product | `apps/e2e-runner/src/catalog/level.json` |

Shipping a feature without updating E2E leaves a **gap**. Closing gaps **bumps the E2E level** (or fills backlog items that define the next level).

---

## Artifacts (always keep these in sync)

| Artifact | Role |
|----------|------|
| `docs/E2E_SCENARIO_CATALOG.md` | **Human design** of every scenario (`S-NNNN`) |
| `apps/e2e-runner/src/catalog/scenarios.json` | Machine catalog (exported from MD) |
| `apps/e2e-runner/src/catalog/coverage.generated.json` | Which IDs appear in test code |
| `docs/E2E_COVERAGE.md` | Human coverage board (generated) |
| `apps/e2e-runner/src/catalog/level.json` | **Current E2E level** + next-level theme |
| `apps/e2e-runner/src/catalog/backlog.json` | **Next-level work** (depth upgrades + new features) |
| `apps/e2e-runner/tests/*.spec.ts` | Executable checks |

### Commands

```bash
# From repo root or apps/e2e-runner
pnpm --dir apps/e2e-runner export-catalog   # MD → scenarios.json
pnpm --dir apps/e2e-runner coverage         # tests ↔ catalog → E2E_COVERAGE.md
pnpm --dir apps/e2e-runner level            # print current vs next + backlog
pnpm --dir apps/e2e-runner sync             # export + coverage + level report

# After catalog + tests updated for a release of E2E maturity:
pnpm --dir apps/e2e-runner level:bump -- 1.1.0 "Deep money paths + new feature X"
```

---

## Assertion depth (quality ladder)

Every scenario targets one depth. **ID presence ≠ deep coverage.**

| Depth | Meaning | Example |
|-------|---------|---------|
| `load` | Page opens, no crash, not stuck on login | Route smoke |
| `mutate` | Create/update/delete or validation block | Create invoice, error on empty brand |
| `balance` | Books/stock/reports move correctly | Stock −1, AR down after payment, TB balanced |

`level.json` → `depth_targets` and `backlog.json` → `target_depth` use these words.

---

## Current level vs next level

### Current level (`level.json`)

- `e2e_level` — semver for **test system** (not app version): e.g. `1.0.0`
- `catalog.scenario_count` / `last_scenario_id` — snapshot of catalog size
- `coverage` — ID mapping stats after last `coverage` run
- `next_level` — declared theme for the upgrade you are working toward

### Next level (`backlog.json` + `level.json.next_level`)

- **Backlog items** = concrete work to reach the next level  
  - `kind: depth_upgrade` — same `S-NNNN`, better asserts  
  - `kind: new_scenario` — new product behavior → new `S-NNNN`  
  - `kind: process` — process/tooling only  
- Status flow:

```
planned → in_progress → automated_load | automated_mutate | automated_balance
                      ↘ wont_automate (with notes)
```

When enough backlog for the theme is done:

1. `pnpm --dir apps/e2e-runner sync`
2. `pnpm --dir apps/e2e-runner level:bump -- X.Y.Z "short label"`
3. Commit catalog + tests + `level.json` + `backlog.json`

---

## Mandatory workflow when product changes

Use this as **Definition of Done** for features, modules, routes, settings, postings, security.

### 1. Classify the change

| Change type | E2E impact |
|-------------|------------|
| New or renamed route | §18 route smoke + any domain journey |
| New form / server action / validation | New or updated scenarios; validation catalog if new error class |
| Money / stock / GL posting | P0 scenarios with **balance** depth |
| Settings toggle behavior | §5 settings matrix |
| Control Room / platform | §14 / §22 (optional admin credentials) |
| UI-only layout | §20 UI/UX (load depth is enough) |

### 2. Catalog first (design)

1. Append scenarios to `docs/E2E_SCENARIO_CATALOG.md` with next free `S-NNNN` (after `last_scenario_id` in `level.json`).
2. Set **Priority** (`P0`–`P3`) and **Tags**.
3. Write **Steps** and expected outcome (success vs blocked).
4. Run `pnpm --dir apps/e2e-runner export-catalog`.

### 3. Backlog or automate

**Same PR as the feature (preferred for P0):**

- Add/adjust Playwright tests (`S-NNNN` in title or section loader).
- Prefer deep helpers (`lifecycle`, `balances`) for money paths.
- Run `pnpm --dir apps/e2e-runner coverage` — new IDs must not stay **missing**.

**If deferred:**

- Add a `backlog.json` item (`kind: new_scenario` or `depth_upgrade`) with `feature_ref` (issue/PR/path).
- Status `planned` is OK only with a clear owner/next level theme.

### 4. Prove and ship

1. Local or `/e2e` against a real instance (URL + credentials).
2. Commit: catalog MD/JSON, tests, coverage, backlog/level if bumped.
3. Push `master` → Portainer rebuild (so `/e2e` image contains new tests).

### 5. After deploy

- Smoke via `/e2e` on the target host.
- If failures show product regressions → fix app or tests; if intentional product change → update catalog expectations.

---

## Template: new catalog scenario

```markdown
### S-0699 — Short title of behavior

- **Priority:** P0
- **Tags:** `@sales`, `@edge`
- **Steps:**
  1. …
  2. …
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.
```

### Template: backlog item

```json
{
  "id": "BL-0042",
  "kind": "new_scenario",
  "related_scenarios": ["S-0699"],
  "title": "Multi-currency invoice posting",
  "priority": "P0",
  "status": "planned",
  "target_depth": "balance",
  "feature_ref": "feat/multi-currency or PR #123",
  "added_at": "YYYY-MM-DD",
  "notes": "Depends on FX accounts + rate field on invoice"
}
```

---

## How AI agents should behave

On any feature/schema/route work in this repo:

1. Read `level.json` and open `backlog.json`.
2. If the change affects user-visible or posting behavior → catalog + test or backlog **in the same change**.
3. Never claim “E2E done” with only app code and zero catalog/test/backlog update.
4. After adding scenarios: `export-catalog` → implement or backlog → `coverage` → `level` (bump if releasing a maturity step).

See also: `AGENTS.md` key-files table, `docs/E2E_AUTOMATION.md`.

---

## Quick “where are we?” check

```bash
pnpm --dir apps/e2e-runner level
```

Example output meaning:

- **E2E level 1.0.0** — full catalog IDs mapped  
- **Next 1.1.0** — deepen money paths + absorb new features  
- **Backlog open: N** — items still planned/in_progress  

That is the bridge between **current system level** and **next level** of E2E checks.
