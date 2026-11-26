# Coding response to QA — 25–26 Nov 2026 (v2.17.3 → v2.19.1)

For the QA agent. This covers everything the coding agent changed in this session: what was fixed, what is new, what changed on purpose, what was verified and what still needs independent testing. Findings stay open until QA closes them; nothing here is self-closed.

- **Build to test:** v2.19.1, commit `39ef99d`, on `master`. Staging `https://staging.clossyan.com` and `https://bookone.clossyan.com` (same deployment and database) show **v2.19.1** on the login page.
- **QA handoff answered:** `handoffs/CODING-20261126-QA-RETEST.md` in Dinu-Sri/bookone-qa PR #129, pinned at `91d7ce8e698517b2c50daeeb552ecd56104f5741` (QA-1126-01 to QA-1126-21).
- **Change records (full detail):** `docs/changes/CHG-20261125-*.md` and `docs/changes/CHG-20261126-*.md`. Each one lists the files touched, the tests and the rollback.
- **Unit tests at v2.19.1:** 757 passed (accounting 298, auth 218 + 5 skipped, agent-bridge 162, commerce 35, statement-import 44). `pnpm typecheck` passes for all 8 workspaces. Docker web image and Production Check are green for every commit.

---

## 1. Version map

| Version | Commit | What |
|---|---|---|
| 2.17.3 | `debf4f6` | Dependency security upgrades (next, better-auth, drizzle, xlsx…) |
| 2.17.4 | `3c1ceba` | Schema push no longer drops the `auth_*` tables |
| 2.17.5 | `7f47ddf` | Staging also served on `staging.clossyan.com` |
| 2.17.6–2.17.8 | `95e3c36`, `ed9bbc8`, `37c3ae7` | Company chart names, per-host links, additive-only schema push |
| 2.17.9–2.17.11 | `d352873`, `475580c`, `54dff07` | Simple Entry category guesses follow the workspace chart and use the tenant's account names |
| 2.17.12 | `e2e04d2` | Simple Entry ignores rental fleet bays as locations |
| **2.18.0** | `43766e8` | **QA-1126-01 to 15** |
| **2.18.1** | `648f5a8` | **QA-1126-16 to 21** |
| **2.19.0** | `9f7ea4e` | **New: Payments settings for store connections** (rest of QA-1126-21) |
| 2.19.1 | `39ef99d` | Payments card button layout |

---

## 2. Staging environment changes QA must know

- **Staging DB was wiped on 2026-11-26** (owner request), before QA's 26 Nov run. Backup: `/var/lib/postgresql/data/zz_backups/pre-wipe-20261126.dump` in `bookone-staging-postgres`.
- **Migration 053 renamed duplicate numbers in QA's company** (QA-1126-17 repair). The oldest record keeps its number and later duplicates get a suffix:
  - INV-20261126-0002 → second one is **INV-20261126-0002-D2**
  - INV-20261126-0006 → **INV-20261126-0006-D2** and **-D3**
  - CUS-0003 → **CUS-0003-2**
  - CUS-0008 → **CUS-0008-2** and **CUS-0008-3**

  Amounts, journals and links are unchanged.
- **Coding-agent test data** (prefix ZZ-TEST): company "ZZ-TEST Company's Company" with:
  - a location ZZMAIN "ZZ-TEST Main Shop", added directly in the DB because the company had only rental bays;
  - a commerce connection "ZZ-TEST Web Shop", in preview mode with no key issued;
  - account 1201 "ZZ-TEST Gateway clearing";
  - a payment rule `cod` → leave unpaid.

  QA's company "QAOwner Nov26's Company" was not touched, apart from the migration 053 renames above.
- Every SQL migration re-runs on each boot. New ones: `052_company_coa_names.sql`, `053_unique_document_numbers.sql`, `054_commerce_payment_settings.sql`.

---

## 3. QA findings: what changed and how to retest

Severity and IDs follow QA's handoff. "Verified on staging" means the coding agent saw it live; everything else is unit tests and source review only.

### P1

**QA-1126-01 · OAuth consent redirect 307**
- Change: Allow and Cancel now redirect with **303**. `/.well-known/oauth-protected-resource` now lists the same `scopes_supported` as the authorization server: `read upload draft`. Post and commerce scopes are granted by the Owner in Company → AgentBridge, not through OAuth.
- Verified on staging: the protected-resource metadata returns `["read","upload","draft"]`.
- Retest: connect the real Claude custom connector (`bookone-claude`). Consent should return 303 and the connector should finish signing in. Check that Cancel also returns 303 to the callback with an error.

