# BookOne release versioning

Canonical product version is the single line in repo-root **`VERSION`**: `MAJOR.MINOR.PATCH`.

The live app shows that number plus the image git SHA in the **sidebar bottom-left** (and on `/login`):

```
v2.1.0 · 137f6b5
```

- `v2.1.0` comes from `VERSION` (baked at Next.js build as `NEXT_PUBLIC_APP_VERSION`).
- `137f6b5` is the GitHub SHA baked by Docker as `NEXT_PUBLIC_BOOKONE_BUILD`. Local `pnpm dev` shows `dev`.
- Workspace `package.json` `"version"` fields are package identity. They are **not** the release stamp. Do not bump every package.json for a release.

This file is the rule. AGENTS.md repeats the gate. Every coding agent must follow it **before** `git commit`.

## Mandatory gate (do not commit without this)

1. Decide the bump (table below).
2. Run `pnpm version:bump -- patch` (or `minor` / `major`) from the repo root, **or** edit `VERSION` by hand to the next unused number.
3. Put the new version in the CHG record (`Version: 2.1.1`).
4. `git add VERSION` with the rest of the change.
5. Refuse to commit if `VERSION` is unchanged from `origin/master` and the commit contains product files.

A commit that ships code, schema, Docker, or UI **without** a `VERSION` bump is incomplete. Do not push it. Do not reuse a version. Do not skip a number to “save” patches.

## What to bump

| Change | Bump |
|--------|------|
| Bug fix, permission fix, copy, refactor, chore that rebuilds the web image | **patch** (`2.1.0` → `2.1.1`) |
| New user-visible feature, new screen/module, new public behaviour | **minor** (`2.1.1` → `2.2.0`, patch resets to 0) |
| Breaking workflow, breaking API, or a migration that operators cannot skip | **major** (`2.2.0` → `3.0.0`) |

`git revert` of a versioned commit may restore the previous `VERSION` only when that revert is the whole change.

Docs-only commits (`docs/`, `AGENTS.md`) that **do not** trigger **Docker web image** may leave `VERSION` unchanged. If the same commit also touches `apps/`, `packages/`, `docker/`, `scripts/`, or `VERSION`, bump it.

## How the stamp gets onto staging

1. Commit includes the new `VERSION`.
2. GitHub Action **Docker web image** copies `VERSION`, sets `NEXT_PUBLIC_BOOKONE_BUILD=$GITHUB_SHA`, and builds Next.js.
3. Portainer Update with **Re-pull ON**.
4. Sidebar bottom-left must show the new `vX.Y.Z · <sha7>`. If it still shows the old pair, the old image is running.

QA run records must quote the on-screen label. A finding without that stamp cannot be tied to a build.

## Commands

```bash
pnpm version:bump -- patch
pnpm version:bump -- minor
pnpm version:bump -- major
```

## First number

BookOne v2 starts this stamp at **2.1.0** (version display + this contract). History before that image has no on-screen semver.
