# BookOne — Event rental + catering (hire inventory)

**Status:** architecture draft · rental **settings shipped** (`/company/rental`, module flag `rental`)  
**Date:** 2026-09-03  
**Offline / local-node work is out of scope** (cloud-only).

Offline / local-node work from `docs/OFFLINE_SYNC_ARCHITECTURE.md` is **out of scope** (product decision: cloud-only).

---

## 1. Verdict

**They can use BookOne today for catering food, labour, and items they sell (disposables, extra portions).**  
Parties, quotes → orders → invoices, VAT, AR, payments, locations, POS, physical stock, and services already cover that.

**They cannot correctly rent chairs, crockery, tents, chafers, or sound for event dates.** If a chair is a `physical` product, an invoice **permanently decrements stock and posts COGS** (`commercial-docs.ts` sale path + `isPhysicalProduct`). That is a **sale**, not a **hire**. If they mark chairs as `service`, there is no quantity, no “out on rent,” no calendar, and double-booking is invisible.

This customer needs a **rental overlay on inventory + sales**, not a new accounting product. Money still flows through the existing posting engine. Time, availability, dispatch, return, and damage are new.

---

## 2. How this business actually works

A catering firm that also hires equipment is **two businesses on one event**.

| Line on the same job | Nature | Comes back? | BookOne today |
|----------------------|--------|-------------|---------------|
| Menu / food | Consumable sale | No | `physical` + COGS |
| Wait staff / chef / setup | Service | n/a | `service`, revenue only |
| Delivery / transport | Service | n/a | `service` |
| Disposables | Sale | No | `physical` |
| Chairs, tables, linens, glass, chafers, tents, speakers | **Hire** | **Yes** | **Gap** |
| “Wedding 200 pax package” | Bundle of the above | Mixed | No kits |

### Operating cycle (industry: Rentman, Odoo Rental, Sage ARM, Point of Rental)

```
Inquiry → Quote (event date, venue, pax)
       → Deposit to hold stock
       → Confirmed booking (reserves qty for a period)
       → Packing list / dispatch (out the door)
       → Event
       → Collect / return / inspect
       → Clean / repair turnaround
       → Final invoice: hire + extras + damage − deposit refund
```

Typical event hire is **hours to a few days**, not monthly equipment lease. Billing is **per event / per day**, often with a minimum period. Overlap of two Saturday weddings is the whole product.

### What “in stock” means (this is the core difference)

Warehouse **qty on hand** for 500 chairs is still ~500 while 200 are at a venue. The chairs are **company assets**. What changes is **availability for a date range**:

```
available(from, to) =
  qtyOwned
  − qtyDamaged/in_repair
  − qtyReserved on overlapping bookings (including turnaround padding)
  − qtyCurrentlyOut that will not be back before `from`
```

A normal sales inventory (BookOne today) only knows `qtyOnHand`. It cannot answer “can I take 180 chairs for 12–14 Sep?”

### Damage and other edges (will happen every season)

| Event | Operational | Accounting |
|-------|-------------|------------|
| Dirty / needs wash | Extra turnaround; not rentable until clean | Optional cleaning fee (revenue) |
| Repairable damage | Off-hire → repair bay; photos | Charge customer and/or repair expense; **do not COGS the fleet** |
| Write-off / smashed | Reduce owned qty | Dr write-off / COGS (or 6800), Cr 5100; invoice customer replacement |
| Missing vs dispatched | Same as write-off until found | Charge customer; if found later, reverse |
| Partial return | 200 out, 198 back | Keep 2 “on rent / missing” |
| Late return | Blocks next booking | Late fee (revenue) |
| Overbook / short | Sub-rent from a vendor | PO/bill (expense or inventory in-then-out); still invoice customer |
| Cancel after deposit | Release reservation | Forfeit or refund deposit per policy |
| Extension | Stretch period; re-check availability | Extra hire on invoice |
| Swap item | Exchange product on the booking | Availability on both SKUs |
| Deposit | Hold, not a sale | **Liability**, not 4000 |

Odoo: deposit is a **service product** invoiced to a **liability** account; refund via credit note; damage is a separate charge. Sage ARM: calendar of available / on rent / due back. Rentman: serials for expensive kit; bulk for chairs; damaged items **cannot be booked**.

---

