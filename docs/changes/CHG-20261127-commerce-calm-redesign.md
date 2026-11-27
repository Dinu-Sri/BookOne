# CHG-20261127-commerce-calm-redesign (v2.27.0)

Status: ready for the owner's staging review.

- Author and date: coding agent, 2026-11-27.
- Pushed directly to `master` (owner-approved).
- Source: the owner's request to redesign the Commerce connection screens to the calm-screen rule book (`docs/UI_DESIGN_RULEBOOK.md`), studying them on the company with a live store.
- No QA finding.

## Study (staging, Dinu Madhusanka's Company, store watercolorlkv2 with live polling and 2 web orders)

- **Header:**
  - a large "Back / Company" button;
  - five technical chips (Custom website, Sandbox, Preview, 1 mapped, 0 need review).
- **Overview:**
  - four equal number tiles;
  - uppercase labels ("ORDERS", "CONTINUE SETUP");
  - the four setup steps shown even when done;
  - jargon: "absolute quantities", "a publish with no mappings is not a successful publication", "HTTP 2xx is not cash settlement".
- **Orders:**
  - the order detail opens under the list, inside an inner scroll area, mostly off-screen;
  - the intro said COD orders hold stock on arrival while the open COD order showed "Stock: Not held".
- **Products:**
  - API paths in the help text (`/catalog/candidates`, "GET /products stays mapped-only");
  - "acknowledge stable IDs".
- **`?tab=products`:** opened Overview (the internal key is `mapping`).
- **Settings and Payments:**
  - full-width Save buttons;
  - uppercase column headers;
  - "IANA name", "payment.method", "codes 1201–1299".
- **Developer:** 50+ API call rows (the website polls every minute); keys shown as "Prefix … · revoked".
- **Activity:** raw `connection.price_list`.
- **Empty state:** "HTTP 2xx is not cash settlement".

## Changes

- **Header:**
  - the title, the one sentence (unchanged) and New connection;
  - the store picker with one plain status line, e.g. "Test store · Custom website · orders wait for your review · stock from online web · 1 product linked";
  - the FormShell back button is hidden (Commerce is a menu page).
- **Tabs:** the same seven test-pinned labels plus Prices; Orders shows a count of orders waiting.
- **Overview:**
  - one main next step (orders waiting, or "Finish setting up" with named stages and one action);
  - "Your store is connected and up to date" when nothing is pending;
  - an "At a glance" statement in place of the tiles;
  - a short "How it works" that depends on the posting mode.
- **Plain wording:**
  - next-step texts and the empty state;
  - Products help;
  - publish texts ("Sent to the website: SKU (received / waiting for the website)");
  - Settings and Payments help.

  The Developer tab keeps its technical terms for developers.
- **Orders:**
  - from 1200 px wide, the list and the open order sit side by side; the detail stays in view and the list hides Placed and Next step;
  - the stock sentence now points to Settings → Hold stock.
- **Fixes:**
  - `?tab=products` opens Products;
  - activity labels added for price list, settings, couriers, webhooks and publish actions;
  - keys show "Key …" with an Active / Being replaced / Revoked badge;
  - the API call log shows the latest 10, with "Show all N".
- **CSS** (`.commerce-v2`): sentence case, buttons keep their own width, tab count badge, side-by-side orders.

## Compatibility

Every action, form field name, server action and test hook is unchanged:
- tab roles and labels with Arrow, Home and End keys;
- tabpanel names;
- "Commerce Integrations" heading;
- "Connect your website so BookOne can share stock levels and receive orders";
- "Map products and test sync", "Last mapping change", "Open Products";
- "Link existing products" before "Publish from BookOne";
- "Developers &amp; Integrations";
- Preview mapping / Apply mapping / BookOne product / Store product ID / Mapping preview / Issue scoped key.

There is no data change.

## Evidence

- Typecheck passes.
- Auth tests: 246 (+5 skipped), including the commerce contract, wp0–wp7, QA-1126 and UI-02 lint tests. A "payhere" example was removed to keep the "names no specific gateway" rule.
- The staging review follows after deploy.

## Rollback

Revert the commit.
