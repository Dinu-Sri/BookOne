# BookOne - Comprehensive E2E Scenario Catalog

> **Purpose:** Exhaustive day-to-day and edge-case scenarios for future Playwright automation.
> **Scope:** Tenant ERP + super-admin Control Room + public surfaces.
> **Status:** Scenario design only - **not yet automated**.
> **Source:** Routes, server actions, settings, and validations in the BookOne monorepo.

## How to use

1. Each scenario has a stable ID `S-NNNN`.
2. **Priority:** `P0` critical money/stock | `P1` core daily ops | `P2` important | `P3` rare.
3. **Tags** filter suites (e.g. `@sales`, `@pos`, `@edge`, `@security`).
4. Default preconditions: logged-in tenant, CoA present, LKR; brand/location rules apply when masters exist.
5. After postings: assert Journal balance, stock levels, and report impact where relevant.

## Global automation conventions

| Convention | Rule |
|------------|------|
| Auth | Dedicated E2E user; prefer **staging** company |
| Isolation | Unique codes/SKUs/names with timestamp seed |
| Cleanup | Archive, or staging health-check / master wipe |
| Assertions | UI + list + journal/stock/report |
| Failures | Clear error; **no silent wrong balances** |

## 1. Authentication & session


### S-0001 — Open login page unauthenticated

- **Priority:** P0
- **Tags:** `@auth`, `@public`
- **Steps:**
  1. Open `/login`
  2. See Sign In form
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0002 — Login valid credentials

- **Priority:** P0
- **Tags:** `@auth`
- **Steps:**
  1. Valid email/password
  2. Submit
  3. Leave `/login`; app shell visible
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0003 — Login wrong password

- **Priority:** P0
- **Tags:** `@auth`, `@edge`
- **Steps:**
  1. Wrong password
  2. Error; stay on login
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0004 — Login unknown email

- **Priority:** P1
- **Tags:** `@auth`, `@edge`
- **Steps:**
  1. Unknown email
  2. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0005 — Login empty fields

- **Priority:** P2
- **Tags:** `@auth`, `@edge`
- **Steps:**
  1. Submit empty
  2. Required validation
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0006 — Login short password

- **Priority:** P2
- **Tags:** `@auth`, `@edge`
- **Steps:**
  1. Password < 8
  2. Blocked or error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0007 — Remember me on

- **Priority:** P2
- **Tags:** `@auth`
- **Steps:**
  1. Login with Remember me
  2. Session persists per cookie rules
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0008 — Remember me off

- **Priority:** P3
- **Tags:** `@auth`
- **Steps:**
  1. Login without Remember me
  2. Session-scoped
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0009 — Deep link redirect after login

- **Priority:** P0
- **Tags:** `@auth`
- **Steps:**
  1. Open `/sales/invoices` logged out
  2. Login with `from`
  3. Return to invoices
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0010 — Authed user hits /login

- **Priority:** P1
- **Tags:** `@auth`
- **Steps:**
  1. While logged in open `/login`
  2. Redirect home
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0011 — Sign up new account

- **Priority:** P1
- **Tags:** `@auth`
- **Steps:**
  1. Sign Up fields
  2. Submit
  3. Success/verify message
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0012 — Sign up password mismatch

- **Priority:** P1
- **Tags:** `@auth`, `@edge`
- **Steps:**
  1. Confirm ≠ password
  2. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0013 — Forgot password without email

- **Priority:** P2
- **Tags:** `@auth`, `@edge`
- **Steps:**
  1. Forgot with empty email
  2. Prompt for email
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0014 — Forgot password with email

- **Priority:** P2
- **Tags:** `@auth`
- **Steps:**
  1. Request reset
  2. Confirmation message
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0015 — Reset password page loads

- **Priority:** P2
- **Tags:** `@auth`
- **Steps:**
  1. Open `/reset-password`
  2. Form usable
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0016 — Sign out

- **Priority:** P0
- **Tags:** `@auth`
- **Steps:**
  1. Sign out
  2. Protected routes → login
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0017 — Legacy password migration login

- **Priority:** P3
- **Tags:** `@auth`, `@edge`
- **Steps:**
  1. Legacy user path migrates then logs in
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0018 — Google button when configured

- **Priority:** P3
- **Tags:** `@auth`
- **Steps:**
  1. See Google control if enabled
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0019 — No session blocks /dashboard

- **Priority:** P0
- **Tags:** `@auth`, `@security`
- **Steps:**
  1. Clear cookies
  2. Open dashboard
  3. Login redirect
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0020 — Static assets not redirected to login

- **Priority:** P1
- **Tags:** `@auth`
- **Steps:**
  1. Load `/_next/static` or logo
  2. Not HTML login page
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 2. Public surfaces (docs & E2E console)


### S-0021 — Docs home without login

- **Priority:** P0
- **Tags:** `@docs`, `@public`
- **Steps:**
  1. Open `/docs` logged out
  2. Not redirected to login
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0022 — Docs getting-started pages

- **Priority:** P1
- **Tags:** `@docs`
- **Steps:**
  1. Open each getting-started page
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0023 — Docs sales section

- **Priority:** P2
- **Tags:** `@docs`
- **Steps:**
  1. Open sales docs pages
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0024 — Docs purchase section

- **Priority:** P2
- **Tags:** `@docs`
- **Steps:**
  1. Open purchase docs
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0025 — Docs inventory section

- **Priority:** P2
- **Tags:** `@docs`
- **Steps:**
  1. Open inventory docs
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0026 — Docs accounting section

- **Priority:** P2
- **Tags:** `@docs`
- **Steps:**
  1. Open accounting docs
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0027 — Docs POS section

- **Priority:** P2
- **Tags:** `@docs`
- **Steps:**
  1. Open POS docs
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0028 — Docs search API public

- **Priority:** P1
- **Tags:** `@docs`, `@public`
- **Steps:**
  1. `GET /api/search?q=invoice` no session
  2. JSON
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0029 — Docs search empty query

- **Priority:** P3
- **Tags:** `@docs`
- **Steps:**
  1. Empty q
  2. Handled
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0030 — Docs exclude admin content

- **Priority:** P1
- **Tags:** `@docs`, `@security`
- **Steps:**
  1. No health-check/control-room/master wipe docs
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0031 — E2E console at /e2e public

- **Priority:** P1
- **Tags:** `@e2e`, `@public`
- **Steps:**
  1. Open `/e2e` logged out
  2. UI loads
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0032 — E2E start needs credentials

- **Priority:** P1
- **Tags:** `@e2e`, `@edge`
- **Steps:**
  1. Start without email/password
  2. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0033 — E2E report download after run

- **Priority:** P1
- **Tags:** `@e2e`
- **Steps:**
  1. Complete a run
  2. Download report/log/bundle
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 3. Shell, navigation, period, module gating


### S-0034 — Sidebar suite expands

- **Priority:** P0
- **Tags:** `@shell`
- **Steps:**
  1. Click Sales
  2. Children visible
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0035 — Sidebar suite collapses on second click

- **Priority:** P0
- **Tags:** `@shell`
- **Steps:**
  1. Click open suite again
  2. Children hide
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0036 — Visit all accounting nav links

- **Priority:** P0
- **Tags:** `@shell`, `@accounting`
- **Steps:**
  1. Simple Entry through Docs
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0037 — Visit customers and vendors

- **Priority:** P0
- **Tags:** `@shell`, `@parties`
- **Steps:**
  1. Both lists
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0038 — Period picker sets URL

- **Priority:** P0
- **Tags:** `@shell`, `@period`
- **Steps:**
  1. Dashboard period
  2. `period=YYYY-MM`
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0039 — Period all-time

- **Priority:** P1
- **Tags:** `@period`
- **Steps:**
  1. Select all
  2. URL reflects all
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0040 — Period filters journal

- **Priority:** P0
- **Tags:** `@period`
- **Steps:**
  1. Post month A
  2. Journal month B empty of that entry
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0041 — Sales module off hides suite

- **Priority:** P0
- **Tags:** `@modules`
- **Steps:**
  1. modules.sales false
  2. No Sales nav
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0042 — Purchase module off hides suite

- **Priority:** P0
- **Tags:** `@modules`
- **Steps:**
  1. modules.purchase false
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0043 — Inventory module off hides suite

- **Priority:** P0
- **Tags:** `@modules`
- **Steps:**
  1. modules.inventory false
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0044 — POS module off hides POS items

- **Priority:** P0
- **Tags:** `@modules`, `@pos`
- **Steps:**
  1. modules.pos false
  2. No POS terminal in nav
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0045 — Control Room hidden for normal user

- **Priority:** P0
- **Tags:** `@security`
- **Steps:**
  1. Non super_admin
  2. No Control Room
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0046 — Control Room for super_admin

- **Priority:** P0
- **Tags:** `@platform`
- **Steps:**
  1. super_admin sees Control Room
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0047 — Collapse sidebar

- **Priority:** P2
- **Tags:** `@shell`
- **Steps:**
  1. Toggle collapse
  2. Expand again
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0048 — Topbar shows company name

- **Priority:** P1
- **Tags:** `@shell`
- **Steps:**
  1. Correct tenant name
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0049 — Accounting screens without PageHeading

- **Priority:** P1
- **Tags:** `@ux`
- **Steps:**
  1. Dashboard/journal/transactions/reports/accounts/recon
  2. No large page headers
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 4. Company masters


### S-0050 — Open company details

- **Priority:** P0
- **Tags:** `@company`
- **Steps:**
  1. Company → Details
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0051 — Save legal name

- **Priority:** P0
- **Tags:** `@company`
- **Steps:**
  1. Change legal name
  2. Persists
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0052 — Save trading name and address

- **Priority:** P1
- **Tags:** `@company`
- **Steps:**
  1. Update address
  2. Save
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0053 — Save phone email

- **Priority:** P2
- **Tags:** `@company`
- **Steps:**
  1. Update contact
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0054 — Default currency LKR

- **Priority:** P1
- **Tags:** `@company`
- **Steps:**
  1. See LKR
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0055 — Default timezone Colombo

- **Priority:** P2
- **Tags:** `@company`
- **Steps:**
  1. See Asia/Colombo
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0056 — Save TIN

- **Priority:** P0
- **Tags:** `@company`, `@tax`
- **Steps:**
  1. Tax → TIN
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0057 — Save VAT number

- **Priority:** P1
- **Tags:** `@company`, `@tax`
- **Steps:**
  1. VAT field
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0058 — Save SVAT

- **Priority:** P2
- **Tags:** `@company`, `@tax`
- **Steps:**
  1. SVAT field
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0059 — Invoice/bill prefixes

- **Priority:** P1
- **Tags:** `@company`, `@tax`
- **Steps:**
  1. Change prefixes
  2. New docs use them
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0060 — Create financial year

- **Priority:** P1
- **Tags:** `@company`
- **Steps:**
  1. Add FY
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0061 — Create brand

- **Priority:** P0
- **Tags:** `@company`, `@brand`
- **Steps:**
  1. Brands → create
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0062 — Create second brand

- **Priority:** P0
- **Tags:** `@company`, `@brand`
- **Steps:**
  1. Another brand
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0063 — Edit brand

- **Priority:** P1
- **Tags:** `@company`, `@brand`
- **Steps:**
  1. Rename brand
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0064 — Create location no brand

- **Priority:** P0
- **Tags:** `@company`, `@location`
- **Steps:**
  1. Locations → create
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0065 — Create location with brand

- **Priority:** P0
- **Tags:** `@company`, `@location`, `@brand`
- **Steps:**
  1. Link brand
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0066 — Create second location

- **Priority:** P0
- **Tags:** `@company`, `@location`
- **Steps:**
  1. Second warehouse
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0067 — Edit location type/address

- **Priority:** P2
- **Tags:** `@company`, `@location`
- **Steps:**
  1. Update
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0068 — Add domain pending

- **Priority:** P2
- **Tags:** `@company`
- **Steps:**
  1. Domains → add
  2. Token shown
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0069 — Verify domain

- **Priority:** P2
- **Tags:** `@company`
- **Steps:**
  1. Mark verified
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0070 — Create second company

- **Priority:** P1
- **Tags:** `@company`, `@multitenant`
- **Steps:**
  1. Create company
  2. In list
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0071 — Switch company

- **Priority:** P0
- **Tags:** `@company`, `@multitenant`
- **Steps:**
  1. Switch
  2. Data isolated
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0072 — Switch back company

- **Priority:** P0
- **Tags:** `@company`, `@multitenant`
- **Steps:**
  1. Original data
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0073 — Commercial form requires brand when brands exist

- **Priority:** P0
- **Tags:** `@brand`
- **Steps:**
  1. ≥1 brand
  2. Brand required on invoice
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0074 — Commercial form requires location when locations exist

- **Priority:** P0
- **Tags:** `@location`
- **Steps:**
  1. ≥1 location
  2. Location required
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0075 — Single brand auto-selected

- **Priority:** P1
- **Tags:** `@brand`
- **Steps:**
  1. One brand defaults
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0076 — Single location auto-selected