## 3. What BookOne already has (reuse)

| Capability | Where | Rental use |
|------------|--------|------------|
| Product types `physical` / `digital` / `service` | `inventory_products` | Add **`rental`**; do **not** reuse physical sale posting |
| Qty by location | `inventory_stock_levels` | Owned fleet per warehouse |
| Movements + adjustments | `inventory_movements`, stock docs | Dispatch, return, damage write-off |
| Negative-stock policy | `inventory_settings` | Overbook policy |
| Quotes / orders / invoices / payments | `business_documents` | Event commercial cycle |
| Quotes & orders **do not post GL or stock** | `postsToGl()` | Good: order = reservation, invoice = money |
| Locations | company settings | Warehouse vs “on rent” vs “repair” |
| Parties, credit limit, VAT, tax invoice serial | sales settings | Same customer / IRD rules |
| Document lines with `productId` | `business_document_lines` | Mix food + service + hire on one invoice |
| Health Check | Control Room | Availability / deposit / TB cases |
| Module flags | `platform-modules.ts` | Optional **`rental`** module |

---

## 4. What must not happen

1. **Invoice a rental SKU as `physical`.** That fires COGS + permanent stock out. Wrong books and empty warehouse on paper.
2. **Last-write-wins two overlapping bookings.** Availability is a **constraint**, not a merge.
3. **Book “damaged” qty.** Repair bay is not available.
4. **Post a security deposit to 4000 Sales.** It is money you owe back (`2400` liability).
5. **Recognize hire income when the deposit lands**, if the event is next month (SME: invoice at confirm/dispatch is OK; deposit still liability).
6. **Treat a lost chair as a sales return.** Returns restock; a loss **writes off** the asset and may **invoice** the customer.

---

## 5. Recommended product design

### 5.1 Module

Add tenant module **`rental`** (like POS). Always-on accounting/company unchanged. Catering customer: sales + inventory + rental (+ purchase for sub-hires).

Nav (under Inventory or a small **Hire** suite):

- Rental calendar  
- Bookings (event jobs)  
- Dispatch / returns  
- On rent / damaged filters (stock levels)  
- Settings: padding, deposit defaults, late fee

Sales quotes/orders/invoices stay; they gain **rental period fields** when a line is a rental product.

### 5.2 Product type `rental`

Same row as other products (`inventory_products`). Differences:

| Field | Rental meaning |
|-------|----------------|
| `productType` | `rental` |
| `sellPrice` | Default **hire rate per period** (day or event) |
| `unitCost` | Fleet unit cost (for write-off / insurance), **not** COGS on dispatch |
| `revenueAccountCode` | Default **4400 Rental income** (new CoA code) |
| Extra | `rentable`, `hireUnit` (`event` \| `day` \| `hour`), `minHireQty`, `turnaroundHours`, `depositAmount` or `%`, `replacementPrice` |

**Accounting on hire invoice:** Dr AR, Cr 4400 (and VAT 2200). **No 5000/5100.**  
**Stock on hire invoice:** **no** `sale` movement. Stock moves only on **dispatch / return / damage**.

`isPhysicalProduct()` must **exclude** `rental` so the existing sale path cannot steal fleet qty.

Consumable food stays `physical`. Labour stays `service`. One document may mix all three.

### 5.3 Locations for fleet status

Reuse `locations` with types (or dedicated virtual locations seeded per tenant):

| Location | Meaning | Bookable? |
|----------|---------|-----------|
| Main warehouse | Clean, on the shelf | Yes |
| On rent | At customer / in transit out | No (already committed) |
| Returns / wash | Back, not ready | No until transferred to warehouse |
| Repair | Damaged, being fixed | No |
| Written off | Optional; usually qty adjustment instead | No |

**Dispatch:** transfer warehouse → on rent (existing transfer engine, new reason).  
**Return good:** on rent → wash or warehouse.  
**Return dirty:** on rent → wash (padding applies).  
**Return damaged:** on rent → repair; flag units/qty.  
**Missing:** adjustment out of on-rent; optional customer charge.

Stock levels UI gains filters the customer asked for: **On hand / On rent / In repair / Available (date)**.

This matches Odoo’s `Customer/Rental` virtual location without a second inventory engine.

### 5.4 Bookings and periods

Do **not** invent a parallel sales stack. Attach periods to commercial documents.

