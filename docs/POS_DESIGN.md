# BookOne POS — locked product design

Status: **decisions locked** (2026-07-17)  
Scope: multi-device, multi-register checkout with returns in v1.

---

## Locked decisions

| # | Topic | Decision |
|---|--------|----------|
| 1 | Devices | **All primary**: touch tablets, POS terminals, desktop; **barcode gun** (keyboard-wedge) first-class |
| 2 | Printing | **Both** thermal and browser print; **per register** in Sales Settings |
| 3 | Invoice kind | **Commercial default**; operator may choose tax only when company is VAT-registered |
| 4 | Counters | **Multi-register from day one** |
| 5 | Returns | **POS returns in v1** (not deferred) |

---

## Design grammar (UX)

Adopt global **cart-right / catalog-left + pay sheet** (Square/Clover school), tuned for Sri Lanka:

- Walk-in customer default  
- Cash chips + change calculation  
- Optional TAX INVOICE only when VAT registered  
- Full-screen sell mode (no suite sidebar chrome)  
- Same engine on tablet / terminal / desktop; layout fluid (CSS), not separate apps  

### Happy path (sale)

1. Open register shift (or resume open shift)  
2. Scan / search / tap product  
3. Adjust qty / line void / discount if needed  
4. **PAY** → Cash / Card / Bank / Mixed  
5. Complete → post `pos_sale` → print (thermal and/or browser per register)  
6. Focus returns to scan box  

### Happy path (return)

1. **Return** mode toggle on POS  
2. Find original ticket (today / scan receipt # / search) **or** free-return lines  
3. Select lines/qty to return  
4. Refund tender (cash / reverse card memo)  
5. Post `sales_return` (or `pos_return` alias) → restock physical → print return slip  

---

## Screen model

### A. Full-screen POS (`/pos`)

```
Top: Register · Shift · Cashier · [Sale | Return] · Menu
Left: Scan/search + categories + product tiles
Right: Cart / return cart + totals + [Hold] [PAY/REFUND]
```

### B. Pay / refund sheet (modal, not new route)

- Tenders, cash chips, change, optional tax invoice toggle  
- Complete posts document  

### C. Office surfaces (with BookOne shell)

- `/sales/pos` — ticket history, filters by register  
- `/company/sales` — VAT + **POS registers** (print mode, name, code, location)  

---

## Data model

### `pos_registers` (multi-counter)

| Field | Purpose |
|-------|---------|
| code | REG-01, COUNTER-A |
| name | Front counter |
| location_id | optional branch |
| print_mode | `browser` \| `thermal` \| `both` |
| thermal_device_hint | optional printer name / USB path note |
| receipt_footer | per-register footer |
| is_active | soft disable |
| default_payment_account_code | cash 1000 default |

### `pos_shifts`

| Field | Purpose |
|-------|---------|
| register_id | which counter |
| opened_by / closed_by | users |
| opening_float / closing_cash_count | cash control |
| status | open \| closed |
| opened_at / closed_at | |

### Document link

- `business_documents.register_id` (nullable)  
- `business_documents.shift_id` (nullable)  
- Types: `pos_sale`, `sales_return` (POS-origin flagged via notes or `sale_channel` / source)  
- Invoice kind on POS: default `commercial`; `tax_invoice` only if settings allow  

### Accounting (unchanged engine)

- Sale: Dr Cash/Card, Cr Revenue, optional Cr 2200 Output VAT, COGS if physical  
- Return: reverse via existing sales return posting + restock  

---

## Device matrix

| Input | Support |
|-------|---------|
| Touch tiles | Large hit targets, no hover-only actions |
| Mouse/keyboard | Hotkeys: focus search, F4 pay, Esc clear confirm |
| Barcode gun | Keyboard wedge into always-focused search; Enter = add |

Print:

| Mode | Behavior |
|------|----------|
| browser | Open receipt HTML → `window.print()` |
| thermal | ESC/POS job (agent/bridge or browser silent print later); v1 may queue + “print when online” |
| both | Thermal first, browser as fallback/copy |

---

## Security / roles (v1 minimum)

| Action | Cashier | Supervisor |
|--------|---------|------------|
| Sale | yes | yes |
| Return | yes (own shift) | yes |
| Void open cart | yes | yes |
| Void completed ticket | no | yes (PIN later) |
| Open drawer no sale | no | yes (later) |
| Close shift | yes | yes |

---

## Implementation phases

### Phase 0 — foundations (schema + settings) ✅

- `pos_registers`, `pos_shifts`  
- Document register/shift FKs  
- Company → Sales Settings: manage registers + print mode  
- Default register seeded  

### Phase 1 — sell screen ✅

- Full-screen `/pos`  
- Register picker if multi active  
- Open shift if none  
- Cart + search/scan + tiles  
- Pay sheet (cash/card/mixed)  
- Post `pos_sale`, commercial default  
- Browser receipt; thermal stub/queue  

### Phase 2 — returns ✅

- Return mode on `/pos` (Sale | Return toggle)  
- Lookup ticket / recent sales → reverse lines with remaining qty  
- Free return (no original) with reason  
- Post `sales_return` + restock + refund tender (cash/card/bank)  


### Phase 3 — shift close + Z ✅

- Close shift from POS top bar  
- Expected cash = float + cash sales − cash refunds  
- Counted cash + variance  
- Printable Z-report `/pos/z-report/[shiftId]`  
- Office list `/sales/pos/shifts`  

### Phase 4 — hardware polish

- ESC/POS bridge, drawer kick, customer display  

---

## Non-goals for first ship

- Offline-first multi-day queue (design-friendly later)  
- Full restaurant modifiers / tables  
- Multi-currency at POS  
- Self-checkout kiosk mode  

---

## Success metrics

- New cashier: first successful sale under 15 minutes training  
- Scan-to-complete cash sale under 10 seconds typical  
- Two registers can sell concurrently without ticket number clash  
- Return of same-day sale without office login  