- **Priority:** P1
- **Tags:** `@location`
- **Steps:**
  1. One location defaults
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0077 — Location brand inference on form

- **Priority:** P2
- **Tags:** `@brand`, `@location`
- **Steps:**
  1. Pick location with brand
  2. Brand updates
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0078 — Simple Entry brand required

- **Priority:** P0
- **Tags:** `@accounting`, `@brand`
- **Steps:**
  1. Brands exist
  2. Must pick brand
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0079 — Simple Entry location required

- **Priority:** P0
- **Tags:** `@accounting`, `@location`
- **Steps:**
  1. Locations exist
  2. Must pick location
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 5. Settings behavior matrix


### S-0080 — Enable VAT registered

- **Priority:** P0
- **Tags:** `@settings`, `@tax`
- **Steps:**
  1. Sales settings VAT on
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0081 — Disable VAT registered

- **Priority:** P1
- **Tags:** `@settings`, `@tax`
- **Steps:**
  1. VAT off
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0082 — VAT rate 18%

- **Priority:** P0
- **Tags:** `@settings`, `@tax`
- **Steps:**
  1. Local tax invoice 18%
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0083 — Export VAT 0%

- **Priority:** P1
- **Tags:** `@settings`, `@tax`
- **Steps:**
  1. Export tax invoice 0%
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0084 — Tax invoice dept code

- **Priority:** P2
- **Tags:** `@settings`, `@tax`
- **Steps:**
  1. Dept 02 in number
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0085 — Credit limit enforce on

- **Priority:** P0
- **Tags:** `@settings`, `@credit`
- **Steps:**
  1. Enable enforce
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0086 — Credit limit enforce off

- **Priority:** P1
- **Tags:** `@settings`, `@credit`
- **Steps:**
  1. Disable
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0087 — Bill approval on

- **Priority:** P0
- **Tags:** `@settings`, `@purchase`
- **Steps:**
  1. Bills pending_approval
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0088 — Bill approval off

- **Priority:** P0
- **Tags:** `@settings`, `@purchase`
- **Steps:**
  1. Bills post immediately
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0089 — Supplier invoice required

- **Priority:** P0
- **Tags:** `@settings`, `@purchase`
- **Steps:**
  1. Bill without # fails
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0090 — Block duplicate supplier invoices

- **Priority:** P0
- **Tags:** `@settings`, `@purchase`
- **Steps:**
  1. Second same vendor+# fails
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0091 — Allow duplicate supplier invoices

- **Priority:** P2
- **Tags:** `@settings`, `@edge`
- **Steps:**
  1. Setting off allows
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0092 — Require GRN before bill on

- **Priority:** P0
- **Tags:** `@settings`, `@grn`
- **Steps:**
  1. Bill from PO without GRN fails
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0093 — Require GRN before bill off

- **Priority:** P1
- **Tags:** `@settings`
- **Steps:**
  1. Bill without GRN ok
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0094 — GRNI on receipt on

- **Priority:** P0
- **Tags:** `@settings`, `@grn`
- **Steps:**
  1. GRN posts 5100/2150
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0095 — GRNI on receipt off

- **Priority:** P1
- **Tags:** `@settings`, `@grn`
- **Steps:**
  1. No GRNI path
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0096 — Costing last

- **Priority:** P0
- **Tags:** `@settings`, `@inventory`
- **Steps:**
  1. Last unit cost on product
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0097 — Costing average

- **Priority:** P0
- **Tags:** `@settings`, `@inventory`
- **Steps:**
  1. Weighted average unit cost
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0098 — Negative stock allow

- **Priority:** P0
- **Tags:** `@settings`, `@inventory`
- **Steps:**
  1. Oversell ok
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0099 — Negative stock block

- **Priority:** P0
- **Tags:** `@settings`, `@inventory`
- **Steps:**
  1. Oversell fails
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0100 — Create POS register

- **Priority:** P0
- **Tags:** `@settings`, `@pos`
- **Steps:**
  1. Add register
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0101 — POS register with location

- **Priority:** P0
- **Tags:** `@settings`, `@pos`, `@location`
- **Steps:**
  1. Assign location
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0102 — POS register print thermal

- **Priority:** P2
- **Tags:** `@settings`, `@pos`
- **Steps:**
  1. Print mode thermal
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0103 — Archive last active register blocked

- **Priority:** P1
- **Tags:** `@settings`, `@pos`, `@edge`
- **Steps:**
  1. Only one active
  2. Archive fails
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0104 — Archive register when multiple

- **Priority:** P1
- **Tags:** `@settings`, `@pos`
- **Steps:**
  1. Archive non-last ok
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0105 — Default payment terms

- **Priority:** P2
- **Tags:** `@settings`
- **Steps:**
  1. Net 30 default on forms
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0106 — Default expense account

- **Priority:** P2
- **Tags:** `@settings`
- **Steps:**
  1. Cash purchase default expense
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 6. Products & stock


### S-0107 — Create physical product minimal

- **Priority:** P0
- **Tags:** `@inventory`, `@product`
- **Steps:**
  1. New product
  2. Type physical
  3. SKU prices
  4. Listed
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0108 — Create digital product minimal

- **Priority:** P0
- **Tags:** `@inventory`, `@product`
- **Steps:**
  1. New product
  2. Type digital
  3. SKU prices
  4. Listed
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0109 — Create service product minimal

- **Priority:** P0
- **Tags:** `@inventory`, `@product`
- **Steps:**
  1. New product
  2. Type service
  3. SKU prices
  4. Listed
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0110 — Physical with opening stock

- **Priority:** P0
- **Tags:** `@inventory`, `@stock`
- **Steps:**
  1. Opening qty > 0
  2. Level increases
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0111 — Product with barcode

- **Priority:** P1
- **Tags:** `@inventory`
- **Steps:**
  1. Barcode set
  2. Searchable
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0112 — Product with category

- **Priority:** P2
- **Tags:** `@inventory`
- **Steps:**
  1. Category set
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0113 — Product with image

- **Priority:** P1
- **Tags:** `@inventory`
- **Steps:**
  1. Upload image
  2. Shows in UI
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0114 — Product cost < sell

- **Priority:** P0
- **Tags:** `@inventory`
- **Steps:**
  1. Normal margin
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0115 — Product cost = sell

- **Priority:** P2
- **Tags:** `@inventory`, `@edge`
- **Steps:**
  1. Allowed
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0116 — Product cost > sell

- **Priority:** P2
- **Tags:** `@inventory`, `@edge`
- **Steps:**
  1. Loss leader allowed
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0117 — Duplicate SKU rejected

- **Priority:** P0
- **Tags:** `@inventory`, `@edge`
- **Steps:**
  1. Second same SKU errors
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0118 — Edit product name/prices

- **Priority:** P0
- **Tags:** `@inventory`
- **Steps:**
  1. Update
  2. Lists refresh
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0119 — Type locked when applicable

- **Priority:** P2
- **Tags:** `@inventory`, `@edge`
- **Steps:**
  1. typeLocked disables type change
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0120 — Archive product

- **Priority:** P0
- **Tags:** `@inventory`
- **Steps:**
  1. Archived hidden from active
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0121 — Restore product

- **Priority:** P0
- **Tags:** `@inventory`
- **Steps:**
  1. Active again
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0122 — Delete unused product

- **Priority:** P1
- **Tags:** `@inventory`
- **Steps:**
  1. No history
  2. Deleted
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0123 — Delete product with history blocked

- **Priority:** P0
- **Tags:** `@inventory`, `@edge`
- **Steps:**
  1. Blockers shown
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0124 — Search products by name

- **Priority:** P1
- **Tags:** `@inventory`
- **Steps:**
  1. Partial name filter
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0125 — Search products by SKU

- **Priority:** P1
- **Tags:** `@inventory`
- **Steps:**
  1. SKU filter
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0126 — Stock levels page

- **Priority:** P0
- **Tags:** `@inventory`, `@stock`
- **Steps:**
  1. Shows on-hand
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0127 — Low stock filter

- **Priority:** P1
- **Tags:** `@inventory`
- **Steps:**
  1. `?low=1`
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0128 — Stock ledger after movements

- **Priority:** P0
- **Tags:** `@inventory`, `@stock`
- **Steps:**
  1. Shows purchase/sale lines
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0129 — Create 20 products scale

- **Priority:** P2
- **Tags:** `@inventory`, `@scale`
- **Steps:**
  1. 20 unique SKUs
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0130 — Digital sale no stock move

- **Priority:** P0
- **Tags:** `@inventory`, `@sales`
- **Steps:**
  1. Invoice digital
  2. No qty change
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0131 — Service sale no stock move

- **Priority:** P0
- **Tags:** `@inventory`, `@sales`
- **Steps:**
  1. Invoice service
  2. No qty change
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0132 — Physical sale decreases stock

- **Priority:** P0
- **Tags:** `@inventory`, `@sales`
- **Steps:**
  1. Buy then sell
  2. qty = buy-sell
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0133 — Physical purchase increases stock

- **Priority:** P0
- **Tags:** `@inventory`, `@purchase`
- **Steps:**
  1. Purchase
  2. qty up
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0134 — Transfer A→B

- **Priority:** P0
- **Tags:** `@inventory`, `@transfer`
- **Steps:**
  1. Stock moves
  2. No GL
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0135 — Transfer same location rejected

- **Priority:** P0
- **Tags:** `@inventory`, `@transfer`, `@edge`
- **Steps:**
  1. from=to error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0136 — Transfer non-physical rejected

- **Priority:** P1
- **Tags:** `@inventory`, `@transfer`, `@edge`
- **Steps:**
  1. Digital transfer error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0137 — Transfer over qty with block fails

- **Priority:** P0
- **Tags:** `@inventory`, `@transfer`, `@edge`
- **Steps:**
  1. Block policy
  2. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0138 — Transfer partial qty

- **Priority:** P1
- **Tags:** `@inventory`, `@transfer`
- **Steps:**
  1. Half moves
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0139 — Adjustment increase

- **Priority:** P0
- **Tags:** `@inventory`, `@adjustment`
- **Steps:**
  1. +qty + GL
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0140 — Adjustment decrease

- **Priority:** P0
- **Tags:** `@inventory`, `@adjustment`
- **Steps:**
  1. -qty + GL
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0141 — Adjustment to zero

- **Priority:** P1
- **Tags:** `@inventory`, `@adjustment`
- **Steps:**
  1. Level 0
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0142 — Adjustment negative with block fails

- **Priority:** P0
- **Tags:** `@inventory`, `@adjustment`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0143 — Transfers list shows doc

- **Priority:** P1
- **Tags:** `@inventory`
- **Steps:**
  1. After transfer listed
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0144 — Adjustments list shows doc

- **Priority:** P1
- **Tags:** `@inventory`
- **Steps:**
  1. After adjustment listed
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0145 — Quick-create product from free-text line

- **Priority:** P1
- **Tags:** `@inventory`, `@sales`
- **Steps:**
  1. Sales line free text save-as product
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 7. Parties


### S-0146 — Create customer minimal

- **Priority:** P0
- **Tags:** `@parties`
- **Steps:**
  1. Name essentials
  2. Listed
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0147 — Create customer with code

- **Priority:** P1
- **Tags:** `@parties`
- **Steps:**
  1. Code set
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0148 — Create customer individual

- **Priority:** P1
- **Tags:** `@parties`
- **Steps:**
  1. Type individual
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0149 — Create customer company

- **Priority:** P1
- **Tags:** `@parties`
- **Steps:**
  1. Type company
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0150 — Create customer credit limit

- **Priority:** P0
- **Tags:** `@parties`, `@credit`
- **Steps:**
  1. Limit 100000
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0151 — Create customer tax IDs

- **Priority:** P1
- **Tags:** `@parties`, `@tax`
- **Steps:**
  1. TIN/VAT
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0152 — Create customer addresses

- **Priority:** P2
- **Tags:** `@parties`
- **Steps:**
  1. Billing/shipping
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0153 — Create customer bank details

- **Priority:** P2
- **Tags:** `@parties`
- **Steps:**
  1. Bank fields
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0154 — Create vendor minimal

- **Priority:** P0
- **Tags:** `@parties`
- **Steps:**
  1. Vendor listed
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0155 — Create vendor payment terms

- **Priority:** P1
- **Tags:** `@parties`
- **Steps:**
  1. Terms days
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0156 — Create dual-role party

- **Priority:** P1
- **Tags:** `@parties`
- **Steps:**
  1. Customer+vendor
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0157 — Edit customer

- **Priority:** P0
- **Tags:** `@parties`
- **Steps:**
  1. Rename
  2. Selectors update
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0158 — Archive customer

- **Priority:** P0
- **Tags:** `@parties`
- **Steps:**
  1. Not in active options
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0159 — Restore customer

- **Priority:** P0
- **Tags:** `@parties`
- **Steps:**
  1. Active
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0160 — Delete unused customer

- **Priority:** P1
- **Tags:** `@parties`
- **Steps:**
  1. Deleted
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0161 — Delete customer with invoices blocked