**Event header** (on quotation / sales order / invoice — JSON column or `rental_events` table):

- `eventDate` (or start/end)  
- `venue` / place of supply  
- `guestCount`  
- `deliverAt` / `collectAt`  
- packing notes  

**Line periods** (`rental_booking_lines`):

- `documentId`, `documentLineId`, `productId`  
- `qty`  
- `periodStart`, `periodEnd` (timestamptz)  
- `status`: reserved | dispatched | returned | cancelled  
- `dispatchedQty`, `returnedQty`, `damagedQty`, `missingQty`

Quote: optional hold (soft reserve, expires).  
Confirmed sales order: **hard reserve** — availability check must pass.  
Invoice: money; may exist before or after dispatch.  
Dispatch/return: qty and condition; links to the booking line.

Availability query (indexed overlap):

```
sum(qty) of rental_booking_lines
  where product + location
    and status in (reserved, dispatched)
    and period overlaps [start - padding, end + padding]
    and document not voided
```

Block confirm if `owned - repair - overlap < requested` (or warn if settings allow overbook).

### 5.5 Calendar (the feature they named)

Three views, same data:

1. **Company calendar** — events as blocks (customer, venue, pax). Click → booking.  
2. **Product calendar** — for a SKU (or all hire SKUs), bars of qty committed per day; capacity line = owned − repair.  
3. **Agenda / due** — dispatch today, collect today, overdue, in repair.

Implementation: server action `listRentalCalendar(from, to, productId?)` → FullCalendar / existing BookOne date popover language. No third-party “rental SaaS.” Filter rented products from Inventory → Stock Levels and from this calendar.

### 5.6 Money: deposits, hire, damage, late

New default accounts (additive CoA, seed + migration for new tenants; optional add for existing):

| Code | Name | Type |
|------|------|------|
| 2400 | Customer deposits | liability |
| 4400 | Rental income | revenue |
| 4450 | Damage & hire charges | revenue (or other income) |
| 5150 | Rental fleet write-off | expense (or use 5000) |

**Deposit (confirm or pickup):** Dr Bank/AR, Cr 2400. Not revenue. Track on the event (`depositHeld`).  
**Clean return:** Dr 2400, Cr Bank (refund) or apply to final invoice.  
**Damage/late/missing:** invoice lines on 4450 (or 4400); optionally **apply deposit** via existing `settlement_allocations` / receive-payment patterns so 2400 reduces and AR/revenue is recognized.  
**Repair we pay:** cash purchase / expense 6800 (or asset maintenance); does not reverse the customer charge.

Hire fees: normal sales invoice lines on the rental product (4400).  
Food: physical lines (4000 + COGS).  
Same invoice is the catering customer’s one tax invoice (IRD serial unchanged).

For short events, **no deferred-revenue engine in v1**. Invoice when they confirm or on dispatch. Deposits remain the only “unearned” bucket.

### 5.7 Damage workflow (first-class)

Return wizard (per booking, per line):

1. Expected qty (dispatched).  
2. Counted good / dirty / damaged / missing.  
3. Photos (reuse receipt upload / R2).  
4. Charge: none / cleaning fee / % of replacement / full replacement (`replacementPrice` × missing/damaged).  
5. Post: stock transfers/adjustments **and** optional invoice lines.  
6. Damaged qty sits in **Repair** until a **repair complete** transfer back to warehouse (or write-off adjustment).

Inventory filters:

- `status=on_rent`  
- `status=repair`  
- `status=available`  
- `status=overdue` (dispatched, collectAt < today)

Never book repair qty. Calendar shows repair as a blocking bar.

### 5.8 Kits / packages (v1.5)

Catering quotes are “200 pax dinner + chairs + chafers.” v1 can be **manual lines** (already have line editor + save-as-product).  
v1.5: `rental_kits` exploding into component lines with qty × pax rules (1.2× plates, etc.). Not required to onboard the customer if staff explode packages by hand.

### 5.9 Serial numbers (v2)

Chairs: **bulk qty**. Generators / speakers / marquees: **serial**. Defer serials unless they have high-value unique kit. Damage history is painful without serials for those SKUs only.

### 5.10 Sub-rent

