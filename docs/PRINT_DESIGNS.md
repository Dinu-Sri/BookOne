# Print designs (v2.26.0)

Versioned print layouts for 11 print items, made by a person in BookOne or by a connected AI assistant through AgentBridge. A person approves a version before it prints. User guide: `/docs/sales/print-designs`.

## Pieces

| Piece | Where |
|---|---|
| Format, element catalogue, compulsory sets, validation, defaults, sample data, assistant guide, layout helpers | `packages/print-design` (pure TypeScript, tested) |
| Tables `print_designs` (one row per version) and `print_design_assets` (logo, signature, stamp) | `packages/db/src/schema/print-designs.ts`, `packages/db/migrations/059_print_designs.sql` (RLS, partial unique "one in use per item") |
| Store, approve, use, delete, assets, document resolution, assistant port | `apps/web/src/lib/print-designs.ts` |
| Document → print data adapters | `apps/web/src/lib/print-data.ts` |
| Renderer | `apps/web/src/components/print/design-print-sheet.tsx` |
| Screens | `/company/print-designs` (items, designs, images), `/company/print-designs/[id]` (review, approve and use, delete), `/company/print-designs/[id]/edit` (editor) |
| Assistant tools | `packages/agent-bridge` (`design_read`, `design_write`), described in `/docs/developers/agentbridge` |

## Print items

`quotation`, `proforma_invoice`, `invoice`, `tax_invoice`, `receipt`, `credit_note`, `sales_order`, `packing_slip`, `pos_bill`, `purchase_order` and `payment_voucher`. Each item has a label, a plain description, its allowed papers (A4, A5, Letter, 80 mm and 58 mm rolls) and a default title.

New print routes:
- the proforma invoice prints from a quotation (`/sales/quotations/[id]/proforma`) or a sales order (`/sales/orders/[id]/proforma`);
- the dispatch note prints from `/sales/orders/[id]/print`.

## Format `bookone.print-design.v1`

A design has the following top-level settings:
- `paper`, `orientation` and `margins`;
- `columns`: width ratios per band, e.g. `{"header":"3:2"}`;
- `theme`: colours as hex, a font from an allowed list, text size 7–14 pt, title scale 1.2–3, table style, an optional header band colour, corners and title case;
- `blocks`.

Each block holds one element placed in a band and a column. The bands are `header`, `top`, `body` (one column, holds the items table), `bottom` and `footer`, and columns are 1–3. A block also has an alignment and, depending on its element, a label, text, a field list and options.

Elements:
- logo, company name, company details;
- document title, number/date/details;
- customer or supplier, delivery address;
- items table, totals, amount in words, payment and change;
- notes, terms, bank details;
- signature lines, stamp, QR code;
- text, line, space, footer.

**Safety:**
- unknown keys, elements, options and values are refused;
- text is plain text, with control characters removed and a length limit;
- images come only from the company's uploaded assets;
- there is no HTML, CSS or URL input.

**Compulsory minimum set per item** (`ELEMENTS[*].requiredFor`). Every item needs:
- company name;
- document title;
- number and date;
- the items table with its required columns;
- the total, for items that show money.

VAT tax invoices also need:
- the title containing "tax invoice";
- the supplier address and TIN;
- the purchaser name, address and TIN;
- the place of supply and the payment mode;
- items with quantity and value;
- subtotal, VAT and total;
- the amount in words.

A proforma must say "proforma", a credit note must say "credit", and a packing slip needs the delivery address. Errors block saving. Warnings (for example, a logo block placed but no logo uploaded) do not.

## Versions, approval, history

- Every save inserts a new row (`version` + 1 in the same `family_id`). Rows are never edited after saving, except for status fields.
- Statuses:
  - `draft`;
  - `awaiting_approval` (the assistant asked);
  - `approved`;
  - `retired`.
- `in_use='1'` marks the version that prints for its item now; at most one per company and item.
- **Only a person** can approve and use, go back to the BookOne standard, or delete a version (not the one in use). Deleting is soft (`deleted_at`). Assistants have no delete, approve or use tool.
- On a document's first print with a design, the version id is remembered in `business_documents.print_style_snapshot.printDesigns[kind]`. Reprints use that version even after it is replaced or deleted. A document that printed earlier with a custom document style keeps that style.
- With no design in use, every item prints exactly as before (standard print and Document styles).

## Assistants

- **Capabilities:**
  - `design_read`: list items, the guide, designs, one design, assets;
  - `design_write`: create, save a version, request approval.
- **Job keys:** `agent_bridge.design_read` and `agent_bridge.design_write` (module `company`, so every company type can use them).
- **Turning it on:** per connection under Company → AgentBridge → Change abilities → Print designs.
- **Effective scopes:** the token and stored scopes intersected with live job grants.
- **Master switch:** these tools stop when "Allow AI assistants for this company" is off. The same check now applies to website product-mapping tools.
- **Argument format:** designs travel as a `designJson` string and are checked by the same `validateDesign` as the editor.

## Backup

`print_designs` and `print_design_assets` are in the tenant archive. Asset image keys are archive storage pointers.
