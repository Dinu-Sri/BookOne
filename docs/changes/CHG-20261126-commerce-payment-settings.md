# CHG-20261126-commerce-payment-settings — Payments settings for store connections (v2.19.0)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-26
- Product version and base: 2.19.0, pushed directly to `master` (owner-approved), based on `648f5a8` / v2.18.1
- QA references: closes the open part of QA-1126-21 ("paid web orders left open in AR, settlement not_configured") from Dinu-Sri/bookone-qa PR #129 at `91d7ce8e698517b2c50daeeb552ecd56104f5741`. Owner request 2026-11-26: build the per-connection settings; must not assume one gateway (Sri Lanka has many).

## Problem

A paid web order posted Dr Accounts Receivable / Cr Sales (+VAT) and stayed open, because the store never says which BookOne account received the money. It settled only when the store sent a 4-digit account code as `payment.method`, which store platforms do not do.

## Change

- **Connection → Payments** (Company → Commerce Integrations, connection detail):
  - **Default account for paid orders**: any active, postable cash, bank or clearing account (10xx–12xx).
  - **Payment methods**: one row per method name the store sends, filled in automatically as orders arrive, or added by hand. Each row maps to an account, "use the default", or "leave unpaid in receivables".
  - **Create a clearing account**: makes "<name> clearing" in 1201–1299 (reconcilable). It becomes the default if none is set. Use one per gateway or channel.
  - A preview line says where paid orders will settle.
- Gateway-neutral: no provider is named or assumed. Method names match case- and space-insensitively.
- Posting: a paid order settles into the method account, then the default. The old 4-digit method code still wins (existing integrations). Pending/unpaid orders never settle. The order stores `settlement_account_code`, and the receipt shows `settled` / `not_configured`.
- A paid order posted with no account chosen writes an Activity row: "Paid order left unpaid (payment account not set)".
- Storage: `commerce_connections.payment_settings` (jsonb) and `commerce_orders.settlement_account_code`, via migration `054_commerce_payment_settings.sql` and the Drizzle schema.
- Permissions: saving needs Commerce Integrations write. Creating a clearing account also needs Accounts write. Account codes are checked against the tenant chart on the server.
- Changes apply to new orders only. Posted orders are not rewritten.

## Shared consumers and preserved behaviour

- `CommerceService.tryPostInvoice` and the order receipt. `PostingPort` is unchanged (it already took `paymentAccountCode`). The settlement path is the existing cash-invoice path in `createCommercialDocumentWithUser`, with tender eligibility unchanged.
- UI uses registry `SelectField` / `TextField` and the existing `commerce-card` styles; no native select.

## Evidence

- New `packages/commerce/test/payments.test.ts` (6): precedence, case-insensitive names, leave-unpaid, pending, legacy code, seen methods, settlement and Activity flag end to end, validation and write access.
- Source locks in `packages/auth/test/qa-1126-commerce-pos.test.ts` (2).
- `pnpm typecheck` 8/8; unit tests 757 passed.

## Follow-up v2.19.1 (staging check)

Staging (ZZ-TEST company, connection "ZZ-TEST Web Shop"): creating "ZZ-TEST Gateway" made 1201 · ZZ-TEST Gateway clearing, set as default; a `cod` rule set to "Leave unpaid" saved and reloaded. The "Create clearing account" button stretched to the full grid cell; it now sits at its natural size. Not run on staging: a paid API order end to end (settlement path covered by unit tests).
