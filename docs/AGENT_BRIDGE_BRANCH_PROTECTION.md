# AgentBridge GitHub branch protection handoff (AB-03)

This file is the concrete owner checklist. It does **not** change GitHub access. YAML in `.github/workflows/docker-web.yml` is not proof that rules are on.

Independent review of `2967526` again reported `master` unprotected, zero required contexts, empty rulesets. This repair does not call the GitHub administration API.

## Required rules for `master` (apply in GitHub Settings)

Repository: `Dinu-Sri/BookOne`. Branch: `master`.

1. Enable classic branch protection or a ruleset targeting `master`.
2. Require a pull request before merging.
3. Require at least 1 approving review. Do not dismiss stale reviews automatically until the owner chooses that policy.
4. Require status checks to pass:
   - `Lint typecheck build test` (quality job)
   - `AgentBridge CoreGuard` (`coreguard` job)
5. Require branches to be up to date before merging.
6. Do not allow bypass of the above for administrators until an explicit owner exception is recorded. If a bypass list is required, name the accounts and expiry.
7. Restrict who can push to `master` to the owner (or the GitOps identity the owner names).
8. Do not allow force pushes or deletions on `master`.
9. Workflow permissions: default `GITHUB_TOKEN` remains read for quality/CoreGuard; `packages: write` stays on Build & push only.
10. After applying, capture a screenshot or `gh api repos/Dinu-Sri/BookOne/branches/master/protection` JSON in a private operator note. Report **applied** rules separately from this YAML.

## Actual applied rules (this candidate)

GitHub API `GET /repos/Dinu-Sri/BookOne/branches/master/protection` on 2026-11-16 (AB-03) returned HTTP 404 `Branch not protected`. No ruleset was applied by this change. YAML publication gates remain quality + CoreGuard. Attest applied rules separately after the owner turns protection on.

## AgentBridge posting

Keep company Inbox OFF, draft-only ON, and posting-stop ON until independent qualification of the repaired SHA.
