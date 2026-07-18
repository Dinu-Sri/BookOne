# BookOne Purchase (AP) — product design

**Status:** planned design (2026-07-18)  
**Audience:** SL SME — mixed goods + services, local + import suppliers  
**Peers studied:** QuickBooks Online / Desktop patterns, Sage Business Cloud / mid-market PO→bill→pay  

---

## 1. What we have today

### Sidebar (live)

| Nav item | Route | Document type(s) | Posts GL? | Stock? |
|----------|-------|------------------|-----------|--------|
| Purchase Orders | `/purchase/orders` | `purchase_order` | **No** | No |
| Purchases | `/purchase/purchases` | `purchase`, `vendor_bill` | **Yes** → Dr expense/inv **5100**, Cr **AP 2100** | Yes if physical product |
| Import Purchases | `/purchase/import` | `import_purchase` | **Yes** → force inventory path | Yes if physical |
| Purchase Returns | `/purchase/returns` | `purchase_return` | **Yes** → Dr AP, Cr inv/expense | Yes (out) if physical |
| (legacy) Bills | `/purchase/bills` | redirect → Purchases | — | — |

### Already implemented (backend / shared UX)

- List UX: search, sort, date range, eye, portaled Actions, convert PO → purchase  
- Form UX: `DocumentLinesEditor` (product search, free-text, Save as product, qty steppers)  
- Vendor picker + free-text override  
- Expense account on purchase forms (header → line `accountCode`)  
- Convert PO → purchase copies lines + `sourceDocumentId`  
- Physical product stock **+qty** on purchase / import; **−qty** on purchase return  
- Posting builders + unit tests (`buildVendorBillPosting`, `buildPurchaseReturnPosting`)  
- `allocateDocumentPayment` exists (shared docs) but **no dedicated Pay Bills UI** in Purchase  

### Gaps (product, not just polish)

| Gap | Why it matters |
|-----|----------------|
| No **Pay vendor / Pay bills** screen | AP stays open forever in practice; cash not linked cleanly to bills |
| No **document detail** (`/purchase/.../[id]`) | No print, pay, partial history, source PO link surface |
| No **edit** route for open docs | Only create + list actions (archive/delete) |
| Convert is all-or-nothing | No partial bill against PO (common in real receiving) |
| No **GRN / receive goods** step | Optional in SME, required for inventory discipline (QB Item Receipt / 3-way match) |
| Purchase return not linked to original bill | Free-standing credit; hard to apply against open AP |
| Import = same form as local | Missing C&F, duty, agent, landed-cost allocation (SL import reality) |
| No **cash purchase / expense** path | QB separates **Expense** (paid now) vs **Bill** (AP later) |
| No AP aging / unpaid list | Cash-flow control for SME |
| No supplier statement / print PO-bill PDF | Operational + compliance |
| VAT on purchases (input tax) | Sales has tax invoice path; purchases largely net-only today |
| Unit cost on purchase lines → product cost | Stock qty updates; average/last cost may not fully update product `unitCost` for COGS accuracy |

---

## 2. How QuickBooks does purchase / AP

### Document roles (QBO mental model)

| QBO object | Posts? | Meaning |
|------------|--------|---------|
| **Purchase order** | No | Commitment / memo to vendor — qty, price, terms |
| **Bill** | Yes | Obligation: Dr expense or inventory, Cr **Accounts Payable** |
| **Expense / Check** | Yes | Paid **now**: Dr expense/inventory, Cr **Bank/Cash** (skips AP) |
| **Item receipt** (Desktop / inventory shops) | Often yes (stock + liability variant) | Goods received before supplier invoice |
| **Vendor credit / Supplier credit** | Yes | Opposite of bill — reduces AP (returns, allowances) |
| **Bill payment / Pay bills** | Yes | Dr AP, Cr bank; can apply credits in same payment |

### Full AP cycle (QuickBooks / industry)

1. Create **PO** (optional)  
2. **Receive goods/services** (GRN / item receipt — optional in light SME)  
3. Receive **supplier invoice** → enter **Bill** (match PO / receipt — 2- or 3-way match)  
4. Code GL (category vs item/inventory) + approve  
5. **Pay bills** (single or batch) from bank  
6. Reconcile bank  