**QA-1126-02 · Discounts writable by Viewer/Cashier**
- Change: create, update, activate/deactivate and archive all check `sales.discounts.write` on the server before writing. A refusal redirects with `flash=denied_write` ("You do not have permission to save that."). For read-only jobs, the list hides New/Edit/Deactivate/Archive and the new/edit pages redirect away.
- Retest: replay the captured Owner requests as Viewer and Cashier. Nothing should change and the request should not return a 500. Owner should still succeed.

**QA-1126-03 · Company domains writable by Viewer/Cashier**
- Change: add and verify check `company.domains.write` before any DNS lookup and write an audit row. Others see "Only an Owner or Admin can add or verify domains."
- Retest: replay add and verify as Viewer/Cashier, including verify with a valid TXT record.

**QA-1126-04 · Duplicate party when display name ≠ legal name**
- Change:
  - The party picker submits a hidden `partyId`, and posting resolves by id.
  - When only a name is given (AgentBridge bills, POS, other API paths), it matches the legal **or** display name. A legal-name match wins, and if several parties share a display name posting is refused with "pick the party from the list".
  - Linked returns use the source document's party id.
- Repair: Customers and Vendors show a **"Possible duplicate parties"** card to Owner/Admin. It lists parties that posting auto-created (audit note "Created party via ensureParty.") whose name is another party's display name. **Merge** moves documents, advances and preferred-vendor links to the original and voids the copy. Journals and amounts are not rewritten.
- Retest: invoice, quotation→invoice, sales return, purchase bill, purchase return, POS and AgentBridge bill, each with display ≠ legal name. No new party should appear. Then check the existing CUS-0002 "Acme" and VEN-0002 "LankaSup" show on the card and merge cleanly.

**QA-1126-16 · Concurrent last-unit orders oversell**
- Root causes:
  1. Stock was read without a lock.
  2. Posting from the commerce API and AgentBridge has no browser session, so loading the inventory settings failed and fell back to **Allow** negative stock. That is why "Block" was ignored.
- Change:
  - A per-product transaction lock (`pg_advisory_xact_lock`) is taken before lot consumption and before every stock decrease.
  - Posting reads settings by tenant.
  - Commerce orders never take stock below zero, whatever the policy. Refused orders go to `needs_review` with "Insufficient stock…".
- Retest: three simultaneous paid orders for the last unit. Expect exactly one posted, two in needs_review, stock 0. Repeat with policy Allow; commerce should still refuse. Also run two POS sales and two manual invoices at the same time on the last unit with Block.

**QA-1126-17 · Same invoice number and customer code under concurrency**
- Change:
  - Document numbers and party codes are allocated under a per-series transaction lock.
  - Voided documents count, so a void never frees a number, and any number already used is skipped.
  - Migration 053 repairs the existing duplicates (see section 2), then adds unique indexes on `(tenant_id, document_type, document_number)` and `(tenant_id, code)` for parties.
- Verified on staging: both indexes exist and no duplicates remain.
- Retest: the QA-16 race should produce unique invoice numbers and customer codes. Void an invoice, then create the next one; it must get a new number. Note: the legacy `documents.ts` path (`createDocument`) still has its own numbering; the index will refuse a clash there rather than duplicate it.

**QA-1126-18 · Commerce cancel/refund always 422**
- Change:
  - Returns use the original invoice's customer (id and legal name) instead of "Commerce refund".
  - If BookOne still refuses, the shop gets a normal receipt and the order moves to **needs review** with "Refund/Cancellation was not booked in BookOne: …", visible under Activity.
  - Line refund counters are restored and the event stays retryable. **Retry** on a posted order replays its failed events.
- Retest:
  - Cancel after post should create a linked return, restock, and set status cancelled.
  - Refund without restock should create a linked return with no stock change.
  - Refund with restock should create a linked return and restore stock.
  - Force a failure (for example, lock the period) and confirm it shows in Activity and that Retry books it once the cause is fixed.

### P2

**QA-1126-05 · Bank import / reconciliation without permission checks**
- Change: every write action in `bank-import-studio.ts`, `bank-reconciliation.ts`, `statement-import.ts` and `reconciliation.ts` returns "You do not have permission to do that." without `accounting.reconciliation.write`.
  - Actions that post or reverse journals also need Simple Entry or Cashbook write: create entry from a bank line, confirm transfer, confirm statement creates, undo creates.
  - `lockPeriod` is gated.
  - Product archive, restore and delete now check inventory write.
  - Read paths, including opening a session from an import, are unchanged.
- Retest: Viewer and Cashier replays of import, save lines, confirm match, create entry, finish, void, lock period, statement commit/create/undo. All should be refused with data unchanged; Owner should succeed.

**QA-1126-06 · New Pvt Ltd company has Inventory off**
- Product decision: plan defaults are **unchanged**, because enabling modules is a pricing call for the owner.
- What changed instead:
  - The onboarding card now reads "Company books — sales, purchase, banking, tax. Stock and POS are added on a higher plan."
  - The Inventory-off message says the plan is the cause and how to upgrade, instead of "set in Control Room".
  - Commerce Integrations says Inventory is required and refuses to create a connection without it.
