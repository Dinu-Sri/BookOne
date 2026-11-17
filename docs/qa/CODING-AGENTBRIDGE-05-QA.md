# Independent remaining-only QA — AgentBridge AB-05 / v2.8.0

Status: READY FOR INDEPENDENT QA. Issued 17 November 2026. This is a **new clock**. Do not reopen consumed v2.7.3 (QA PR #122) or v2.7.4 (QA PR #123/#124/#125) clocks. Do not replay CONT11, POS 118, Mission2, or source A vendor/failed-PDF actions.

Coding-agent self-tests are **not** this acceptance. Keep existing company Inbox OFF, draft-only ON, posting-stop ON until this mission’s posting cases are authorized on a **fresh synthetic** company. Recovery is LAST.

## Pins (fill SHA after product commit)

| Pin | Value |
|-----|--------|
| Product branch | `fix/v280-agentbridge-05` |
| Base | origin/master `9eb13dabc3bd988bec2ed9e6bb2d17ded05db767` (v2.7.4, tree `aa7ff89b146d8f2532dd5a5ef350a0e530e21d6b`) |
| Candidate version | **2.8.0** |
| Candidate SHA | *(product PR after commit)* |
| Schema | `ab-05.1` / migration `046_agent_bridge_facts.sql` |
| Policy | `ab-01.purchase-bill.unpaid-service.v1` |
| Staging host | `https://bookone.clossyan.com` — verify sidebar stamp before any click |
| UX companion | `024f8c35223a28c0662d469b71cd96579d4ee24d` |
| Product CHG | `docs/changes/CHG-20261117-agentbridge-05.md` |

If the live stamp is still `v2.7.4 · 9eb13da`, this candidate is **not deployed**. Stop. Do not test AB-05 behaviour on v2.7.4.

## Preserve

- Existing source A: one vendor, one failed PDF. Do not reupload, recreate, or post against it.
- Existing recovery target. Do not restore into it for this mission.
- Historical companies, closed shifts, CONT/Mission2 money.
- UI-NAV-01 list clipping. Tiles stay removed.

## Coding-agent evidence already collected (not a substitute)

Commands and counts from the implementation session. Independent QA must re-run what it needs against the **deployed** SHA.

```
pnpm --filter @bookone/agent-bridge test
→ 18 files / 65 passed (AB-02 6, AB-03 3, AB-04 2, AB-05 12, OAuth JWKS 2, PKCE 5, schemas 2)

pnpm --filter @bookone/auth exec vitest run test/tenant-archive.test.ts test/ab04-permissions.test.ts test/release-gate-workflow.test.ts test/agent-bridge-permissions.test.ts
→ 47 passed in those targeted files

pnpm --dir apps/web exec playwright test e2e/agent-bridge-01.spec.ts e2e/ui-nav-01.spec.ts
→ 10 passed / 1 skipped (AGENT_BRIDGE_E2E_BASE_URL unset)

pnpm --filter @bookone/agent-bridge exec tsc --noEmit
pnpm --filter @bookone/db exec tsc --noEmit
→ passed
```

Skipped / not-run here: isolated Next+Postgres browser (`AGENT_BRIDGE_E2E_BASE_URL` unset), live OCR, production IdP, real Codex, real Claude, independent PostgreSQL RLS posting, staging financial workflow, recovery LAST, GitHub branch-protection enforcement, Portainer webhook.

First failure in this session: facts idempotency replay expected `.ok` on a status payload; service now returns `{ ok: true, document, proposal }` for that replay. CoreGuard blocked-list order was aligned to registry (`codex-claude-live-clients` first). Archive helper moved to `format.ts` so auth tests do not import `server-only`.

## Golden outcomes (independent of the production helper)

Use a **fresh synthetic** company, approved supplier **ABC Supplies**, expense **6800**, VAT-registered 18%, currency matching the company (synthetic LKR in unit tests).

| Case | Expected |
|------|----------|
| G1 VAT1180 | Original stored. Facts net 1000 + VAT 180 = gross 1180. Preview journal Dr6800=1000, Dr2300=180, Cr2100=1180. One human approval. One posted bill. AP 1180. Balanced journal. Dates/source link retained. |
| G2 no OCR | Upload without `AGENT_BRIDGE_OCR_LIVE`. Status `awaiting_facts`. Practical reason. Facts form usable. Not a dead-end `failed` with no recovery. |
| G3 paid refuse | Paid/part-paid facts refused. No bill. Message points to ordinary ERP payment workflow. |
| G4 stock/mixed refuse | Stock or mixed document refused. No reinterpretation as unpaid service. |
| G5 hash/revision | Wrong content hash or stale revision refused. Same facts key + payload replays. Same key + different payload fails clearly. |
| G6 batch | Manifest of two files. Per-item status. No batch-wide approval control. |
| G7 viewer | Viewer cannot approve or post. Cross-company ids/files denied. |
| G8 jobs | Cashier→Owner and Owner→Sales selects bind to the current role without reload. Unsaved switch confirms. Disposable jobs only. |
| G9 backup | Company with a DB-backed AgentBridge PDF reports that file as stored in company data, not “1 missing S3”. True missing external objects still warn. |
| G10 original bytes | Authorized download of the stored original after upload and after restore (restore is LAST). |

Oracle for VAT minor units is independent (`oracleVatMinor`), not the production preview helper under test.

## Remaining-only live cases

Run only after owner deploys this SHA and you have confirmed the sidebar stamp. Use a new clock and fresh synthetic fixtures.

1. **Stamp** — `v2.8.0 · <sha7>` on `https://bookone.clossyan.com`.
2. **Flags** — existing company still Inbox OFF / draft-only ON / posting-stop ON.
3. **Inbox no-OCR** — on the synthetic company, upload PDF, land in awaiting-facts, enter facts, preview VAT1180, **stop before posting** unless this clock authorizes posting.
4. **Failed recovery** — failed/awaiting document shows a safe reason and the facts form (AB05-UI-02). Do not touch source A’s failed PDF; use a disposable upload.
5. **Jobs remount** — disposable jobs, reverse role sequence, reload consistency (AB05-UI-01).
6. **Backup classification** — prepare archive; DB-backed blob is not “missing S3” (AB05-UI-03). Browser save-unverified copy is accurate. Do not restore yet.
7. **Connections** — list empty then, after a live client or after a labelled OAuth fixture, show client/scopes/last use/revoke.
8. **Codex live** — follow `docs/AGENT_BRIDGE_CODEX.md`. Record the exact Codex surface and version. Initialize, tools/list, OAuth consent, file transfer **or** explicit upload-session fallback, preview, human approval in BookOne, disconnect. If the vendor account or production IdP is missing, mark **EXTERNALLY BLOCKED** with the remaining operator action. A protocol unit test is not this case.
9. **Claude live** — follow `docs/AGENT_BRIDGE_CLAUDE.md`. Same bar. Chat attachments must not be treated as automatic file transfer.
10. **Posting** — only if this clock authorizes it on the synthetic company: one G1 bill, Viewer deny, lost-response reconcile, same-key replay. Existing company stays posting-stopped.
11. **Recovery LAST** — after functional outcomes: encrypted export + matching files from the synthetic source, restore **once** into a distinct empty target. Verify original bytes/hash, remapped ownership, revoked approvals, safe flags, DB-backed vs S3-backed, genuine missing-object handling, unchanged source. Wrong-password/mismatched-pair must refuse. Do not restore into the existing recovery target or live company.

## Enablement checklist (owner, after independent pass)

1. Image identity is this SHA (not a moving `latest` tag as the only identity).
2. Independent QA recorded pass/fail/blocked/inconclusive on the remaining-only cases.
3. Existing company still posting-stopped until an explicit owner decision.
4. Production OAuth issuer/JWKS (or a labelled HMAC fixture) recorded without secrets in chat.
5. Codex and Claude live surfaces named with versions, or still BLOCKED.
6. Rollback: revert the deploy; additive 046 columns remain.

## Acceptance matrix (implementation session)

| Requirement | Status |
|-------------|--------|
| Versioned strict schemas, money exact, MCP version negotiate | IMPLEMENTED+TESTED |
| Actor/company from verified auth; token∩live grants | IMPLEMENTED+TESTED (retained AB-03/04) |
| Upload without OCR → awaiting_facts | IMPLEMENTED+TESTED |
| `submit_extracted_facts` + hash/revision/idempotency | IMPLEMENTED+TESTED |
| Upload session + review URL fallback | IMPLEMENTED+TESTED (unit); LIVE-UNVERIFIED in staging |
| Batch manifest, no batch approval | IMPLEMENTED+TESTED |
| Supplier/account/proposal lookups | IMPLEMENTED+TESTED |
| Inbox upload/facts/clarify/preview/approve/receipt UI | IMPLEMENTED+TESTED (Playwright source routes); LIVE-UNVERIFIED staging financial |
| Practical copy; no “fixture or unconfigured” | IMPLEMENTED+TESTED |
| OAuth discovery, PKCE, consent, Connections, revoke | IMPLEMENTED+TESTED (contract); LIVE-UNVERIFIED real clients |
| HMAC fail-closed in production | IMPLEMENTED+TESTED |
| Default connection scopes read/upload/draft; agents cannot mint approval | IMPLEMENTED+TESTED |
| Durable DB, leases, lost-response reconcile, posted immutable via this API | IMPLEMENTED+TESTED (retained + 046) |
| AB05-UI-01 Jobs remount | IMPLEMENTED+TESTED (Playwright); LIVE-UNVERIFIED staging |
| AB05-UI-02 failed inbox recovery | IMPLEMENTED+TESTED (unit/Playwright); LIVE-UNVERIFIED staging |
| AB05-UI-03 DB-backed backup classification | IMPLEMENTED+TESTED (archive unit); LIVE-UNVERIFIED staging prepare |
| Additive 046; flags stay safe; VERSION 2.8.0 | IMPLEMENTED+TESTED |
| CoreGuard full-workflow + quality ancestor | IMPLEMENTED+TESTED (local); CI LIVE-UNVERIFIED until this branch runs on GitHub |
| Codex real surface | EXTERNALLY BLOCKED — vendor account + deployed host + IdP/HMAC + synthetic Inbox |
| Claude real surface | EXTERNALLY BLOCKED — same, plus public HTTPS :443 from Anthropic |
| Staging financial workflow | EXTERNALLY BLOCKED — owner deploy + new clock; posting stays off on existing company |
| Recovery LAST | EXTERNALLY BLOCKED — after functional outcomes, empty target only |
| Live OCR remote smoke | EXTERNALLY BLOCKED — `AGENT_BRIDGE_OCR_*` not authorized |
| GitHub master protection | EXTERNALLY BLOCKED — API 404; YAML is not proof |
| Portainer webhook | EXTERNALLY BLOCKED — secret empty |
| Dynamic client registration / CIMD | NOT IMPLEMENTED — pre-registered `bookone-codex` / `bookone-claude` only |
| Folder watchers, stock/FX/payments, autonomous posting | NOT IMPLEMENTED (unsupported by design) |

Independently qualified in this session: **Codex no, Claude no, staging financial no, recovery no.**