**Three-way match (when inventory discipline matters):** PO ↔ GRN ↔ Bill.  
**Two-way match (services / light SME):** PO ↔ Bill, or Bill only.

### Bill vs Expense (critical)

- **Bill** = credit purchase → AP open → pay later  
- **Expense** = already paid (cash/card) → no AP balance  

BookOne today only has the **Bill** path (`purchase` / `import_purchase`). Cash purchases either go through Simple Entry or are missing as a first-class Purchase screen.

### Credits

Supplier credit = reverse bill effect; applied when paying bills (checkbox credits in Pay Bills), not only a separate “return” list.

---

## 3. How Sage-style products do it

Sage (50 / 200 / Business Cloud family — same shape as mid-market UK/EU/SA products):

| Concept | Role |
|---------|------|
| **Purchase order** | Non-posting or commitment; often printable to supplier |
| **Goods received note (GRN)** | Stock in before invoice; open GRNs await matching |
| **Purchase invoice / supplier invoice** | Posts purchase ledger (AP) + nominal |
| **Purchase credit note** | Return / price credit |
| **Supplier payment** | Allocates to invoices / credits (batch remittance) |
| **Supplier enquiry / aged creditors** | Who we owe, aging buckets |

Sage more often **separates GRN from invoice** than QBO Simple Start; BookOne should treat GRN as **phase 2**, not block v1 bills.

Import / landed cost in Sage-like systems:

- Local invoice vs foreign supplier  
- Extra costs (freight, duty, clearing) allocated to stock value  

BookOne already has `import_purchase` forcing inventory account **5100** — good seed; needs cost fields later.

---

## 4. BookOne recommended model (locked direction)

### Design principles (SL SME)

1. **Mirror sales symmetry** where it helps: PO ↔ SO, Purchase bill ↔ Invoice, Return ↔ Credit, Pay bills ↔ Receive payment.  
2. **Default path is short:** Bill-only for services; PO→Bill for stock shops.  
3. **Never invent junk products** — free-text + optional Save as product (already shipped).  
4. **AP is sacred:** every unpaid credit purchase hits **2100**; payments clear AP explicitly.  
5. **Cash purchase is first-class** (like QBO Expense) — not only Simple Entry.  
6. **Import is a specialization of bill**, not a totally different product — extra landed-cost fields later.  
7. **GRN optional** — company setting later: “Require receive before bill for physical items.”  
8. **Accounting engine stays pure** — UI posts through existing builders; extend carefully.

### Canonical document lifecycle

```
                    (optional)
Vendor ──► Purchase order (PO) ──► [Receive goods GRN] ──► Purchase bill (local | import)
                 │ no GL                    stock?              GL: Dr 5100/expense  Cr 2100
                 │                          only if GRN            stock + if physical on bill*
                 ▼
         Convert / copy lines
                 │
                 ▼
         Purchase return / credit ──► reduces stock + Dr 2100 Cr 5100/expense
                 │
                 ▼
         Pay vendor (allocate) ──► Dr 2100  Cr Bank/Cash
```

\*If GRN already stocked items, bill should not double-stock (phase 2 rule).  
v1 (now): **stock on bill only** (current code) — no GRN yet.

### Document type map (BookOne)

| Type | UI name | GL | Stock | Notes |
|------|---------|-----|-------|-------|
| `purchase_order` | Purchase order | — | — | Commitment; print later |
| `purchase` | Purchase (bill) | AP bill | physical + | Local credit purchase |
| `import_purchase` | Import purchase | AP + inv 5100 | physical + | Force inventory path; extend landed cost |
| `purchase_return` | Purchase return / credit | reverse AP | physical − | Link to source bill preferred |
| *(new)* `purchase_expense` or flag `paidNow` | Cash purchase | Dr exp/inv Cr bank | physical + | QBO Expense equivalent |
| *(later)* `goods_receipt` | Goods received | optional / stock | physical + | Phase 2 |

### Accounting standards (v1 keep / clarify)

