# BookOne Entity Tiers & Tax Architecture

> **Status:** Approved product architecture (planning doc — not fully implemented).  
> **Audience:** Product, engineering, future AI agents.  
> **Last updated:** 2026-07-27  
> **Related:** `docs/PROJECT_STATUS.md`, `docs/ACCOUNTING_INTEGRATION_AUDIT.md`, `packages/db/src/schema/tenants.ts`, `apps/web/src/lib/platform-modules.ts`

This document is the **canonical reference** for expanding BookOne from a company-oriented multi-tenant ERP into three registration buckets: **Personal**, **Sole proprietorship**, and **Private limited company** — with smooth upgrade paths, mass-scale multi-tenant design, and maximum reuse of the existing core.

---

## 1. Product intent (Sri Lanka context)

Sri Lanka is tightening individual tax compliance (IIT). Demand is growing for:

1. **Individuals** tracking income, expenses, and loans for personal tax returns.  
2. **Sole proprietors** whose business results feed the **same person’s** IIT file: business and personal amounts are **calculated separately** but **paid together**.  
3. **Pvt Ltd / companies** that need the full ERP (what BookOne is today).

Users at the personal / small sole-prop end are often **Excel-only**. Large sole props may need **the entire current ERP**. The architecture must support both without forking the product.

---

## 2. Confirmed product model

| Registration bucket | Who | Personal books | Business / ERP | Notes |
|---------------------|-----|----------------|----------------|-------|
| **Personal** | Individual (IIT) | Yes only | No | Simple UX: money in/out, loans, year pack |
| **Sole prop (lite)** | Person + small business | Yes | Distilled (invoice/expense lite) | Same tax file; domains split |
| **Sole prop (full)** | Person + large business | Yes | Full ERP modules on | Same core as pvt ltd + personal switch |
| **Pvt Ltd** | Company | **No** | Full ERP | Current BookOne path |

### 2.1 What “personal” means in engineering terms

Personal is **not** only a nav module like Sales. It is the combination of:

1. **`entity_kind`** on the tenant (legal/tax shape at registration)  
2. **`book_domain`** on postings (`personal` | `business`) where needed  
3. **UX shell** (simple vs full ERP)  
4. **Module flags** (existing `tenants.modules` — what ERP suites are on)

```text
personal          → entity_kind=personal,   domain=personal only, modules mostly OFF
sole_prop lite    → entity_kind=sole_prop,  domains=personal+business, lite modules
sole_prop full    → entity_kind=sole_prop,  domains=personal+business, full modules
company (pvt ltd) → entity_kind=company,    domain=business only (no personal surface)
```

---

## 3. Codebase validation (why this fits BookOne)

### 3.1 Reuse (already built)

| Asset | Location | Fit |
|-------|----------|-----|
| Multi-tenant + RLS | `tenants`, all tables `tenant_id` | One workspace per filing entity |
| Module gating | `tenants.modules` JSON; `apps/web/src/lib/platform-modules.ts`; shell filter | Lite vs full without a second app |
| Always-on accounting | Shell: accounting + company always on | Personal can live on Simple Entry + ledger |
| Double-entry engine | `@bookone/accounting`, journals | Personal categories still post balanced journals |
| Simple Entry | `/` money in/out/transfer | Excel-user path already exists |
| Category inference | `transactions.categoryCode` / `categoryName` | Human labels → CoA |
| CoA seed on signup | `packages/auth/src/session.ts` → `DEFAULT_CHART_OF_ACCOUNTS` | Swap packs by `entity_kind` |
| Company / tax profile | `company_profiles`, `tax_profiles` | Extend for person NIC/TIN |
| Plans | starter / growth / pro → module defaults | Map to capability tiers |
| Control Room | create company, modules, audit | Operator upgrade/downgrade |
| Memberships | `tenant_memberships` | Future accountant multi-client |
| Brands / locations | Required only when masters exist | Keep off for personal / lite |

### 3.2 Gaps to implement

| Gap | Today | Need |
|-----|--------|------|
| Entity type | All tenants behave as company | `entity_kind` on `tenants` |
| Personal vs business books | No domain | `book_domain` on postings |
| Personal CoA pack | One SME CoA only | Personal + sole add-on packs |
| Registration choice | Auto `"{name}'s Company"` | Wizard: 3 buckets + defaults |
| UX shells | One ERP shell | Personal shell; sole domain switcher; company shell |
| Tax year / IIT | Generic tax profile | Versioned tax packs + year summary (later) |
| Upgrade path | Plan / modules only | Typed upgrades + audit trail |

