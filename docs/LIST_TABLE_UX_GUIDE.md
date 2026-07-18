# BookOne list tables, search & form line entry — design guide

**Purpose:** Canonical UI/UX for reusable list screens and product line entry across Sales, Purchase, Inventory, Parties.  
**Status:** Living standard (updated **2026-07-18**).  
**Primary references:**

| Screen | Implementation |
|--------|----------------|
| Quotations list | `apps/web/src/components/sales/quotation-list.tsx` |
| Quotation create form | `apps/web/src/components/sales/quotation-form.tsx` |
| Product typeahead | `apps/web/src/components/module/product-add-search.tsx` |
| Parties list | `apps/web/src/components/parties/party-list.tsx` |
| Products list | `apps/web/src/components/inventory/product-list.tsx` |
| Date range | `apps/web/src/components/layout/date-range-picker.tsx` |
| Styles | `apps/web/src/app/globals.css` (`party-*`, `doc-action-*`, `th-sort-*`, `product-add-*`) |

Also linked from `AGENTS.md`.

---

## A. List screen shell

### Toolbar (left → right)

1. **Universal search** — `party-search-form` + `input.party-search` (flex grow)  
2. **Duration filter** — `DateRangePicker compact` in `party-toolbar-period`  
3. **Primary CTA** — e.g. New quotation  

```tsx
<div className="workspace party-workspace">
  <div className="party-toolbar">
    <div className="party-search-form">
      <input className="input party-search" placeholder="Search by customer name or number…" />
    </div>
    <div className="party-toolbar-period">
      <DateRangePicker compact />
    </div>
    <Link href="…/new"><Button variant="primary">New …</Button></Link>
  </div>
  {/* Card + table + pagination */}
</div>
```

### List chrome rules

| Do | Don’t |
|----|--------|
| `workspace party-workspace` | Page H1 / eyebrow / long lead (`ModulePageHeader`) |
| Compact table in `Card` | Nested page titles |
| `party-back-btn` on create/edit | One-off back link styles |

---

## B. Universal search

| Rule | Detail |
|------|--------|
| Live filter | Filter as user types; optional ~250ms debounce when syncing URL |
| **Must search** | Document/code **number** + **customer/party name** (or product name/SKU) |
| Also useful | Status, dates, totals, codes |
| Placeholder | Explicit: `Search by customer name or number…` |
| Empty states | “No records yet” vs “No matches” / “Try another search or date range” |
| URL (optional) | `q` query param for shareable filters |

---

## C. Duration (date range) filter

| Rule | Detail |
|------|--------|
| Component | `DateRangePicker` |
| Params | `from`, `to` as `YYYY-MM-DD`; empty = all time |
| Document lists | Filter **issue date**: `issueDate >= from && issueDate <= to` |
| Outside click | **Close** on mousedown outside root + **Escape** |
| Presets | All time, Last 7 days, Last 30 days, This month |

Never require manual Cancel to dismiss the menu.

---

## D. Table layout

### Columns

- Prefer: **Number · Party · Date · Status · Total** (+ compact actions).  
- Avoid a separate column per action (Edit / Archive / Delete each as a button).

### Row actions (required)

| Control | Spec |
|---------|------|
| **View** | Eye icon — `Button variant="ghost" className="icon"` |
| **Actions** | One dropdown: Edit, convert/domain ops, Archive/Restore, Delete |

**Same line — never wrap** (keeps row height tight):

```css
.party-row-actions-inline { flex-wrap: nowrap; white-space: nowrap; align-items: center; }
.td-actions { white-space: nowrap; width: 1%; vertical-align: middle; }
.th-actions { width: ~132–140px; }
```

### Actions dropdown — sizing & visibility

| Rule | Detail |
|------|--------|
| Min width | **220px** (`min-width` / portal `minWidth`) |
| Item padding | Comfortable: ~`10px 12px` |
| Render | **Portal** to `document.body` (not inside `.table-wrap`) |
| Position | `position: fixed` from trigger `getBoundingClientRect()` |
| Open direction | Prefer **down**; open **up** only if not enough space below **and** enough space above |
| Open-up technique | `top` at trigger top + `transform: translateY(-100%)` |
| z-index | **≥ 300** on the portaled panel |
| Background | Solid surface + shadow so text never “disappears” over table |
| Empty state | If no actions apply (e.g. converted), show **“No actions available”** — never an empty shell |
| Resolve row | Look up open menu row from **pageRows → filtered → all rows** so first/last pages never miss items |
| Close | Outside click, scroll, resize |

Classes: `doc-action-panel`, `doc-action-panel-fixed`, `doc-action-item`, `doc-action-trigger`.

---

## E. Sorting

| Rule | Detail |
|------|--------|
| Headers | Clickable `th-sort-btn` on each sortable column |
| Icon | Idle `ArrowUpDown`; active `ArrowUp` / `ArrowDown` (`.th-sort-icon.active`) |
| Toggle | Same column flips asc/desc; new column uses sensible default (dates/totals often **desc**) |

