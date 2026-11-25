# CHG-20261125-staging-test-host — serve staging on staging.clossyan.com too (v2.17.5)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-25
- Product version (`VERSION` file) and base SHA / branch/PR: 2.17.5 pushed directly to `master` (owner-approved) from `3c1ceba` / v2.17.4
- QA repository revision and companion PR/change ID: independent staging QA pending
- Intended before/after behaviour with a concrete example: the owner routed `staging.clossyan.com` through the Cloudflare tunnel to the staging stack so agents/QA can create test accounts on a host whose name marks it as a test environment. Before: `https://staging.clossyan.com/login` returned Traefik's plain-text `404 page not found` because the web router only matched `Host(bookone.clossyan.com)`. After: Traefik routes both hosts to `bookone-staging-web`, and Better Auth trusts both origins so email/password sign-up and sign-in work on either host
- Existing behaviour that must remain correct: `bookone.clossyan.com` login, Google sign-in (redirect URI still on `BETTER_AUTH_URL`), AgentBridge OAuth discovery/issuer (`AUTH_URL`), docs host routing
- Actual changed paths/symbols/routes: `docker/docker-compose.staging.yml` (web router rule `|| Host(${WEB_HOST_TEST:-staging.clossyan.com})`, new `BETTER_AUTH_TRUSTED_ORIGINS` env defaulting to both origins); `packages/auth/src/auth.ts` (`trustedOrigins` parsed from `BETTER_AUTH_TRUSTED_ORIGINS`)
- Business rule/profile/scenario IDs: none
- Accounting, stock/rental, tenant/access and customer-data effects: none. Cookies are per host, so a session on one host does not sign you in on the other
- Migrations, schema/history compatibility and recovery implications: none. Rollback: revert this commit and redeploy
- Dependencies, settings/flags, deployment and external-service changes: Portainer Pull and redeploy picks up the compose change. Production compose unchanged; set `BETTER_AUTH_TRUSTED_ORIGINS` there only if bookone.lk ever serves more than one host. Known limits on the second host: absolute links built from `AUTH_URL` (team invite links, document print links, docs layout link, logged-out redirect in purchase inbox file route) still point at `bookone.clossyan.com`
- Independent diff/impact review and uncertainties: Better Auth 1.7 also reads `BETTER_AUTH_TRUSTED_ORIGINS` itself; the explicit parse keeps behaviour stable across versions
- Checks executed (local): `pnpm --filter @bookone/auth test` 173 passed, 5 skipped (includes staging compose source locks); `@bookone/auth` and `@bookone/web` typecheck exit 0
- Failed/skipped/flaky/blocked/not-run checks and reasons: live sign-up on staging.clossyan.com runs after redeploy
- New QA assertions or outstanding work; changed expectations and owner decision: agent creates a ZZ-TEST account on staging.clossyan.com, credentials kept in local gitignored `.env.staging-test`
- Created staging records/cleanup, if any: none yet
- Documentation updated: this record, TASK_LOG, PROJECT_STATUS
- Next exact action and responsible role: agent redeploys staging and runs sign-up/login smoke on the new host

Final product/QA SHAs belong in PR metadata and external run manifests after commit. Do not label the change verified from code review alone.

## UI/UX impact and existing-design compatibility

Not applicable: infrastructure routing and auth origin config only.