### 3.3 Hard constraints from current design

1. **Users are bound to a tenant** (`users.tenantId` + memberships) — one primary workspace for v1.  
2. **Signup seeds full SME CoA** — personal must seed a lighter pack.  
3. **Brand/location required when masters exist** — personal must not create brands by default.  
4. **Empty `modules: {}` = legacy full access** — new personal tenants need an **explicit** modules object (all sellable keys `false`).  
5. **Journal integrity is non-negotiable** — simple UX still produces balanced double-entry.

### 3.4 Risks if we choose a weaker model

- Sole prop without domains → cannot split IIT personal vs business.  
- Pvt ltd with a personal module → wrong tax UX and confusion.  
- Separate personal codebase → upgrades become migrations, not configuration.

**Locked recommendation:** one multi-tenant core + `entity_kind` + `book_domain` + modules + UX shells.

---

## 4. Target architecture

```text
Registration (3 buckets)
        │
        ▼
┌───────────────────────────────┐
│ Tenant workspace              │
│  entity_kind                  │
│  capability_tier (optional)   │
│  modules (existing JSON)      │
└───────────────┬───────────────┘
                │
   ┌────────────┼────────────┐
   ▼            ▼            ▼
Personal UX  Sole UX      Company UX
(simple)     (lite→full)  (current ERP)
   │            │            │
   └────────────┼────────────┘
                ▼
   Domain services (reuse)
   journal | parties | docs | stock | POS
   book_domain where sole / personal
                │
                ▼
   Tax adapters (versioned packs) — later phases
   IIT personal | IIT sole combined | CIT later
```

### 4.1 Design principles

1. **One ledger engine** — personal categories resolve to CoA codes.  
2. **Modules = product complexity**; **entity_kind = legal/tax shape**.  
3. **Sole prop = two domains, one workspace** (not two logins for v1).  
4. **Grow by enabling modules**, not migrating to another product.  
5. **Incorporate = new company tenant** + import; keep sole history clean.  
6. **Tax rules are packs**, not scattered UI conditionals.  
7. **Simple UX is a shell**, not a second backend.  
8. **Advanced paths stay optional** until capability allows them.

---

## 5. Data model (Phase 1 target)

### 5.1 `tenants`

Add:

| Column | Type | Values | Notes |
|--------|------|--------|--------|
| `entity_kind` | varchar | `personal` \| `sole_prop` \| `company` | Default `company` for existing rows |
| `capability_tier` | varchar (optional) | `lite` \| `full` | Sole only; or derive from modules |

Existing:

- `modules` JSON — keep; personal create must set `{ sales:false, purchase:false, inventory:false, pos:false, hr:false }`  
- `plan` — keep for billing; map defaults carefully per entity_kind  

### 5.2 Postings — `book_domain`

Add nullable `book_domain` (`personal` | `business`) on:

- `transactions`  
- `business_documents`  
- `journal_entries` (preferred) and/or `journal_lines`  

**Write rules:**

| entity_kind | book_domain on write |
|-------------|----------------------|
| `personal` | always `personal` |
| `company` | always `business` |
| `sole_prop` | required: `personal` or `business` |

Reports and IIT rollups filter by domain.

### 5.3 Chart of accounts packs

| Pack | Used by | Content (illustrative) |
|------|---------|-------------------------|
| `personal` | personal tenants | Cash/bank, employment/other income, living expenses, personal loans, drawings |
| `sole_business` add-on | sole_prop | AR/AP, sales, COGS, inventory subset, business loans |
| `company` | company | Current `DEFAULT_CHART_OF_ACCOUNTS` |

Seed on tenant create; upgrade personal → sole **adds** business accounts without wiping personal accounts.

### 5.4 Tax profiles (later depth)

- Keep `tax_profiles` for TIN/VAT.  
- Add person identifiers (NIC / personal TIN) when needed.  
- IIT logic lives in **versioned tax packs**, not inside POS/invoice forms.

---

## 6. Module & capability matrix

Sellable keys today (`platform-modules.ts`): `sales`, `purchase`, `inventory`, `pos`, `hr`.  
Always-on: **accounting**, **company** (settings).

