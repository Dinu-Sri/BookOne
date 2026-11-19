## 2026-11-19 — Accounts/Advances UI consistency and UI-02 gate (v2.13.0)

Candidate **2.13.0** on `feat/v2130-ui-02-coa-consistency` from origin/master `f2bfed6` / v2.12.2. Live v2.12.2 Accounts/Advances used native selects, native dates, and raw subtype identifiers. This candidate restyles those six routes onto shared BookOne controls and adds CoreGuard UI-02 (AST lint + browser fixture) as a Docker web image publication prerequisite. COA-01 posting behaviour is unchanged. Owner deploys after the Docker web image is green. Independent staging QA pending. Real Codex/Claude stay unverified. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-19 — CoA prerender login redirect (v2.12.2)

Candidate **2.12.2** on `fix/v2122-coa-01-prerender` from origin/master `3efd103` / v2.12.1. Production Check on v2.12.1 passed lint then failed `next build` prerendering `/accounts/import` without a session. This candidate loads tenant first and redirects to login on CoA and Advances pages. COA-01 posting behaviour is unchanged. Owner deploys after the Docker web image is green. Independent staging QA pending. Real Codex/Claude stay unverified. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-19 — CoA web lint types (v2.12.1)

Candidate **2.12.1** on `fix/v2121-coa-01-web-lint` from origin/master `57fcb60` / v2.12.0. Production Check on v2.12.0 failed web `tsc` for account-detail classification fields and advance cash-code literals. This candidate types those surfaces. COA-01 behaviour is unchanged. Owner deploys after the Docker web image is green. Independent staging QA pending. Real Codex/Claude stay unverified. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-19 — Company Chart of Accounts COA-01 (v2.12.0)

Candidate **2.12.0** on `feat/v2120-coa-01-chart-of-accounts` from origin/master `b35762d` / v2.11.5. Business companies maintain a full chart of accounts, add banks and advances, post a balanced opening separately from account create, and see custom 11xx banks in cash/dashboard/cash-flow. Permission catalog stays v2. AgentBridge scopes are unchanged. Taxable advances are refused. Owner deploys after the Docker web image is green. Independent staging QA pending. Real Codex/Claude stay unverified. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-19 — Compact desktop dashboard overview (v2.11.5)

Candidate **2.11.5** on `fix/v2115-dashboard-db02-compact` from origin/master `9ed27aa` / v2.11.4. Live v2.11.4 `/dashboard` required scrolling through duplicate company heading, tall metric cards and always-visible daily tables. This candidate keeps DB-01 metric definitions and makes the default desktop overview fit one viewport. Owner deploys after the Docker web image is green. Independent staging QA pending. Real Codex/Claude stay unverified. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-19 — AgentBridge MCP protocol negotiation (v2.11.4)

Candidate **2.11.4** on `fix/v2114-agentbridge-11-mcp-negotiation` from origin/master `2edf473` / v2.11.3. Live v2.11.3 Codex OAuth succeeded, then `initialize` failed with `UNSUPPORTED_PROTOCOL` for `2025-06-18`. This candidate accepts that protocol, keeps older versions, negotiates unknown versions, and returns Streamable HTTP notification 202 plus `MCP-Protocol-Version` handling. Capabilities stay tools-only. This is not a live-tested Codex tool inventory. Owner deploys after the Docker web image is green, then retries initialize on the existing authorized connector. Independent staging QA pending. Real Codex/Claude stay unverified until that retry. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-19 — AgentBridge exact callback preservation (v2.11.3)

Candidate **2.11.3** on `fix/v2113-agentbridge-10-callback-preservation` from origin/master `45d1f2f` / v2.11.2. Live v2.11.2 Codex login stored `localhost` while Codex redeemed `127.0.0.1` (`redirect_mismatch`, request `4b22d15c`). Next.js NextURL rewrites nested loopback hosts in the authorize query. This candidate reads the Fetch Request URL so the exact callback survives consent, sign-in `from=`, persist and token exchange. Exact redirect matching is unchanged. This is not a live-tested Codex login. Owner deploys after the Docker web image is green, then retries the saved Codex login with a new code. Independent staging QA pending. Real Codex/Claude stay unverified until that retry. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-19 — AgentBridge token-exchange diagnostic (v2.11.2)

Candidate **2.11.2** on `fix/v2112-agentbridge-09-token-diagnose` from origin/master `b7e7499` / v2.11.1. Live v2.11.1 Codex login still returned generic `invalid_grant`. This candidate records a sanitized request id and reason enum for the actual rejection branch, and makes tenant-bound codes win over a tenant hint. Exact redirect matching is unchanged. This is not a live-tested Codex fix; the coding environment cannot query staging token logs. Owner deploys after the Docker web image is green, then retries the saved Codex login and reads the Company AgentBridge last-attempt reason. Independent staging QA pending. Real Codex/Claude stay unverified until that retry. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-18 — AgentBridge login repair and consent UX (v2.11.1)

Candidate **2.11.1** on `fix/v2111-agentbridge-09-login-consent` from origin/master `514e51b` / v2.11.0. Token exchange no longer marks an authorization code used before client, exact redirect, PKCE and expiry checks. Company → AgentBridge no longer labels a consent-only row as an authenticated client. BookOne-owned consent is branded; Codex’s loopback completion page stays client-owned. Keep Inbox OFF, draft-only ON, posting-stop ON. Owner deploys after the Docker web image is green, then retries the saved Codex login. Independent staging QA pending. Real Codex/Claude stay unverified until that retry. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-18 — Company AgentBridge connections UI (v2.11.0)

Candidate **2.11.0** on `feat/v2110-agentbridge-08-company-connections` from origin/master `58eea1a` / v2.10.2. Company → AgentBridge is the place to configure AI access, copy Codex or Claude connection prompts, and manage connected clients. AB-07 login discovery stays. Keep Inbox OFF, draft-only ON, posting-stop ON. Owner deploys after the Docker web image is green, then retries the saved Codex login. Independent staging QA pending. Real Codex/Claude stay unverified until that retry. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-18 — Codex MCP login discovery (v2.10.2)

Candidate **2.10.2** on `fix/v2102-agentbridge-07-codex-login` from origin/master `a12c182` / v2.10.1. Real Codex CLI opened `{issuer}/authorize` and got a 404 because unauthenticated discovery 307'd to `/login`. This candidate publishes OAuth/MCP metadata without a session and aliases `/authorize` to the implemented consent handler. Keep Inbox OFF, draft-only ON, posting-stop ON. Owner deploys after the Docker web image is green, then retries the saved Codex login. Independent staging QA pending. Real Codex/Claude stay unverified until that retry. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-18 — Unblock GitHub Actions web build and DB-01 postgres (v2.10.1)

Candidate **2.10.1** on `fix/v2101-ci-web-build` from origin/master `f3a3b8d` / v2.10.0. Production Check and Docker web image failed on v2.9.0 and v2.10.0 (`node:crypto` in the client connection screen, `'use server'` object exports on `/dashboard`, turbo stripping `DATABASE_URL`, tenant-b isolation expected 0 vs fixture 9999). Keep Inbox OFF, draft-only ON, posting-stop ON. Owner deploys after the Docker web image is green. Independent staging QA pending. Real Codex/Claude stay unverified. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-18 — Persistent AgentBridge signing and connection screen (v2.10.0)

Candidate **2.10.0** on `feat/v210-agentbridge-connect` from origin/master `bcac32a` / v2.9.0. Internal generate-once PKCS8 signing on a named volume so the usual Portainer Re-pull serves JWKS. Connection details live at `/purchase/inbox/connections`. Keep Inbox OFF, draft-only ON, posting-stop ON. Owner deploys after the Docker web image is green. Independent staging QA pending. Real Codex/Claude stay unverified. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-18 — Business overview dashboard DB-01 (v2.9.0)

Candidate **2.9.0** on `feat/v290-dashboard-db01` from origin/master `9a719dc` / v2.8.3. `/dashboard` is a labelled business overview with metric contracts in [DASHBOARD_METRICS.md](DASHBOARD_METRICS.md). CoreGuard Dashboard DB-01 is a Docker web image publication prerequisite. AgentBridge signing PEM_FILE stays. Keep Inbox OFF, draft-only ON, posting-stop ON. Owner deploys after the Docker web image is green. Independent staging QA pending. Real Codex/Claude stay unverified. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-18 — Staging AgentBridge signing file + compose forwarding (v2.8.3)

Candidate **2.8.3** on `fix/v283-agentbridge-signing` from origin/master `e9160f3` / v2.8.2. Compose now forwards AgentBridge public URL, issuer, kid, and a read-only signing-key file. `oauthSigningPem` loads `AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE`. Feature-branch PR only — owner deploys; do not silently redeploy. Operator steps: [AGENT_BRIDGE_SIGNING_STAGING.md](AGENT_BRIDGE_SIGNING_STAGING.md). Keep Inbox OFF, draft-only ON, posting-stop ON. After owner deploy, public JWKS must be a nonempty RSA list. Real Codex/Claude stay unverified until independent client sessions pass. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-18 — Self-host Noto Serif Sinhala so Production Check can build (v2.8.2)

origin/master merged PR #19 as **2.8.1** `756f9fb`. Production Check `44234985424` failed `next/font/google` (Google CSS `/l/font?kit=` URLs without extensions). Docker web image on that merge succeeded. This candidate vendors Noto Serif Sinhala and uses `next/font/local`, and declares JWKS `runtime` on the well-known route. See [CHG-20261118-local-sinhala-font](changes/CHG-20261118-local-sinhala-font.md). Keep Inbox OFF, draft-only ON, posting-stop ON. After Docker web image is green, owner Portainer Re-pull ON. Independent remaining-only AgentBridge mission stays `docs/qa/CODING-AGENTBRIDGE-06-QA.md`. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-18 — AgentBridge AB-06 independent acceptance repair (v2.8.1)