---

## F. Pagination

| Rule | Detail |
|------|--------|
| Page size | **10** (`PAGE_SIZE = 10`) |
| UI | `party-pagination` + Previous / Next |
| Copy | `{n} total · page X of Y` |
| Reset page | When search, date range, or sort changes |

---

## G. Soft / destructive actions

| Action | Behavior |
|--------|----------|
| View | Snapshot modal (lines + totals); no navigation |
| Edit | Dedicated route when fields need a form |
| Archive | Status `archived`; restorable |
| Delete | Soft void (`voidedAt`); confirm; **block** if posted/converted |
| Confirm | `ConfirmDialog` (danger tone for delete) |
| Feedback | `pushStatusToast` |

---

## H. Product add on document forms (quotes → orders → invoices)

**Canonical flow** for large catalogues (thousands of SKUs).  
**Do not** use a full product `<select>`.

### UX flow

1. Lines table shows **committed** rows only (SKU, description, qty, unit price, amount, remove).  
2. Below the table: one always-visible **Add product** search field (full width, min-height ~**44px**).  
3. User types **SKU**, **product name**, or **barcode**.  
4. **While typing (search active):**  
   - **Collapse** the upper document details section (customer, dates, terms) to free vertical space.  
   - Show a slim **“Quotation details — Expand”** bar.  
   - **Expand** must stick open while the user still has text in the search field (`pinDetailsExpanded`); only auto-collapse again after search is cleared. Do not re-collapse on every parent re-render of `onSearchActive`.  
   - Use a stable callback (`useCallback` + ref in `ProductAddSearch`) so expand does not “refresh/flicker”.  
5. **Suggestions:**  
   - **Multiple matches** → portaled list (not clipped by table/footer); ↑↓ + Enter or click.  
   - Each suggestion: **1:1 thumbnail** (36×36) + SKU + name + price. Fallback initial if no image.  
   - **Exact SKU/barcode** → **auto-add immediately**.  
   - **Exactly one fuzzy match** (query length ≥ 2) → **auto-add after ~400ms debounce**.  
6. On add: append line (qty default `1`, price from product); **clear search**; **keep focus** for next item.  
7. User can edit qty/price/description on the line; × removes the line.  
8. Save disabled (or validated) when there are **zero** lines.

### Suggestion list clipping

| Rule | Detail |
|------|--------|
| Render | Portal to `document.body` |
| Position | `position: fixed` under (or above) the search input |
| Max height | From available viewport space (min ~160, max ~320) |
| Flip | Open **up** when bottom space is tight |
| z-index | ≥ **220** |

### Implementation

| Piece | Path / class |
|-------|----------------|
| Component | `ProductAddSearch` — `components/module/product-add-search.tsx` |
| Collapse | `onSearchActive` → parent sets `detailsCollapsed`; bar `.doc-details-collapsed-bar` |
| Styles | `.product-add-search*`, `.product-add-thumb`, `.product-add-row`, `.doc-line-sku` |
| Form data | `loadSalesFormData` supplies `id`, `sku`, `name`, `sellPrice`, `unitCost`, `barcode`, **`imageUrl`** |
| Reference form | `quotation-form.tsx` |

### Free-text / uncatalogued lines

When the typed text has **no catalog match**:

| Step | Behavior |
|------|----------|
| Enter or “Add as free text” | Add line: **description** = typed text, **qty = 1**, **unit price blank** |
| SKU column | Show **Manual** (not a product id) |
| Price | User sets on the line before save |
| Qty | **− / value / +** stepper on every line (`QtyStepper`) |

**Accounting policy (BookOne standard — see also below):**  
On **quotations / sales orders**, free-text is document-only (no inventory, no GL).  
When converted to **invoice / POS / posted sale**, free-text posts as **service-like revenue** to default sales account **4000** (no COGS / no stock movement) unless the user later links a catalog product.  
Optional later: “Save as product” prompt with type physical/digital/service — **not required** on every free-text add.

### Reuse checklist (forms)

- [ ] No product `<select>` for catalogues  
- [ ] `ProductAddSearch` under lines  
- [ ] Suggestions **portaled** (not cut by footer)  
- [ ] Thumbnails 1:1 on suggestions  
- [ ] Collapse details while searching; expand on bar click  
- [ ] Auto-add single / exact match  
- [ ] Free-text add when no match (qty 1, blank price)  
- [ ] Qty steppers on lines  
- [ ] Focus retained after add  
- [ ] Hidden inputs / line indices still post correctly to server actions  

---

## H2. Accounting standard for manual (free-text) lines

### What international practice does

| Approach | Used by | Meaning |
|----------|---------|---------|
| **Non-inventory / service line** | Sage, QuickBooks, Xero | Description + amount only; revenue GL; **no stock** |
| **One-time item** | Many mid-market ERPs | Same as service line; optional “save to item list later” |
| **Force create item first** | Strict inventory shops | Blocks free text — slower for quotes |