If availability fails: create a **purchase** (or cash purchase) of hire from a vendor for the same dates, receive into warehouse, dispatch to the event. Optional later: `subrent` flag on a booking line. v1: use Purchase as-is.

---

## 6. Edge-case matrix (must be in e2e / Health Check)

| # | Case | Expected |
|---|------|----------|
| 1 | Two events same Saturday, 300 chairs owned, both want 200 | Second confirm blocked |
| 2 | Event A Sun 18:00 collect, Event B Sun 19:00 deliver, padding 12h | Block B |
| 3 | Quote hold expired | Qty free again |
| 4 | Invoice without dispatch | Revenue OK; stock still in warehouse; calendar still reserved if order confirmed |
| 5 | Dispatch 100, return 97 good + 2 damaged + 1 missing | 97 available after wash; 2 repair; 1 written off + charge |
| 6 | Charge damage, then repair in-house | Customer income 4450; our repair bill expense; qty returns to warehouse |
| 7 | Deposit 20,000, damage 8,000 | Refund 12,000; 8,000 from 2400 → 4450 |
| 8 | Lost item later found | Reverse write-off; credit note customer if charged |
| 9 | Cancel confirmed booking | Release reservation; deposit policy (refund/forfeit) |
| 10 | Extend return by 1 day | Re-check overlap; extra hire line |
| 11 | Mix food + hire on one invoice | Food COGS; hire no COGS; one VAT invoice |
| 12 | Negative stock policy `block` | Cannot dispatch more than warehouse qty even if calendar said OK |
| 13 | Period lock | Cannot post damage invoice into locked month |
| 14 | Overdue return | Calendar shows blocked; late fee line |

---

## 7. Fit to posting engine

```
Quote / Order          → no GL, rental_booking_lines reserved
Dispatch               → stock transfer only (warehouse → on rent)
Hire invoice           → Dr AR Cr 4400 [Cr 2200]; NO inventory 5100
Food invoice lines     → existing physical posting
Deposit receipt        → Dr Bank Cr 2400
Return good            → transfer on rent → warehouse/wash
Return damage/missing  → transfer/adjust + optional invoice 4450
Refund deposit         → Dr 2400 Cr Bank (or allocate to invoice)
```

Do **not** add a second journal generator. Add `buildRentalDepositPosting` / reuse `recordEntry` or a small document type `customer_deposit` that posts 2400. Damage lines are normal invoice lines with account 4450.

---

## 8. What we tell the catering company (honest)

**Yes, they can come onto BookOne**, with this split:

- **Now:** customers, suppliers, catering food, staff/delivery as services, VAT invoices, payments, reports, buying new crockery into stock.  
- **After rental phase:** date-based hire, calendar, on-rent filter, deposits, damage/returns.  
- **Not in v1:** customer self-service portal, RFID, route optimisation, recipe/costing, allergen labels, payroll for waiters (HR still placeholder).

If they only need “write invoices and see profit,” they can start **now** and keep a spreadsheet calendar until the rental module ships — **as long as they do not enter chairs as physical sales.**

---

## 9. Phased plan

### Phase 0 — Tenant settings (done 2026-09-03)

Hire businesses do not share one policy. The four product questions are **tenant settings**, not hardcoded:

| Setting | What the company enables | Default for new bookings |
|---------|--------------------------|--------------------------|
| Hire units | Per event, per day, per hour (any mix) | Event |
| Invoice timing | On confirm, on dispatch, after return, manual | On confirm; booking may override |
| Deposits | Per event, per item, or both | Per event (amount and/or %) |
| Overlap | Block / manager override / warn / allow | Manager override |
| Turnaround | Hours after return before qty is free | 0 (product may override later) |

UI: **Company → Rental Settings** (`/company/rental`). Shown when the **rental** module is on (Pro default; Control Room can enable for any tenant). Products and bookings pick among the **enabled** options — a catering firm can invoice on confirm with a per-event deposit, while a speaker-hire line on the same tenant can be per-day with a per-item deposit.

CoA 2400 / 4400 / 4450 / 5150 is seeded for existing tenants in migration `021_rental_settings.sql`.

### Phase 1 — Rental product + stock status (done with Phase 2)

- `productType = rental`; posting skip COGS/stock-on-invoice.  
- Seed On rent / Repair / Wash locations.  
- Stock levels columns: on hand, on rent, in repair, available.  
- Filters: On rent / In repair.

