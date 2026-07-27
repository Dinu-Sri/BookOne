# BookOne UX Flows — Personal & Sole Prop (Lite)

> **Status:** Approved UX direction (design reference — not fully built).  
> **Last updated:** 2026-07-27  
> **Companion:** [`ENTITY_TIERS_AND_TAX_ARCHITECTURE.md`](./ENTITY_TIERS_AND_TAX_ARCHITECTURE.md)  
> **Related:** [`SIMPLE_ENTRY_UX_REDESIGN.md`](./SIMPLE_ENTRY_UX_REDESIGN.md)

How **Personal** and **Sole proprietorship (lite)** should feel: **tile-based**, **Excel/cashbook familiar**, **minimum clicks**, optional **Sinhala gloss** on important words only.

---

## 1. Goals

| Goal | How we hit it |
|------|----------------|
| Damn simple | Cashbook home + large tiles; no ERP suite explosion |
| Excel brain | Transaction **sheet** (Date · Who · What · In · Out) |
| Fast recognition | Color + icons + big tiles (POS-style familiarity) |
| Min clicks | Daily expense in **3** actions |
| Bilingual help | English primary; Sinhala in brackets when user turns ON |
| Reuse core | Distill Simple Entry (`/`) components |

**Not in this doc:** sole prop full ERP chrome, pvt ltd changes, Phase 1 schema code (see tiers architecture).

---

## 2. Product surfaces (UX)

| Mode | User sees |
|------|-----------|
| **Personal** | Cashbook home + action tiles. No Sales/Purchase/Inventory/POS suites. |
| **Sole prop lite** | Same DNA + **Personal \| Business** domain tiles + lite Invoice/Bill |
| **Sole prop full** | Current ERP + personal domain switch (detail later) |
| **Pvt Ltd** | Current ERP only — **no personal chrome** |

---

## 3. UX principles (locked)

1. **Excel brain** — history looks like a sheet, not an ERP list.  
2. **Tile first** — modes, domain, payment method, categories = large tiles.  
3. **3-click happy path** — open → tile → fill → Save.  
4. **Defaults** — today, last cash/bank, sensible category.  
5. **No jargon** on primary path (no debit/credit, no account codes).  
6. **Sinhala gloss optional** — important words only.  
7. **Shared building blocks** with Simple Entry.

---

## 4. Language: English + Sinhala gloss

### 4.1 Rules

- Preference: **Show Sinhala hints** ON/OFF.  
- Default: **OFF**; optional first-run prompt: “Show Sinhala next to key words?”  
- When ON: `English (සිංහල)` — gloss muted/smaller, in brackets.  
- Do **not** fully translate every sentence in v1.  
- Amounts, dates, LKR stay as-is.

Examples:

- `Money In (ආදායම)`  
- `Money Out (වියදම)`  
- `Paid to (ගෙවූ තැන)`  
- `Save (සුරකින්න)`  
- `Business (ව්‍යාපාර)`

### 4.2 Implementation (later build)

- Small glossary map (~40 keys), not a full i18n framework.  
- Helper e.g. `t('money_in')` → English or English + gloss.  
- Stored preference on user or localStorage until profile exists.

### 4.3 Glossary seed (important words)

| Key | English | Sinhala |
|-----|---------|---------|
| money_in | Money In | ආදායම |
| money_out | Money Out | වියදම |
| move_money | Move Money | මුදල් මාරු |
| loan | Loan | ණය |
| loan_took | Took a loan | ණය ගත්තා |
| loan_paid | Paid loan | ණය ගෙව්වා |
| invoice | Invoice | ඉන්වොයිස් |
| bill | Bill | බිල්පත |
| personal | Personal | පුද්ගලික |
| business | Business | ව්‍යාපාර |
| cash | Cash | මුදල් |
| bank | Bank | බැංකුව |
| date | Date | දිනය |
| amount | Amount | මුදල |
| from_whom | From whom | කවුරුන්ගෙන් |
| paid_to | Paid to | ගෙවූ තැන |
| description | Description | විස්තරය |
| save | Save | සුරකින්න |
| this_month | This month | මේ මාසය |
| year_summary | Year summary | වසර සාරාංශය |
| import_excel | Import Excel | Excel එකතු කරන්න |
| home | Home | මුල් පිටුව |
| settings | Settings | සැකසුම් |

---

## 5. Registration flow (3 tiles)

**Screen title:** What are you using BookOne for?

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  👤 Personal     │  │  🏪 Business     │  │  🏢 Company      │
│  (පුද්ගලික)      │  │  Sole prop       │  │  Pvt Ltd         │
│                  │  │  (තනි හිමිකම)   │  │  (සමාගම)        │
│  My money & tax  │  │  Me + my shop    │  │  Full company    │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**Flow**

1. Tap one tile.  
2. Confirm display name (prefilled from email).  
3. Land on home.

**Sole prop only — optional second step (2 tiles):**

- `Start simple` → lite modules  
- `I need stock / POS` → full modules (existing ERP path)

**Click budget:** 2–3 to first home screen.

Maps to architecture: `entity_kind` = `personal` | `sole_prop` | `company`.

---

## 6. Personal home (cashbook)

### 6.1 Wireframe

