# Independent remaining-only QA — AgentBridge AB-06 (v2.8.1)

Pin the on-screen stamp **v2.8.1 · &lt;sha7&gt;** after owner deploy. New clock. Do not reopen consumed v2.7.3 / v2.7.4 / v2.8.0 clocks. Do not replay CONT11, POS 118, or Mission2. Keep existing company Inbox OFF, draft-only ON, posting-stop ON until this candidate is independently accepted.

## Candidate

| Item | Value |
|------|--------|
| Product | 2.8.1 |
| Schema | `ab-06.1` (no new SQL migration; facts_keys PK already in 046) |
| Baseline | live v2.8.0 `43233f0` / tree `fbda63ca` |
| Mission | CODING-AGENTBRIDGE-06 |

## Must pass (this SHA)

1. Original 425 product regressions remain green.
2. The five independent service reproductions in `packages/agent-bridge/test/ab06-independent.test.ts` (same expectations as QA `tests/runtime/ab05-independent-review.test.ts`) are green without weakening outcomes:
   - concurrent same-key upload → one document
   - same facts key + changed lineDescription → `IDEMPOTENCY_MISMATCH`
   - expenseAccountCode 6800 → categoryLabel `General Expense`
   - submitExtractedFacts after grantApproval with expected revision → ok, old approval `revokedAt`
   - after P2, requestApproval(oldId)+commitApprovedProposal(old P1/A1) must not post (posting adapter invocation count zero)
3. Actual no-OCR UI intake and VAT1180 preview still work. Jobs role switching stays fixed.
4. Edit facts is available on draft/validated/awaiting_approval with expected revision and exact decimal validation (blank/malformed/negative/overprecision refused; never Number-invalid→0).
5. Browser upload with `?uploadSession=` finalizes that session (ownership/hash/length/expiry). No second document.
6. Backup health does not count verified DB-backed AgentBridge blobs as missing S3. Empty/corrupt DB blobs and absent S3 objects still count missing.
7. OAuth: consent grants only read/upload/draft. Token exchange does not require `tenant_id` when the code is tenant-bound. `refresh_token` grant works when advertised. Production without `AGENT_BRIDGE_OAUTH_SIGNING_PEM` + issuer stays 503. HMAC remains labelled fixture only.

## After owner deployment (new clock)

- Supported financial posting on a **fresh synthetic** company only, after flags are explicitly authorized for that company.
- Real Codex connection through the production-compatible RS256 path (not unit tests, not empty Connections).
- Real Claude connection the same way.
- Recovery LAST into a fresh empty target; source unchanged. Verify restored raw bytes and references.

## Preserve

AB-05 source company: one stored original, one validated proposal, one vendor, draft-only/post-stop ON, zero bills/journals. Backup pair prepared once; no restore from this QA unless LAST is authorized. Never blindly reupload/recreate that source.

## Explicitly not in this build

Full multi-line/discount/evidence contracts. Stock, payments, FX. Dynamic client registration. Universal accounting-standards engine.

## Blocked until owner configures

| Item | Why |
|------|-----|
| Live Codex / Claude | Needs deployed SHA, public HTTPS, `AGENT_BRIDGE_OAUTH_SIGNING_PEM` + issuer (or labelled HMAC, which is **not** qualification), Inbox on a fresh synthetic company, vendor accounts |
| Staging posting | Existing company flags stay off |
| Recovery LAST | After functional outcomes, empty target only |
| GitHub branch protection | Owner applies in GitHub settings; API 404 expected |