Candidate **2.8.1** on `fix/v281-agentbridge-06` from origin/master `43233f0` / v2.8.0. Focused repair of independent v2.8.0 service acceptance failures (concurrency, facts hash, category label, approval binding, upload session, archive health, production OAuth). Merged as origin/master `756f9fb`. Independent remaining-only mission `docs/qa/CODING-AGENTBRIDGE-06-QA.md`. After owner deployment of 2.8.2, independent QA retests posting, real Codex/Claude, and recovery LAST. See [CHG-20261118-agentbridge-06](changes/CHG-20261118-agentbridge-06.md) and [AGENT_BRIDGE.md](AGENT_BRIDGE.md). Keep Inbox OFF, draft-only ON, posting-stop ON. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-17 — AgentBridge v1 unpaid service bill workflow AB-05 (v2.8.0)

Candidate **2.8.0** on `fix/v280-agentbridge-05` from origin/master `9eb13da` / v2.7.4. Complete AgentBridge v1 unpaid domestic service/expense bill path with no OCR required, plus staging UI defects AB05-UI-01/02/03. Feature-branch PR only — do not merge or enable existing-company posting. Independent remaining-only mission `docs/qa/CODING-AGENTBRIDGE-05-QA.md`. Codex, Claude, staging financial workflow and recovery LAST are not independently qualified. See [CHG-20261117-agentbridge-05](changes/CHG-20261117-agentbridge-05.md) and [AGENT_BRIDGE.md](AGENT_BRIDGE.md). Keep Inbox OFF, draft-only ON, posting-stop ON. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-16 — AgentBridge approve/post permission keys AB-04 (v2.7.4)