| entity_kind | Default modules | Personal surface |
|-------------|-----------------|------------------|
| `personal` | all sellable **false** | Derived from entity_kind (not a MODULE_KEYS flag in v1) |
| `sole_prop` lite | sales true (lite UX); purchase optional lite; inventory/pos false | Yes + Business switch |
| `sole_prop` full | sales, purchase, inventory, pos as per plan | Yes + full ERP |
| `company` | plan defaults (starter/growth/pro) | **No** |

**v1 decision:** do **not** add `personal` to `MODULE_KEYS`. Personal UI is shown when `entity_kind` is `personal` or `sole_prop`.

---

## 7. Lifecycle: upgrade & downgrade

```text
personal ──upgrade──► sole_prop (lite) ──expand modules──► sole_prop (full)
                                                              │
                                                              ▼ incorporate
                                                         company (NEW tenant + import)
```

| Transition | Mechanism | Data |
|------------|-----------|------|
| personal → sole lite | Same tenant; set `entity_kind`; seed business CoA; enable lite modules | Personal history kept |
| sole lite → sole full | Flip modules only | History kept |
| sole → company | **New** company tenant; opening balances from business domain | Sole tenant archived for tax history |
| Module downgrade | Hide modules; advanced docs read-only | Never delete journals |
| company → personal | **Not supported** in place | Out of scope |

All transitions: platform audit event + idempotent jobs.

---

## 8. UX surfaces

> **Detailed flows, Sinhala gloss, click budgets, wireframes:**  
> [`ENTITY_UX_FLOWS.md`](./ENTITY_UX_FLOWS.md)

### 8.1 Personal shell (Excel-level)

- Verbs: Money in, Money out, Loan, Transfer  
- Hide CoA, journals, brands, suite explosion  
- Categories with SL-friendly defaults  
- Year-end: “Tax pack” export for accountant  
- CSV/Excel import  
- **Tile + sheet (Excel) UI**; optional Sinhala in brackets on key labels  

**Implementation reuse:** Simple Entry + category inference + bank accounts.

### 8.2 Sole prop shell

- Topbar: **Personal | Business** domain switcher (tiles)  
- Lite: simple invoice + expenses + cash  
- Full: current ERP suites when modules on; switcher remains  

### 8.3 Company shell

- Current BookOne shell  
- No personal domain switcher  

---

## 9. Tax layer (phased)

```text
Postings (domain-tagged)
  → Classification (tax category codes)
    → Tax year adapter (versioned pack, e.g. IIT 2025/26)
      → Schedules / export / accountant pack
```

| Kind | Tax output (direction) |
|------|-------------------------|
| Personal | IIT-oriented personal summary |
| Sole prop | Business P&L (business domain) + personal (personal domain) → combined IIT payable view |
| Company | Corporate path later (CIT); not forced into IIT adapter |

Rules change yearly → **versioned packs**, not hardcoded UI.

---

## 10. Scale, speed, cost, reliability

| Concern | Approach |
|---------|----------|
| Many small users | Shared Postgres + RLS (existing); cheap personal workspaces |
| Speed | Personal shell = few routes/queries; avoid loading full suite nav |
| Cost | Module gating; freemium personal → paid sole/company |
| Reliability | Same double-entry integrity for all entity kinds |
| Safe change | Additive migrations; existing tenants `entity_kind=company` |
| Future | Read replicas / async year-end packs only if volume requires |

---

## 11. Phased delivery

### Phase 0 — Documentation (this file)

- [x] Architecture approved and written  
- [x] UX companion: `ENTITY_UX_FLOWS.md`  
- [ ] Link from `PROJECT_STATUS.md`  

### Phase 1 — Data model foundation — **DONE (engine MVP)**

| Item | Status |
|------|--------|
| Migration `021_entity_tiers.sql` (`entity_kind`, `capability_tier`, `book_domain`) | Done |
| Schema + indexes on tenants / transactions / journals / docs | Done |
| CoA packs (`PERSONAL`, sole merge, company default) | Done |
| New workspace `entity_kind=pending` until onboarding | Done |
| Posting writes `book_domain`; personal skips brand/location hard req | Done |
| Modules derived from entity + sole lite/full | Done |
| Control Room entity filters | **Not done** (nice-to-have) |
| Hard posting *guards* rejecting illegal domains | **Partial** (resolve + write only) |

### Phase 2 — Registration wizard + shell routing — **DONE (core)**

| Item | Status |
|------|--------|
| Onboarding tiles: Personal \| Sole \| Company (+ sole lite/full) | Done |
| Apply modules + CoA merge + display name | Done |
| Server `/` routing (no company UI flash) | Done |
| Cashbook shell routes + logout + full-ERP lock | Done |
| Onboarding gate if already onboarded | Done |
| Control Room create/list entity filters | **Not done** |
| Upgrade wizards (personal→sole) | Phase 5 |

