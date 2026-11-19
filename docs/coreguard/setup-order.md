# Pilot setup order (synthetic rehearsal)

Real opening values and policy selections stay business-owner decisions. This order is the supported product path for a **synthetic** company using existing screens.

Cutoff for the custom-bank fixture period: **2026-01-01 … 2026-01-31**. Opening date **2026-01-15**. Transfer date **2026-01-16**. Source reference: `docs/coreguard/fixtures/custom-bank.v1.json`.

## Ready on current product

1. **Company** — entity kind `company`, modules sales/purchase on, inventory/POS/rental/HR off unless the pilot selects them.
2. **Jobs** — Owner (write) and Viewer (read). Catalog v2 templates.
3. **Chart of Accounts** — seeded company pack. Add custom banks with `/accounts/new` (template Bank, range 1101–1199). CSV import is metadata only (`/accounts/import`); it does not post money.
4. **Opening balances** — `/accounts/opening` preview-then-post. One fingerprint per posted set. Creating an account starts at zero. Offset to equity 3000.
5. **Internal bank transfer** — Simple Entry Move Money. Custom 11xx banks are spendable tenders.
6. **Unpaid domestic service/expense bill (AgentBridge)** — supported MemoryStore/facts path only. Live Codex/Claude stay blocked. Posting-stop stays on for the live company.

## Validation failures and how to correct them

| Input | Typical failure | Correction |
| --- | --- | --- |
| CoA CSV duplicate code | dry-run skips or issues `Duplicate code` | Keep the existing row; change the new code |
| Formula-like CSV name (`=cmd`) | export prefixes `'` | Re-export; do not paste raw `=` cells |
| Unbalanced opening | preview refuses Post | Add the equity (or other) offset so debits equal credits |
| Group heading in opening | `group headings cannot receive opening balances` | Post to a posting account |
| Repeat opening fingerprint | `already posted` | Do not post the same lines twice; reverse/void through product controls if a correction is needed |
| Viewer writing accounts or Simple Entry | server `You do not have permission to do that.` | Use Owner |

## Not ready for this increment (product gaps or later journeys)

- Open invoices/bills opening AR/AP subledger import as a first-class setup wizard.
- Opening stock with trial-balance recon in the same rehearsal.
- Counterparties CSV as a dedicated setup step (customers/suppliers exist as ordinary screens).
- Encrypted backup restore into a fresh empty company (**recovery LAST** — do not run it in this candidate).

Trial balance must not count the same opening twice across journal and subledger paths. Opening journals and later operational documents stay separate events.

Rehearsal evidence: `packages/accounting/test/coreguard-setup-order.test.ts` against `docs/coreguard/fixtures/setup-order.v1.csv` plus the custom-bank opening oracle.
