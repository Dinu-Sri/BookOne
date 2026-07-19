# Accounting integration audit — Sales · Purchase · Inventory · Parties · Simple Entry

**Date:** 2026-07-19  
**Scope:** Operational connectivity to the double-entry engine and shared ledger  
**Codebase:** BookOne monorepo (`packages/accounting` + `apps/web` actions)

---

## 1. Architecture: two posting highways into one ledger

```
┌─────────────────────────────────────────────────────────────────┐
│  SHARED LEDGER (Postgres)                                         │
│  transactions · journal_entries · journal_lines · accounts        │
│  (Reports / Journal / TB / BS / P&L / Reconciliation all read this) │
└─────────────────────────────────────────────────────────────────┘
           ▲                                    ▲
           │                                    │
┌──────────┴──────────────┐      ┌──────────────┴──────────────────┐
│ HIGHWAY A — Simple Entry │      │ HIGHWAY B — Commercial modules  │
│ recordEntry              │      │ createCommercialDocument        │
│ → inferTransaction       │      │ → document-posting builders     │
│ → generateJournal        │      │ + stock / parties / documents   │
│ free-text party          │      │ + AR/AP balanceDue              │
└──────────────────────────┘      └─────────────────────────────────┘
```

| | Simple Entry | Commercial (Sales/Purchase/POS) |
|--|--------------|----------------------------------|
| Engine | `inferTransaction` + `generateJournal` | `buildSalesInvoicePosting`, `buildVendorBillPosting`, etc. |
| Documents | **None** | `business_documents` + lines |
| Party | Free-text on `transactions.party` | `ensureParty` → `parties.id` |
| Inventory qty | **Never** | Yes for physical lines / GRN / adj / transfer |
| AR/AP subledger | Journal only | `balanceDue` + payments + aging |
| VAT | **None** | Output 2200 / Input 2300 when tax invoice |

**Bottom line:** Modules *do* share the accounting engine’s **ledger tables**. They do **not** all use the same **posting path**. That is the root of most edge cases.

---

## 2. Chart of accounts (canonical codes)

| Code | Name | Used by |
|------|------|---------|
| 1000 | Cash | POS/cash, payments, Simple Entry |
| 1100 | Bank | Payments, Simple Entry default |
| 1200 | Card | POS/card |
| 1300 | AR | Credit sales, receive payment, SaleCredit |
| 2100 | AP | Credit bills, pay vendors |
| 2150 | GRNI | Optional GRN liability until bill |
| 2200 | Output VAT | Tax sales invoices / POS tax |
| 2300 | Input VAT | Tax purchase invoices |
| 4000 | Sales revenue | All commercial sales + SE sales |
| 4100 | Sales returns | Sales returns |
| 5000 | COGS | Physical sales |
| 5100 | Inventory | Physical purchases, COGS relief, adjustments |
| 6000–6800 | Expenses | Bills (expense), SE money out, adjustments |

---

## 3. Document / operation matrix (GL + stock)

### 3.1 Sales

| Operation | GL? | Journal (simplified) | Stock (physical + productId) |
|-----------|-----|----------------------|------------------------------|
| Quotation | No | — | No |
| Sales order | No | — | No |
| Sales invoice (credit) | **Yes** | Dr **1300** · Cr **4000** · Cr **2200**? · Dr **5000**/Cr **5100**? | **−qty** |
| Sales invoice (cash / payment acct) | **Yes** | Dr **cash** · Cr 4000 · VAT · COGS | **−qty** |
| POS sale | **Yes** | Dr tender · Cr 4000 · VAT · COGS | **−qty** |
| Sales return | **Yes** | Dr **4100** · Cr AR/cash · reverse COGS | **+qty** |
| Receive payment | **Yes** | Dr cash · Cr **1300** | No |
| AR aging | Report only | — | — |

### 3.2 Purchase

| Operation | GL? | Journal | Stock |
|-----------|-----|---------|-------|
| PO | No | — | No |
| GRN | **Optional** | If GRNI on: Dr **5100** · Cr **2150** | **+qty** (+ last/avg cost) |
| Purchase / import bill | **Yes*** | Dr **5100** or expense · Dr **2300**? · Cr **2100** | **+qty** unless GRN already received |
| Cash purchase | **Yes** | Dr inv/exp · Dr 2300? · Cr **bank** | **+qty** |
| Purchase return | **Yes** | Dr **2100** · Cr inv/exp · VAT reverse? | **−qty** |
| Pay vendors | **Yes** | Dr **2100** · Cr bank | No |
| Pending approval bill | Deferred | No journal until Approve | No until Approve |