### Phase 3 — Personal surface — **DONE (core)**

| Item | Status |
|------|--------|
| Cashbook home / summary / settings | Done |
| Money in/out with correct income/expense accounts | Done |
| Loan took/paid → 2500 liability journals | Done |
| Move money from/to tiles | Done |
| Category tiles + CSV tax pack v0 | Done |
| E2E smoke personal | **Not done** |

### Phase 4 — Sole prop lite — **DONE (core)**

| Item | Status |
|------|--------|
| Domain switcher Personal \| Business | Done |
| Business tiles: Money In/Out, Invoice, Bill, Move | Done |
| Lite invoice → SaleCredit (Dr 1300 / Cr 4000), `book_domain=business` | Done |
| Lite bill → PurchaseCredit (Dr expense / Cr 2100) | Done |
| Month period prev/next | Done |
| Combined year overview (personal + business + net) | Done |
| AR/AP open amounts on business summary | Done |
| E2E sole lite | **Not done** |
| Excel import | Still later |

### Phase 5 — Sole prop full + lifecycle — **DONE (core)**

| Item | Status |
|------|--------|
| personal → sole lite (same tenant, CoA merge, modules) | Done — Settings |
| sole lite → sole full (modules + capability_tier) | Done — Settings |
| sole full → lite downgrade (hide modules; keep journals) | Done — Settings |
| sole → company incorporate (**new** tenant + archive sole) | Done — Settings |
| Opening balances from business-domain journals | Done (matching CoA codes + equity plug) |
| Audit events UPGRADE / DOWNGRADE / INCORPORATE / ARCHIVE | Done |
| Multi-tenant switcher back to archived sole | **Later** (membership kept) |
| E2E lifecycle | **Not done** |

### Phase 6 — Tax depth

- Versioned IIT packs, schedules, deeper IRD alignment  
- Does not block Phases 1–5  

---

## 11.1 Known residual gaps

1. Excel import still placeholder  
2. Linked collect/pay against lite invoice/bill (AR/AP settlement UX)  
3. E2E personal / sole / lifecycle  
4. Control Room entity filters  
5. Switcher UI for archived sole after incorporate (membership exists)  
6. Phase 3/4 audit notes about money-in/loan bugs — **fixed** in later commits  

---

## 12. Non-goals (v1)

- Multiple independent businesses under one sole prop workspace  
- Full IRD e-filing API  
- Multi-currency personal books  
- Automatic government incorporation filing  
- In-place convert of pvt ltd → sole prop  

---

## 13. Open decisions (defaults)

| Topic | Default for v1 |
|-------|----------------|
| Shared bank personal/business for sole | Allowed; domain tags each posting |
| Free personal tier | Freemium funnel into sole |
| `personal` in MODULE_KEYS | **No** — derive from `entity_kind` |
| Accountant multi-client | Later via memberships |

---

## 14. Implementation map (concrete code touchpoints)

| Area | Primary files |
|------|----------------|
| Tenant schema | `packages/db/src/schema/tenants.ts`, new migration under `packages/db/migrations/` |
| Postings | `transactions.ts`, `business-documents.ts`, `journal-entries.ts` |
| Signup seed | `packages/auth/src/session.ts` |
| Module defaults | `apps/web/src/lib/platform-modules.ts` |
| Shell / nav | `apps/web/src/components/layout/bookone-shell.tsx` |
| Control Room create | `apps/web/src/app/actions/platform.ts` |
| CoA packs | `packages/accounting/src/chart-of-accounts.ts` (+ personal pack) |
| Simple Entry | existing record-entry path — tag domain |
| E2E | new buckets when shells ship |

---

## 15. Success criteria

- Existing company tenants unaffected (default `entity_kind=company`).  
- Personal user can run money in/out without seeing full ERP.  
- Sole prop can report personal and business separately for IIT.  
- Sole prop full can enable inventory/POS without data migration.  
- Pvt ltd never shows personal domain.  
- Upgrades audited; journals never wiped on downgrade.

---

## 16. Document history

| Date | Change |
|------|--------|
| 2026-07-27 | Initial architecture from product discussion + codebase validation |

**Next engineering step after this doc:** Phase 1 schema migration PR only when explicitly scheduled — do not mix with unrelated ERP feature work.