- **Priority:** P0
- **Tags:** `@parties`, `@edge`
- **Steps:**
  1. Blockers
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0162 — Blocked customer cannot receive new sales

- **Priority:** P0
- **Tags:** `@parties`, `@edge`
- **Steps:**
  1. Status blocked
  2. Post fails
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0163 — Inactive customer cannot post

- **Priority:** P0
- **Tags:** `@parties`, `@edge`
- **Steps:**
  1. Inactive fails
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0164 — Search customers

- **Priority:** P1
- **Tags:** `@parties`
- **Steps:**
  1. Name/code/phone
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0165 — Search vendors

- **Priority:** P1
- **Tags:** `@parties`
- **Steps:**
  1. Filters
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0166 — Duplicate TIN handling

- **Priority:** P1
- **Tags:** `@parties`, `@edge`
- **Steps:**
  1. Per product rules
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0167 — Ensure party from free-text name

- **Priority:** P0
- **Tags:** `@parties`, `@sales`
- **Steps:**
  1. New name on invoice creates party
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0168 — Customer open AR display

- **Priority:** P1
- **Tags:** `@parties`
- **Steps:**
  1. After unpaid invoice
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0169 — Vendor open AP display

- **Priority:** P1
- **Tags:** `@parties`
- **Steps:**
  1. After unpaid bill
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0170 — Create 50 customers scale

- **Priority:** P3
- **Tags:** `@parties`, `@scale`
- **Steps:**
  1. List usable
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0171 — customer create happy path

- **Priority:** P1
- **Tags:** `@parties`, `@matrix`
- **Steps:**
  1. Perform create
  2. UI consistent
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0172 — customer edit happy path

- **Priority:** P1
- **Tags:** `@parties`, `@matrix`
- **Steps:**
  1. Perform edit
  2. UI consistent
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0173 — customer archive happy path

- **Priority:** P1
- **Tags:** `@parties`, `@matrix`
- **Steps:**
  1. Perform archive
  2. UI consistent
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0174 — customer restore happy path

- **Priority:** P1
- **Tags:** `@parties`, `@matrix`
- **Steps:**
  1. Perform restore
  2. UI consistent
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0175 — vendor create happy path

- **Priority:** P1
- **Tags:** `@parties`, `@matrix`
- **Steps:**
  1. Perform create
  2. UI consistent
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0176 — vendor edit happy path

- **Priority:** P1
- **Tags:** `@parties`, `@matrix`
- **Steps:**
  1. Perform edit
  2. UI consistent
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0177 — vendor archive happy path

- **Priority:** P1
- **Tags:** `@parties`, `@matrix`
- **Steps:**
  1. Perform archive
  2. UI consistent
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0178 — vendor restore happy path

- **Priority:** P1
- **Tags:** `@parties`, `@matrix`
- **Steps:**
  1. Perform restore
  2. UI consistent
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 8. Sales lifecycle


### S-0179 — Create quotation

- **Priority:** P0
- **Tags:** `@sales`, `@quotation`
- **Steps:**
  1. Customer+lines
  2. Draft listed
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0180 — Quotation brand+location

- **Priority:** P0
- **Tags:** `@sales`, `@brand`, `@location`
- **Steps:**
  1. Dimensions saved
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0181 — Quotation multi-line mixed types

- **Priority:** P0
- **Tags:** `@sales`
- **Steps:**
  1. Physical+service totals
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0182 — Quotation fixed discount

- **Priority:** P1
- **Tags:** `@sales`, `@discount`
- **Steps:**
  1. Total reduced
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0183 — Quotation percent discount

- **Priority:** P1
- **Tags:** `@sales`, `@discount`
- **Steps:**
  1. Total reduced
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0184 — Quotation discount master

- **Priority:** P1
- **Tags:** `@sales`, `@discount`
- **Steps:**
  1. Select discount entity
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0185 — Edit quotation header

- **Priority:** P1
- **Tags:** `@sales`
- **Steps:**
  1. Notes/date when not posted
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0186 — Convert QT→SO

- **Priority:** P0
- **Tags:** `@sales`
- **Steps:**
  1. SO created
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0187 — Archive quotation

- **Priority:** P2
- **Tags:** `@sales`
- **Steps:**
  1. Archived
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0188 — Delete unconverted quotation

- **Priority:** P1
- **Tags:** `@sales`
- **Steps:**
  1. Deleted
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0189 — Delete converted quotation blocked

- **Priority:** P0
- **Tags:** `@sales`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0190 — Create sales order direct

- **Priority:** P0
- **Tags:** `@sales`, `@order`
- **Steps:**
  1. Confirmed SO
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0191 — Convert SO→invoice

- **Priority:** P0
- **Tags:** `@sales`
- **Steps:**
  1. Open AR invoice
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0192 — Full SO to invoice

- **Priority:** P1
- **Tags:** `@sales`
- **Steps:**
  1. SO fully invoiced
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0193 — Multi-SO same customer one invoice

- **Priority:** P0
- **Tags:** `@sales`
- **Steps:**
  1. Combine
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0194 — Multi-SO different customers fails

- **Priority:** P0
- **Tags:** `@sales`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0195 — SO no GL

- **Priority:** P0
- **Tags:** `@sales`, `@accounting`
- **Steps:**
  1. No journal
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0196 — SO no stock move

- **Priority:** P0
- **Tags:** `@sales`, `@stock`
- **Steps:**
  1. Stock unchanged
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0197 — Commercial credit invoice

- **Priority:** P0
- **Tags:** `@sales`, `@invoice`
- **Steps:**
  1. Open AR + GL
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0198 — Commercial cash invoice

- **Priority:** P0
- **Tags:** `@sales`, `@invoice`
- **Steps:**
  1. Paid + cash GL
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0199 — Tax invoice local VAT

- **Priority:** P0
- **Tags:** `@sales`, `@tax`
- **Steps:**
  1. Output VAT
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0200 — Tax invoice export 0 VAT

- **Priority:** P1
- **Tags:** `@sales`, `@tax`
- **Steps:**
  1. Export channel
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0201 — Invoice physical reduces stock+COGS

- **Priority:** P0
- **Tags:** `@sales`, `@stock`
- **Steps:**
  1. Stock down
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0202 — Invoice services only no stock

- **Priority:** P0
- **Tags:** `@sales`
- **Steps:**
  1. No stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0203 — Invoice print

- **Priority:** P1
- **Tags:** `@sales`
- **Steps:**
  1. Print route
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0204 — Invoice detail

- **Priority:** P0
- **Tags:** `@sales`
- **Steps:**
  1. Lines/totals/status
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0205 — Credit limit blocks over-limit

- **Priority:** P0
- **Tags:** `@sales`, `@credit`, `@edge`
- **Steps:**
  1. Enforce on
  2. Blocked
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0206 — Credit limit allows under

- **Priority:** P0
- **Tags:** `@sales`, `@credit`
- **Steps:**
  1. Succeeds
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0207 — Credit limit off allows over

- **Priority:** P1
- **Tags:** `@sales`, `@credit`
- **Steps:**
  1. Succeeds
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0208 — Invoice missing brand multi-brand fails

- **Priority:** P0
- **Tags:** `@sales`, `@brand`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0209 — Invoice missing location multi-loc fails

- **Priority:** P0
- **Tags:** `@sales`, `@location`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0210 — Receive full payment

- **Priority:** P0
- **Tags:** `@sales`, `@payment`
- **Steps:**
  1. Invoice paid
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0211 — Receive partial payment

- **Priority:** P0
- **Tags:** `@sales`, `@payment`
- **Steps:**
  1. Partial status
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0212 — Receive remaining payment

- **Priority:** P0
- **Tags:** `@sales`, `@payment`
- **Steps:**
  1. Paid
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0213 — Payment over balance fails

- **Priority:** P0
- **Tags:** `@sales`, `@payment`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0214 — Multi-invoice allocation payment

- **Priority:** P0
- **Tags:** `@sales`, `@payment`
- **Steps:**
  1. Allocate two invoices
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0215 — Payment receipt view

- **Priority:** P2
- **Tags:** `@sales`
- **Steps:**
  1. Receipt page
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0216 — Cannot pay non-AR doc

- **Priority:** P1
- **Tags:** `@sales`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0217 — Sales return full

- **Priority:** P0
- **Tags:** `@sales`, `@return`
- **Steps:**
  1. Stock in + GL
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0218 — Sales return partial

- **Priority:** P0
- **Tags:** `@sales`, `@return`
- **Steps:**
  1. Partial restock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0219 — Sales return over remaining fails

- **Priority:** P0
- **Tags:** `@sales`, `@return`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0220 — Sales return cash refund

- **Priority:** P1
- **Tags:** `@sales`, `@return`
- **Steps:**
  1. Cash out
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0221 — Sales return credit

- **Priority:** P1
- **Tags:** `@sales`, `@return`
- **Steps:**
  1. AR credit
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0222 — Create percent discount master

- **Priority:** P1
- **Tags:** `@sales`, `@discount`
- **Steps:**
  1. Active
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0223 — Create fixed discount master

- **Priority:** P1
- **Tags:** `@sales`, `@discount`
- **Steps:**
  1. Active
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0224 — Deactivate discount

- **Priority:** P1
- **Tags:** `@sales`, `@discount`
- **Steps:**
  1. Hidden from forms
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0225 — Activate discount

- **Priority:** P1
- **Tags:** `@sales`, `@discount`
- **Steps:**
  1. Available
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0226 — Archive discount

- **Priority:** P2
- **Tags:** `@sales`, `@discount`
- **Steps:**
  1. Hidden
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0227 — Discount future window

- **Priority:** P2
- **Tags:** `@sales`, `@discount`, `@edge`
- **Steps:**
  1. Not applied yet
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0228 — Discount expired window

- **Priority:** P2
- **Tags:** `@sales`, `@discount`, `@edge`
- **Steps:**
  1. Not available
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0229 — Sales list search

- **Priority:** P1
- **Tags:** `@sales`
- **Steps:**
  1. By number
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0230 — Sales list sort

- **Priority:** P2
- **Tags:** `@sales`
- **Steps:**
  1. By date
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0231 — Delete posted invoice blocked

- **Priority:** P0
- **Tags:** `@sales`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0232 — AR aging open invoices

- **Priority:** P0
- **Tags:** `@sales`, `@aging`
- **Steps:**
  1. Matches balances
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0233 — AR aging all paid empty

- **Priority:** P1
- **Tags:** `@sales`, `@aging`
- **Steps:**
  1. Zero open
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0234 — Invoice matrix kind=commercial channel=local settle=credit

- **Priority:** P1
- **Tags:** `@sales`, `@matrix`, `@tax`
- **Steps:**
  1. Configure VAT if tax_invoice
  2. Create invoice commercial/local
  3. Credit
  4. Assert status/GL/tax
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0235 — Invoice matrix kind=commercial channel=local settle=cash

- **Priority:** P1
- **Tags:** `@sales`, `@matrix`, `@tax`
- **Steps:**
  1. Configure VAT if tax_invoice
  2. Create invoice commercial/local
  3. Cash payment account
  4. Assert status/GL/tax
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0236 — Invoice matrix kind=commercial channel=export settle=credit

- **Priority:** P1
- **Tags:** `@sales`, `@matrix`, `@tax`
- **Steps:**
  1. Configure VAT if tax_invoice
  2. Create invoice commercial/export
  3. Credit
  4. Assert status/GL/tax
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0237 — Invoice matrix kind=commercial channel=export settle=cash

- **Priority:** P1
- **Tags:** `@sales`, `@matrix`, `@tax`
- **Steps:**
  1. Configure VAT if tax_invoice
  2. Create invoice commercial/export
  3. Cash payment account
  4. Assert status/GL/tax
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0238 — Invoice matrix kind=tax_invoice channel=local settle=credit

- **Priority:** P1
- **Tags:** `@sales`, `@matrix`, `@tax`
- **Steps:**
  1. Configure VAT if tax_invoice
  2. Create invoice tax_invoice/local
  3. Credit
  4. Assert status/GL/tax
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0239 — Invoice matrix kind=tax_invoice channel=local settle=cash

- **Priority:** P1
- **Tags:** `@sales`, `@matrix`, `@tax`
- **Steps:**
  1. Configure VAT if tax_invoice
  2. Create invoice tax_invoice/local
  3. Cash payment account
  4. Assert status/GL/tax
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0240 — Invoice matrix kind=tax_invoice channel=export settle=credit

- **Priority:** P1
- **Tags:** `@sales`, `@matrix`, `@tax`
- **Steps:**
  1. Configure VAT if tax_invoice
  2. Create invoice tax_invoice/export
  3. Credit
  4. Assert status/GL/tax
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0241 — Invoice matrix kind=tax_invoice channel=export settle=cash

- **Priority:** P1
- **Tags:** `@sales`, `@matrix`, `@tax`
- **Steps:**
  1. Configure VAT if tax_invoice
  2. Create invoice tax_invoice/export
  3. Cash payment account
  4. Assert status/GL/tax
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0242 — Invoice one line type physical