Independent retest of v2.7.3 `382f0d8` found catalog `agent_bridge.approve` / `agent_bridge.post` grants that `allows(..., 'write')` did not recognize for Owner, Accountant and Purchasing (QA draft PR #123). This candidate uses an explicit-key rule plus a persisted `.write` alias so those standard jobs can approve and post. Viewer stays read-only. Flags stay off. Staging remains unchanged. See [CHG-20261116-agentbridge-04](changes/CHG-20261116-agentbridge-04.md). Owner deploys after independent qualification. Do not enable posting until then. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-16 — AgentBridge authorization, reconciliation, restore AB-03 (v2.7.3)

Independent retest of v2.7.2 `2967526` reproduced Viewer stale-scope posting, lost-response document drift, and restore attachment lookup failure (QA draft PR #122). This candidate intersects token scopes with current grants, reconciles receipt and document together, and remaps blob keys with the shared storage-pointer rule. Flags stay off. See [CHG-20261116-agentbridge-03](changes/CHG-20261116-agentbridge-03.md). Owner deploys via Docker web image then Portainer Re-pull ON. Do not enable posting until qualification. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-16 — Type AgentBridge operation receipts for web lint (v2.7.2)

v2.7.1 `4e9b7ba` quality job failed `tsc` on `mapOp` receipt `never`. This candidate types receipts as `OperationReceipt` so the Docker web image can build. Flags stay off. See [CHG-20261116-agentbridge-02-lint](changes/CHG-20261116-agentbridge-02-lint.md). Owner deploys via Docker web image then Portainer Re-pull ON. Do not enable posting until qualification. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-16 — AgentBridge grouped repair AB-02 (v2.7.1)

Independent review of v2.7.0 `ab54e34` reproduced seven acceptance failures (QA draft PR #121). This candidate fails closed on blocking issues at approval and posting, claims one operation per proposal, rejects tokens without finite expiry, refuses agent-minted human approval, implements the OCR HTTP adapter, keeps tenant scope on every store call, and dumps AgentBridge records in tenant archive (connections excluded). Flags stay off. See [CHG-20261116-agentbridge-02](changes/CHG-20261116-agentbridge-02.md). Owner deploys via Docker web image then Portainer Re-pull ON. Do not enable posting until qualification. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-16 — AgentBridge Foundation AB-01 (v2.7.0)

Document Inbox and the shared AgentBridge purchase-bill service land behind company flags that default off. List clipping and docs isolation from UI-NAV-01 stay. See [CHG-20261116-agentbridge-01](changes/CHG-20261116-agentbridge-01.md) and [AGENT_BRIDGE.md](AGENT_BRIDGE.md). Owner deploys via Docker web image then Portainer Re-pull ON. Live OCR, production IdP, and external MCP clients stay BLOCKED. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-16 — Remove sidebar Tiles; keep list clipping fix (v2.6.1)

Sidebar List/Tiles toggle and tile navigation are gone. Accounting View-only children still show Documentation fully; docs still open in a new tab. See [CHG-20261116-remove-nav-tiles](changes/CHG-20261116-remove-nav-tiles.md). Owner deploys via Docker web image then Portainer Re-pull ON. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-16 — UI-NAV-01 sidebar clipping, docs isolation, List/Tiles (v2.6.0)

Accounting View-only children no longer clip Documentation. Documentation opens in a new tab; same-tab history Back restores BookOne chrome. Sidebar List/Tiles toggle defaults to List. See [CHG-20261116-ui-nav-01](changes/CHG-20261116-ui-nav-01.md). Owner deploys via Docker web image then Portainer Re-pull ON. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-15 — Simple Entry write comes from the server home page (v2.5.30)

v2.5.29 Docker web image and Production Check failed compile because client Simple Entry imported `@/lib/access` (`next/headers`). Home now derives `jobCanWrite(tenant, 'Simple Entry')` on the server and passes `canWrite`. Viewer still sees the read-only Record hint. See [CHG-20261115-simple-entry-canwrite](changes/CHG-20261115-simple-entry-canwrite.md). Owner deploys via Docker web image then Portainer Re-pull ON. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-15 — Mission1 grouped register auth, payment validation, purchase VAT preview, labels, VAT summary (v2.5.29)

Mission1 on live `v2.5.28 · 48e4407`: Viewer could see register/VAT Save on `/company/sales` because register actions used `requireTenantContext` without `assertPermission`. Payment helpers parsed `1abc` as 1 and previewed mixed `-1`+cap as a different total than submit. Unsaved claimed purchase 2×60 showed Total 120 with no VAT row. POS service memo showed `18.000000000000004%`. Converted QT/SO displayed “Tax invoice” beside the quote/order number. Reports had no VAT summary. This candidate gates register writes on `company.sales_settings.write`, shares one validated payment batch, shows purchase net/VAT/gross from the posting policy, formats VAT memos, separates document type from tax treatment, and adds a bookkeeping VAT summary on Reports. See [CHG-20261115-mission1-grouped](changes/CHG-20261115-mission1-grouped.md). Owner deploys via Docker web image then Portainer Re-pull ON. Do not replay CONT11 or the POS 118 refund. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-14 — POS linked-return preview uses original VAT (v2.5.28)

CONT10 on deployed `v2.5.27 · dae17ab`: TAX POS sale 2×100 net 200 / VAT 36 / gross 236 accepted. Return lookup of that ticket showed sold 2 / left 2, but selecting one unit previewed refund **100** instead of **118**. No refund was posted. This candidate uses the original ticket stored tax profile for linked-return cart, modal and Complete refund. Commercial/zero-VAT and free returns stay net-only. See [CHG-20261114-pos-linked-return-vat](changes/CHG-20261114-pos-linked-return-vat.md). Owner deploys via Docker web image then Portainer Re-pull ON. Do not repair QA history. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-12 — Purchase input VAT at PO/GRN-to-bill conversion (v2.5.27)

Source qualification of the PO→GRN→bill journey found no supported Claim input VAT choice on PO new, PO convert, or GRN-to-bill convert (direct purchase already had it). This candidate stores informational input-VAT intent on PO/GRN, copies it through conversion, and lets the operator override on the bill. VAT-registered 10×60 Claim posts inventory 600 / input VAT 108 / AP 708 on the bill only. Commercial/no-input stays 600. Non-VAT explicit claims are refused with zero posting. Review branch `fix/v2527-purchase-vat-conversion` — do not merge or deploy in this request. See [CHG-20261112-purchase-vat-conversion](changes/CHG-20261112-purchase-vat-conversion.md). Do not grant fixtures or replay prior money. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-12 — VAT conversion profile and manual POS print (v2.5.26)

Grouped coding candidate from combined qualification 15 passed / 4 blocked / 3 inconclusive on product `a6eda60` / v2.5.25. VAT-registered quotes and orders store intended invoice kind and sale channel without posting tax. Convert copies that profile; convert-to-invoice can override. Tax invoices post output VAT; commercial does not. Ineligible tax invoices are refused with zero posting. POS print mode `manual` skips autoprint, thermal write, and drawer kick on sale, refund, and Z-close. Default print mode stays `browser`. Payment receipts stay on `/sales/payments/receipt?payment=<paymentTransactionId>`. See [CHG-20261112-vat-pos-print](changes/CHG-20261112-vat-pos-print.md). Owner deploys via Docker web image then Portainer Re-pull ON. Do not grant fixtures or replay 11 Nov money. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-11-04 — Rapid04 follow-up hire continuity, bays, Activity (v2.5.25)

Rapid04 follow-up on live v2.5.24 · `e5bb589` after fixture PR93. Charge invoices keep the hire order status. After-return hire invoices do not re-reserve or void the deposit event. Owner can create On rent / Wash / Repair through Locations Type or Create missing hire bays. Activity lists rental booking/event/stock-level rows. Review branch `fix/v2525-rapid04-followup` — do not merge or deploy in this request. See [CHG-20261104-rapid04-followup](changes/CHG-20261104-rapid04-followup.md). A/B accounts already exist; do not recreate them. Fleet 20@50 and after-return settings on A remain unprepared until qualified on this candidate. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-10-30 — Rapid04 rental permission, agreed charges, cash tender (v2.5.24)

Rapid04 qualification on baseline v2.5.23 · `b89dd78`. Dispatch/return/extend/release now fail closed without `rental.dispatch.write` and rental module. Dirty return is stock-only. Agreed 4450/4400 uses **Invoice hire charges**. Deposit tender defaults to Cash 1000. Charge invoices link the hire document without converting it. Original QA Inventory-off ceiling is unchanged. Review branch `fix/v2524-rapid04-qualification` — do not merge or deploy in this request. See [CHG-20261030-rapid04-rental-security](changes/CHG-20261030-rapid04-rental-security.md). Staging Pro+rental fixture AUTH is separate. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-10-29 — Rapid02 grouped settlement, allocation UX, activity, return tender (v2.5.23)

Rapid02 on v2.5.22 · `211771e`: 18 passed / 3 failed / 2 inconclusive. Supplier cash refunds posted correct cash/stock/expense but left credits open/paid0. This candidate settles **new** cash refunds (`refunded`, paid=total, balance 0), adds per-source over-balance feedback on both payment forms, adds `/journal/audit`, exposes ordinary sales-return tender, and documents the rental Inventory/Rental module ceiling. Historical Rapid02 refund rows are not rewritten. Review branch `fix/v2523-rapid02-consolidated` — do not merge or deploy in this request. See [CHG-20261029-rapid02-consolidated](changes/CHG-20261029-rapid02-consolidated.md). Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-10-24 — List BODY return-focus, return paid help, order source link (v2.5.22)

Light07 attempt2 of v2.5.21 · `7458a9c`: 13 passed / 1 operator checkpoint failure / 22 blocked. List Archive cancel now ignores a captured BODY and restores the surviving row Actions button. Sales-return paid/partial badges expose help. Sales orders show a visible source-quotation link on View and `/sales/orders/[id]`. Order print, list/trial export, and actor/audit UI remain unsupported. See [CHG-20261024-light06-focus-order-source](changes/CHG-20261024-light06-focus-order-source.md). Review branch only — do not merge or deploy in this request. Preserve Light07 S600/P200 and converted Q/order 600. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-10-23 — List return focus and layout-width status help (v2.5.21)

Light05 recovery review of v2.5.20 · `de45536`: 9 passed / 2 failed / 16 blocked / 3 inconclusive. List Archive cancel now returns focus to the surviving row Actions button instead of BODY. Status help at 320/305 layout is capped to 289px so both 8px gutters fit. See [CHG-20261023-light05-list-focus-help](changes/CHG-20261023-light05-list-focus-help.md). Applicable UX refs: UXW-005/018. Do not deploy across an active Light mission. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-10-22 — Raw header discount, dialog focus, tooltip placement, credit print (v2.5.20)

PR54/PR55 coding mission on inspected master v2.5.19 · `3e9ffee`. Quote header 150% is refused from preserved raw type/value instead of saving a clamped 10 draft. ConfirmDialog and StatusHelp use the existing primitives with focus trap and measured placement. Sales credit print is CREDIT NOTE. Product create/edit is view-only without inventory write. Required-supplier refusal keeps a durable alert. See [CHG-20261022-pr54-header-dialog-credit](changes/CHG-20261022-pr54-header-dialog-credit.md). Do not deploy across an active Light mission. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-10-21 — Bill-picker remount and split-return source prices (v2.5.19)

Light03 fresh attempt on v2.5.18 · a4a6d65: 18 passed / 2 failed / 2 blocked. Client bill-picker selection now remounts remaining qty/price/vendor instead of leaving empty lines. Added linked-return catalog rows lock the source unit price (catalog 10 does not replace source 100). Branch `fix/v2519-light03-picker-split-price` is on master as `4c3a304`. See [CHG-20261021-light03-picker-split-price](changes/CHG-20261021-light03-picker-split-price.md). Applicable UX refs: UXW-009/010/011; adjacent UXW-002/004/006/012. INV0032 open 300 preserved. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-10-21 — Incremental UI/UX QA contract (documentation only)

Owner-requested existing-design preservation and shared UX workbook adoption on product v2.5.19 · `4c3a304` without overwriting Light03 code. See [UI_UX_CHANGE_GUIDE](UI_UX_CHANGE_GUIDE.md) and [CHG-20261021-ux-incremental-contract](changes/CHG-20261021-ux-incremental-contract.md). Root AGENTS/.claude, existing list guide, QA contract and CHG template now require scoped compatible changes, external UX/UXW/WB refs, shared-consumer impact and actual evidence. External 48 UX workflows remain draft/unbound/not-run. UXQ-001–004 stay unresolved. No UI code/VERSION/deployment change in this documentation commit. Independent QA retests the existing Light03 build. Backup last. BookOne is not customer-ready.

## 2026-10-18 — Visible partial purchase-return entry (v2.5.18)

Light02 coding mission on frozen v2.5.16 · b2c5205: 12 passed / 2 failed / 4 blocked. This candidate keeps the v2.5.17 required-number correction and 256.50 draft hydration and adds a visible remaining-qty purchase-return path (bill picker, list Return, detail Create return → `/purchase/returns/new?from=`). Independent example: return 1@60 is Dr AP 60 Cr Inventory 60; leftover bills 120+120; stock 4/240. Branch `fix/v2517-pr46-idempotency-hydration` — do not deploy onto remaining frozen Light02 `b2c5205`. See [CHG-20261018-light02-purchase-return-entry](changes/CHG-20261018-light02-purchase-return-entry.md). Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-10-18 — Rejected-attempt idempotency, draft hydration, return breakdown (v2.5.17)

QA PR #46 coding mission on v2.5.16 · b2c5205. Conclusive create refusals release the pending idempotency claim so a corrected retry can post once; in-flight claims stay busy and committed success replays. Draft invoices restore SKU, product class and line discounts. Return View shows persisted gross/discount/net, header, allocationAdjustment, VAT and credit. Invalid return quantity is a distinct preview state. Bill conversion takes an entered supplier invoice number. Branch `fix/v2517-pr46-idempotency-hydration` — do not deploy while Light02 is executing on frozen `b2c5205`. See [CHG-20261018-pr46-idempotency-hydration](changes/CHG-20261018-pr46-idempotency-hydration.md). Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-10-18 — Preview header cap, residual line representation, retain fields on error (v2.5.16)

QA PR #44 review of v2.5.15: source diagnostics 13 checks, 7 passed / 6 failed. Linked-return preview now shares remaining-header cap and residual math with posting. Legacy 1.01/1.04 credits keep an explicit last-line allocation adjustment. Failed commercial creates keep submitted dates, notes and selects. See [CHG-20261018-preview-cap-residual-form-retain](changes/CHG-20261018-preview-cap-residual-form-retain.md). Portainer Re-pull ON after Docker web image. Quote `v2.5.16 · <sha7>`. Isolated upgrade cases remain blocked. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-10-18 — Closing residual 1.01, aggregate return qty, taxed full credit, retained stock error (v2.5.15)

QA HANDOFF on v2.5.14: 87 bounded manual checks, 70 passed / 11 failed / 6 inconclusive. Closing linked returns take leftover source net so the last of 6.95 after 5.94 previews and posts 1.01. Return rows of the same SKU are aggregated (2+2 vs 3 refused). A discounted taxable full return keeps header 13.50 and credits 302.67. Stock shortage keeps the invoice form. See [CHG-20261018-residual-duplicate-tax-form](changes/CHG-20261018-residual-duplicate-tax-form.md). Portainer Re-pull ON after Docker web image. Quote `v2.5.15 · <sha7>`. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-10-17 — Linked return party, residual rounding, source price, retained validation (v2.5.14)

QA HANDOFF on v2.5.13: 95 bounded manual checks, 88 passed / 6 failed / 1 inconclusive. Source-linked sales and purchase returns inherit and lock the original party; a different party is rejected before mutation. Linked return unit prices are locked so preview matches the posted source credit. The last remaining unit of a 2.99 source previews and posts 0.99. Invalid 150% line discount keeps the entered invoice form. See [CHG-20261017-return-party-rounding-validation](changes/CHG-20261017-return-party-rounding-validation.md). Portainer Re-pull ON after Docker web image. Quote `v2.5.14 · <sha7>`. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-10-17 — Historical aging, return preview, subtotal labels (v2.5.13)

QA HANDOFF on v2.5.12: 67 bounded manual checks, 61 passed / 4 failed / 2 inconclusive. As-of aging reconstructs later settlements so a 17 Oct receipt of 1 does not reduce 16 Oct AR (181; aggregate 251). Partial-return preview matches posted credits (85.50 / 171). Quote and invoice Subtotal labels show line-net 270 against Discount 13.50 and Total 256.50. Stored totals and journals are unchanged. See [CHG-20261017-aging-return-preview-subtotal](changes/CHG-20261017-aging-return-preview-subtotal.md). Portainer Re-pull ON after Docker web image. Quote `v2.5.13 · <sha7>`. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-10-16 — Broad-workflow findings (v2.5.12)

QA HANDOFF on v2.5.11: 62 bounded manual checks, 45 passed / 17 failed → nine findings (five P1s). PO remaining now includes GRN-sourced bills and rejects over-receipt. Purchase returns reject a second full return. New line discounts default to percent (3×100 / 10% / header 5% = 256.50). Payment print is allocation-backed. As-of aging excludes later-issued documents. Convert duplicate-bill and over-balance payment return visible errors without posting. Linked return preview copies header discount. Percentage discounts above 100% refuse. See [CHG-20261016-broad-workflow-findings](changes/CHG-20261016-broad-workflow-findings.md). Portainer Re-pull ON after Docker web image. Quote `v2.5.12 · <sha7>`. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-10-16 — Restricted DB company settings and platform catalog (v2.5.11)

QA HANDOFF on v2.5.10: 303 campaign assertions pass; 129 PostgreSQL pass; HTTPS 23 pass / 2 fail / 1 blocked. BUG-0053 own-invoice GET now passes. `getCompanySettingsData` no longer bootstraps memberships outside tenant context. Platform Admin listing uses a privileged catalog; lookup functions are hardened in forward migration 043. See [CHG-20261016-restricted-settings-platform](changes/CHG-20261016-restricted-settings-platform.md). Portainer Re-pull ON after Docker web image. Quote `v2.5.11 · <sha7>`. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-10-15 — Restricted DB own invoices (v2.5.10)

QA HANDOFF on v2.5.9: 303 campaign assertions pass; 13/13 owner-DB HTTP pass; HTTP-102 fail (restricted-DB own invoice 307 `/login`) with ten dependents blocked. `getTenantInfo` now re-pins tenant GUC for the `tenants` row after `requireTenantContext` returns. See [CHG-20261015-restricted-tenant-guc](changes/CHG-20261015-restricted-tenant-guc.md). Portainer Re-pull ON after Docker web image. Quote `v2.5.10 · <sha7>`. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-10-15 — HTTP permissions, session identity, BS as-of (v2.5.9)

QA HANDOFF on v2.5.8: HTTP 9 passed / 8 failed / 9 blocked; PostgreSQL 127 passed / 2 failed. Viewer wrote company details and four settings forms. Product now splits period P&L from as-of balance sheet, seeds Starter modules on additional companies, asserts Viewer-denied settings writes, repairs Owner jobs only, and resolves credential identity without BYPASSRLS. See [CHG-20261015-http-permissions-session](changes/CHG-20261015-http-permissions-session.md). Portainer Re-pull ON after Docker web image. Quote `v2.5.9 · <sha7>`. Restore remains unverified. Backup testing stays last. BookOne is not customer-ready.

## 2026-10-15 — Physical browser reports, receipt, PO vendor, SO preview (v2.5.8)

QA HANDOFF on v2.5.7: physical browser 19 pass / 4 fail; campaign 300 pass / 1 fail (RT-060). Balance Sheet now includes unclosed current earnings so assets 1520 equal liabilities 400 + equity 1120. Receipt print is a client boundary. First PO alternative vendor name saves. Sales-order View uses sales-order labels. See [CHG-20261015-physical-browser-reports-print](changes/CHG-20261015-physical-browser-reports-print.md). Portainer Re-pull ON after Docker web image. Quote `v2.5.8 · <sha7>`. Restore remains unverified. BookOne is not customer-ready.

## 2026-10-15 — Module-off historical document reads (v2.5.7)

QA STATUS on v2.5.6: 292 checks, 291 passed, 1 failed (BUG-0043 / RT-047). Live stamp confirmed **v2.5.6 · d5377d8**. Backup page opens; restore is disabled on a company with records (empty-tenant gate, not restore acceptance). Owner historical invoice detail is now allowed after Sales-off while create/pay stay denied; Warehouse, scope-fault, deny-override and Viewer writes are unchanged. See [CHG-20261015-module-off-historical-read](changes/CHG-20261015-module-off-historical-read.md). Portainer Re-pull ON after Docker web image. Quote `v2.5.7 · <sha7>`. Restore remains unverified. BookOne is not customer-ready.

## 2026-10-14 — QA batch all-or-nothing, returns, VAT, scope (v2.5.6)

QA STATUS on v2.5.5: 292 checks, 273 passed, 19 failed (13 groups). Product now rolls back mixed payment batches, fingerprints payment keys, requires files-pack `dataSha256` when the restore stored it, restores original return cost/discount/tax, charges VAT from classification, refuses excessive discounts and repeat refunds, settles cash credits on liquid tender, and fail-closes document detail plus shop-scope metadata errors. See [CHG-20261014-qa-batch-atomicity-sales-scope](changes/CHG-20261014-qa-batch-atomicity-sales-scope.md). Portainer Re-pull ON after Docker web image. Quote `v2.5.6 · <sha7>`. Restore remains unverified. Browser workflows still pending Admin grant. BookOne is not customer-ready.

## 2026-10-14 — QA campaign atomicity, auth, restore pair (v2.5.5)

Unified QA campaign (bookone-qa PR #15) on v2.5.3: 242 passed, 13 failed, 4 skipped; original 60 source + 49 DB still green. Nine new defect groups. Product now serializes AR payments, completes payment idempotency without `id`, denies Viewer rental-money and stock-transfer writes, rolls back failed deposit/transfer, pairs files packs on `dataSha256` when present, and refuses empty journals / posted AR without a transaction. See [CHG-20261014-qa-campaign-atomicity-auth](changes/CHG-20261014-qa-campaign-atomicity-auth.md). Portainer Re-pull ON after Docker web image. Quote `v2.5.5 · <sha7>`. Restore remains unverified. Full coverage still unfinished (137 workflows; 57 partial, 80 none).

## 2026-10-14 — Archive backup owner-only + restore integrity (v2.5.4)

QA HANDOFF-20261014-backup-plan on v2.5.3: 60 source + 49 PostgreSQL pass; archive helpers 15/1 fail (BUG-0021 Admin resolver). Privileged backup keys now skip RBAC-off full-access. Restore enforces stock/layers and AR/AP vs documents and refuses to complete an invalid files pack. Legacy v2.4.0 pairing is exportId-only. See [CHG-20261014-archive-backup-owner-integrity](changes/CHG-20261014-archive-backup-owner-integrity.md). Portainer Re-pull ON after Docker web image. Quote `v2.5.4 · <sha7>`. Restore remains unverified.

## 2026-10-14 — Form overlay audit (v2.5.3)

Document `submit` capture removed. Client writes use `withFormPending`. AGENTS.md **Form busy overlay** is mandatory for new forms. See [CHG-20261014-form-busy-overlay-audit](changes/CHG-20261014-form-busy-overlay-audit.md). Portainer Re-pull ON after Docker web image. Quote `v2.5.3 · <sha7>`.

## 2026-10-14 — Stuck form overlay (v2.5.2)

“Working… please wait” stayed up after backup, reverse, and sometimes login. Client pending never cleared. See [CHG-20261014-form-busy-overlay-stuck](changes/CHG-20261014-form-busy-overlay-stuck.md). Portainer Re-pull ON after Docker web image is green. Quote `v2.5.2 · <sha7>`.

## 2026-10-14 — Backup page NoSuchKey (v2.5.1)

Company → Backup crashed with MinIO `NoSuchKey` (digest 182952617) when no prepared archive object existed. See [CHG-20261014-tenant-archive-backup-nosuchkey](changes/CHG-20261014-tenant-archive-backup-nosuchkey.md). Portainer Re-pull ON after Docker web image is green. Quote `v2.5.1 · <sha7>`.

## 2026-10-14 — Tenant archive files pack, transformers, reminder (v2.5.0)

Owner applies the matching attachments pack after data restore, sees missing receipts, and gets a 30-day backup reminder. See [CHG-20261014-tenant-archive-files](changes/CHG-20261014-tenant-archive-files.md). Portainer Re-pull ON after Docker web image is green. Quote `v2.5.0 · <sha7>`.

## 2026-10-13 — Tenant archive restore + Control Room nav (v2.4.0)

Owner restores encrypted company data into an empty tenant (phase 2). Control Room menu children show for platform super_admin. Files pack apply shipped later in v2.5.0. See [CHG-20261013-tenant-archive-restore](changes/CHG-20261013-tenant-archive-restore.md). Portainer Re-pull ON after Docker web image is green. Quote `v2.4.0 · <sha7>`.

## 2026-10-13 — Tenant archive export (v2.3.0)

Owner-held company backup phase 1: paired encrypted downloads at Company → Backup. Restore shipped later in v2.4.0. See [CHG-20261013-tenant-archive-export](changes/CHG-20261013-tenant-archive-export.md).

## 2026-10-13 — Physical SKU, posting atomicity, bill approve (v2.2.5)

QA RUN-15 on v2.2.4: foreign SKU on invoice, leftover txn/empty journal, Viewer bill approve. See [CHG-20261013-physical-sku-atomicity-approval](changes/CHG-20261013-physical-sku-atomicity-approval.md). Portainer Re-pull ON after Docker web image is green. Quote `v2.2.5 · <sha7>`.

## 2026-10-13 — Reserved Drizzle client (v2.2.4)

v2.2.3 empty module nav / dashboard `parsers` TypeError: reserved postgres.js clients lack `options`. See [CHG-20261013-reserved-drizzle](changes/CHG-20261013-reserved-drizzle.md). Portainer Re-pull ON after Docker web image is green. Quote `v2.2.4 · <sha7>`.

## 2026-10-13 — Reports, dates, receipt, RLS, reversal (v2.2.3)

QA RUN-12 on v2.2.2: payments pass; `30 Feb 2026` still rolled over; credit 100 inflated reported income; receipt signer, tenant helper, and double reversal still failed. See [CHG-20261013-runtime-reports-dates](changes/CHG-20261013-runtime-reports-dates.md). Portainer Re-pull ON after Docker web image is green. Quote `v2.2.3 · <sha7>`.

## 2026-10-13 — Payment allocation, tender, bank dates (v2.2.2)

QA RUN-10: quality gate verified (A 15/15); remaining source findings B-007 Viewer allocation, B-011 revenue tender, F-004 impossible bank dates. `allocateDocumentPayment` now asserts write + liquid tender; `parseStatementDate` rejects non-calendar dates. See [CHG-20261013-allocation-tender-date](changes/CHG-20261013-allocation-tender-date.md). Portainer Re-pull ON after Docker web image is green. Quote `v2.2.2 · <sha7>`.

## 2026-10-13 — Quality + GHCR gate (v2.2.1)

QA RUN-08: Batch A 14/15, remaining A-014 / BUG-0008 (Docker published while quality was red). Type errors fixed; Docker web image now requires same-workflow lint+typecheck+build+test, including manual dispatch. See [CHG-20261013-quality-release-gate](changes/CHG-20261013-quality-release-gate.md). Portainer Re-pull ON after Docker web image is green. Quote `v2.2.1 · <sha7>`.

## 2026-10-13 — QA finance + sidebar (v2.2.0)

QA PR #5 finance handoff: Viewer reversal denied; cash flow nets sale+reversal; Open AR ignores unposted/archived drafts; Reports period label; Production Check gates GHCR. Sidebar shows first name + job, centered version, logo to dashboard. See [CHG-20261013-finance-qa-and-sidebar](changes/CHG-20261013-finance-qa-and-sidebar.md). Portainer Re-pull ON after Docker web image is green.

## 2026-10-13 — On-screen version (v2.1.0)

Sidebar bottom-left shows `v2.1.0 · <sha>`. Agents must bump `VERSION` before product commits. See [VERSIONING.md](VERSIONING.md) and [CHG-20261013-on-screen-version](changes/CHG-20261013-on-screen-version.md). Portainer Re-pull ON after Docker web image is green.

## 2026-10-13 — Viewer hard deny (QA PR #5)

QA still created customers and invoice drafts as Viewer after `85bb2f3`. Primary Viewer is now read-only even with extra grants. Login shows `build <sha>`. See [CHG-20261013-viewer-hard-deny](changes/CHG-20261013-viewer-hard-deny.md). Pull GHCR after Docker web image is green (Re-pull ON).

## 2026-10-12 — Viewer write denial (BUG-0003 / BUG-0004)

QA PR #4: Viewer created a customer and saved invoice draft `INV-20261012-0001`. Product now denies those writes on the server and hides New/Edit/Archive. See [CHG-20261012-viewer-write-denial](changes/CHG-20261012-viewer-write-denial.md). Pull the new GHCR image after **Docker web image** is green.

## 2026-10-12 — GHCR web image (VPS only pulls)

GitHub Action **Docker web image** pushes `ghcr.io/dinu-sri/bookone-web:latest`. Staging and prod compose have no `web` `build:`. Wait for the Action to go green, then Portainer Update with Re-pull ON. Infra stays `pull_policy: missing`. See [CHG-20261012-ghcr-web-image](changes/CHG-20261012-ghcr-web-image.md).

## 2026-10-12 — QA BUG-0001 / BUG-0002

Simple Entry cash sale posts to 4000. Viewer invoice write denial is a toast/readable page, not a Next.js error. See [CHG-20261012-qa-bugs-0001-0002](changes/CHG-20261012-qa-bugs-0001-0002.md). Rebuild web to pick up.

## 2026-10-12 — Tenant portable archive (design freeze)

Superseded 2026-10-13: phase 1 export shipped in v2.3.0. Restore remains unbuilt. Spec: [TENANT_BACKUP_ARCHIVE.md](TENANT_BACKUP_ARCHIVE.md).

## 2026-10-12 — Remove Control Room test tools; grant admin by email

Health Check is an empty placeholder. Control Room Audit, company reset, demo seed APIs/scripts, and leftover E2E docs (`docs/E2E_*`, `REMOVE_INBUILT_E2E.md`, `PRODUCTION_SMOKE_TEST.md`) are gone. Schema/migration `019` is kept. `PLATFORM_ADMIN_EMAIL` (comma-separated) promotes those users to `super_admin` on signup and login so Control Room appears. Owner must set the env in Portainer and rebuild web. See [CHG-20261012-remove-test-ops](changes/CHG-20261012-remove-test-ops.md).

## 2026-10-12 — Portainer web image install hotfix

Wave 1b is on `master`. Production Check going green does not build the Portainer image. `Dockerfile.web` now uses Debian slim (glibc, same as Actions) and a full workspace copy. Pull latest `master` and rebuild **web only** (never MinIO). Then run bookone-qa denial tests S-0031–S-0033.

## 2026-10-12 — Inbuilt E2E cleanup Wave 1b (product delete)

Branch `chore/remove-inbuilt-e2e` removes the inbuilt runner, `/e2e`, `/api/e2e/**`, and e2e Docker. Tests live in https://github.com/Dinu-Sri/bookone-qa (`0ed1195`). Do not merge to `master` until reviewed. After deploy, run QA denial tests S-0031–S-0033. Operator: stop `bookone-staging-e2e` and the `bookone-e2e.clossyan.com` tunnel. Health-check, company reset, seeds, migrations, MinIO, `/ops/logs` stay.

## 2026-10-12 — Inbuilt E2E cleanup Wave 1a (QA companion)

QA branch `qa/chg-20261012-e2e-denial` at `0ed1195` asserts `/e2e` and `/api/e2e/**` cannot start runs or return artifacts (S-0031/S-0032/S-0033/S-0578). `agent-browse` lives in bookone-qa. Discovery 770; unit 94 passed / 4 skipped. Wave 1b product delete is on this BookOne branch. Health-check, company reset, seeds, and package unit tests stay.

## 2026-10-12 — Inbuilt E2E cleanup Wave 0 (preservation)

Branch `chore/remove-inbuilt-e2e`. Inventory vs https://github.com/Dinu-Sri/bookone-qa (`b9e13bc`) recorded in [CHG-20261012-remove-inbuilt-e2e](changes/CHG-20261012-remove-inbuilt-e2e.md). Tests are preserved in QA (94 unit passed / 4 skipped; 771 browser tests discovered). Public `/e2e` is still live. Wave 1a companion now exists at bookone-qa `0ed1195`. Health-check, company reset, seeds, and package unit tests stay.

## 2026-10-11 — External QA handover

Canonical public QA project: https://github.com/Dinu-Sri/bookone-qa. All development agents must follow [QA_CHANGE_CONTRACT.md](QA_CHANGE_CONTRACT.md) and maintain [change records](changes/README.md). Inbuilt product test consoles, company reset, demo seeds, and Control Room health-check runners are removed. Staging test data is owner-authorized; production is outside QA access.

---

# BookOne v2 — Master Status, Workflows & Operations Guide

> **Audience:** Anyone joining the project (yourself, future AI agents, or a teammate).
> **Last updated:** 2026-06-16
> **Live URL:** https://bookone.clossyan.com
> **Admin access:** Use the approved secret store; never put credentials in this public repository.

This is the single canonical document for **what's built, what's running, what broke and how we fixed it, how to deploy, how to develop locally, and what's next.** It is the companion to `AGENTS.md` (which is AI-specific) and `docs/DEPLOYMENT_WORKFLOW.md` (which is the operational runbook).

---

## Table of Contents

1. [What is BookOne v2](#1-what-is-bookone-v2)
2. [Architecture at a glance](#2-architecture-at-a-glance)
3. [Implementation master plan — done vs in-progress](#3-implementation-master-plan--done-vs-in-progress)
4. [Repository layout](#4-repository-layout)
5. [Data model (PostgreSQL)](#5-data-model-postgresql)
6. [Storage: R2 (Cloudflare)](#6-storage-r2-cloudflare)
7. [Environments & secrets](#7-environments--secrets)
8. [Local development](#8-local-development)
9. [Production deployment — Portainer stack](#9-production-deployment--portainer-stack)
10. [Deployment errors we hit and exactly how we fixed them](#10-deployment-errors-we-hit-and-exactly-how-we-fixed-them)
11. [Code-level conventions & rules](#11-code-level-conventions--rules)
12. [Testing & verification](#12-testing--verification)
13. [What's next (open work)](#13-whats-next-open-work)
14. [Glossary](#14-glossary)

---

## 1. What is BookOne v2

BookOne v2 is a **multi-tenant SaaS accounting & ERP** application, rebuilt from scratch in Next.js 15 (TypeScript, App Router) on top of the proven double-entry accounting logic of the original PHP system. It is built for non-accountants:

- **Simple Entry** is a 4-tile screen (Money In / Money Out / Move Money / Invoice/Bill) with a date, party, amount, free-text description, and a receipt upload.
- **The engine** maps that minimal input to a proper double-entry journal with the right debit/credit accounts, balanced to the cent.
- The user **never** sees "debit" or "credit" in the UI; they just see the result and can override the inferred category if they disagree.

The product positioning and design philosophy is documented in `docs/ACCOUNTING_ENGINE_DESIGN.md`.

---

## 2. Architecture at a glance

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser → Cloudflare DNS → Cloudflare Tunnel (cloudflared)    │
│                                     │                          │
│                                     ▼                          │
│  VPS (Linux)                                                        │
│  ┌─────────────────────────────────────────────┐                │
│  │  Docker stack (Portainer)                        │                │
│  │  ┌────────────┐                                │                │
│  │  │ Traefik    │  ← TLS / routing              │                │
│  │  └─────┬──────┘                                │                │
│  │        ▼                                        │                │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────┐ │                │
│  │  │ bookone-   │  │ bookone-   │  │ bookone- │ │                │
│  │  │ web :3100  │  │ postgres   │  │ redis    │ │                │
│  │  │ (Next.js)  │  │ :5432      │  │ :6379    │ │                │
│  │  └─────┬──────┘  └────────────┘  └──────────┘ │                │
│  │        │                                        │                │
│  │  ┌────────────┐  ┌────────────┐                │                │
│  │  │ bookone-   │  │ cloudflared│  (tunnel)     │                │
│  │  │ minio/S3   │  │            │                │                │
│  │  │ (optional) │  │            │                │                │
│  │  └────────────┘                                │                │
│  └─────────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                  ┌────────────────────┐
                  │  Cloudflare R2      │  (receipts)
                  │  bookone-receipts   │
                  └────────────────────┘
```

**Tech stack:**

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend + API | Next.js 15 App Router | SSR + server actions, RSC, type-safe |
| Language | TypeScript (strict) | Catch errors at compile time |
| Monorepo | pnpm workspaces + Turborepo | Fast, isolated, native TypeScript |
| DB | PostgreSQL 16 | RLS, JSON, mature |
| ORM | Drizzle ORM | Type-safe SQL builder, no runtime overhead |
| Auth | Better Auth | Email/password, Google login, verification/reset emails, organization foundation |
| Storage | Cloudflare R2 (S3-compatible) | 10 GB free, no egress fees |
| File upload | AWS SDK v3 (S3 client) | Works with both MinIO and R2 |
| Reverse proxy | Traefik v3 | Auto-TLS, Docker provider |
| Tunnel | Cloudflare Tunnel | No open ports on VPS |
| CI | GitHub Actions | build + lint + typecheck on every push |
| Observability (planned) | Sentry + PostHog | Errors + product analytics |

---

## 3. Implementation master plan — done vs in-progress

Each phase corresponds to a commit on `master`. Replay them in order if you ever need to rebuild from scratch.

### Current checkpoint - 2026-06-21

- Period filtering is wired through Dashboard, Transactions, Journal, Reports, and Reconciliation from the header period picker.
- Bank reconciliation now persists CSV imports, statement lines, automatic matches, and manual Reconciled/Unmatched decisions.
- Period close is implemented through `period_locks`; locked months block new direct entries for that month.
- Reversing entries are available from Transactions and post an opposite journal in the current open period.
- Transaction review now supports search, party, account, low confidence, missing receipt, and unreconciled filters.
- Receipt viewing uses private R2 presigned download URLs from the Transactions page.
- Browser tests live in https://github.com/Dinu-Sri/bookone-qa.
- Customer/vendor parties are reusable records instead of only free-text names.
- Invoices and bills are real AR/AP documents with journal posting and payment allocation.
- Reports v1 now exposes Profit & Loss, Balance Sheet, Cash Flow, General Ledger, and Trial Balance.
- Journal is now the first accounting-engine audit surface: check every posted entry, balance status, debit/credit totals, and ledger integrity before trusting reports or reconciliation.
- Company reset and demo seed tools were removed from the product.
- Settings now includes the company setup foundation: legal company profile, tax identifiers, financial years, brands, locations, tenant memberships, additional company creation, and company switching through tenant-session refresh.

| # | Phase | Status | Commit | Notes |
|---|-------|--------|--------|-------|
| 0 | Legacy audit & architecture docs | ✅ | (pre-monorepo) | README, ACCOUNTING_LOGIC, CHANGELOG |
| 1 | Monorepo scaffold + AGENTS + deployment docs | ✅ | `937de9b` scaffold v2 | pnpm, Turborepo, docker/, docs/ |
| 2 | Docker pipeline working (Traefik, compose, Dockerfile) | ✅ | `3baa35a` | Port 3100 to avoid team-tasks-app |
| 3 | Auto-init entrypoint (migrations + RLS + seed on deploy) | ✅ | `2ded922` | No manual `pnpm db:migrate` needed |
| 4 | Phase 1 — Pure accounting engine + 12 tests | ✅ | `dabfec6` | packages/accounting |
| 5 | Phase 2 — Drizzle schema (9 tables + RLS) | ✅ | `79c517a` | packages/db |
| 6 | Phase 3 — Better Auth login + tenant bridge | ✅ | (current) | Email/password, Google login, verification/reset emails, and BookOne tenant mapping |
| 7 | Phase 4 — `recordEntry` server action | ✅ | `71be731` | Engine + DB transaction + audit |
| 8 | Phase 5 — Login page + entry form wiring | ✅ | `70b136c` | /login + form to recordEntry |
| 9 | Production deploy issues — middleware, cache, pnpm | ✅ | `3e331ea` `ad5fbdb` | Login worked |
| 10 | **Phase A** — Real account selector, date picker, R2 receipts, category override | ✅ | `233b1e2` | apps/web/src/app/actions/* |
| 11 | **Phase B + C** — Dashboard, Transactions, Journal, Reports, Accounts, Reconciliation, Settings | ✅ | `a4d8224` | 7 read pages with real DB data |
| 12 | Period filter actually scopes data | ✅ | (local) | Dashboard / Transactions / Journal / Reports / Reconciliation use `?period=YYYY-MM` or `?period=all` |
| 13 | Multi-company foundation | in progress | (local) | Tenant memberships, additional company creation, and active-company switching are available in Settings |
| 14 | Bank reconciliation wizard (CSV upload) | in progress | (local) | CSV upload preview, exact date/amount matching, and manual Reconciled/Unmatched statuses added; persistence still next |
| 15 | Onboarding wizard (Onborda) | ⏳ | — | First-run tour |
| 16 | Sentry + PostHog | ⏳ | — | Env keys not configured yet |
| 17 | Worker service (apps/workers) | ⏳ | — | Disabled in compose, no source yet |
| 18 | BullMQ cron / scheduled jobs | ⏳ | — | Period close jobs |
| 19 | AI Assistant (OpenAI) | ⏳ | — | Tables exist in `migrations/006_ai_assistant*.sql` |
| 20 | Multi-user invitations | ⏳ | — | Settings page shows 1 user only |
| 21 | Stripe + PayHere billing | ⏳ | — | Env vars reserved in .env.example |

**Recommended next step:** Phase 14 (bank reconciliation CSV upload and matching wizard).

---

## 4. Repository layout

```
BookOne v2
├── apps/
│   ├── web/                        # Next.js 15 App Router (the live app)
│   │   └── src/
│   │       ├── app/                # Routes (/, /login, /dashboard, ...)
│   │       │   ├── actions/        # Server actions (recordEntry, accounts, ...)
│   │       │   ├── dashboard/
│   │       │   ├── transactions/
│   │       │   ├── journal/
│   │       │   ├── reports/
│   │       │   ├── accounts/
│   │       │   ├── reconciliation/
│   │       │   ├── settings/
│   │       │   ├── login/
│   │       │   ├── design-system/
│   │       │   ├── layout.tsx
│   │       │   ├── page.tsx        # Simple Entry
│   │       │   └── globals.css
│   │       ├── components/
│   │       │   ├── layout/bookone-shell.tsx  # Topbar + sidebar
│   │       │   └── ui/bookone-ui.tsx        # Button, Card, Badge, ...
│   │       ├── lib/entry-schema.ts
│   │       ├── lib/demo-data.ts
│   │       └── middleware.ts        # Local middleware (NOT re-exported)
│   └── workers/                    # Disabled — no source yet
├── packages/
│   ├── accounting/                 # Pure TS double-entry engine + inference
│   │   ├── src/
│   │   │   ├── chart-of-accounts.ts            # 20 accounts, 5 types
│   │   │   ├── inference/                      # Tier 1 regex rules
│   │   │   ├── engine/                         # Balanced journal generator
│   │   │   └── index.ts
│   │   └── test/engine.test.ts     # 12 vitest cases, all passing
│   ├── auth/                       # Better Auth + tenant session bridge
│   ├── db/                         # Drizzle ORM, migrations, RLS
│   │   ├── src/schema/             # 9 tables
│   │   ├── src/seed.ts             # Admin user + 20 accounts
│   │   ├── src/db.ts               # Lazy DB connection
│   │   ├── src/helpers.ts          # setTenantContext, withTenantContext
│   │   └── migrations/
│   │       ├── 001_enable_rls.sql
│   │       ├── 005_performance_indexes.sql
│   │       └── 006_ai_assistant*.sql
│   ├── modules/                    # Future: feature flags per tenant
│   └── ui/                         # (currently unused — apps/web has its own)
├── docker/
│   ├── docker-compose.prod.yml     # Production stack definition
│   ├── Dockerfile.web              # Multi-stage build, BUILD_DATE arg
│   ├── Dockerfile.worker           # (unused)
│   └── entrypoint.sh               # Auto-init: migrate → RLS → seed → start
├── docs/
│   ├── ARCHITECTURE_PLAN.md
│   ├── ACCOUNTING_ENGINE_DESIGN.md
│   ├── DEPLOYMENT_WORKFLOW.md      # Operational runbook
│   ├── PORTAINER_SETUP.md         # Env var reference
│   ├── PRODUCTION_RULES.md
│   ├── KNOWN_ERRORS.md
│   ├── TASK_LOG.md
│   ├── CLOUDFLARE_R2_SETUP.md      # Receipts setup guide
│   ├── ENTITY_TIERS_AND_TAX_ARCHITECTURE.md  # Personal / sole prop / pvt ltd strategy
│   └── PROJECT_STATUS.md           # ← THIS FILE
├── ai/                             # AI context (auto-generated)
├── .github/
│   ├── copilot-instructions.md
│   └── workflows/production-check.yml
├── AGENTS.md                       # AI agent instructions (canonical)
├── .env.example                    # Template — NEVER commit .env
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── package.json
```

---

## 5. Data model (PostgreSQL)

9 tables, all with `tenant_id UUID NOT NULL`, RLS enforced.

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `tenants` | Workspace (1 per company) | `id`, `name`, `slug`, `plan` |
| `users` | Auth + role | `id`, `tenant_id`, `email`, `password_hash`, `role` |
| `accounts` | Chart of accounts | `id`, `code`, `name`, `type`, `normal_side` |
| `parties` | (Future) Customers, suppliers, employees | `id`, `tenant_id`, `name`, `type` |
| `transactions` | User-entered entries | `id`, `accounting_type`, `direction`, `amount`, `party`, `category_*`, `receipt_ref` |
| `journal_entries` | One per transaction | `id`, `transaction_id`, `memo`, `entry_date`, `is_balanced` |
| `journal_lines` | Debit/credit lines | `id`, `journal_entry_id`, `account_id`, `side`, `amount` |
| `settlement_allocations` | (Future) Invoice ↔ payment matching | `id`, `invoice_id`, `payment_id`, `amount` |
| `audit_log` | Every mutation | `id`, `user_id`, `action`, `table_name`, `record_id`, `new_values` |
| `bank_statement_imports` | Uploaded bank statement batches | `id`, `tenant_id`, `period`, `file_name`, `status`, `row_count` |
| `bank_statement_lines` | Statement rows and match decisions | `id`, `import_id`, `matched_transaction_id`, `transaction_date`, `amount`, `status` |
| `period_locks` | Closed accounting periods | `id`, `tenant_id`, `period`, `status`, `locked_at` |
| `business_documents` | Customer invoices and vendor bills | `id`, `party_id`, `transaction_id`, `document_type`, `status`, `total`, `balance_due` |
| `business_document_lines` | Invoice/bill line detail | `id`, `document_id`, `account_id`, `description`, `quantity`, `unit_price`, `line_total` |
| `tenant_memberships` | User access to companies | `id`, `tenant_id`, `user_id`, `role`, `status` |
| `company_profiles` | Legal company identity | `id`, `tenant_id`, `legal_name`, `registration_number`, `country`, `base_currency` |
| `tax_profiles` | Tax IDs and document defaults | `id`, `tenant_id`, `tin`, `vat_number`, `invoice_prefix`, `bill_prefix` |
| `financial_years` | Company fiscal years | `id`, `tenant_id`, `label`, `start_date`, `end_date`, `status` |
| `brands` | Trading brands under a company | `id`, `tenant_id`, `name`, `code`, `status` |
| `locations` | Branches, warehouses, counters, offices | `id`, `tenant_id`, `brand_id`, `name`, `location_type`, `status` |

**RLS policy:** `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`. Set at the start of every request via `withTenantContext()` (server) or middleware (Edge).

**Migrations:** Use `pnpm --filter @bookone/db db:migrate` (which runs `drizzle-kit push`). In production, the entrypoint script runs this automatically on every container start.

---

## 6. Storage: R2 (Cloudflare)

Receipts are stored in **Cloudflare R2** under the `bookone-receipts` bucket.

| Property | Value |
|----------|-------|
| Endpoint | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| Region | `auto` |
| Force path-style | `true` |
| Public access | ❌ Disabled (private bucket) |
| Auth model | Presigned URLs (10 min) |
| Path layout | `tenants/<tenantId>/receipts/<userId>/<uuid>-<safeName>` |
| Allowed MIME | JPEG, PNG, WebP, HEIC, HEIF, PDF |
| Max size | 10 MB |

**Why R2:** Free 10 GB tier, no egress fees, full S3 API, same code works against MinIO if we ever need to self-host.

**Setup:** See `docs/CLOUDFLARE_R2_SETUP.md` for the 5-minute walkthrough.

---

## 7. Environments & secrets

| Variable | Used for | Where set |
|----------|----------|-----------|
| `DATABASE_URL` | Postgres connection | Portainer stack env |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Compose healthcheck + Postgres image | Portainer stack env |
| `BETTER_AUTH_SECRET` | Better Auth session signing | Portainer stack env (32+ bytes, base64) |
| `BETTER_AUTH_URL` | Better Auth callback URL | `https://bookone.clossyan.com` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google login | Google Cloud OAuth client |
| `REDIS_URL` | Cache / future BullMQ | `redis://redis:6379` |
| `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`, `S3_FORCE_PATH_STYLE` | R2 / MinIO | Portainer stack env |
| `OPENAI_API_KEY` | AI assistant (Phase 19) | not yet set |
| `SENTRY_DSN` | Error tracking (Phase 16) | not yet set |
| `NEXT_PUBLIC_POSTHOG_KEY` | Product analytics (Phase 16) | not yet set |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflared | Portainer stack env |
| `LETSENCRYPT_EMAIL` | Traefik ACME | Portainer stack env |
| `BUILD_DATE` | Forces Docker cache invalidation on rebuild | Portainer stack env (number) |

**Local `.env`** is in `.gitignore`. Template is in `.env.example`. To set up a teammate:

```bash
cp .env.example .env
# fill in BETTER_AUTH_SECRET: openssl rand -base64 32
# fill in DB_*
docker compose -f docker/docker-compose.yml up -d postgres redis
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

---

## 8. Local development

**Prerequisites:** Node.js 20+, pnpm 9+, Docker Desktop (for Postgres + Redis).

```bash
# 1. Clone and install
git clone https://github.com/Dinu-Sri/BookOne.git
cd BookOne
pnpm install

# 2. Set up env
cp .env.example .env
# Edit .env: set BETTER_AUTH_SECRET, leave DB_ defaults

# 3. Start backing services
docker compose -f docker/docker-compose.yml up -d

# 4. Initialize DB (schema + RLS + seed)
pnpm --filter @bookone/db db:migrate
pnpm exec tsx scripts/init-db.ts

# 5. Start dev server
pnpm dev
# → http://localhost:3000
```

**Useful commands:**

```bash
pnpm test                                # Run all vitest suites
pnpm --filter @bookone/accounting test   # Just the accounting engine
pnpm --filter @bookone/web typecheck     # TypeScript check
pnpm --filter @bookone/web build         # Production build (no start)
pnpm --filter @bookone/db db:studio      # Open Drizzle Studio (DB GUI)
```

---

## 9. Production deployment — Portainer stack

**Source of truth:** GitHub `master` → Action **Docker web image** pushes GHCR → Portainer pulls `ghcr.io/dinu-sri/bookone-web:latest`.

**In Portainer:**

1. **Stacks → bookone → Editor**
2. Repository: `https://github.com/Dinu-Sri/BookOne`
3. Compose path: `docker/docker-compose.prod.yml` ← **must be the prod file, not dev**
4. Environment variables: see Section 7 above. **Do not include quotes around values unless the value contains spaces.**
5. Wait until GitHub Action **Docker web image** is green (it tags the image with the commit SHA as `BUILD_DATE`).
6. Click **Update the stack** with **Re-pull image and redeploy** ON.

**What happens on `Update`:**

1. Portainer pulls latest `master` compose
2. Docker pulls `ghcr.io/dinu-sri/bookone-web:latest` (no VPS `next build`)
3. `entrypoint.sh` runs inside the new container:
   - Waits for Postgres
   - Runs `drizzle-kit push` (additive migrations only)
   - Applies RLS policies via `scripts/init-db.ts`
   - Seeds admin user + 20 accounts (idempotent)
4. `next start` on port 3100
5. Traefik routes `bookone.clossyan.com` → `bookone-web:3100`

**Manual overrides** (only if auto-init fails):

```bash
docker exec -it bookone-web sh
pnpm --filter @bookone/db db:migrate
pnpm exec tsx scripts/init-db.ts
```

---

## 10. Deployment errors we hit and exactly how we fixed them

A chronological log of every blocker we hit during deployment and the exact fix. Use this when something breaks again.

### 10.1 Missing `pnpm-lock.yaml` → CI install fails

- **Symptom:** GitHub Actions `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` on `pnpm install --frozen-lockfile`
- **Fix:** Run `pnpm install` locally, commit `pnpm-lock.yaml`.
- **Lesson:** The repo's CI branch was `master`; the workflow was set to run on `main` only. Fixed to `master`.

### 10.2 Portainer shows only Postgres, Redis, MinIO

- **Symptom:** Stack shows 3 services instead of all 6.
- **Cause:** Portainer was using `docker/docker-compose.yml` (the dev file) instead of `docker/docker-compose.prod.yml`.
- **Fix:** In Portainer, change the compose path. The dev file is intentionally minimal.

### 10.3 Traefik YAML escape error

- **Symptom:** Container restart loop with `yaml: found character that cannot start any token`.
- **Cause:** A Traefik label contained a value with an unescaped `:` character.
- **Fix:** Properly quote the label value: `key="value with : inside"`.

### 10.4 Worker service fails to build

- **Symptom:** `pnpm --filter @bookone/worker build` fails with "no source files".
- **Fix:** Disabled the worker service in `docker-compose.prod.yml` (commented out). Will re-enable when `apps/workers/` has real code.

### 10.5 `next build` filter mismatch

- **Symptom:** `next build` runs in the wrong directory or skips web.
- **Cause:** `turbo.json` filter was `web`, the workspace package is `@bookone/web`.
- **Fix:** Aligned all filters to the workspace package name.

### 10.6 `next start` arg parsing

- **Symptom:** `Invalid project directory ... /app/apps/web/-H`.
- **Cause:** `pnpm --dir apps/web start -- -H 0.0.0.0` is invalid syntax.
- **Fix:** `pnpm --dir apps/web exec next start -H 0.0.0.0 -p 3100` (use `exec`, not `start`).

### 10.7 Docker build context issues

- **Symptom:** Build hangs on `COPY . .` or fails with "no such file or directory".
- **Fixes applied:** Added `.dockerignore`, made the `public/` dir exist with `.gitkeep`, reordered `COPY` and `RUN` layers to invalidate cache properly.

### 10.8 DATABASE_URL password mismatch

- **Symptom:** `password authentication failed for user "bookone"`.
- **Cause:** `DATABASE_URL` contained `<db-user>:<db-password>` but the Postgres container was created with a different password.
- **Fix:** Make sure `DATABASE_URL`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` in Portainer all match what the `postgres` service in compose expects. `DATABASE_URL` should be:
  `postgres://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}`

### 10.9 Login page shows, no design, login button does nothing

- **Symptom:** HTML loads, no CSS, every JS chunk returns **307 redirect to /login**, console shows `Unexpected token '<'`.
- **Root cause:** `apps/web/src/middleware.ts` was `export { middleware, config } from '@bookone/auth';` — a re-export across the workspace boundary. Next.js 15's bundler dropped the `config.matcher` during the re-export, so the middleware ran on EVERY path including `/_next/static/*`. Each chunk request got redirected to `/login` and the browser tried to parse HTML as JS.
- **Fix (3e331ea):** Make `apps/web/src/middleware.ts` a local file with a minimal cookie-presence check (no `auth()` call, to avoid pulling bcryptjs into the Edge bundle). Matcher: `'/((?!_next/static|_next/image|favicon.ico|favicon.webp|logo.webp|api/auth).*)'`

### 10.10 Cloudflare CDN caching stale HTML

- **Symptom:** After deploy, browser still shows old HTML referencing deleted JS chunks.
- **Cause:** Custom `Cache-Control: no-cache` header in `next.config.js` interacted badly with Cloudflare's edge cache.
- **Fix (3e331ea):** Removed the custom header. Next.js's default cache headers are correct: `immutable` for `/_next/static`, short max-age for HTML. A visible build stamp (`build: v10`) in the HTML forces a fresh fetch.

### 10.11 Port conflicts

- **Symptom:** `bind: address already in use` on port 3000, then 3001.
- **Cause:** Another app (team-tasks-app) is on the VPS.
- **Fix:** Switched to port 3100. `docker-compose.prod.yml`, `Dockerfile.web`, and `entrypoint.sh` all updated.

### 10.12 Docker build cache not invalidating

- **Symptom:** Code changes don't appear after redeploy.
- **Fix:** Added `ARG BUILD_DATE` in `Dockerfile.web`, set via Portainer env. Increment the value to force a fresh build.

### 10.13 `tsx: not found` inside the container

- **Symptom:** Entrypoint script fails with `tsx: not found` when running as `nextjs` user.
- **Cause:** pnpm store is not writable by the non-root user.
- **Fix:** Export `PNPM_HOME=/app/.pnpm-store`, `npm_config_cache=/app/.cache/npm` in entrypoint; `chown` these dirs in Dockerfile to `nextjs:nodejs` before `USER nextjs`.

### 10.14 `categoryOverride` typecheck error after extending the engine

- **Symptom:** `Property 'categoryOverride' does not exist on type ... & { direction: 'invoice_bill' }`.
- **Cause:** Added `categoryOverride` to the Zod schema but not to the matching TypeScript interface in `packages/accounting/src/inference/types.ts`.
- **Fix:** Always update both the Zod variants AND the TS union interfaces in lockstep. Documented in `/memories/nextjs.md`.

---

## 11. Code-level conventions & rules

(Enforced by `AGENTS.md`. Re-stated here for visibility.)

1. **No hardcoded localhost / secrets** in source. Use `process.env.*`.
2. **Never bypass tenant isolation.** Every DB query that touches tenant data MUST be inside `withTenantContext(user.tenantId, ...)`.
3. **Never `DELETE`** — set `voided = true` / `voidedAt = timestamp`.
4. **Every financial mutation must create journal entries** (via the engine).
5. **Use DB transactions** for multi-table mutations. If one step fails, all roll back.
6. **Schema changes are additive migrations only.** Never modify a migration file after it's been deployed. Create a new one with the next sequence number.
7. **Audit everything** financial in `audit_log`.
8. **Respect period locks.** Locked periods cannot be directly edited — create a reversing entry.

Additional BookOne-specific conventions:

- **Server actions live in `apps/web/src/app/actions/<domain>.ts`** and are the only way client components talk to the DB.
- **Pages can be Server Components** (read data via `getX()` server action) **or Client Components** (form interactions). Prefer Server Components for read paths.
- **Middleware must be a local file** in `apps/web/src/middleware.ts` — never re-exported from a workspace package (lesson 10.9).
- **Build stamp**: every meaningful user-facing change should bump `build: vN` in `login/page.tsx` so a quick visual confirms a fresh deploy.

---

## 12. Testing & verification

| Layer | How | When |
|-------|-----|------|
| Accounting engine | `pnpm --filter @bookone/accounting test` — 12 vitest cases | On every change to `packages/accounting` |
| TypeScript | `pnpm --filter <pkg> typecheck` | Before commit |
| Production build | `pnpm --filter @bookone/web build` | Before commit |
| Live deploy | Redeploy in Portainer, open https://bookone.clossyan.com | After push |
| RLS isolation | `pnpm exec tsx scripts/test-rls.ts` (TODO: write) | After any schema migration |
| End-to-end | Playwright (planned, not yet wired) | Pre-release |

**Manual smoke test (use after every deploy):**

1. Open https://bookone.clossyan.com/login
2. Sign in with an authorized staging test account from the approved secret store.
3. Verify the build stamp in the corner is the latest
4. Click Dashboard → should show real metrics
5. Click Simple Entry → fill in form, submit → "Entry recorded. Journal #..."
6. Click Journal → see the new entry with balanced lines
7. Click Reports → see the P&L reflect the new entry
8. Click Accounts → see updated balances

---

## 13. What's next (open work)

### Strategic: entity tiers (Personal · Sole prop · Pvt Ltd)

**Canonical design:** [`ENTITY_TIERS_AND_TAX_ARCHITECTURE.md`](./ENTITY_TIERS_AND_TAX_ARCHITECTURE.md)  
**UX flows (personal / sole lite):** [`ENTITY_UX_FLOWS.md`](./ENTITY_UX_FLOWS.md)

Registration buckets: **personal**, **sole_prop** (lite → full ERP + personal), **company** (full ERP, no personal). One multi-tenant core; `entity_kind` + `book_domain` + existing modules; UX = tiles + Excel-like sheet + optional Sinhala gloss; phased delivery starting with schema then personal UX.


In rough priority order, picking up from where we are today:

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 🔴 High | **Entity tiers Phase 1** — `entity_kind` + `book_domain` schema (see ENTITY_TIERS doc) | multi-day | Unlocks personal / sole prop market |
| 🔴 High | Bank reconciliation CSV upload | 1 day | Closes the period-close loop |
| 🟡 Med | Onboarding tour (Onborda) | 1 day | First-time UX |
| 🟡 Med | Sentry + PostHog wiring | 0.5 day | Observability |
| 🟢 Low | Multi-tenant switcher (user_tenants join table) | 2 days | For orgs with multiple companies |
| 🟢 Low | Stripe / PayHere billing | 3 days | Self-serve plan upgrades |
| 🟢 Low | AI Assistant (OpenAI) | 2 days | "What did I spend on rent in Q2?" |
| 🟢 Low | Worker service (BullMQ) | 1 day | Cron jobs, async tasks |
| 🟢 Low | Multi-user invitations | 1 day | Team collaboration |

Tell me which to pick up and I'll plan the work.

---

## 14. Glossary

| Term | Meaning |
|------|---------|
| **Account** | A ledger account (e.g. "Cash on Hand" code 1000). One of asset / liability / equity / revenue / expense. |
| **Journal entry** | A dated group of debits and credits that together balance to zero. |
| **Debit / Credit** | The two sides of a journal line. Whether a debit or credit increases a balance depends on the account's `normalSide` (asset/expense = debit-normal, liability/equity/revenue = credit-normal). |
| **RLS** | Row-Level Security — PostgreSQL feature that hides rows from a query based on a `current_setting(...)` value. |
| **Simple Entry** | The 4-tile UI for non-accountants. The "what happened?" screen. |
| **Engine** | The TypeScript function `inferTransaction()` that maps a Simple Entry to a balanced journal. |
| **Category override** | User picking a different expense account than what the engine inferred. Stored with `categorySource = 'override'`. |
| **R2** | Cloudflare's S3-compatible object storage, 10 GB free tier. |
| **Period** | A calendar month. The app groups reports by period. Locked periods are read-only. |
| **Tenant** | A workspace / company. All data in BookOne is tenant-scoped via RLS. |
| **BookOne** | This product. |

---

*Last reviewed: 2026-06-16 by GitHub Copilot.*
*If you find anything missing or wrong, edit this file. It is the single source of truth.*

