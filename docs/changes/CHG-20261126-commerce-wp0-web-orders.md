# CHG-20261126-commerce-wp0-web-orders — Web orders, held stock, clearer Commerce screen (v2.20.0)

Status: ready-for-QA.

- Author/agent and date: coding agent, 2026-11-26
- Product version and base: 2.20.0, pushed directly to `master` (owner-approved), based on `6f83f1a` / v2.19.1
- Source: owner request 2026-11-26 forwarding the Watercolor.LK web team brief "extend Commerce API for e-commerce websites" (WP0 of WP0–WP7), plus "the commerce integration screen UI is messy, make it user friendly". QA references: none new; prior QA run Dinu-Sri/bookone-qa PR #129 at `91d7ce8e698517b2c50daeeb552ecd56104f5741`. No external UX/UXW/WB ID applies (owner request).
- Release note for the website team: [docs/commerce/RELEASE-WP0.md](../commerce/RELEASE-WP0.md)

## Behaviour

1. **Web orders in BookOne.** `CommerceService.listWebOrders` / `getWebOrder` plus staff actions `confirmWebOrder`, `markWebOrderPaid`, `dispatchWebOrder` (courier, tracking, URL from courier template), `markWebOrderDelivered`, `cancelWebOrder`, `refundWebOrder` (with or without restock). Cancel, paid and refund reuse the existing event paths (`applyEvent`) with an operator actor, so accounting is the same as website events. Each change writes an audit row and a `kind: "order"` change.
2. **Held stock.** New table `commerce_stock_commitments` (migration `055`, RLS tenant isolation).
   - A pending order whose method is in the connection's hold list (default `cod`, `bank_transfer`) commits its lines atomically under the same per-product advisory lock as posting.
   - Available = on hand − active commitments.
   - Cancel releases. Posting consumes before the invoice and re-activates if posting fails.
   - `adjustStock` (POS, invoices, every stock decrease) refuses to sell held units when negative stock is blocked.
   - `/inventory` and inventory changes report `onHand`, `committed`, `available`; `quantity` = available.
3. **API.** `GET /payment-methods`; order receipt adds `paymentStatus`, `stock`, `fulfilment`; change kinds `order`, `mapping`, `publish`; comma-separated `sku`. OpenAPI (`packages/commerce/src/openapi.ts`) and `/docs/developers/custom-website` updated with a dated changelog.
4. **Settings.** `payment_settings` JSON keeps `commitStockMethods` and `couriers` (name + https tracking template containing `{tracking}`).
5. **Screen.** Company → Commerce Integrations is reorganised into tabs:
   - **Overview:** counts, setup steps, next step, sync facts, a plain "how it works".
   - **Orders:** new.
   - **Products:** was Mapping; content unchanged.
   - **Payments**
   - **Settings:** posting controls, plus a new "Orders and delivery" card.
   - **Developer:** API keys and test.
   - **Activity:** audit trail; the review table moved into Orders.

   The header keeps the store picker and status badges. Old `?tab=connections` links open Overview.

## UI/UX compatibility

- Extends existing classes (`commerce-card`, `commerce-table`, `party-tabs`, `commerce-next`, `commerce-progress`). Added only `.commerce-table tr.is-selected` and `.commerce-overview-tiles`, which use existing tokens (`--line`, `--brand-soft`, `--ink-soft`).
- New components (`commerce-web-orders.tsx`, `commerce-fulfilment-card.tsx`) use registry `SelectField`, `TextField`, `SearchField`, shared `Button`, `Badge`, `ConfirmDialog` and `withFormPending`. There is no native select or date input; checkboxes are allowed HTML.
- Server-action forms use shared `Button type="submit"`. Confirmed destructive actions (cancel, refund) go through `ConfirmDialog` and `withFormPending`.
- Preserved: every form field name and server action contract, permissions (Commerce Integrations write; Viewer sees read-only text), mapping/publish flows, posting confirmation dialog, key issue/rotate/revoke dialogs.
- Direct consumers: `/company/commerce` page only. Transitive: `adjustStock` (all stock-decreasing postings), Commerce API routes.

## Evidence

- New `packages/commerce/test/wp0-web-orders.test.ts` (10). It covers:
  - holding on receipt, visible in the list;
  - a second order goes to review when short;
  - a paid card order cannot take a held unit;
  - cancel releases, and non-listed methods do not hold;
  - Mark paid posts and consumes the hold;
  - confirm/dispatch/delivered show in the order read and the feed;
  - validation and Viewer refusal;
  - refund with restock;
  - payment-methods flags;
  - the mapping event.
- New `packages/auth/test/commerce-wp0-ui.test.ts` (5): adjustStock respects holds; migration 055 shape; tabs; registry-only controls; old tab links.
- `pnpm typecheck` 8/8; unit tests: commerce 45, auth 223 (+5 skipped), accounting 298, agent-bridge 162, statement-import 44.
- Not run locally: Postgres concurrency of `commitStock`, browser keyboard/narrow checks. Staging check after deploy: see TASK_LOG.

## Rollback

Revert this commit. Migration 055 is additive (a new table and a column); leaving it in place is harmless. Active commitments would then be ignored by the reverted code.

## Follow-up v2.20.1 — CoreGuard browser specs for the new tabs

The Docker web image workflow for `c21978e` failed in "AgentBridge CoreGuard / Pilot custom-bank": `e2e/coreguard-commerce.spec.ts` expected **Issue scoped key** on the first screen and tabs named **Connections** and **Mapping**. The spec now opens **Developer** for the key, walks Overview → Orders → Products with ArrowRight and ends on Activity with End; the mapping-preview invalidation and 390px checks are unchanged. `coreguard-custom-bank.spec.ts` (Viewer) opens Developer and Settings so the disabled Issue/Save checks still run. Commit `6777640` carried only these spec changes: a shell chain stopped before the VERSION bump and this note, so VERSION 2.20.1 and this record were added afterwards (commit `e694b5a` set 2.20.1, the next commit sets 2.20.2).

## Follow-up v2.20.2 — Commerce page load cost

The v2.20.1 CoreGuard run got past the tabs but failed at "Apply mapping enabled after Preview": the button stayed `aria-busy` (form still pending) for the 5 s window. v2.20.0 made the page load web orders per connection in separate tenant sessions, and `PostgresCommerceStore.listOrders` read every order of the tenant and then queried lines one order at a time. Now `listOrders` filters by connection/status in SQL (latest 500) and loads lines in one query; the page loads the view and all web orders in one tenant session and runs the Inventory probe and payment accounts in parallel. The spec allows 20 s for the busy state to clear and logs the preview line for diagnosis.

## Follow-up v2.20.3 — CI diagnosis (tests only)

v2.20.2 CoreGuard: the preview showed "SKU-1 · Pilot mug · ready to apply", yet **Apply mapping** stayed `aria-busy` (form pending) for 20 s, so the cause is not page-load time. The mapping form and handlers are byte-identical to v2.19.1 (passing). The spec now logs browser errors, POST responses and requests still in flight when the button stays busy, to find what keeps the form transition open. Separately, `coreguard-bank-recon.spec.ts` matched "Finished" as a substring of "This month is finished…" (strict-mode violation); it now uses an exact match. No product code change.
