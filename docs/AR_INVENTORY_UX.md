# Sales receive payment + Inventory polish

**Status:** implemented 2026-07-19  
**Peers:** QuickBooks Online Receive payment / Aged receivables; stock levels + reorder alerts  

---

## Sales AR (parity with Pay vendors)

| Screen | Route | Role |
|--------|-------|------|
| Receive payments list | `/sales/payments` | Open AR invoices + balances |
| Receive payment form | `/sales/payments/new` | Multi-invoice apply, deposit account |
| Payment receipt | `/sales/payments/receipt` | Printable remittance / receipt |
| AR aging | `/sales/aging` | Current / 1–30 / 31–60 / 61–90 / 90+ |

### Accounting
- **Dr** Cash / Bank / Card (1000 / 1100 / 1200)  
- **Cr** Accounts Receivable **1300**  
- Updates invoice `paidAmount`, `balanceDue`, status `partial` | `paid`  

### UX (QBO-aligned)
1. Customer pays against open invoice(s).  
2. Select deposit account + date.  
3. Tick invoices, enter amount (default = balance).  
4. Post → receipt print.  

Invoice list Actions: **Receive**. Invoice detail: **Receive payment**.

---

## Inventory polish

| Area | Improvement |
|------|-------------|
| Stock levels | Search, sort, **low stock** toggle, stock value total, last-cost label, link to ledger |
| Low stock nav | Inventory → **Low Stock** (`/inventory/levels?low=1`) |
| Stock ledger | Product filter (`?productId=`), links to product edit, clearer qty (+/−), source type |
| Product list | Low-stock qty highlight, last-cost caption, Actions → ledger / levels |
| Product snapshot | Cost policy note (last purchase cost), link to stock ledger |

### Cost policy (unchanged, documented in UI)
Physical products use **last purchase cost** updated on purchase/GRN. Stock value = qty × last cost.

---

## File index

| Concern | Path |
|---------|------|
| Open AR list / aging | `app/actions/commercial-docs.ts` → `listOpenArInvoices`, `getArAgingSummary` |
| Receive payments action | `app/actions/documents.ts` → `receiveCustomerPayments` |
| Receive UI | `components/sales/receive-payments-form.tsx` |
| Stock levels UI | `components/inventory/stock-levels-list.tsx` |
| Stock ledger UI | `components/inventory/stock-ledger-list.tsx` |