- **Priority:** P0
- **Tags:** `@sales`, `@matrix`
- **Steps:**
  1. Invoice physical
  2. Stock impact correct
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0243 — Invoice one line type digital

- **Priority:** P0
- **Tags:** `@sales`, `@matrix`
- **Steps:**
  1. Invoice digital
  2. Stock impact correct
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0244 — Invoice one line type service

- **Priority:** P0
- **Tags:** `@sales`, `@matrix`
- **Steps:**
  1. Invoice service
  2. Stock impact correct
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 9. Purchase lifecycle


### S-0245 — Create PO

- **Priority:** P0
- **Tags:** `@purchase`, `@po`
- **Steps:**
  1. No GL no stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0246 — Create multi-line PO

- **Priority:** P0
- **Tags:** `@purchase`, `@po`
- **Steps:**
  1. Totals ok
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0247 — PO→full GRN

- **Priority:** P0
- **Tags:** `@purchase`, `@grn`
- **Steps:**
  1. Stock in
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0248 — PO→partial GRN then rest

- **Priority:** P0
- **Tags:** `@purchase`, `@grn`
- **Steps:**
  1. Cumulative stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0249 — GRN with GRNI

- **Priority:** P0
- **Tags:** `@purchase`, `@grn`
- **Steps:**
  1. 5100/2150
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0250 — Bill after GRN no double stock

- **Priority:** P0
- **Tags:** `@purchase`, `@grn`
- **Steps:**
  1. Stock once
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0251 — Bill without GRN when required fails

- **Priority:** P0
- **Tags:** `@purchase`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0252 — Bill without GRN when not required

- **Priority:** P0
- **Tags:** `@purchase`
- **Steps:**
  1. OK
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0253 — Credit purchase bill direct

- **Priority:** P0
- **Tags:** `@purchase`, `@bill`
- **Steps:**
  1. AP+stock+GL
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0254 — Bill with supplier invoice #

- **Priority:** P0
- **Tags:** `@purchase`
- **Steps:**
  1. Saved
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0255 — Bill missing supplier # when required fails

- **Priority:** P0
- **Tags:** `@purchase`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0256 — Duplicate supplier invoice blocked

- **Priority:** P0
- **Tags:** `@purchase`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0257 — Bill pending approval

- **Priority:** P0
- **Tags:** `@purchase`, `@approval`
- **Steps:**
  1. No GL yet
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0258 — Approve pending bill

- **Priority:** P0
- **Tags:** `@purchase`, `@approval`
- **Steps:**
  1. GL+stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0259 — Reject pending bill

- **Priority:** P0
- **Tags:** `@purchase`, `@approval`
- **Steps:**
  1. No GL
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0260 — Approve non-pending fails

- **Priority:** P1
- **Tags:** `@purchase`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0261 — Cash purchase

- **Priority:** P0
- **Tags:** `@purchase`, `@cash`
- **Steps:**
  1. Paid + stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0262 — Import purchase landed costs

- **Priority:** P0
- **Tags:** `@purchase`, `@import`
- **Steps:**
  1. Cost includes freight/duty
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0263 — Import zero landed

- **Priority:** P2
- **Tags:** `@purchase`, `@import`
- **Steps:**
  1. Unit cost only
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0264 — Pay vendor full

- **Priority:** P0
- **Tags:** `@purchase`, `@payment`
- **Steps:**
  1. Bill paid
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0265 — Pay vendor partial then rest

- **Priority:** P0
- **Tags:** `@purchase`, `@payment`
- **Steps:**
  1. Statuses
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0266 — Pay multi-bill

- **Priority:** P0
- **Tags:** `@purchase`, `@payment`
- **Steps:**
  1. Allocation
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0267 — Pay over balance fails

- **Priority:** P0
- **Tags:** `@purchase`, `@payment`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0268 — Remittance view

- **Priority:** P2
- **Tags:** `@purchase`
- **Steps:**
  1. Renders
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0269 — Purchase return from bill

- **Priority:** P0
- **Tags:** `@purchase`, `@return`
- **Steps:**
  1. Stock out AP credit
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0270 — Purchase return partial

- **Priority:** P1
- **Tags:** `@purchase`, `@return`
- **Steps:**
  1. Partial
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0271 — Return from cash purchase

- **Priority:** P1
- **Tags:** `@purchase`, `@return`
- **Steps:**
  1. Cash refund path
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0272 — AP aging open bills

- **Priority:** P0
- **Tags:** `@purchase`, `@aging`
- **Steps:**
  1. Matches
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0273 — Supplier performance page

- **Priority:** P2
- **Tags:** `@purchase`
- **Steps:**
  1. Loads
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0274 — PO convert no remaining fails

- **Priority:** P0
- **Tags:** `@purchase`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0275 — Purchase print

- **Priority:** P2
- **Tags:** `@purchase`
- **Steps:**
  1. Renders
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0276 — Delete unposted PO

- **Priority:** P1
- **Tags:** `@purchase`
- **Steps:**
  1. OK
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0277 — Delete posted bill blocked

- **Priority:** P0
- **Tags:** `@purchase`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0278 — Bill brand+location

- **Priority:** P0
- **Tags:** `@purchase`, `@brand`, `@location`
- **Steps:**
  1. On doc+journal
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0279 — GRN location A stock only A

- **Priority:** P0
- **Tags:** `@purchase`, `@location`
- **Steps:**
  1. Independent levels
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0280 — Purchase line type physical

- **Priority:** P0
- **Tags:** `@purchase`, `@matrix`
- **Steps:**
  1. Purchase physical
  2. Stock impact correct
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0281 — Purchase line type digital

- **Priority:** P0
- **Tags:** `@purchase`, `@matrix`
- **Steps:**
  1. Purchase digital
  2. Stock impact correct
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0282 — Purchase line type service

- **Priority:** P0
- **Tags:** `@purchase`, `@matrix`
- **Steps:**
  1. Purchase service
  2. Stock impact correct
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0283 — List loads purchase_order

- **Priority:** P1
- **Tags:** `@purchase`, `@matrix`
- **Steps:**
  1. Open list for purchase_order
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0284 — List loads goods_receipt

- **Priority:** P1
- **Tags:** `@purchase`, `@matrix`
- **Steps:**
  1. Open list for goods_receipt
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0285 — List loads purchase

- **Priority:** P1
- **Tags:** `@purchase`, `@matrix`
- **Steps:**
  1. Open list for purchase
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0286 — List loads cash_purchase

- **Priority:** P1
- **Tags:** `@purchase`, `@matrix`
- **Steps:**
  1. Open list for cash_purchase
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0287 — List loads import_purchase

- **Priority:** P1
- **Tags:** `@purchase`, `@matrix`
- **Steps:**
  1. Open list for import_purchase
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0288 — List loads purchase_return

- **Priority:** P1
- **Tags:** `@purchase`, `@matrix`
- **Steps:**
  1. Open list for purchase_return
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 10. POS


### S-0289 — Open POS with registers

- **Priority:** P0
- **Tags:** `@pos`
- **Steps:**
  1. Terminal loads
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0290 — Open POS no registers

- **Priority:** P1
- **Tags:** `@pos`, `@edge`
- **Steps:**
  1. Prompt setup
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0291 — Open shift float

- **Priority:** P0
- **Tags:** `@pos`
- **Steps:**
  1. Shift open
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0292 — Reuse open shift

- **Priority:** P1
- **Tags:** `@pos`, `@edge`
- **Steps:**
  1. No duplicate open
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0293 — POS sale cash

- **Priority:** P0
- **Tags:** `@pos`
- **Steps:**
  1. Paid stock out
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0294 — POS multi-line sale

- **Priority:** P0
- **Tags:** `@pos`
- **Steps:**
  1. Totals
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0295 — POS card tender

- **Priority:** P0
- **Tags:** `@pos`
- **Steps:**
  1. Card GL
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0296 — POS bank tender

- **Priority:** P1
- **Tags:** `@pos`
- **Steps:**
  1. Bank GL
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0297 — POS mixed tender

- **Priority:** P1
- **Tags:** `@pos`
- **Steps:**
  1. Recorded
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0298 — POS walk-in

- **Priority:** P0
- **Tags:** `@pos`
- **Steps:**
  1. OK
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0299 — POS named customer

- **Priority:** P1
- **Tags:** `@pos`
- **Steps:**
  1. OK
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0300 — POS header discount

- **Priority:** P1
- **Tags:** `@pos`, `@discount`
- **Steps:**
  1. Total down
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0301 — POS tax invoice

- **Priority:** P1
- **Tags:** `@pos`, `@tax`
- **Steps:**
  1. VAT
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0302 — POS commercial

- **Priority:** P1
- **Tags:** `@pos`
- **Steps:**
  1. OK
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0303 — POS without shift fails

- **Priority:** P0
- **Tags:** `@pos`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0304 — POS oversell block fails

- **Priority:** P0
- **Tags:** `@pos`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0305 — POS auto brand no UI field

- **Priority:** P0
- **Tags:** `@pos`, `@brand`
- **Steps:**
  1. Succeeds with brands present
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0306 — POS uses register location

- **Priority:** P0
- **Tags:** `@pos`, `@location`
- **Steps:**
  1. Doc location set
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0307 — POS return full

- **Priority:** P0
- **Tags:** `@pos`, `@return`
- **Steps:**
  1. Stock in
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0308 — POS return partial

- **Priority:** P0
- **Tags:** `@pos`, `@return`
- **Steps:**
  1. OK
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0309 — POS return over remaining fails

- **Priority:** P0
- **Tags:** `@pos`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0310 — POS free return

- **Priority:** P2
- **Tags:** `@pos`, `@return`
- **Steps:**
  1. If allowed
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0311 — POS recent sales

- **Priority:** P1
- **Tags:** `@pos`
- **Steps:**
  1. Listed
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0312 — POS receipt page

- **Priority:** P1
- **Tags:** `@pos`
- **Steps:**
  1. Renders
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0313 — Close shift exact cash

- **Priority:** P0
- **Tags:** `@pos`
- **Steps:**
  1. Variance 0
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0314 — Close shift over

- **Priority:** P1
- **Tags:** `@pos`
- **Steps:**
  1. +variance
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0315 — Close shift short

- **Priority:** P1
- **Tags:** `@pos`
- **Steps:**
  1. -variance
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0316 — Z-report after close

- **Priority:** P0
- **Tags:** `@pos`
- **Steps:**
  1. Summary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0317 — Customer display page

- **Priority:** P2
- **Tags:** `@pos`
- **Steps:**
  1. Loads
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0318 — POS history list

- **Priority:** P1
- **Tags:** `@pos`
- **Steps:**
  1. /sales/pos
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0319 — POS shifts list

- **Priority:** P1
- **Tags:** `@pos`
- **Steps:**
  1. /sales/pos/shifts
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0320 — Switch register

- **Priority:** P2
- **Tags:** `@pos`
- **Steps:**
  1. Needs own shift
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0321 — POS tender matrix cash

- **Priority:** P0
- **Tags:** `@pos`, `@matrix`
- **Steps:**
  1. Shift
  2. Sell
  3. Pay cash
  4. GL correct
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0322 — POS tender matrix card

- **Priority:** P0
- **Tags:** `@pos`, `@matrix`
- **Steps:**
  1. Shift
  2. Sell
  3. Pay card
  4. GL correct
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0323 — POS tender matrix bank

- **Priority:** P0
- **Tags:** `@pos`, `@matrix`
- **Steps:**
  1. Shift
  2. Sell
  3. Pay bank
  4. GL correct
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0324 — POS tender matrix mixed

- **Priority:** P0
- **Tags:** `@pos`, `@matrix`
- **Steps:**
  1. Shift
  2. Sell
  3. Pay mixed
  4. GL correct
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 11. Accounting, reports, reconciliation


### S-0325 — Money in new sale

- **Priority:** P0
- **Tags:** `@accounting`
- **Steps:**
  1. Balanced journal
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0326 — Money in customer payment

- **Priority:** P1
- **Tags:** `@accounting`
- **Steps:**
  1. Posts
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0327 — Money in owner contribution

- **Priority:** P1
- **Tags:** `@accounting`
- **Steps:**
  1. Posts
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0328 — Money out expense

- **Priority:** P0
- **Tags:** `@accounting`
- **Steps:**
  1. Expense GL
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0329 — Money out category override

- **Priority:** P1
- **Tags:** `@accounting`
- **Steps:**
  1. Uses override
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0330 — Move money accounts

- **Priority:** P0
- **Tags:** `@accounting`
- **Steps:**
  1. Both sides
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0331 — Simple customer invoice path

- **Priority:** P1
- **Tags:** `@accounting`
- **Steps:**
  1. AR-style
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0332 — Simple vendor bill path

- **Priority:** P1
- **Tags:** `@accounting`
- **Steps:**
  1. AP-style
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0333 — Simple entry receipt upload

- **Priority:** P1
- **Tags:** `@accounting`
- **Steps:**
  1. Viewable
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0334 — Simple entry brand/location required

