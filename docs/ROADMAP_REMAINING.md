# BookOne — remaining product work (after Phase 5 + switcher)

> Last updated: 2026-07-27  
> Companion: `ENTITY_TIERS_AND_TAX_ARCHITECTURE.md`, `ENTITY_UX_FLOWS.md`

## Product model (4 registration shapes)

| Kind | Who | Primary UI |
|------|-----|------------|
| **Personal** | Individuals | Cashbook only |
| **Sole prop lite** | Me + shop, simple | Cashbook · Personal \| Business |
| **Sole prop full** | Same legal sole, full ops | **Full ERP + Cashbook** (still Personal \| Business on cashbook) |
| **Company (Pvt Ltd)** | Incorporated | Full ERP only (no personal domain) |

**Important:** Sole prop full is **not** a Pvt Ltd. Personal books remain required for tax. Domain switcher stays on cashbook; ERP is for business operations (stock/POS/etc.).

---

## Shipped recently

- Phases 1–5 core (data, onboarding, personal, sole lite, lifecycle)
- Workspace **switcher** (memberships, including archived sole after incorporate)
- Control Room **Type** column (Personal / Sole lite|full / Company / Pending)
- Sole full: **Cashbook** nav item + cashbook **Full ERP** link

---

## Phase 6 — Tax depth (next major product)

| Item | Notes |
|------|--------|
| Versioned IIT pack (e.g. 2025/26) | JSON/TS pack, not hardcoded UI |
| Personal year summary schedules | Employment / other income / expenses |
| Sole combined IIT view | Personal domain + business domain → payable overview |
| Accountant export pack v1 | Beyond CSV: PDF/zip of schedules |
| Company CIT path | Later; do not force into IIT adapter |

**Does not block** ops features (AR settlement, import, Control Room polish).

---

## Other system needs (priority order)

### P0 — correctness / admin

1. ~~Control Room entity type on companies & users~~ (this pass)  
2. ~~Workspace switcher~~ (this pass)  
3. Super admin always sees Control Room even if home tenant is personal  
4. Linked **collect / pay** for lite Invoice/Bill (AR/AP settlement against cashbook Money In/Out)

### P1 — sole & personal depth

5. Excel/CSV **import** wizard  
6. Period picker polish + search on sheet  
7. Account nicknames in settings  
8. Optional multi-line lite invoice  

### P2 — platform

9. Control Room create company with entity kind choice  
10. Metrics by entity kind on Control Room overview  
11. Switcher / impersonate for support (careful)  

### P3 — quality

12. E2E personal / sole / lifecycle / switcher (when ready)  
13. Version banner / health for multi-workspace users  

---

## Sole full UX (locked)

```
ERP sidebar
  Accounting
    Simple Entry
    Cashbook  ← Personal | Business domains live here
    Dashboard…
  Sales / Purchase / Inventory / POS  ← business modules
```

Cashbook header: **Full ERP** when capability = full.  
Settings: Open full BookOne + lifecycle cards.

---

## Incorporate vs sole full

| Action | Legal | Personal books |
|--------|-------|----------------|
| Sole lite → full | Still sole prop | **Yes** (cashbook personal domain) |
| Sole → incorporate | **New** Pvt Ltd tenant | No personal domain on company; sole **archived** (switcher can open for history) |