| Event | Debit | Credit |
|-------|-------|--------|
| Local bill (service / free-text) | Expense (e.g. 6800) | AP 2100 |
| Local bill (physical product) | Inventory 5100 | AP 2100 |
| Import bill | Inventory 5100 (v1 always) | AP 2100 |
| Purchase return physical | AP 2100 | Inventory 5100 |
| Purchase return service | AP 2100 | Expense |
| Pay bill | AP 2100 | Bank/Cash |
| Cash purchase physical | Inventory 5100 | Bank/Cash |
| Cash purchase service | Expense | Bank/Cash |

**Unit cost rule (must fix with payments phase):** on inventory purchase, set/move product cost from bill unit price (or weighted average) so COGS on sale is correct.

---

## 5. Screen inventory — current vs target

### A. Keep (already right shape)

| Screen | Keep / polish |
|--------|----------------|
| PO list + new | ✅ Polish: edit, print, status open/partial/closed |
| Purchases list + new | ✅ Rename clarity: “Bills / Purchases”; pay action |
| Import list + new | ✅ Add import fields later; same engine |
| Returns list + new | ✅ Link to source bill; apply as credit |

### B. Missing **main** screens (recommended)

| Priority | Screen | Route (proposed) | Why (QB/Sage parity) |
|----------|--------|------------------|----------------------|
| **P0** | **Pay vendors / Pay bills** | `/purchase/payments` + `/purchase/payments/new` | Core AP close-out; QBO Pay Bills / Sage supplier payment |
| **P0** | **Purchase document detail** | `/purchase/purchases/[id]`, orders/import/returns same | View, print, pay, convert, history |
| **P0** | **Edit open document** | `.../[id]/edit` | Fix mistakes before period close |
| **P1** | **Cash purchase (Expense)** | `/purchase/expenses` or toggle on bill form “Paid now” | QBO Expense vs Bill |
| **P1** | **AP aging / Unpaid bills** | `/purchase/aging` or filter on Purchases + dashboard widget | Cash planning |
| **P1** | **Print / PDF** PO & bill | `/purchase/.../[id]/print` | Send to supplier / file |
| **P2** | **Goods received (GRN)** | `/purchase/receipts` | 3-way match / warehouse |
| **P2** | **Landed cost on import** | fields on import form + allocation | SL import truth |
| **P2** | **Batch pay / remittance advice** | multi-bill payment | Sage batch |
| **P3** | Purchase settings | `/company/purchase` | Default expense, GRN required, terms |
| **P3** | Supplier statement | party detail or report | Enquiry |

### C. Nav proposal (sidebar)

```
Purchase
  ├─ Purchase Orders
  ├─ Purchases (bills)          ← primary AP docs
  ├─ Cash purchases             ← P1 (or nested under Purchases)
  ├─ Import Purchases
  ├─ Purchase Returns
  ├─ Pay vendors                ← P0 NEW
  └─ AP aging (optional link)   ← P1
```

Legacy `/purchase/bills` stays redirect to Purchases.

---

## 6. UX flows (target)

### Flow 1 — Fast local service buy (most common SME)

1. Purchases → New purchase  
2. Vendor + free-text or catalog service line  
3. Expense account  
4. Save → AP open  
5. Later: Pay vendors → select bill → bank → allocate  

### Flow 2 — Stocked goods with PO

1. PO → lines (physical products) → Save (no GL)  
2. Actions → **To purchase** (or open detail → Convert)  
3. Adjust qty/price if needed → Save → stock + AP  
4. Pay vendors  

### Flow 3 — Cash stock buy (no AP)

1. Cash purchase → Paid now + bank  
2. Physical products → stock + cash out (no 2100)  

### Flow 4 — Return / credit

1. From bill detail → **Return** (preferred) **or** free New return  
2. Posts credit; remaining balance reduced or applied at Pay vendors  

### Flow 5 — Import (v1 simple → v2 landed)

1. Import purchase → supplier/agent + physical lines  
2. Posts inventory + AP  
3. Later: duty/freight lines or landed-cost worksheet allocating into 5100  

---

## 7. Implementation phases

### Phase P0 — “AP can close” (highest value)