- **Priority:** P0
- **Tags:** `@accounting`
- **Steps:**
  1. With masters
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0335 — Simple entry locked period fails

- **Priority:** P0
- **Tags:** `@accounting`, `@period`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0336 — Duplicate commercial soft warning

- **Priority:** P1
- **Tags:** `@accounting`, `@edge`
- **Steps:**
  1. Warn + force
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0337 — Force duplicate posts

- **Priority:** P2
- **Tags:** `@accounting`, `@edge`
- **Steps:**
  1. Succeeds
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0338 — Reverse transaction

- **Priority:** P0
- **Tags:** `@accounting`
- **Steps:**
  1. Net zero
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0339 — Reverse open-period rules

- **Priority:** P1
- **Tags:** `@accounting`, `@edge`
- **Steps:**
  1. Per product rules
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0340 — Transactions search party

- **Priority:** P1
- **Tags:** `@accounting`
- **Steps:**
  1. Filters
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0341 — Filter low confidence

- **Priority:** P2
- **Tags:** `@accounting`
- **Steps:**
  1. Chip
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0342 — Filter missing receipt

- **Priority:** P2
- **Tags:** `@accounting`
- **Steps:**
  1. Chip
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0343 — Filter unreconciled

- **Priority:** P2
- **Tags:** `@accounting`
- **Steps:**
  1. Chip
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0344 — View receipt from tx

- **Priority:** P1
- **Tags:** `@accounting`
- **Steps:**
  1. Opens
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0345 — Journal integrity OK

- **Priority:** P0
- **Tags:** `@accounting`
- **Steps:**
  1. Debits=credits
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0346 — Journal expand lines

- **Priority:** P0
- **Tags:** `@accounting`
- **Steps:**
  1. Details
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0347 — Report P&L

- **Priority:** P0
- **Tags:** `@accounting`, `@reports`
- **Steps:**
  1. Renders
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0348 — Report Balance Sheet

- **Priority:** P0
- **Tags:** `@accounting`, `@reports`
- **Steps:**
  1. Renders
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0349 — Report Cash Flow

- **Priority:** P0
- **Tags:** `@accounting`, `@reports`
- **Steps:**
  1. Renders
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0350 — Report GL

- **Priority:** P0
- **Tags:** `@accounting`, `@reports`
- **Steps:**
  1. Renders
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0351 — Report Trial Balance

- **Priority:** P0
- **Tags:** `@accounting`, `@reports`
- **Steps:**
  1. Balanced
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0352 — Report period changes figures

- **Priority:** P0
- **Tags:** `@accounting`, `@period`
- **Steps:**
  1. Different numbers
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0353 — Accounts balances after post

- **Priority:** P0
- **Tags:** `@accounting`
- **Steps:**
  1. Moves
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0354 — Dashboard updates after post

- **Priority:** P1
- **Tags:** `@accounting`
- **Steps:**
  1. Metrics change
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0355 — Recon upload CSV

- **Priority:** P0
- **Tags:** `@recon`
- **Steps:**
  1. Imported
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0356 — Recon auto match

- **Priority:** P0
- **Tags:** `@recon`
- **Steps:**
  1. Matched
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0357 — Recon mark reconciled

- **Priority:** P0
- **Tags:** `@recon`
- **Steps:**
  1. Status
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0358 — Recon mark unmatched

- **Priority:** P1
- **Tags:** `@recon`
- **Steps:**
  1. Status
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0359 — Lock period when ready

- **Priority:** P0
- **Tags:** `@recon`, `@period`
- **Steps:**
  1. Locked
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0360 — Post into locked period fails

- **Priority:** P0
- **Tags:** `@recon`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0361 — Recon bad CSV

- **Priority:** P2
- **Tags:** `@recon`, `@edge`
- **Steps:**
  1. Handled
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0362 — Recon empty CSV

- **Priority:** P3
- **Tags:** `@recon`, `@edge`
- **Steps:**
  1. Handled
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0363 — Simple Entry money out via Cash

- **Priority:** P1
- **Tags:** `@accounting`, `@matrix`
- **Steps:**
  1. Method Cash
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0364 — Simple Entry money in via Cash

- **Priority:** P1
- **Tags:** `@accounting`, `@matrix`
- **Steps:**
  1. Method Cash
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0365 — Simple Entry money out via Bank

- **Priority:** P1
- **Tags:** `@accounting`, `@matrix`
- **Steps:**
  1. Method Bank
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0366 — Simple Entry money in via Bank

- **Priority:** P1
- **Tags:** `@accounting`, `@matrix`
- **Steps:**
  1. Method Bank
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0367 — Simple Entry money out via Card

- **Priority:** P1
- **Tags:** `@accounting`, `@matrix`
- **Steps:**
  1. Method Card
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0368 — Simple Entry money in via Card

- **Priority:** P1
- **Tags:** `@accounting`, `@matrix`
- **Steps:**
  1. Method Card
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 12. Full business-day journeys


### S-0369 — Day setup masters

- **Priority:** P0
- **Tags:** `@journey`
- **Steps:**
  1. Profile tax brand location FY settings
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0370 — Day products and parties

- **Priority:** P0
- **Tags:** `@journey`
- **Steps:**
  1. 3 physical 2 customers 2 vendors
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0371 — Buy credit pay later

- **Priority:** P0
- **Tags:** `@journey`
- **Steps:**
  1. PO→GRN→Bill→Pay
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0372 — Cash buy and sell same day

- **Priority:** P0
- **Tags:** `@journey`
- **Steps:**
  1. Cash purchase then invoice
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0373 — Quote to cash

- **Priority:** P0
- **Tags:** `@journey`
- **Steps:**
  1. QT→SO→INV→Pay
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0374 — Abandoned quote

- **Priority:** P1
- **Tags:** `@journey`
- **Steps:**
  1. QT only no GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0375 — Order not invoiced

- **Priority:** P0
- **Tags:** `@journey`
- **Steps:**
  1. SO stock unchanged
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0376 — Sell return restock

- **Priority:** P0
- **Tags:** `@journey`
- **Steps:**
  1. Buy sell return
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0377 — Multi-location sell

- **Priority:** P0
- **Tags:** `@journey`, `@location`
- **Steps:**
  1. Buy A transfer B sell B
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0378 — POS full shift day

- **Priority:** P0
- **Tags:** `@journey`, `@pos`
- **Steps:**
  1. Open 10 sales 1 return close Z
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0379 — VAT tax invoice day

- **Priority:** P0
- **Tags:** `@journey`, `@tax`
- **Steps:**
  1. Output VAT in reports
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0380 — Import landed then sell

- **Priority:** P0
- **Tags:** `@journey`
- **Steps:**
  1. Landed cost in COGS path
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0381 — Average cost journey

- **Priority:** P0
- **Tags:** `@journey`
- **Steps:**
  1. Two buys sell
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0382 — Last cost journey

- **Priority:** P0
- **Tags:** `@journey`
- **Steps:**
  1. Two buys sell
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0383 — Credit limit journey

- **Priority:** P0
- **Tags:** `@journey`, `@credit`
- **Steps:**
  1. Block then pay then allow
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0384 — Period close journey

- **Priority:** P0
- **Tags:** `@journey`, `@period`
- **Steps:**
  1. Post recon lock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0385 — Wrong entry reverse

- **Priority:** P0
- **Tags:** `@journey`
- **Steps:**
  1. Post reverse correct
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0386 — Multi-brand sales

- **Priority:** P1
- **Tags:** `@journey`, `@brand`
- **Steps:**
  1. Two brands tagged
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0387 — Dual-role party buy and sell

- **Priority:** P1
- **Tags:** `@journey`
- **Steps:**
  1. Same party both sides
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0388 — Approval workflow day

- **Priority:** P0
- **Tags:** `@journey`, `@approval`
- **Steps:**
  1. Reject one approve one pay
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0389 — GRNI full path

- **Priority:** P0
- **Tags:** `@journey`, `@grn`
- **Steps:**
  1. PO GRN bill TB clean
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0390 — Partial GRN multi bill

- **Priority:** P0
- **Tags:** `@journey`
- **Steps:**
  1. 10→4→6
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0391 — Multi-order invoice partial pay

- **Priority:** P0
- **Tags:** `@journey`
- **Steps:**
  1. 2 SO → INV → partial
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0392 — Discounted sale full return

- **Priority:** P1
- **Tags:** `@journey`
- **Steps:**
  1. Consistent
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0393 — Service-only company day

- **Priority:** P1
- **Tags:** `@journey`
- **Steps:**
  1. No stock impact
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0394 — Digital goods day

- **Priority:** P1
- **Tags:** `@journey`
- **Steps:**
  1. No stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 13. Mid-operation edit/delete edges


### S-0395 — Edit quote after save

- **Priority:** P1
- **Tags:** `@edge`, `@sales`
- **Steps:**
  1. Header notes
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0396 — Cannot edit posted invoice header

- **Priority:** P0
- **Tags:** `@edge`, `@sales`
- **Steps:**
  1. Blocked
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0397 — Delete draft quote

- **Priority:** P1
- **Tags:** `@edge`
- **Steps:**
  1. Gone
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0398 — Convert then delete source blocked

- **Priority:** P0
- **Tags:** `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0399 — Price change after SO before INV

- **Priority:** P1
- **Tags:** `@edge`
- **Steps:**
  1. Line prices as entered
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0400 — Cost change after purchase before sale

- **Priority:** P1
- **Tags:** `@edge`
- **Steps:**
  1. COGS at post time
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0401 — Deactivate discount mid quote

- **Priority:** P2
- **Tags:** `@edge`
- **Steps:**
  1. Convert still valid
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0402 — Archive product on open SO

- **Priority:** P1
- **Tags:** `@edge`
- **Steps:**
  1. Defined behavior
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0403 — Block party after quote

- **Priority:** P0
- **Tags:** `@edge`
- **Steps:**
  1. Invoice fails
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0404 — Lower credit limit below open AR

- **Priority:** P0
- **Tags:** `@edge`, `@credit`
- **Steps:**
  1. New invoice blocked
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0405 — Switch company mid form

- **Priority:** P0
- **Tags:** `@edge`, `@security`
- **Steps:**
  1. No cross-tenant leak
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0406 — Logout mid form

- **Priority:** P2
- **Tags:** `@edge`
- **Steps:**
  1. No post
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0407 — Double submit invoice

- **Priority:** P0
- **Tags:** `@edge`
- **Steps:**
  1. One doc not double GL
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0408 — Browser back after create

- **Priority:** P1
- **Tags:** `@edge`
- **Steps:**
  1. No duplicate
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0409 — Refresh detail page

- **Priority:** P1
- **Tags:** `@edge`
- **Steps:**
  1. Still loads
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0410 — Invalid UUID route

- **Priority:** P2
- **Tags:** `@edge`
- **Steps:**
  1. 404/safe
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0411 — Other tenant UUID access

- **Priority:** P0
- **Tags:** `@edge`, `@security`
- **Steps:**
  1. Not found
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0412 — Period lock while reconciling

- **Priority:** P1
- **Tags:** `@edge`
- **Steps:**
  1. Posts fail after lock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0413 — Toggle neg stock mid oversell

- **Priority:** P1
- **Tags:** `@edge`
- **Steps:**
  1. Second fails
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0414 — Enable VAT after commercials exist

- **Priority:** P1
- **Tags:** `@edge`, `@tax`
- **Steps:**
  1. Old remain new tax ok
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0415 — Disable module mid session

- **Priority:** P1
- **Tags:** `@edge`, `@modules`
- **Steps:**
  1. Nav hides
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0416 — Suspend tenant while logged in

- **Priority:** P0
- **Tags:** `@edge`, `@platform`
- **Steps:**
  1. Ops fail
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0417 — Master wipe staging

- **Priority:** P0
- **Tags:** `@edge`, `@platform`
- **Steps:**
  1. Ops cleared profile kept
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0418 — Master wipe production blocked

- **Priority:** P0
- **Tags:** `@edge`, `@security`
- **Steps:**
  1. Fails
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0419 — Wrong RESET phrase

- **Priority:** P1
- **Tags:** `@edge`
- **Steps:**
  1. No wipe
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0420 — Health check production blocked

- **Priority:** P0
- **Tags:** `@edge`, `@platform`
- **Steps:**
  1. Fails
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0421 — Health check full suite staging

- **Priority:** P0
- **Tags:** `@platform`, `@health`
- **Steps:**
  1. Steps pass
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0422 — Health check wipe run

- **Priority:** P1
- **Tags:** `@platform`
- **Steps:**
  1. Scoped wipe
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0423 — POS after shift close fails

- **Priority:** P0
- **Tags:** `@edge`, `@pos`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0424 — Transfer then sell destination

- **Priority:** P0
- **Tags:** `@edge`, `@stock`
- **Steps:**
  1. OK
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0425 — Adjust then delete product blocked

- **Priority:** P1
- **Tags:** `@edge`
- **Steps:**
  1. Blockers
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0426 — Return more than sold after pay fails

- **Priority:** P0
- **Tags:** `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0427 — Two browser sessions same user