\*Unless Purchase settings require approval → `pending_approval` holds GL/stock.

### 3.3 Inventory standalone

| Operation | GL? | Journal | Stock |
|-----------|-----|---------|-------|
| Stock adjustment | **Yes** | ±5100 ↔ 6800 | ±qty |
| Stock transfer | **No** | — | Location ↔ location |
| Product opening qty | **No** | — | Opening level only |
| Last cost update | No | — | Product master on purchase/GRN |

### 3.4 Parties

| Operation | GL? | Role |
|-----------|-----|------|
| Create/edit party | No | Master data |
| Document create | Via doc | `ensureParty(name)` always runs |
| Credit limit | **Not enforced** | Advisory only |
| Blocked/inactive | Blocks post | Hard gate |

### 3.5 Simple Entry

| Direction (UI) | What actually posts | Journal |
|----------------|---------------------|---------|
| Money In | Always **new sale** | Dr cash · Cr **4000** |
| Money Out | Expense (or Owner if 3100) | Dr category · Cr cash |
| Move Money | Transfer | Dr to · Cr from |
| Invoice/Bill | Always **customer AR invoice** | Dr **1300** · Cr **4000** |

Engine *supports* Receive / vendor bill / Pay / Owner contribution, but **UI does not expose them** (or maps Invoice/Bill incorrectly to customer only).

---

## 4. Connection health by module

### ✅ Strongly connected

1. **Sales invoice / POS → engine builders → balanced journals + stock + COGS**  
2. **Purchase bills / cash purchase / returns → builders → AP/cash + stock rules**  
3. **Receive payment / Pay vendors → same `allocateDocumentPayment` → AR/AP clear**  
4. **AR/AP aging** read `business_documents.balanceDue` (commercial path only)  
5. **Period locks** block commercial GL and Simple Entry  
6. **Parties** always materialised on commercial docs; blocked parties rejected  
7. **Reports / Journal / TB** include **all** journal lines (both highways)

### ⚠️ Weakly connected / parallel

1. **Simple Entry** posts to ledger but **never** creates documents → invisible to Receive payment, Pay vendors, aging, supplier performance  
2. **Legacy `documents.ts` create** still exists (simplified AR/AP, no COGS/VAT/stock)  
3. **Product account codes** (revenue/COGS/inventory per product) largely **ignored**; builders hardcode 4000/5000/5100  
4. **Brand/location** required on Simple Entry if configured; commercial journals often omit them  

### ❌ Gaps (not connected or incorrect for full ERP purity)

See §5 severity list.

---

## 5. Edge cases & risks (prioritised)

### Critical (can misstate financials)

| # | Edge case | What happens | Impact |
|---|-----------|--------------|--------|
| C1 | **Double post SE + commercial** | Same sale recorded as Simple Entry *and* invoice | Double revenue/cash |
| C2 | **GRN without bill** | Qty up, **5100 not increased** | Stock on hand ≠ inventory asset |
| C3 | **Opening stock** | Qty set, **no 5100** | BS inventory lag from day one |
| C4 | **Last-cost COGS** | Sale uses *current* product cost, not layer | COGS wrong after price changes |
| C5 | **Zero unit cost physical sale** | Qty decreases, **no COGS journal** | Inventory asset stuck; COGS understated |
| C6 | **Mixed bill** (goods + service) | Any physical line → **entire total to 5100** | Services capitalised into stock |

### High

| # | Edge case | What happens | Impact |
|---|-----------|--------------|--------|
| H1 | **Sales return + VAT** | Return builder always **vatTotal=0** | Output VAT not reversed |
| H2 | **Return from cash purchase** | Still **Dr AP** not cash | Phantom AP / wrong cash |
| H3 | **Purchase return vs original bill** | GL reduces AP; **original bill balanceDue unchanged** | Subledger ≠ control account story |
| H4 | **Sales return vs original invoice** | Credit AR; **invoice balanceDue not reduced** | Same subledger drift |
| H5 | **Cash purchase landed costs** | Doc total may include freight; GL `landedExtra: 0` | Doc total ≠ journal |
| H6 | **No reverse void of posted docs** | Soft-delete blocked if `transactionId` set | Corrections only via counter-docs / SE |
| H7 | **Negative stock allowed** | Sale with qty > on hand | Negative qty, COGS still posts |