- Retest: copy on a new company. Commerce connection creation should be blocked with a reason when Inventory is off.

**QA-1126-07 · Same file accepted twice in AgentBridge**
- Change:
  - Browser upload, MCP `submit_document` and `finalize_upload_session` refuse bytes already received in a non-rejected document. The code is `DUPLICATE_DOCUMENT`, with the message "This file was already received on <date> (document X, status Y)…".
  - The browser shows "Open the earlier document" and an **"Upload anyway as a separate document"** checkbox. MCP accepts `allowDuplicate: true`.
  - The inbox list marks "possible duplicate".
- Retest: both paths, with an existing draft and with an already-posted document.

**QA-1126-08 · Commit refuses silently**
- Change:
  - Any commit result that is not `posted` shows a message, and a failed post keeps its reason on the document.
  - The detail page warns before commit when posting is stopped or the company is in draft-only mode.
  - **Preview** warns when the supplier invoice number already has a bill for that supplier (legal or display name), and says commit will be refused when duplicate blocking is on.
- Retest: QA's repro A (posting stopped) and repro B (duplicate supplier invoice).

**QA-1126-19 · Cashier sees POS Return but cannot complete it**
- Product decision: refunds stay a **manager** permission (`sales.returns.write`).
  - The Return tab is disabled for jobs without it, with "Refunds need a manager".
  - `completePosReturn` refuses with the same message on the server.
  - An Owner can allow till refunds by adding Sales Returns to the Cashier job.
- Retest: Cashier sees the disabled tab and the message. Owner still refunds. A Cashier whose job is given Sales Returns can refund.

**QA-1126-20 · Commerce orders post without VAT**
- Change: for a **VAT-registered** company:
  - If the shop's tax equals the company rate on the net after discounts (shipping not VAT'd), the order posts as a **tax invoice**.
  - If the order has no tax, or a different amount, it is held for review with the reason.

  For a company that is **not** VAT registered, an untaxed order posts as a commercial invoice and a taxed order is held.
- Retest: VAT-registered company with a shop order carrying 18% tax should give a tax invoice with Output VAT. The same order with no tax should be held. Products marked exempt are expected to be held, not guessed.

### P3

| ID | Change | Retest |
|---|---|---|
| 09 | Settings form actions redirect a refusal to `flash=denied_write` instead of an HTTP 500: Company details, tax, financial year, brands, locations, company create, POS registers, VAT/sales settings, AgentBridge settings, inbox upload/approve/commit. | Replay as Viewer/Cashier: no 500s. |
| 10 | Approval line: "Approved by <name> · expires <local time>" (company timezone, default Asia/Colombo). | Inbox detail after approval. |
| 11 | MCP schema errors and unknown tools return `INVALID_ARGUMENT`, not `STALE_REVISION`. | `lookup_suppliers {"query":"ABC"}`. |
| 12 | A commerce connection needs a stock location (form and server); turning posting on needs one too. | Create without a location. |
| 13 | A malformed or unknown commerce token returns "The commerce token is invalid, revoked or expired." A missing header still says a token is required. **Verified on staging.** | `Bearer bkc_sand_bad_x`. |
| 14 | Balance Sheet (and P&L) sections are sorted by account code. Inventory keeps code 5100 (asset in the default chart since launch, not renumbered). | Reports → Balance Sheet. |
| 15 | Sign-up message follows the server: "Account created. You can sign in now." when verification is not enforced; the verify-email message otherwise. | Sign up on staging. |
| 21 | A later review reason is appended to the earlier one (`a \| b`), not overwritten. Negative stock defaults to **Block** for companies that never saved a policy. Walk-in: POS already reuses one "Walk-in" party per company (no change). Paid orders left in AR: see section 4. | woo-3006 style case; new company Inventory Settings shows Block. |

---

## 4. New feature: Payments settings for store connections (v2.19.0)

Closes the "paid web orders stay open in AR / settlement not_configured" part of QA-1126-21. It works with any payment gateway; none is named or assumed.

**Where:** Company → Commerce Integrations → pick a store → **Payments** (below Posting controls).

- **Default account for paid orders:** any active, postable cash, bank or clearing account (codes 10xx–12xx).
- **Payment methods:** one row per method name the store sends (`payment.method`).
  - Rows are filled in automatically as orders arrive, or added by hand.
  - Each row maps to an account, "use the default", or "leave unpaid in receivables".
  - Names are case- and space-insensitive.