- **Priority:** P2
- **Tags:** `@edge`, `@scale`
- **Steps:**
  1. TB ok
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 14. Control Room / platform


### S-0428 — Overview as super_admin

- **Priority:** P0
- **Tags:** `@platform`
- **Steps:**
  1. Metrics
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0429 — Non-admin control room redirect

- **Priority:** P0
- **Tags:** `@platform`, `@security`
- **Steps:**
  1. Home
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0430 — List companies

- **Priority:** P0
- **Tags:** `@platform`
- **Steps:**
  1. Table
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0431 — Filter companies by plan

- **Priority:** P2
- **Tags:** `@platform`
- **Steps:**
  1. Filtered
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0432 — Filter companies by status

- **Priority:** P2
- **Tags:** `@platform`
- **Steps:**
  1. Filtered
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0433 — Search companies

- **Priority:** P1
- **Tags:** `@platform`
- **Steps:**
  1. Name/slug
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0434 — Create starter company

- **Priority:** P0
- **Tags:** `@platform`
- **Steps:**
  1. Owner + plan
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0435 — Create growth company

- **Priority:** P0
- **Tags:** `@platform`, `@modules`
- **Steps:**
  1. Inventory module
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0436 — Create pro company

- **Priority:** P0
- **Tags:** `@platform`, `@modules`
- **Steps:**
  1. POS module
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0437 — Create staging company

- **Priority:** P0
- **Tags:** `@platform`
- **Steps:**
  1. Env staging
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0438 — Edit company plan modules

- **Priority:** P0
- **Tags:** `@platform`
- **Steps:**
  1. Save
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0439 — Suspend company

- **Priority:** P0
- **Tags:** `@platform`
- **Steps:**
  1. Suspended
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0440 — Restore company

- **Priority:** P0
- **Tags:** `@platform`
- **Steps:**
  1. Active
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0441 — Modules matrix

- **Priority:** P1
- **Tags:** `@platform`
- **Steps:**
  1. Flags
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0442 — Apply plan module defaults

- **Priority:** P1
- **Tags:** `@platform`
- **Steps:**
  1. Reset
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0443 — Access users search

- **Priority:** P1
- **Tags:** `@platform`
- **Steps:**
  1. Cross-tenant
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0444 — Audit after create company

- **Priority:** P0
- **Tags:** `@platform`
- **Steps:**
  1. Event logged
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0445 — Health check UI super_admin

- **Priority:** P0
- **Tags:** `@platform`
- **Steps:**
  1. Loads
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0446 — Toggle env staging

- **Priority:** P0
- **Tags:** `@platform`
- **Steps:**
  1. Saved
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0447 — Run health core suite

- **Priority:** P0
- **Tags:** `@platform`, `@health`
- **Steps:**
  1. Report
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0448 — Run health full suite

- **Priority:** P0
- **Tags:** `@platform`, `@health`
- **Steps:**
  1. Report
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 15. Security & tenancy


### S-0449 — No cross-tenant invoice

- **Priority:** P0
- **Tags:** `@security`
- **Steps:**
  1. Foreign UUID
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0450 — No cross-tenant product

- **Priority:** P0
- **Tags:** `@security`
- **Steps:**
  1. Foreign UUID
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0451 — No cross-tenant party

- **Priority:** P0
- **Tags:** `@security`
- **Steps:**
  1. Foreign UUID
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0452 — Stock isolated per tenant

- **Priority:** P0
- **Tags:** `@security`
- **Steps:**
  1. Two tenants
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0453 — Mutation without session fails

- **Priority:** P1
- **Tags:** `@security`
- **Steps:**
  1. POST unauthenticated
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0454 — XSS party name escaped

- **Priority:** P1
- **Tags:** `@security`
- **Steps:**
  1. Script tags
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0455 — XSS product name escaped

- **Priority:** P1
- **Tags:** `@security`
- **Steps:**
  1. Script tags
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0456 — Search SQLi harmless

- **Priority:** P1
- **Tags:** `@security`
- **Steps:**
  1. Evil string
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0457 — Path traversal image rejected

- **Priority:** P2
- **Tags:** `@security`
- **Steps:**
  1. Odd path
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0458 — Upload within size limit

- **Priority:** P2
- **Tags:** `@security`
- **Steps:**
  1. OK
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0459 — Upload over size rejected

- **Priority:** P2
- **Tags:** `@security`, `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0460 — Rapid failed logins no crash

- **Priority:** P3
- **Tags:** `@security`
- **Steps:**
  1. Many attempts
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0461 — Docs no tenant secrets

- **Priority:** P0
- **Tags:** `@security`, `@docs`
- **Steps:**
  1. Public docs clean
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0462 — E2E report no password

- **Priority:** P0
- **Tags:** `@security`, `@e2e`
- **Steps:**
  1. Password not in report
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0463 — Suspended tenant blocked

- **Priority:** P0
- **Tags:** `@security`, `@platform`
- **Steps:**
  1. Ops fail
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 16. Numeric & data edges


### S-0464 — Qty fraction 0.5

- **Priority:** P1
- **Tags:** `@edge`, `@numeric`
- **Steps:**
  1. If allowed totals ok
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0465 — Qty zero rejected

- **Priority:** P0
- **Tags:** `@edge`, `@numeric`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0466 — Qty negative rejected

- **Priority:** P0
- **Tags:** `@edge`, `@numeric`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0467 — Price zero free item

- **Priority:** P1
- **Tags:** `@edge`, `@numeric`
- **Steps:**
  1. Allowed
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0468 — Price negative rejected

- **Priority:** P0
- **Tags:** `@edge`, `@numeric`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0469 — Very large amount

- **Priority:** P2
- **Tags:** `@edge`, `@numeric`
- **Steps:**
  1. OK or max validation
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0470 — Money rounding consistency

- **Priority:** P0
- **Tags:** `@edge`, `@numeric`
- **Steps:**
  1. .005 cases
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0471 — Discount > subtotal

- **Priority:** P1
- **Tags:** `@edge`, `@numeric`
- **Steps:**
  1. Clamp or error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0472 — Line sum equals document total math

- **Priority:** P0
- **Tags:** `@edge`, `@numeric`
- **Steps:**
  1. Assert
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0473 — Unicode Sinhala/Tamil names

- **Priority:** P1
- **Tags:** `@edge`, `@i18n`
- **Steps:**
  1. Save search display
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0474 — Emoji in notes

- **Priority:** P3
- **Tags:** `@edge`
- **Steps:**
  1. Saved
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0475 — Long name max length

- **Priority:** P2
- **Tags:** `@edge`
- **Steps:**
  1. Truncate or error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0476 — Empty line description rejected

- **Priority:** P1
- **Tags:** `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0477 — Whitespace-only name rejected

- **Priority:** P1
- **Tags:** `@edge`
- **Steps:**
  1. Error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0478 — Far future invoice date

- **Priority:** P2
- **Tags:** `@edge`
- **Steps:**
  1. Handled
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0479 — Far past invoice date

- **Priority:** P2
- **Tags:** `@edge`
- **Steps:**
  1. If period open
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0480 — Due before issue date

- **Priority:** P2
- **Tags:** `@edge`
- **Steps:**
  1. Per rules
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 17. Validation error catalog (one per class)


### S-0481 — Error class: Select a brand

- **Priority:** P0
- **Tags:** `@edge`, `@brand`
- **Steps:**
  1. Construct minimal case for: Select a brand
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0482 — Error class: Select a location

- **Priority:** P0
- **Tags:** `@edge`, `@location`
- **Steps:**
  1. Construct minimal case for: Select a location
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0483 — Error class: Party blocked

- **Priority:** P0
- **Tags:** `@edge`, `@parties`
- **Steps:**
  1. Construct minimal case for: Party blocked
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0484 — Error class: Party inactive

- **Priority:** P0
- **Tags:** `@edge`, `@parties`
- **Steps:**
  1. Construct minimal case for: Party inactive
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0485 — Error class: Credit limit exceeded

- **Priority:** P0
- **Tags:** `@edge`, `@credit`
- **Steps:**
  1. Construct minimal case for: Credit limit exceeded
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0486 — Error class: Insufficient stock

- **Priority:** P0
- **Tags:** `@edge`, `@stock`
- **Steps:**
  1. Construct minimal case for: Insufficient stock
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0487 — Error class: Period locked

- **Priority:** P0
- **Tags:** `@edge`, `@period`
- **Steps:**
  1. Construct minimal case for: Period locked
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0488 — Error class: Supplier invoice required

- **Priority:** P0
- **Tags:** `@edge`, `@purchase`
- **Steps:**
  1. Construct minimal case for: Supplier invoice required
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0489 — Error class: Duplicate supplier invoice

- **Priority:** P0
- **Tags:** `@edge`, `@purchase`
- **Steps:**
  1. Construct minimal case for: Duplicate supplier invoice
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0490 — Error class: GRN required before bill

- **Priority:** P0
- **Tags:** `@edge`, `@grn`
- **Steps:**
  1. Construct minimal case for: GRN required before bill
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0491 — Error class: No remaining qty to convert

- **Priority:** P0
- **Tags:** `@edge`, `@purchase`
- **Steps:**
  1. Construct minimal case for: No remaining qty to convert
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0492 — Error class: Payment exceeds balance

- **Priority:** P0
- **Tags:** `@edge`, `@payment`
- **Steps:**
  1. Construct minimal case for: Payment exceeds balance
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0493 — Error class: Approve only pending

- **Priority:** P0
- **Tags:** `@edge`, `@approval`
- **Steps:**
  1. Construct minimal case for: Approve only pending
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0494 — Error class: Delete posted doc blocked

- **Priority:** P0
- **Tags:** `@edge`, `@sales`
- **Steps:**
  1. Construct minimal case for: Delete posted doc blocked
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0495 — Error class: Open shift required

- **Priority:** P0
- **Tags:** `@edge`, `@pos`
- **Steps:**
  1. Construct minimal case for: Open shift required
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0496 — Error class: Return qty exceeds remaining

- **Priority:** P0
- **Tags:** `@edge`, `@pos`
- **Steps:**
  1. Construct minimal case for: Return qty exceeds remaining
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0497 — Error class: Transfer from≠to

- **Priority:** P0
- **Tags:** `@edge`, `@transfer`
- **Steps:**
  1. Construct minimal case for: Transfer from≠to
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0498 — Error class: Transfer physical only

- **Priority:** P0
- **Tags:** `@edge`, `@transfer`
- **Steps:**
  1. Construct minimal case for: Transfer physical only
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0499 — Error class: Keep one active register

- **Priority:** P0
- **Tags:** `@edge`, `@pos`
- **Steps:**
  1. Construct minimal case for: Keep one active register
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0500 — Error class: Account code not found

- **Priority:** P0
- **Tags:** `@edge`, `@accounting`
- **Steps:**
  1. Construct minimal case for: Account code not found
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0501 — Error class: Master wipe staging only

- **Priority:** P0
- **Tags:** `@edge`, `@platform`
- **Steps:**
  1. Construct minimal case for: Master wipe staging only
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0502 — Error class: Health suite staging only

- **Priority:** P0
- **Tags:** `@edge`, `@platform`
- **Steps:**
  1. Construct minimal case for: Health suite staging only
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0503 — Error class: Duplicate SKU

- **Priority:** P0
- **Tags:** `@edge`, `@inventory`
- **Steps:**
  1. Construct minimal case for: Duplicate SKU
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0504 — Error class: Party delete blockers

- **Priority:** P0
- **Tags:** `@edge`, `@parties`
- **Steps:**
  1. Construct minimal case for: Party delete blockers
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0505 — Error class: Cannot remove role with docs

- **Priority:** P0
- **Tags:** `@edge`, `@parties`
- **Steps:**
  1. Construct minimal case for: Cannot remove role with docs
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0506 — Error class: Multi-SO different customers

- **Priority:** P0
- **Tags:** `@edge`, `@sales`
- **Steps:**
  1. Construct minimal case for: Multi-SO different customers
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0507 — Error class: Invalid brand for company

- **Priority:** P0
- **Tags:** `@edge`, `@brand`
- **Steps:**
  1. Construct minimal case for: Invalid brand for company
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0508 — Error class: Invalid location for company

- **Priority:** P0
- **Tags:** `@edge`, `@location`
- **Steps:**
  1. Construct minimal case for: Invalid location for company
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0509 — Error class: Bill rejection only pending

- **Priority:** P0
- **Tags:** `@edge`, `@approval`
- **Steps:**
  1. Construct minimal case for: Bill rejection only pending
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0510 — Error class: Pay wrong document type

- **Priority:** P0
- **Tags:** `@edge`, `@payment`
- **Steps:**
  1. Construct minimal case for: Pay wrong document type
  2. Assert user-visible error
  3. Assert no corrupt partial GL/stock
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 18. Route smoke (load only)