### Medium

| # | Edge case | What happens |
|---|-----------|--------------|
| M1 | Free-text sale line (no productId) | Treated as **service** — no stock, no COGS even if physical goods sold |
| M2 | Product revenue/COGS account overrides ignored | Always 4000/5000/5100 |
| M3 | POS mixed tender | One cash account; split only in notes |
| M4 | `sourceDocumentId` → mark source **converted** broadly | Can mis-label source docs (returns, etc.) |
| M5 | Credit limit not enforced | Only shown/advisory |
| M6 | Party match by **name only** | Typos create duplicate parties |
| M7 | Stock locations: sales/purchases use default null location | Transfers use locations — split stock |
| M8 | Approve path expense hardcodes 6800 | Line expense accounts dropped |
| M9 | Simple Entry Invoice/Bill UI says vendor but posts **customer AR** | Bug / UX trap |
| M10 | Accounting type strings inconsistent | SE: `Sale`/`Expense` vs commercial: `sale`/`invoice_bill` |

### Low / operational

| # | Note |
|---|------|
| L1 | POS shift float / Z variance not journalled |
| L2 | SE period reverse posts *today*, not original date |
| L3 | Supplier performance on-time % uses `updatedAt` as pay date proxy |

---

## 6. “Are modules properly connected?” — scorecard

| Module | Posts to shared ledger? | Uses pure builders? | Subledger (docs/aging)? | Stock? | Overall |
|--------|-------------------------|---------------------|-------------------------|--------|---------|
| **Sales invoices / POS** | Yes | Yes | Yes | Yes (physical) | **Strong** |
| **Receive payments** | Yes | allocate path | Yes | No | **Strong** |
| **Purchase bills / pay** | Yes | Yes | Yes | Yes (rules) | **Strong** |
| **GRN** | No GL | — | No | Qty only | **Partial by design** |
| **Inventory adj** | Yes | Yes | No | Yes | **Good** |
| **Inventory transfer** | No | — | No | Yes | **OK (qty only)** |
| **Parties** | Indirect | ensureParty | Aging via docs | No | **Good for commercial** |
| **Simple Entry** | Yes | Different engine | **No** | **No** | **Parallel highway** |
| **Quotes / SO / PO** | No | — | Pipeline only | No | **Correct** |

**Almost everything commercial is wired.** The system is **not** one seamless “all operations must go through documents” design: Simple Entry is a **second, simpler on-ramp** to the same books.

---

## 7. Recommended operating rules (SME)

Until deeper engineering fixes land, run the business like this:

### Do

1. **Day-to-day sales** → Sales invoices / POS (not Simple Entry Money In for the same sale).  
2. **Day-to-day purchases** → Purchase / cash purchase / import (not Simple Entry for stocked goods).  
3. **Clear AR/AP** → Receive payments / Pay vendors only.  
4. **Stocked goods** → Always use **product lines** (not free-text) so stock + COGS fire.  
5. **GRN process** → Always **bill GRNs** so 5100 catches up to physical qty.  
6. **Opening inventory** → Prefer stock adjustment (GL) or a purchase bill, not product opening qty alone.  
7. **Simple Entry** → Use for **misc cash** (petty cash, bank fees, owner drawings, transfers) that are **not** already a commercial document.

### Don’t

1. Record the same event twice (SE + invoice).  
2. Sell physical goods as free-text lines.  
3. Leave GRNs unbilled for long periods if you care about BS inventory.  
4. Expect Simple Entry AR to show on AR aging.  
5. ~~Expect sales returns to auto-clear the original invoice balance~~ ✅ P1 applies return against source `balanceDue` when open.

---

## 8. Fix backlog (engineering priority)

### P0 — correctness ✅ implemented 2026-07-19

