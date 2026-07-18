# BookOne list table & universal search — design guide

**Purpose:** Reuse the same list UX across Parties, Inventory, Sales documents, Purchase, etc.  
**Status:** Canonical patterns (updated 2026-07-18).  
**Reference implementation:** `apps/web/src/components/sales/quotation-list.tsx`, `party-list.tsx`, `product-list.tsx`, `date-range-picker.tsx`.

---

## 1. Toolbar layout (universal)

Order left → right:

1. **Universal search** (flex grow) — `party-search-form` + `input.party-search`
2. **Duration / period picker** — `DateRangePicker compact` in `party-toolbar-period`
3. **Primary action** — e.g. New quotation / New customer

```tsx
<div className="party-toolbar">
  <div className="party-search-form">
    <input className="input party-search" placeholder="Search by …" />
  </div>
  <div className="party-toolbar-period">
    <DateRangePicker compact />
  </div>
  <Link href="…/new"><Button variant="primary">New …</Button></Link>
</div>
```

Shell: `workspace party-workspace` — **no page H1 / eyebrow / lead** on list screens.

---

## 2. Universal search

| Rule | Detail |
|------|--------|
| Live filter | Client-side debounce ~250ms optional; filter as user types |
| Fields | Always include **primary code/number** and **party/name**; plus status, dates, totals as useful |
| Placeholder | Explicit: e.g. `Search by customer name or number…` |
| Empty state | Distinguish “no records yet” vs “no matches for filter” |
| URL (optional) | Sync `q` query param for shareable state (`product-list` pattern) |

**Quotations:** search blob includes `documentNumber`, `partyName`, status, dates, totals.

---

## 3. Duration (date range) filter

| Rule | Detail |
|------|--------|
| Component | `DateRangePicker` (`components/layout/date-range-picker.tsx`) |
| Query params | `from`, `to` as `YYYY-MM-DD`; empty = all time |
| Document lists | Filter on **issue date** (`issueDate >= from && issueDate <= to`) |
| Outside click | **Must close** picker on mousedown outside root + Escape |
| Presets | All time, Last 7 days, Last 30 days, This month |

Do not leave the period menu open until Cancel is pressed.

---

## 4. Table structure

### Columns

- Prefer **compact** data columns (number, party, date, status, amount).
- Avoid stacking many action buttons as separate columns.

### Row actions (required pattern)

| Control | Placement |
|---------|-----------|
| **View** | Eye icon (`Button variant="ghost" className="icon"`) |
| **Actions** | Single dropdown: Edit, domain actions (convert…), Archive/Restore, Delete |

**Same line, never wrap:**

```css
.party-row-actions-inline { flex-wrap: nowrap; white-space: nowrap; }
.td-actions { white-space: nowrap; width: 1%; }
```

### Dropdown clipping (first/last rows)

Do **not** rely on `position: absolute` inside `.table-wrap` (overflow clips menus).

| Rule | Detail |
|------|--------|
| Render | Portal menu to `document.body` |
| Position | `position: fixed` from trigger `getBoundingClientRect()` |
| Flip | Prefer **open down**; only open up when space below &lt; panel height **and** space above is enough |
| Transform | When open up: `transform: translateY(-100%)` with `top` at trigger top (avoids off-screen first rows) |
| z-index | ≥ **200** so menu paints above sticky chrome / table heads |
| Close | Outside click, scroll, resize |

Classes: `doc-action-panel doc-action-panel-fixed`.

---

## 4b. Product add on forms (quotes / orders / invoices)

**Do not** use a full product `<select>` when catalogues can be large.

| Rule | Detail |
|------|--------|
| Control | Single **search field** under the lines table |
| Query | SKU, product name, barcode |
| Multiple matches | Show suggestion list; keyboard ↑↓ + Enter; click to select |
| Exactly one match | **Auto-add** after short debounce (or immediately on exact SKU/barcode) |
| After add | Clear search; focus stays on field for next item |
| Lines | Committed rows show SKU, editable qty/price/description, remove |
| Component | `components/module/product-add-search.tsx` (`ProductAddSearch`) |

This is the **universal product-entry UX** for all commercial document forms.

---

## 5. Sorting

| Rule | Detail |
|------|--------|
| Headers | Clickable sort control on each sortable column |
| Icon | Neutral `ArrowUpDown`; active `ArrowUp` / `ArrowDown` |
| Toggle | Same column → flip asc/desc; new column → sensible default (dates/totals often desc) |
| Class | `th-sort-btn` + `th-sort-icon` / `.active` |

---

## 6. Pagination

| Rule | Detail |
|------|--------|
| Page size | **10** rows (`PAGE_SIZE = 10`) |
| UI | `party-pagination` + Previous / Next |
| Copy | `{n} total · page X of Y` |
| Reset page | When search, date range, or sort changes |

---

## 7. Destructive / soft actions

| Action | Behavior |
|--------|----------|
| View | Snapshot modal (no navigation) |
| Edit | Dedicated edit route when fields need forms |
| Archive | Soft status `archived`; restorable |
| Delete | Soft void (`voidedAt`); confirm dialog; block if posted/converted |
| Confirm | `ConfirmDialog` with danger tone for delete |

Toasts via `pushStatusToast` after success/failure.

---

## 8. Checklist for a new list screen

1. [ ] `party-workspace` + toolbar (search + duration + primary CTA)
2. [ ] Live search includes name/number (and domain keys)
3. [ ] `DateRangePicker` with outside-click close
4. [ ] Sortable column headers with icons
5. [ ] Pagination 10/page
6. [ ] View icon + Actions dropdown **inline**
7. [ ] Actions menu portaled (no table clip)
8. [ ] Confirm for archive/delete
9. [ ] No ModulePageHeader / long lead on list
10. [ ] Same patterns for back button on create/edit (`party-back-btn`)

---

## 9. Key files

| Piece | Path |
|-------|------|
| Quotation list (reference) | `apps/web/src/components/sales/quotation-list.tsx` |
| Parties list | `apps/web/src/components/parties/party-list.tsx` |
| Products list | `apps/web/src/components/inventory/product-list.tsx` |
| Date range | `apps/web/src/components/layout/date-range-picker.tsx` |
| Shared styles | `apps/web/src/app/globals.css` (party-*, doc-action-*, th-sort-*) |
| Confirm dialog | `apps/web/src/components/ui/confirm-dialog.tsx` |

---

## 10. Reuse note

When adding **Sales Orders**, **Invoices**, **Purchase Orders** lists, clone the quotation list patterns rather than inventing new toolbars or multi-button action columns. Keep POS full-screen UX separate (see `docs/POS_DESIGN.md`).