### S-0511 — Route smoke /

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate / with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0512 — Route smoke /dashboard

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /dashboard with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0513 — Route smoke /transactions

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /transactions with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0514 — Route smoke /journal

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /journal with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0515 — Route smoke /reports

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /reports with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0516 — Route smoke /accounts

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /accounts with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0517 — Route smoke /reconciliation

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /reconciliation with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0518 — Route smoke /parties/customers

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /parties/customers with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0519 — Route smoke /parties/vendors

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /parties/vendors with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0520 — Route smoke /parties/customers/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /parties/customers/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0521 — Route smoke /parties/vendors/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /parties/vendors/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0522 — Route smoke /sales/quotations

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /sales/quotations with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0523 — Route smoke /sales/quotations/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /sales/quotations/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0524 — Route smoke /sales/orders

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /sales/orders with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0525 — Route smoke /sales/orders/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /sales/orders/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0526 — Route smoke /sales/invoices

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /sales/invoices with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0527 — Route smoke /sales/invoices/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /sales/invoices/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0528 — Route smoke /sales/payments

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /sales/payments with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0529 — Route smoke /sales/payments/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /sales/payments/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0530 — Route smoke /sales/aging

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /sales/aging with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0531 — Route smoke /sales/returns

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /sales/returns with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0532 — Route smoke /sales/returns/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /sales/returns/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0533 — Route smoke /sales/discounts

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /sales/discounts with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0534 — Route smoke /sales/discounts/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /sales/discounts/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0535 — Route smoke /sales/pos

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /sales/pos with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0536 — Route smoke /sales/pos/shifts

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /sales/pos/shifts with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0537 — Route smoke /pos

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /pos with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0538 — Route smoke /pos/customer-display

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /pos/customer-display with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0539 — Route smoke /purchase/orders

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /purchase/orders with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0540 — Route smoke /purchase/orders/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /purchase/orders/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0541 — Route smoke /purchase/receipts

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /purchase/receipts with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0542 — Route smoke /purchase/receipts/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /purchase/receipts/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0543 — Route smoke /purchase/purchases

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /purchase/purchases with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0544 — Route smoke /purchase/purchases/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /purchase/purchases/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0545 — Route smoke /purchase/import

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /purchase/import with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0546 — Route smoke /purchase/import/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /purchase/import/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0547 — Route smoke /purchase/expenses

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /purchase/expenses with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0548 — Route smoke /purchase/expenses/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /purchase/expenses/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0549 — Route smoke /purchase/returns

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /purchase/returns with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0550 — Route smoke /purchase/returns/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /purchase/returns/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0551 — Route smoke /purchase/payments

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /purchase/payments with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0552 — Route smoke /purchase/payments/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /purchase/payments/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0553 — Route smoke /purchase/aging

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /purchase/aging with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0554 — Route smoke /purchase/suppliers

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /purchase/suppliers with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0555 — Route smoke /inventory/products

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /inventory/products with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0556 — Route smoke /inventory/products/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /inventory/products/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0557 — Route smoke /inventory/levels

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /inventory/levels with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0558 — Route smoke /inventory/ledger

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /inventory/ledger with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0559 — Route smoke /inventory/transfers

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /inventory/transfers with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0560 — Route smoke /inventory/transfers/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /inventory/transfers/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0561 — Route smoke /inventory/adjustments

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /inventory/adjustments with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0562 — Route smoke /inventory/adjustments/new

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /inventory/adjustments/new with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0563 — Route smoke /company/details

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /company/details with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0564 — Route smoke /company/tax

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /company/tax with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0565 — Route smoke /company/sales

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /company/sales with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0566 — Route smoke /company/purchase

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /company/purchase with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0567 — Route smoke /company/inventory

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /company/inventory with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0568 — Route smoke /company/brands

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /company/brands with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0569 — Route smoke /company/locations

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /company/locations with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0570 — Route smoke /company/domains

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /company/domains with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0571 — Route smoke /docs

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /docs with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0572 — Route smoke /docs/getting-started

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /docs/getting-started with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0573 — Route smoke /docs/sales

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /docs/sales with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0574 — Route smoke /docs/purchase

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /docs/purchase with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0575 — Route smoke /docs/inventory

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /docs/inventory with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0576 — Route smoke /docs/accounting

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /docs/accounting with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0577 — Route smoke /docs/pos

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /docs/pos with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0578 — Route smoke /e2e

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /e2e with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0579 — Route smoke /login

- **Priority:** P1
- **Tags:** `@smoke`, `@routes`
- **Steps:**
  1. Navigate /login with appropriate auth
  2. Success; no error boundary
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0580 — Super-admin smoke /control-room

- **Priority:** P1
- **Tags:** `@platform`, `@smoke`
- **Steps:**
  1. As super_admin open /control-room
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0581 — Non-admin blocked /control-room

- **Priority:** P0
- **Tags:** `@platform`, `@security`
- **Steps:**
  1. As normal user open /control-room
  2. Redirect/forbidden
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0582 — Super-admin smoke /control-room/companies

- **Priority:** P1
- **Tags:** `@platform`, `@smoke`
- **Steps:**
  1. As super_admin open /control-room/companies
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0583 — Non-admin blocked /control-room/companies

- **Priority:** P0
- **Tags:** `@platform`, `@security`
- **Steps:**
  1. As normal user open /control-room/companies
  2. Redirect/forbidden
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0584 — Super-admin smoke /control-room/companies/new

- **Priority:** P1
- **Tags:** `@platform`, `@smoke`
- **Steps:**
  1. As super_admin open /control-room/companies/new
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0585 — Non-admin blocked /control-room/companies/new

- **Priority:** P0
- **Tags:** `@platform`, `@security`
- **Steps:**
  1. As normal user open /control-room/companies/new
  2. Redirect/forbidden
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0586 — Super-admin smoke /control-room/modules

- **Priority:** P1
- **Tags:** `@platform`, `@smoke`
- **Steps:**
  1. As super_admin open /control-room/modules
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0587 — Non-admin blocked /control-room/modules

- **Priority:** P0
- **Tags:** `@platform`, `@security`
- **Steps:**
  1. As normal user open /control-room/modules
  2. Redirect/forbidden
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0588 — Super-admin smoke /control-room/access

- **Priority:** P1
- **Tags:** `@platform`, `@smoke`
- **Steps:**
  1. As super_admin open /control-room/access
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0589 — Non-admin blocked /control-room/access

- **Priority:** P0
- **Tags:** `@platform`, `@security`
- **Steps:**
  1. As normal user open /control-room/access
  2. Redirect/forbidden
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0590 — Super-admin smoke /control-room/audit

- **Priority:** P1
- **Tags:** `@platform`, `@smoke`
- **Steps:**
  1. As super_admin open /control-room/audit
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0591 — Non-admin blocked /control-room/audit

- **Priority:** P0
- **Tags:** `@platform`, `@security`
- **Steps:**
  1. As normal user open /control-room/audit
  2. Redirect/forbidden
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0592 — Super-admin smoke /control-room/health-check

- **Priority:** P1
- **Tags:** `@platform`, `@smoke`
- **Steps:**
  1. As super_admin open /control-room/health-check
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0593 — Non-admin blocked /control-room/health-check

- **Priority:** P0
- **Tags:** `@platform`, `@security`
- **Steps:**
  1. As normal user open /control-room/health-check
  2. Redirect/forbidden
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 19. Integrity after operations


### S-0594 — TB balanced after mixed day

- **Priority:** P0
- **Tags:** `@reports`, `@integrity`
- **Steps:**
  1. After posts TB balances
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0595 — Journal debits always equal credits

- **Priority:** P0
- **Tags:** `@reports`, `@integrity`
- **Steps:**
  1. Any state
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0596 — AR aging = sum open invoices

- **Priority:** P0
- **Tags:** `@reports`, `@integrity`
- **Steps:**
  1. Compare
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0597 — AP aging = sum open bills

- **Priority:** P0
- **Tags:** `@reports`, `@integrity`
- **Steps:**
  1. Compare
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0598 — Stock on-hand = movement formula

- **Priority:** P0
- **Tags:** `@reports`, `@integrity`
- **Steps:**
  1. Purchases−sales+returns±adj±transfers
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0599 — Cash matches money reports

- **Priority:** P1
- **Tags:** `@reports`, `@integrity`
- **Steps:**
  1. Reconcile
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0600 — After reverse TB still balanced

- **Priority:** P0
- **Tags:** `@reports`, `@integrity`
- **Steps:**
  1. OK
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0601 — After period lock reports readable

- **Priority:** P1
- **Tags:** `@reports`, `@period`
- **Steps:**
  1. Read-only reports
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 20. UI/UX non-functional


### S-0602 — Product form uses tabs

- **Priority:** P1
- **Tags:** `@ux`
- **Steps:**
  1. Tabs not endless scroll
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0603 — Lists toolbar no page headers

- **Priority:** P1
- **Tags:** `@ux`
- **Steps:**
  1. Customers
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0604 — Confirm destructive actions

- **Priority:** P1
- **Tags:** `@ux`
- **Steps:**
  1. Dialog
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0605 — Success toast/message

- **Priority:** P2
- **Tags:** `@ux`
- **Steps:**
  1. On save
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0606 — Error message visible

- **Priority:** P1
- **Tags:** `@ux`
- **Steps:**
  1. On invalid
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0607 — Print layout clean

- **Priority:** P2
- **Tags:** `@ux`
- **Steps:**
  1. Invoice print
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0608 — Slow network single post

- **Priority:** P2
- **Tags:** `@ux`, `@edge`
- **Steps:**
  1. Throttle no double
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0609 — Large list usable

- **Priority:** P2
- **Tags:** `@ux`, `@scale`
- **Steps:**
  1. Many rows
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 21. Rare / stress / ops


### S-0610 — 100 invoices same customer

- **Priority:** P3
- **Tags:** `@scale`
- **Steps:**
  1. AR sum correct
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0611 — 100 products

- **Priority:** P3
- **Tags:** `@scale`
- **Steps:**
  1. Search works
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0612 — POS 50 sales one shift

- **Priority:** P2
- **Tags:** `@scale`, `@pos`
- **Steps:**
  1. Z totals match
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0613 — All modules nav no 500

- **Priority:** P1
- **Tags:** `@scale`
- **Steps:**
  1. Pro plan every link
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0614 — Starter plan inventory URL denied

- **Priority:** P1
- **Tags:** `@modules`, `@security`
- **Steps:**
  1. Direct URL blocked/empty
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0615 — Future dated payment handled

- **Priority:** P3
- **Tags:** `@rare`
- **Steps:**
  1. OK/warn
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0616 — TZ boundary Colombo posting

- **Priority:** P3
- **Tags:** `@rare`
- **Steps:**
  1. OK
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0617 — POS pay refresh storm

- **Priority:** P1
- **Tags:** `@rare`, `@pos`
- **Steps:**
  1. No double sale
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0618 — Deploy no auto demo seed

- **Priority:** P1
- **Tags:** `@ops`
- **Steps:**
  1. No demo products auto
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0619 — Deploy migrations only logs

- **Priority:** P1
- **Tags:** `@ops`
- **Steps:**
  1. No seed in entrypoint
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0620 — Public favicon/logo 200

- **Priority:** P3
- **Tags:** `@ops`
- **Steps:**
  1. Assets
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 22. Health-check suite step scenarios (mirror product suite)


### S-0621 — Health-check step 1: Preflight CoA/settings

- **Priority:** P0
- **Tags:** `@health`, `@platform`
- **Steps:**
  1. Staging company
  2. Run/assert step: Preflight CoA/settings
  3. Pass criteria per health-check panel
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0622 — Health-check step 2: Create physical product

- **Priority:** P0
- **Tags:** `@health`, `@platform`
- **Steps:**
  1. Staging company
  2. Run/assert step: Create physical product
  3. Pass criteria per health-check panel
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0623 — Health-check step 3: Purchase bill stock+GL

- **Priority:** P0
- **Tags:** `@health`, `@platform`
- **Steps:**
  1. Staging company
  2. Run/assert step: Purchase bill stock+GL
  3. Pass criteria per health-check panel
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0624 — Health-check step 4: Pay vendor

- **Priority:** P0
- **Tags:** `@health`, `@platform`
- **Steps:**
  1. Staging company
  2. Run/assert step: Pay vendor
  3. Pass criteria per health-check panel
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0625 — Health-check step 5: Sales invoice stock+GL

- **Priority:** P0
- **Tags:** `@health`, `@platform`
- **Steps:**
  1. Staging company
  2. Run/assert step: Sales invoice stock+GL
  3. Pass criteria per health-check panel
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0626 — Health-check step 6: Sales return

- **Priority:** P0
- **Tags:** `@health`, `@platform`
- **Steps:**
  1. Staging company
  2. Run/assert step: Sales return
  3. Pass criteria per health-check panel
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0627 — Health-check step 7: PO+GRN path

- **Priority:** P0
- **Tags:** `@health`, `@platform`
- **Steps:**
  1. Staging company
  2. Run/assert step: PO+GRN path
  3. Pass criteria per health-check panel
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0628 — Health-check step 8: Tax VAT invoice