1. **Sales return VAT reverse** ✅ `buildSalesReturnPosting` + source/tax rate wiring  
2. **Purchase return from cash purchase** → refund cash ✅ `refundCashAccountCode`  
3. **Cash purchase landedExtra** into GL ✅ (+ unit-cost allocation)  
4. **Mixed purchase bills** → per-line inventory vs expense ✅ `lineBuckets`  
5. **SE vs commercial double-post** warning ✅ Simple Entry blocks with force checkbox  
6. **Opening stock GL** ✅ Dr 5100 / Cr 3000 on product create with opening qty  
7. **Bonus:** returns no longer mark source document `converted`

### P1 — subledger integrity ✅ implemented 2026-07-19

7. **Returns reduce / allocate against source** ✅ apply `min(source.balanceDue, returnTotal)`; mark both docs paid/partial; `settlement_allocations` when both have transactions. Cash sources (balanceDue=0) skip apply — refund on return GL.  
8. **Don’t mark source `converted` for returns** ✅ (shipped with P0).  
9. **Enforce credit limit (optional)** ✅ `sales_settings.enforce_credit_limit` + Company → Sales checkbox; blocks credit invoices when open AR + this invoice > party `creditLimit`.  
10. **Product account codes into builders** ✅ enrich lines with product `revenue`/`cogs`/`inventory` codes; multi-revenue grouping in `buildSalesInvoicePosting`.  
11. **Simple Entry vendor bill + customer payment** ✅ UI selects `moneyInType` / `invoiceType`; category preview only for expense vendor bills.

### P2 — inventory purity ✅ implemented 2026-07-19

12. **Optional GRNI on GRN** ✅ Purchase Settings `postGrniOnReceipt` → GRN posts Dr **5100** / Cr **2150**; bill clears Dr **2150** for received inventory (no double 5100). Account auto-seeded / ensured.  
13. **Negative stock block** ✅ Inventory Settings `negativeStockPolicy` allow|block on commercial stock-out, transfers, adjustments.  
14. **Average cost** ✅ Inventory Settings `costingMethod` last|average (weighted by total qty on hand before receipt).  
15. **Location-aware sales/purchases** ✅ `locationId` on commercial docs + stock levels; form picker when locations exist; POS uses register location.

---

## 9. End-to-end test script (manual smoke)

Use after deploy to prove connectivity:

| # | Steps | Expect |
|---|-------|--------|
| 1 | Create physical product unit cost 100 | Master cost 100 |
| 2 | Purchase 10 @ 100 | Dr 5100 1000 · Cr 2100 1000 · qty 10 |
| 3 | Pay vendor full | Dr 2100 · Cr bank · balanceDue 0 |
| 4 | Sales invoice 2 @ 200 (service? no — physical) | Dr 1300 400 · Cr 4000 400 · Dr 5000 200 · Cr 5100 200 · qty 8 |
| 5 | Receive payment full | Dr bank · Cr 1300 · invoice paid |
| 6 | GRN 5 then bill from GRN | Default: GRN qty+ only; bill AP + 5100, **qty no double**. With GRNI: GRN Dr5100/Cr2150; bill Dr2150/Cr2100 |
| 7 | Stock adjustment −1 | Dr 6800 · Cr 5100 · qty down |
| 8 | Simple Entry money out 500 rent | Dr 6100 · Cr bank — **no** purchase doc |
| 9 | Trial balance | Balanced; AR/AP/cash/inventory match story |
| 10 | **Anti-test:** SE sale + invoice same sale | TB revenue doubles — **forbidden ops** |

---

## 10. Conclusion

**Yes — Sales, Purchase, Inventory, and Parties are largely connected to the accounting engine for commercial workflows**, through `document-posting` builders and shared journal tables. Receive/Pay, COGS, AP/AR, VAT (when configured), and period locks form a coherent SME backbone.

**However:**

1. **Simple Entry is a second highway** into the same books — powerful but **not** integrated with AR/AP documents or stock.  
2. Several **edge cases** (GRN vs inventory asset, last-cost COGS, returns vs balances, mixed bills, cash-purchase returns) mean the system is **strong for happy-path SME ops**, not yet airtight ERP purity.  
3. Following the **operating rules in §7** keeps books trustworthy; P0–P2 correctness, subledger, and inventory purity settings are implemented.

---

*Audit based on source read of `commercial-docs.ts`, `documents.ts`, `record-entry.ts`, `inventory.ts`, `document-posting.ts`, `posting.ts`, `journal-generator.ts`, POS session, parties, purchase settings (2026-07-19).*