1. **Document detail pages** for PO / purchase / import / return  
   - Snapshot: vendor, lines, totals, balance, source link, journal link  
   - Actions: Edit (if open), Convert, Pay, Print, Archive, Delete  
2. **Pay vendors**  
   - List unpaid bills (`balanceDue > 0`)  
   - Payment form: vendor, date, bank account, amount, multi-bill allocation  
   - Reuse/extend `allocateDocumentPayment`  
   - Posting: Dr 2100, Cr bank; update `balanceDue` / status `paid` / `partial`  
3. **Edit** routes for non-converted open docs  
4. **Unit cost**: on physical purchase, update product cost policy (document choice: last cost vs weighted avg — recommend **last cost** for v1 SME simplicity)  
5. List actions: **Pay** on open purchases  

### Phase P1 — Parity with sales + QBO Expense

1. Cash purchase (`paidNow` or `purchase_expense`)  
2. AP aging report / list filters (Current, 30, 60, 90+)  
3. Print templates (PO, bill, return)  
4. Purchase return **from bill** with residual qty  
5. Partial convert PO → bill (line qty remaining)  
6. Dedicated purchase form shell (not only generic `CommercialDocNewForm`) — delivery date, terms, supplier invoice #  

### Phase P2 — Inventory discipline + SL import

1. GRN document + company toggle  
2. Bill match: stock only if not already received  
3. Import: currency note, freight, duty, CIF fields; simple allocation to lines  
4. Batch pay + remittance PDF  
5. Input VAT (when company VAT-registered) on purchases — parallel sales tax invoice design  

### Phase P3 — Controls & polish

1. Approval workflows (optional)  
2. Duplicate bill detection (vendor + supplier invoice # + amount)  
3. Purchase settings  
4. Supplier performance lite (on-time, returns)  

---

## 8. Data / schema notes (when building P0–P1)

Likely already on `business_documents` / lines — confirm before new tables:

| Field need | Purpose |
|------------|---------|
| `source_document_id` | PO → bill, bill → return |
| `balance_due`, `status` | open / partial / paid / converted |
| `supplier_invoice_number` | External ref (duplicate guard) |
| `payment_account_code` / allocations table | Pay bills |
| `delivery_date` | PO / GRN |
| Line `qty_received` / `qty_invoiced` | Partial receive & bill (P1–P2) |

Prefer **reuse** `document_payment_allocations` (or whatever `allocateDocumentPayment` uses) rather than a second payment system.

---

## 9. Explicit non-goals (for now)

- Multi-currency AP valuation (store note only until FX module)  
- Full 3-way match mandatory for all tenants  
- EDI / supplier portal  
- Automatic bank bill-pay rails (PayHere/Stripe for AP)  
- Manufacturing BOM purchase requisitions  

---

## 10. Success criteria

| Metric | Pass |
|--------|------|
| PO → purchase → stock on hand | Qty increases on physical |
| Purchase → trial balance | AP 2100 credit = unpaid total |
| Pay bill → AP | Balance due 0; bank reduced |
| Return physical | Stock down; AP reduced |
| Free-text service bill | Expense not inventory |
| Import physical | Inventory 5100 not random expense |
| Cash purchase | No AP balance left open |

---

## 11. Recommended build order (next engineering sprint)

1. Write this design into implementation tickets (this doc is source of truth).  
2. **P0.1** Document detail + print stub for purchases.  
3. **P0.2** Pay vendors (single bill, then multi).  
4. **P0.3** Cost update on purchase + smoke test product → purchase → sale → COGS.  
5. **P1** Cash purchase + aging + return-from-bill.  
6. **P2** GRN + import landed cost only after P0 proven in production.

---

## 12. File index (today)

| Concern | Path |
|---------|------|
| Routes | `apps/web/src/app/purchase/**` |
| Shared form | `components/module/commercial-doc-screens.tsx` |
| List | `components/sales/commercial-document-list.tsx` |
| Create/post/convert | `app/actions/commercial-docs.ts` |
| Payment allocate | `app/actions/documents.ts` → `allocateDocumentPayment` |
| Posting | `packages/accounting/src/engine/document-posting.ts` |
| Nav | `components/layout/bookone-shell.tsx` |

---

*Last updated: 2026-07-18*