- **Priority:** P0
- **Tags:** `@health`, `@platform`
- **Steps:**
  1. Staging company
  2. Run/assert step: Tax VAT invoice
  3. Pass criteria per health-check panel
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0629 — Health-check step 9: Simple Entry sample

- **Priority:** P0
- **Tags:** `@health`, `@platform`
- **Steps:**
  1. Staging company
  2. Run/assert step: Simple Entry sample
  3. Pass criteria per health-check panel
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0630 — Health-check step 10: Credit limit block

- **Priority:** P0
- **Tags:** `@health`, `@platform`
- **Steps:**
  1. Staging company
  2. Run/assert step: Credit limit block
  3. Pass criteria per health-check panel
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0631 — Health-check step 11: Negative stock block

- **Priority:** P0
- **Tags:** `@health`, `@platform`
- **Steps:**
  1. Staging company
  2. Run/assert step: Negative stock block
  3. Pass criteria per health-check panel
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0632 — Health-check step 12: POS cash sale

- **Priority:** P0
- **Tags:** `@health`, `@platform`
- **Steps:**
  1. Staging company
  2. Run/assert step: POS cash sale
  3. Pass criteria per health-check panel
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0633 — Health-check step 13: Average cost purchases

- **Priority:** P0
- **Tags:** `@health`, `@platform`
- **Steps:**
  1. Staging company
  2. Run/assert step: Average cost purchases
  3. Pass criteria per health-check panel
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0634 — Health-check step 14: Multi-location transfer

- **Priority:** P0
- **Tags:** `@health`, `@platform`
- **Steps:**
  1. Staging company
  2. Run/assert step: Multi-location transfer
  3. Pass criteria per health-check panel
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0635 — Health-check step 15: Final TB + stock formula

- **Priority:** P0
- **Tags:** `@health`, `@platform`
- **Steps:**
  1. Staging company
  2. Run/assert step: Final TB + stock formula
  3. Pass criteria per health-check panel
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 23. Quantity/price micro-matrix


### S-0636 — Line math qty=1 price=100

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 1 price 100
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0637 — Line math qty=1 price=999.99

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 1 price 999.99
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0638 — Line math qty=1 price=1500

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 1 price 1500
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0639 — Line math qty=1 price=0

- **Priority:** P2
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 1 price 0
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0640 — Line math qty=2 price=100

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 2 price 100
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0641 — Line math qty=2 price=999.99

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 2 price 999.99
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0642 — Line math qty=2 price=1500

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 2 price 1500
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0643 — Line math qty=2 price=0

- **Priority:** P2
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 2 price 0
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0644 — Line math qty=5 price=100

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 5 price 100
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0645 — Line math qty=5 price=999.99

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 5 price 999.99
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0646 — Line math qty=5 price=1500

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 5 price 1500
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0647 — Line math qty=5 price=0

- **Priority:** P2
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 5 price 0
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0648 — Line math qty=10 price=100

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 10 price 100
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0649 — Line math qty=10 price=999.99

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 10 price 999.99
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0650 — Line math qty=10 price=1500

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 10 price 1500
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0651 — Line math qty=10 price=0

- **Priority:** P2
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 10 price 0
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0652 — Line math qty=0.5 price=100

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 0.5 price 100
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0653 — Line math qty=0.5 price=999.99

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 0.5 price 999.99
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0654 — Line math qty=0.5 price=1500

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 0.5 price 1500
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0655 — Line math qty=12.25 price=100

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 12.25 price 100
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0656 — Line math qty=12.25 price=999.99

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 12.25 price 999.99
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0657 — Line math qty=12.25 price=1500

- **Priority:** P1
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 12.25 price 1500
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0658 — Line math qty=12.25 price=0

- **Priority:** P2
- **Tags:** `@numeric`, `@matrix`
- **Steps:**
  1. Create invoice line qty 12.25 price 0
  2. Assert line total and doc total
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 24. Payment method matrices


### S-0659 — Receive AR payment via Cash

- **Priority:** P1
- **Tags:** `@payment`, `@matrix`
- **Steps:**
  1. Pay open invoice using Cash account
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0660 — Pay AP bill via Cash

- **Priority:** P1
- **Tags:** `@payment`, `@matrix`
- **Steps:**
  1. Pay open bill using Cash
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0661 — Receive AR payment via Bank

- **Priority:** P1
- **Tags:** `@payment`, `@matrix`
- **Steps:**
  1. Pay open invoice using Bank account
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0662 — Pay AP bill via Bank

- **Priority:** P1
- **Tags:** `@payment`, `@matrix`
- **Steps:**
  1. Pay open bill using Bank
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0663 — Receive AR payment via Card

- **Priority:** P1
- **Tags:** `@payment`, `@matrix`
- **Steps:**
  1. Pay open invoice using Card account
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0664 — Pay AP bill via Card

- **Priority:** P1
- **Tags:** `@payment`, `@matrix`
- **Steps:**
  1. Pay open bill using Card
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 25. Document status transitions


### S-0665 — Status quotation: draft -> converted

- **Priority:** P0
- **Tags:** `@status`, `@matrix`
- **Steps:**
  1. Via: Convert to SO
  2. Assert status field and side effects
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0666 — Status sales_order: confirmed -> fully_invoiced

- **Priority:** P0
- **Tags:** `@status`, `@matrix`
- **Steps:**
  1. Via: Convert to invoice
  2. Assert status field and side effects
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0667 — Status sales_invoice: open -> partial

- **Priority:** P0
- **Tags:** `@status`, `@matrix`
- **Steps:**
  1. Via: Partial payment
  2. Assert status field and side effects
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0668 — Status sales_invoice: partial -> paid

- **Priority:** P0
- **Tags:** `@status`, `@matrix`
- **Steps:**
  1. Via: Final payment
  2. Assert status field and side effects
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0669 — Status sales_invoice: open -> paid

- **Priority:** P0
- **Tags:** `@status`, `@matrix`
- **Steps:**
  1. Via: Full payment
  2. Assert status field and side effects
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0670 — Status purchase_order: confirmed -> received

- **Priority:** P0
- **Tags:** `@status`, `@matrix`
- **Steps:**
  1. Via: Full GRN
  2. Assert status field and side effects
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0671 — Status purchase: open -> partial

- **Priority:** P0
- **Tags:** `@status`, `@matrix`
- **Steps:**
  1. Via: Partial vendor pay
  2. Assert status field and side effects
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0672 — Status purchase: partial -> paid

- **Priority:** P0
- **Tags:** `@status`, `@matrix`
- **Steps:**
  1. Via: Final vendor pay
  2. Assert status field and side effects
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0673 — Status purchase: pending_approval -> open

- **Priority:** P0
- **Tags:** `@status`, `@matrix`
- **Steps:**
  1. Via: Approve bill
  2. Assert status field and side effects
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0674 — Status purchase: pending_approval -> rejected

- **Priority:** P0
- **Tags:** `@status`, `@matrix`
- **Steps:**
  1. Via: Reject bill
  2. Assert status field and side effects
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0675 — Status cash_purchase: n/a -> paid

- **Priority:** P0
- **Tags:** `@status`, `@matrix`
- **Steps:**
  1. Via: Create cash purchase
  2. Assert status field and side effects
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0676 — Status pos_sale: n/a -> paid

- **Priority:** P0
- **Tags:** `@status`, `@matrix`
- **Steps:**
  1. Via: Complete POS sale
  2. Assert status field and side effects
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0677 — Status sales_return: open -> refunded

- **Priority:** P0
- **Tags:** `@status`, `@matrix`
- **Steps:**
  1. Via: Cash return settle if applicable
  2. Assert status field and side effects
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0678 — Status goods_receipt: n/a -> received

- **Priority:** P0
- **Tags:** `@status`, `@matrix`
- **Steps:**
  1. Via: Post GRN
  2. Assert status field and side effects
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 26. Reports x period matrix


### S-0679 — Report pnl period=current_month

- **Priority:** P1
- **Tags:** `@reports`, `@matrix`
- **Steps:**
  1. Open /reports?report=pnl
  2. Set period current_month
  3. Renders without error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0680 — Report pnl period=previous_month

- **Priority:** P1
- **Tags:** `@reports`, `@matrix`
- **Steps:**
  1. Open /reports?report=pnl
  2. Set period previous_month
  3. Renders without error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0681 — Report pnl period=all

- **Priority:** P1
- **Tags:** `@reports`, `@matrix`
- **Steps:**
  1. Open /reports?report=pnl
  2. Set period all
  3. Renders without error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0682 — Report balance period=current_month

- **Priority:** P1
- **Tags:** `@reports`, `@matrix`
- **Steps:**
  1. Open /reports?report=balance
  2. Set period current_month
  3. Renders without error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0683 — Report balance period=previous_month

- **Priority:** P1
- **Tags:** `@reports`, `@matrix`
- **Steps:**
  1. Open /reports?report=balance
  2. Set period previous_month
  3. Renders without error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0684 — Report balance period=all

- **Priority:** P1
- **Tags:** `@reports`, `@matrix`
- **Steps:**
  1. Open /reports?report=balance
  2. Set period all
  3. Renders without error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0685 — Report cashflow period=current_month

- **Priority:** P1
- **Tags:** `@reports`, `@matrix`
- **Steps:**
  1. Open /reports?report=cashflow
  2. Set period current_month
  3. Renders without error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0686 — Report cashflow period=previous_month

- **Priority:** P1
- **Tags:** `@reports`, `@matrix`
- **Steps:**
  1. Open /reports?report=cashflow
  2. Set period previous_month
  3. Renders without error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0687 — Report cashflow period=all

- **Priority:** P1
- **Tags:** `@reports`, `@matrix`
- **Steps:**
  1. Open /reports?report=cashflow
  2. Set period all
  3. Renders without error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0688 — Report ledger period=current_month

- **Priority:** P1
- **Tags:** `@reports`, `@matrix`
- **Steps:**
  1. Open /reports?report=ledger
  2. Set period current_month
  3. Renders without error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0689 — Report ledger period=previous_month

- **Priority:** P1
- **Tags:** `@reports`, `@matrix`
- **Steps:**
  1. Open /reports?report=ledger
  2. Set period previous_month
  3. Renders without error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0690 — Report ledger period=all

- **Priority:** P1
- **Tags:** `@reports`, `@matrix`
- **Steps:**
  1. Open /reports?report=ledger
  2. Set period all
  3. Renders without error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0691 — Report trial period=current_month

- **Priority:** P1
- **Tags:** `@reports`, `@matrix`
- **Steps:**
  1. Open /reports?report=trial
  2. Set period current_month
  3. Renders without error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0692 — Report trial period=previous_month

- **Priority:** P1
- **Tags:** `@reports`, `@matrix`
- **Steps:**
  1. Open /reports?report=trial
  2. Set period previous_month
  3. Renders without error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0693 — Report trial period=all

- **Priority:** P1
- **Tags:** `@reports`, `@matrix`
- **Steps:**
  1. Open /reports?report=trial
  2. Set period all
  3. Renders without error
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## 27. Company settings pages save


### S-0694 — Save company details settings

- **Priority:** P0
- **Tags:** `@company`, `@settings`
- **Steps:**
  1. Open /company/details
  2. Change legal profile
  3. Save
  4. Reload persists
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0695 — Save company tax settings

- **Priority:** P0
- **Tags:** `@company`, `@settings`
- **Steps:**
  1. Open /company/tax
  2. Change tax profile
  3. Save
  4. Reload persists
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0696 — Save company sales settings

- **Priority:** P0
- **Tags:** `@company`, `@settings`
- **Steps:**
  1. Open /company/sales
  2. Change VAT and registers
  3. Save
  4. Reload persists
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0697 — Save company purchase settings

- **Priority:** P0
- **Tags:** `@company`, `@settings`
- **Steps:**
  1. Open /company/purchase
  2. Change AP/GRN settings
  3. Save
  4. Reload persists
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

### S-0698 — Save company inventory settings

- **Priority:** P0
- **Tags:** `@company`, `@settings`
- **Steps:**
  1. Open /company/inventory
  2. Change costing/negative stock
  3. Save
  4. Reload persists
- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.

## Catalog statistics

| Metric | Value |
|--------|------:|
| **Total scenarios** | **698** |
| ID range | S-0001 … S-0698 |

## Suggested Playwright packaging (later)

1. `@smoke` — login + route loads
2. `@p0` / integrity journeys
3. Module packs: `@sales` `@purchase` `@pos` `@inventory` `@accounting`
4. `@edge` validation + mid-op
5. `@platform` super-admin
6. `@matrix` nightly combinatorics
7. `@scale` weekly volume

## Traceability

| Area | Primary code |
|------|----------------|
| Commercial docs | `commercial-docs.ts` |
| Settings | sales/purchase/inventory settings actions |
| Stock | `inventory.ts` |
| POS | `pos-session.ts`, `pos-terminal.tsx` |
| Accounting | `record-entry.ts`, workspace reports |
| Platform | `platform.ts`, `health-check.ts` |
| Dimensions | `dimensions.ts` |

---

*Catalog complete. Next: implement Playwright specs mapped to these IDs/tags.*