- **Create a clearing account:** creates "<name> clearing" in 1201–1299, reconcilable. It becomes the default if none is set. The intent is one clearing account per gateway.
- **Posting order of precedence:**
  1. A 4-digit account code sent as `payment.method` (kept for existing integrations).
  2. The method's own account.
  3. The store default.
  4. Otherwise the invoice is left open, and Activity shows "Paid order left unpaid (payment account not set)".

  Pending/unpaid orders never settle.
- **Effect on posting:** a settled order posts as a paid sale, debiting the chosen account instead of Accounts Receivable. The receipt returns `settlement: settled`, and the order records `settlement_account_code`. Changes apply to new orders only.
- **Permissions:** saving needs Commerce Integrations write. Creating a clearing account also needs Accounts write. The server rejects any account that cannot take payments.
- **Verified on staging (ZZ-TEST):**
  - creating a clearing account (→ 1201, set as default);
  - saving a `cod` → leave-unpaid rule and reloading it;
  - the preview line;
  - the button layout fix in v2.19.1.
- **Not run on staging:** a real paid API order through to a settled invoice (covered by unit tests only).
- **Retest:**
  - A paid order with a mapped method should settle into that account, with the invoice paid and not in AR aging.
  - An unmapped method should settle into the default.
  - A `cod` rule set to leave unpaid should leave the invoice open in AR.
  - A pending order should not settle.
  - With nothing configured, check the Activity row appears.
  - Viewer cannot save.
  - Then reconcile a gateway payout against the clearing account in Reconciliation.

---

## 5. Earlier changes in this session (before the QA retest)

| Version | Change | Retest hint |
|---|---|---|
| 2.17.3 | Security upgrades: next 15.5.29, better-auth 1.7.28, drizzle-orm 0.45 / drizzle-kit 0.31, xlsx 0.20.3 (SheetJS CDN), vitest 4. `pnpm audit` 68 → 2. | Login, Google sign-in, reset email, XLSX statement import, product photo upload. |
| 2.17.4 | **Incident:** v2.17.3's `drizzle-kit push --force` dropped and recreated the empty `auth_*` tables on staging (logins lost). Fixed with `tablesFilter: ['*','!auth_*']`. | Sign up, restart, still signs in. |
| 2.17.5 | Staging served on `staging.clossyan.com` too (Traefik and Better Auth trusted origins). | Sign-up works on both hosts; cookies are per host. |
| 2.17.6 | Company tenants kept personal account names (6500 "Healthcare" etc.). Renamed for unposted, unrenamed accounts (migration 052). Invite/print/QR links follow the request host when it is configured. | New company chart names; invite link host. |
| 2.17.7–2.17.8 | Startup schema push is now **additive only** (`push-additive.ts`: pull + generateMigration + filter). It no longer drops RLS policies or indexes on every boot. | RLS policy count stays the same across restarts. |
| 2.17.9 | Simple Entry category guesses follow the workspace chart (personal/sole-prop never land on Healthcare/Food for business costs; they map to 6800 General Expense). | Personal/sole workspace: "office supplies" → General Expense. |
| 2.17.10–2.17.11 | Category preview, stored category, audit row and journal memo use the tenant's own account name. | Rename 6500, post "stationery", check all four. |
| 2.17.12 | Simple Entry ignores the rental fleet bays (On rent/Repair/Wash) as locations, so a company with no real location is not forced to pick "On rent". | Company with only fleet bays: no Location field. |

---

## 6. Behaviour changes QA should not report as bugs (intended)

- Write controls are hidden for read-only jobs on Discounts and Domain Verification. Refusals show a toast instead of a 500.
- Uploading the same AgentBridge file twice is refused unless "Upload anyway" is ticked. MCP clients need `allowDuplicate: true`.
- MCP schema errors now return the code `INVALID_ARGUMENT`.
- Commerce never posts below zero stock, even with policy Allow.
- VAT-registered companies: commerce orders without matching tax are held for review instead of posting with no VAT.
- Negative stock defaults to Block for companies without a saved policy.
- POS Return is disabled for jobs without Sales Returns write.
- Document numbers and party codes may skip a number after a void; voided numbers are never reused.
- The onboarding copy for Pvt Ltd no longer promises stock/POS.

## 7. Known gaps and open items

- Not run live by the coding agent:
  - the real Claude connector sign-in;
  - Viewer/Cashier request replays;
  - the three-order race on real Postgres;
  - commerce cancel/refund end to end;
  - a VAT tax-invoice web order;
  - a settled paid web order.
- Inventory module plan defaults for new companies: owner decision pending (QA-1126-06).
- Legacy `createDocument` numbering (`documents.ts`) is not locked; the unique index is the backstop.
- Commerce VAT matching treats all lines as taxable. Exempt products cause a review hold, not a mixed-rate invoice.
- MinIO files from before the staging wipe are orphaned. The pre-wipe dump can be deleted when no longer needed.
- WooCommerce plugin live install still not run (no WordPress host).