### Phase 2 — Periods + availability + calendar (done 2026-09-03)

- Event header + `rental_booking_lines`.  
- Overlap availability on quote / order / invoice create (honours tenant overlap policy).  
- Calendar at `/inventory/calendar` (month + product bars).  
- Quote → order / invoice convert copies hire period and cancels the source hold.

### Phase 3 — Dispatch / return / damage (started 2026-09-04)

- Dispatch/return wizards at `/inventory/on-rent` and on the sales invoice.  
- Condition counts: good → warehouse, damaged → Repair, missing → write off qty.  
- Overdue flag on dispatched lines past hire-to.  
- Photos + customer damage invoice (4450) still Phase 4 with deposits.

### Phase 4 — Deposits & late fees (started 2026-09-04)

- Collect/refund deposit on the hire job (Dr/Cr 2400).  
- Return can invoice damage/missing (4450) and a late fee.  
- Optional apply open deposit to that charges invoice.

### Phase 5 — Hardening

- Health Check + e2e cases from §6.  
- Docs at `/docs`.  
- Module flag in Control Room.  
- Optional kits later.

---

## 10. Key decisions

1. **Rental is not a sale.** New product type; invoice does not COGS or consume fleet.  
2. **Reuse sales documents** for the event job; add periods, do not fork a second ERP.  
3. **Availability is time-overlap of bookings + padding + repair qty**, not `qtyOnHand` alone.  
4. **On rent / repair are locations** so Inventory filters stay first-class.  
5. **Deposits are liabilities (2400).** Damage is extra revenue, write-off is expense + qty.  
6. **Module `rental`** so other tenants stay clean.  
7. **Bulk qty v1; serials v2.**  
8. **Cloud-only** (offline work cancelled).  
9. **Policies are settings, not one global rule.** Enable every option the tenant uses; defaults apply to new bookings; lines may still differ.

---

## 11. Open questions

Resolved (tenant settings, not a single product lock):

1. Pricing unit — **event, day, and hour** can all be enabled.  
2. Invoice timing — **confirm / dispatch / after return / manual**, with optional per-booking override.  
3. Deposit — **per event, per item, both, or none**; event amount and/or %.  
5. Overlap — **block / manager override / warn / allow**.

Still open:

4. Wash location required, or return straight to warehouse with padding hours only? (Turnaround hours is already a setting; virtual wash location is Phase 1/3.)

---

## 12. PR Plan

| PR | Title | Affects | Depends | Description |
|----|--------|---------|---------|-------------|
| PR0 | `feat(rental): tenant settings + module flag` | `rental_settings`, `/company/rental`, CoA, platform modules | — | **Done.** Policies configurable per tenant. |
| PR1 | `db: rental product type` | chart, seed, `isPhysicalProduct`, product form | PR0 | Rental SKUs do not COGS on invoice |
| PR2 | `db: rental locations + stock status columns` | locations seed, stock levels UI | PR1 | On rent / repair filters |
| PR3 | `db: rental events + booking lines + RLS` | new tables, migration | PR1 | Periods storage |
| PR4 | `feat(rental): availability + confirm guard` | commercial-docs, actions | PR0, PR3 | Honour `overlapPolicy` |
| PR5 | `feat(rental): calendar pages` | `/inventory/calendar` or `/rentals/calendar` | PR3 | Date-period view |
| PR6 | `feat(rental): dispatch and return wizards` | stock docs, booking status | PR2, PR3 | Moves + condition |
| PR7 | `feat(rental): deposits and damage charges` | 2400 postings, invoice lines | PR0, PR6 | Honour deposit mode |
| PR8 | `test: rental health-check + e2e` | health-check, e2e-runner | PR7 | Matrix in §6 |

---

## 13. Sources

- Odoo Rental: product types, `Customer/Rental` location, deposits as service/liability, pickup/return state machine  
- Rentman (party rental + catering): bulk vs serial, damage blocks booking, packing lists  
- Sage 100 ARM: calendar of available / on rent / due back  
- Point of Rental / Alert: inspect on return, sell missing/damaged from the contract  
- Catering ops: packing lists, food vs kit, 1.2× crockery multipliers  
- BookOne: `inventory_products.productType`, `postsToGl`, stock delta only on invoice/POS for physical goods