Best practice for SME + mixed goods/services: **allow free-text on quotes/orders**, post as **non-stock revenue** on invoice, optionally promote to product master later.

### BookOne recommended model

```
Quote / SO line
  productId = null
  description = user text
  qty, unitPrice
  (no inventory type required yet)

Invoice / POS / GL post
  if productId set → use product type (physical/digital/service) + accounts
  if productId null → treat as **service / non-stock**
       Dr AR/Cash
       Cr Sales Revenue 4000
       no inventory 5100, no COGS 5000
```

### Do we ask product type on every manual line?

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **A. No type on quote** (default service on post) | Fast quotes | Wrong if they meant stocked goods | **Default for quotes** |
| **B. Optional type on line** (goods / service) | Better invoice accuracy | Extra click | Use when converting to invoice |
| **C. Force “Save as product”** | Clean masters | Slows sales staff | Offer as **optional** action, not required |

**Recommended BookOne flow:**

1. **Quote/SO:** free-text = manual line, no type dialog.  
2. **Invoice conversion / direct invoice:** if any free-text lines remain, optional banner: “Link to product or keep as non-stock service (4000).”  
3. **Save as product (optional):** opens product form pre-filled name; user picks physical/digital/service; future lines use SKU.  
4. **Never** auto-create catalog products from free-text without confirmation (avoids junk SKUs).

### Inventory / VAT notes

- Free-text physical goods still need a **product** for proper stock + COGS; free-text alone cannot track qty on hand correctly.  
- VAT: tax status follows company settings / line tax flags; free-text uses default standard rate unless marked exempt.  
- Sri Lanka tax invoice: description of goods/services on the line is valid even without an item code.

---

## I. Checklist — new **list** screen

1. [ ] `party-workspace` + toolbar (search + duration + primary CTA)  
2. [ ] Live search includes **name + number**  
3. [ ] `DateRangePicker` with outside-click close  
4. [ ] Sortable headers with icons  
5. [ ] Pagination 10/page  
6. [ ] View icon + Actions dropdown **on one line**  
7. [ ] Actions menu **portaled**, min-width **220px**, z-index ≥ 200  
8. [ ] Confirm for archive/delete  
9. [ ] No ModulePageHeader on list  
10. [ ] Create/edit uses `party-back-btn` + compact form shell  

---

## J. Checklist — new **document form** (quote / SO / invoice)

1. [ ] Compact shell (`doc-form-shell` / party form patterns)  
2. [ ] Header fields (party, dates, terms)  
3. [ ] Lines table + **ProductAddSearch** (not product dropdown)  
4. [ ] Live totals (subtotal / discount / total)  
5. [ ] Sticky footer Cancel / Save  

---

## K. Rollout status (2026-07-18)

| Module | List UX | Form / lines UX |
|--------|---------|-----------------|
| **Quotations** | ✅ `QuotationList` → `CommercialDocumentList` | ✅ `QuotationForm` + `DocumentLinesEditor` |
| **Sales Orders** | ✅ same list component | ✅ `SalesDocumentForm` |
| **Sales Invoices** | ✅ list + tax cols + print | ✅ `InvoiceDocumentForm` |
| **Sales Returns** | list (basic) | ✅ `SalesDocumentForm` |
| **POS** | history list | ✅ Full-screen `/pos` (not office form) |
| **Inventory products** | ✅ search + period + pagination + inline actions | Product form (existing) |
| Purchase orders/bills | Still older `CommercialDocList` shell | Can adopt `DocumentLinesEditor` next |

### Shared building blocks

| Block | File |
|-------|------|
| Document list | `components/sales/commercial-document-list.tsx` |
| Line editor + free text + **Save as product** | `components/module/document-lines-editor.tsx` |
| Product typeahead | `components/module/product-add-search.tsx` |
| Qty steppers | `components/module/qty-stepper.tsx` |
| Quick create product | `createQuickProduct` in `app/actions/inventory.ts` |

### Save as product (free-text → catalog)

On each **Manual** line:

1. Type dropdown: **Service (default)** / Physical / Digital  
2. **Save** → `createQuickProduct` → product master + link `productId` on the line  
3. Physical gets stock level 0; invoice/POS later uses type for COGS/stock  
4. SKU auto: `Q-{NAME}-{stamp}`  

POS full-screen remains separate — see `docs/POS_DESIGN.md`.

---

## L. Key file index

| Concern | File |
|---------|------|
| Quotation list | `apps/web/src/components/sales/quotation-list.tsx` |
| Quotation form | `apps/web/src/components/sales/quotation-form.tsx` |
| Product typeahead | `apps/web/src/components/module/product-add-search.tsx` |
| Snapshot view | `apps/web/src/components/sales/quotation-snapshot.tsx` |
| Doc archive/delete | `apps/web/src/app/actions/commercial-docs.ts` |
| Date range | `apps/web/src/components/layout/date-range-picker.tsx` |
| Shared CSS | `apps/web/src/app/globals.css` |
| This guide | `docs/LIST_TABLE_UX_GUIDE.md` |