```
┌────────────────────────────────────────────────────────────┐
│ BookOne · Personal              [SI hints]  [This month ▾] │
├────────────────────────────────────────────────────────────┤
│  SUMMARY STRIP                                              │
│  In: LKR …    Out: LKR …    Net: LKR …                     │
├────────────────────────────────────────────────────────────┤
│  ACTION TILES                                               │
│  [Money In] [Money Out] [Move Money] [Loan] [Import Excel]  │
├────────────────────────────────────────────────────────────┤
│  SHEET (Excel feel)                                         │
│  Date │ Who │ What │ In │ Out │                             │
│  …rows…                                                     │
│  Empty: “Tap Money Out to record your first expense”        │
└────────────────────────────────────────────────────────────┘
│  Nav:  Home  ·  Summary  ·  Settings                        │
└────────────────────────────────────────────────────────────┘
```

### 6.2 Primary flows

**Money Out (default daily path) — 3 steps**

1. Tap **Money Out**.  
2. Enter Paid to, Amount, Description (date/cash defaulted).  
3. Tap **Save** → back to sheet, new row highlighted; focus ready for next.

**Money In** — same structure.  
**Move Money** — From / To as account tiles.  
**Loan** — sub-tiles: Took a loan | Paid loan.  
**Import Excel** — file → map columns (tiles for Date/Who/Amount) → preview sheet → Import.

### 6.3 Hidden by design

- Sidebar suites (Sales / Purchase / Inventory / POS)  
- Brands / locations  
- Journal, trial balance (optional later under Advanced)

### 6.4 Navigation

Only **Home · Summary · Settings** (3 items). Mobile: bottom bar; desktop: top or slim side.

---

## 7. Entry form (shared with Simple Entry)

Reuse Simple Entry layout logic ([SIMPLE_ENTRY_UX_REDESIGN](./SIMPLE_ENTRY_UX_REDESIGN.md)):

| Zone | Content |
|------|---------|
| Top | Mode tiles (one selected) |
| Main | Who, Amount, Description — large fields |
| Side / sticky bottom | Cash/Bank/Card **tiles**, Date, Receipt photo, **Save** |

- Payment method = tiles (not long `<select>`).  
- Category = plain language chip + “Change” → category **tile grid**.  
- Tab order: party → amount → description → account → save.

---

## 8. Sole prop lite

### 8.1 Domain switcher (always visible)

```
[ Personal (පුද්ගලික) ]   [ Business (ව්‍යාපාර) ]
```

- One tap switches `book_domain` for list + new entries.  
- Summary strip follows active domain.  
- Year summary can show both columns.

### 8.2 Tiles by domain

| Domain | Tiles |
|--------|--------|
| Personal | Money In/Out, Move, Loan, Import Excel |
| Business | Money In/Out, Invoice, Bill, Move, Import Excel |

No stock/POS tiles on lite.

### 8.3 Lite Invoice / Bill

Simplified forms (not full commercial doc suite):

- Who (customer/vendor)  
- Amount + description (or 1–3 simple lines)  
- Date · Save  
- Maps later to commercial docs / Simple Entry invoice_bill with `book_domain=business`

### 8.4 Year tax view (sole)

```
┌─────────────────────┬─────────────────────┐
│ Personal year       │ Business year       │
│ Income …            │ Sales …             │
│ Expenses …          │ Costs …             │
│ Net …               │ Net …               │
└─────────────────────┴─────────────────────┘
         Combined overview (info v1)
```

---

## 9. Visual system

| Pattern | Role |
|---------|------|
| Large tiles | Modes, domain, payment, category, registration |
| Sheet table | History (sticky header, search, month filter) |
| Color | In = green tint; Out = amber/red; Move = neutral |
| Icons | Lucide, same family as Simple Entry |
| Empty state | One sentence + one CTA tile |
| Success | Toast + row on sheet; stay for next entry |

**Responsive:** mobile 2-column tiles; desktop wide sheet + tile row.

---

## 10. Click budgets (acceptance)

| Task | Max primary actions |
|------|---------------------|
| Register personal | 3 |
| Post daily expense | 3 |
| Switch Personal ↔ Business | 1 |
| See month summary | 0–1 (on home strip) |
| Lite customer invoice | 4 |

Any flow over budget must be redesigned before build.

---

## 11. Screen inventory (v1)

1. Registration — 3-bucket tiles (+ sole lite/full choice)  
2. Personal home — sheet + tiles  
3. Entry form — in / out / move / loan  
4. Summary — month / year  
5. Settings — Sinhala toggle, account nicknames  
6. Sole domain switcher (on home)  
7. Lite invoice + lite bill  
8. Import Excel wizard  

**Out of v1 UX:** full POS, inventory, multi-brand, journal browser (Advanced only).

---

## 12. Mapping to architecture & Phase 1

| UX need | Architecture need |
|---------|-------------------|
| Domain switcher | `book_domain` on postings |
| Registration tiles | `entity_kind` on tenant |
| Lite vs full sole | modules JSON |
| Personal hide ERP | modules all false + personal shell |
| Sheet of entries | list transactions (filtered by domain) |

Building UX without Phase 1 data model is limited; **UX contracts should land before or with Phase 1**.

---

## 13. Defaults (open choices)

| Choice | Default |
|--------|---------|
| Sinhala default | OFF; one-time prompt |
| Default entry mode | Money Out |
| Invoice on personal | Hidden |
| Loan depth | Took / Paid only |

---

## 14. Success criteria

- [ ] Expense without training or “accounting” words  
- [ ] Sole prop cannot confuse personal vs business (domain tiles always on)  
- [ ] Sinhala gloss helpful, not noisy  
- [ ] This doc is enough for implementers + future E2E scenarios  
- [ ] Personal path never requires learning full ERP  

---

## 15. Document history

| Date | Change |
|------|--------|
| 2026-07-27 | Initial UX flows for personal & sole prop lite |

**Next:** implement Phase 1 schema with these UX contracts, or high-fidelity mockups of home + entry only.
