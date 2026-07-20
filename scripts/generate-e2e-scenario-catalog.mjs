/**
 * Generates docs/E2E_SCENARIO_CATALOG.md — comprehensive manual/Playwright scenario list.
 * Run: node scripts/generate-e2e-scenario-catalog.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'E2E_SCENARIO_CATALOG.md');
const lines = [];
const push = (s) => lines.push(s);
let n = 0;

function scen(title, steps, tags = [], priority = 'P1') {
  n += 1;
  const id = `S-${String(n).padStart(4, '0')}`;
  push('');
  push(`### ${id} — ${title}`);
  push('');
  push(`- **Priority:** ${priority}`);
  if (tags.length) push(`- **Tags:** ${tags.map((t) => `\`${t}\``).join(', ')}`);
  push('- **Steps:**');
  steps.forEach((st, i) => push(`  ${i + 1}. ${st}`));
  push(
    '- **Expect:** Valid path succeeds with consistent books/stock/UI; invalid path is blocked with a clear error and no corrupt partial postings.',
  );
  return id;
}

push('# BookOne - Comprehensive E2E Scenario Catalog');
push('');
push('> **Purpose:** Exhaustive day-to-day and edge-case scenarios for future Playwright automation.');
push('> **Scope:** Tenant ERP + super-admin Control Room + public surfaces.');
push('> **Status:** Scenario design only - **not yet automated**.');
push('> **Source:** Routes, server actions, settings, and validations in the BookOne monorepo.');
push('');
push('## How to use');
push('');
push('1. Each scenario has a stable ID `S-NNNN`.');
push('2. **Priority:** `P0` critical money/stock | `P1` core daily ops | `P2` important | `P3` rare.');
push('3. **Tags** filter suites (e.g. `@sales`, `@pos`, `@edge`, `@security`).');
push('4. Default preconditions: logged-in tenant, CoA present, LKR; brand/location rules apply when masters exist.');
push('5. After postings: assert Journal balance, stock levels, and report impact where relevant.');
push('');
push('## Global automation conventions');
push('');
push('| Convention | Rule |');
push('|------------|------|');
push('| Auth | Dedicated E2E user; prefer **staging** company |');
push('| Isolation | Unique codes/SKUs/names with timestamp seed |');
push('| Cleanup | Archive, or staging health-check / master wipe |');
push('| Assertions | UI + list + journal/stock/report |');
push('| Failures | Clear error; **no silent wrong balances** |');
push('');

// 1 Auth
push('## 1. Authentication & session');
push('');
scen('Open login page unauthenticated', ['Open `/login`', 'See Sign In form'], ['@auth', '@public'], 'P0');
scen('Login valid credentials', ['Valid email/password', 'Submit', 'Leave `/login`; app shell visible'], ['@auth'], 'P0');
scen('Login wrong password', ['Wrong password', 'Error; stay on login'], ['@auth', '@edge'], 'P0');
scen('Login unknown email', ['Unknown email', 'Error'], ['@auth', '@edge'], 'P1');
scen('Login empty fields', ['Submit empty', 'Required validation'], ['@auth', '@edge'], 'P2');
scen('Login short password', ['Password < 8', 'Blocked or error'], ['@auth', '@edge'], 'P2');
scen('Remember me on', ['Login with Remember me', 'Session persists per cookie rules'], ['@auth'], 'P2');
scen('Remember me off', ['Login without Remember me', 'Session-scoped'], ['@auth'], 'P3');
scen('Deep link redirect after login', ['Open `/sales/invoices` logged out', 'Login with `from`', 'Return to invoices'], ['@auth'], 'P0');
scen('Authed user hits /login', ['While logged in open `/login`', 'Redirect home'], ['@auth'], 'P1');
scen('Sign up new account', ['Sign Up fields', 'Submit', 'Success/verify message'], ['@auth'], 'P1');
scen('Sign up password mismatch', ['Confirm ≠ password', 'Error'], ['@auth', '@edge'], 'P1');
scen('Forgot password without email', ['Forgot with empty email', 'Prompt for email'], ['@auth', '@edge'], 'P2');
scen('Forgot password with email', ['Request reset', 'Confirmation message'], ['@auth'], 'P2');
scen('Reset password page loads', ['Open `/reset-password`', 'Form usable'], ['@auth'], 'P2');
scen('Sign out', ['Sign out', 'Protected routes → login'], ['@auth'], 'P0');
scen('Legacy password migration login', ['Legacy user path migrates then logs in'], ['@auth', '@edge'], 'P3');
scen('Google button when configured', ['See Google control if enabled'], ['@auth'], 'P3');
scen('No session blocks /dashboard', ['Clear cookies', 'Open dashboard', 'Login redirect'], ['@auth', '@security'], 'P0');
scen('Static assets not redirected to login', ['Load `/_next/static` or logo', 'Not HTML login page'], ['@auth'], 'P1');

// 2 Public
push('');
push('## 2. Public surfaces (docs & E2E console)');
push('');
scen('Docs home without login', ['Open `/docs` logged out', 'Not redirected to login'], ['@docs', '@public'], 'P0');
scen('Docs getting-started pages', ['Open each getting-started page'], ['@docs'], 'P1');
scen('Docs sales section', ['Open sales docs pages'], ['@docs'], 'P2');
scen('Docs purchase section', ['Open purchase docs'], ['@docs'], 'P2');
scen('Docs inventory section', ['Open inventory docs'], ['@docs'], 'P2');
scen('Docs accounting section', ['Open accounting docs'], ['@docs'], 'P2');
scen('Docs POS section', ['Open POS docs'], ['@docs'], 'P2');
scen('Docs search API public', ['`GET /api/search?q=invoice` no session', 'JSON'], ['@docs', '@public'], 'P1');
scen('Docs search empty query', ['Empty q', 'Handled'], ['@docs'], 'P3');
scen('Docs exclude admin content', ['No health-check/control-room/master wipe docs'], ['@docs', '@security'], 'P1');
scen('E2E console at /e2e public', ['Open `/e2e` logged out', 'UI loads'], ['@e2e', '@public'], 'P1');
scen('E2E start needs credentials', ['Start without email/password', 'Error'], ['@e2e', '@edge'], 'P1');
scen('E2E report download after run', ['Complete a run', 'Download report/log/bundle'], ['@e2e'], 'P1');

// 3 Shell
push('');
push('## 3. Shell, navigation, period, module gating');
push('');
scen('Sidebar suite expands', ['Click Sales', 'Children visible'], ['@shell'], 'P0');
scen('Sidebar suite collapses on second click', ['Click open suite again', 'Children hide'], ['@shell'], 'P0');
scen('Visit all accounting nav links', ['Simple Entry through Docs'], ['@shell', '@accounting'], 'P0');
scen('Visit customers and vendors', ['Both lists'], ['@shell', '@parties'], 'P0');
scen('Period picker sets URL', ['Dashboard period', '`period=YYYY-MM`'], ['@shell', '@period'], 'P0');
scen('Period all-time', ['Select all', 'URL reflects all'], ['@period'], 'P1');
scen('Period filters journal', ['Post month A', 'Journal month B empty of that entry'], ['@period'], 'P0');
scen('Sales module off hides suite', ['modules.sales false', 'No Sales nav'], ['@modules'], 'P0');
scen('Purchase module off hides suite', ['modules.purchase false'], ['@modules'], 'P0');
scen('Inventory module off hides suite', ['modules.inventory false'], ['@modules'], 'P0');
scen('POS module off hides POS items', ['modules.pos false', 'No POS terminal in nav'], ['@modules', '@pos'], 'P0');
scen('Control Room hidden for normal user', ['Non super_admin', 'No Control Room'], ['@security'], 'P0');
scen('Control Room for super_admin', ['super_admin sees Control Room'], ['@platform'], 'P0');
scen('Collapse sidebar', ['Toggle collapse', 'Expand again'], ['@shell'], 'P2');
scen('Topbar shows company name', ['Correct tenant name'], ['@shell'], 'P1');
scen('Accounting screens without PageHeading', ['Dashboard/journal/transactions/reports/accounts/recon', 'No large page headers'], ['@ux'], 'P1');

// 4 Company
push('');
push('## 4. Company masters');
push('');
scen('Open company details', ['Company → Details'], ['@company'], 'P0');
scen('Save legal name', ['Change legal name', 'Persists'], ['@company'], 'P0');
scen('Save trading name and address', ['Update address', 'Save'], ['@company'], 'P1');
scen('Save phone email', ['Update contact'], ['@company'], 'P2');
scen('Default currency LKR', ['See LKR'], ['@company'], 'P1');
scen('Default timezone Colombo', ['See Asia/Colombo'], ['@company'], 'P2');
scen('Save TIN', ['Tax → TIN'], ['@company', '@tax'], 'P0');
scen('Save VAT number', ['VAT field'], ['@company', '@tax'], 'P1');
scen('Save SVAT', ['SVAT field'], ['@company', '@tax'], 'P2');
scen('Invoice/bill prefixes', ['Change prefixes', 'New docs use them'], ['@company', '@tax'], 'P1');
scen('Create financial year', ['Add FY'], ['@company'], 'P1');
scen('Create brand', ['Brands → create'], ['@company', '@brand'], 'P0');
scen('Create second brand', ['Another brand'], ['@company', '@brand'], 'P0');
scen('Edit brand', ['Rename brand'], ['@company', '@brand'], 'P1');
scen('Create location no brand', ['Locations → create'], ['@company', '@location'], 'P0');
scen('Create location with brand', ['Link brand'], ['@company', '@location', '@brand'], 'P0');
scen('Create second location', ['Second warehouse'], ['@company', '@location'], 'P0');
scen('Edit location type/address', ['Update'], ['@company', '@location'], 'P2');
scen('Add domain pending', ['Domains → add', 'Token shown'], ['@company'], 'P2');
scen('Verify domain', ['Mark verified'], ['@company'], 'P2');
scen('Create second company', ['Create company', 'In list'], ['@company', '@multitenant'], 'P1');
scen('Switch company', ['Switch', 'Data isolated'], ['@company', '@multitenant'], 'P0');
scen('Switch back company', ['Original data'], ['@company', '@multitenant'], 'P0');
scen('Commercial form requires brand when brands exist', ['≥1 brand', 'Brand required on invoice'], ['@brand'], 'P0');
scen('Commercial form requires location when locations exist', ['≥1 location', 'Location required'], ['@location'], 'P0');
scen('Single brand auto-selected', ['One brand defaults'], ['@brand'], 'P1');
scen('Single location auto-selected', ['One location defaults'], ['@location'], 'P1');
scen('Location brand inference on form', ['Pick location with brand', 'Brand updates'], ['@brand', '@location'], 'P2');
scen('Simple Entry brand required', ['Brands exist', 'Must pick brand'], ['@accounting', '@brand'], 'P0');
scen('Simple Entry location required', ['Locations exist', 'Must pick location'], ['@accounting', '@location'], 'P0');

// 5 Settings
push('');
push('## 5. Settings behavior matrix');
push('');
scen('Enable VAT registered', ['Sales settings VAT on'], ['@settings', '@tax'], 'P0');
scen('Disable VAT registered', ['VAT off'], ['@settings', '@tax'], 'P1');
scen('VAT rate 18%', ['Local tax invoice 18%'], ['@settings', '@tax'], 'P0');
scen('Export VAT 0%', ['Export tax invoice 0%'], ['@settings', '@tax'], 'P1');
scen('Tax invoice dept code', ['Dept 02 in number'], ['@settings', '@tax'], 'P2');
scen('Credit limit enforce on', ['Enable enforce'], ['@settings', '@credit'], 'P0');
scen('Credit limit enforce off', ['Disable'], ['@settings', '@credit'], 'P1');
scen('Bill approval on', ['Bills pending_approval'], ['@settings', '@purchase'], 'P0');
scen('Bill approval off', ['Bills post immediately'], ['@settings', '@purchase'], 'P0');
scen('Supplier invoice required', ['Bill without # fails'], ['@settings', '@purchase'], 'P0');
scen('Block duplicate supplier invoices', ['Second same vendor+# fails'], ['@settings', '@purchase'], 'P0');
scen('Allow duplicate supplier invoices', ['Setting off allows'], ['@settings', '@edge'], 'P2');
scen('Require GRN before bill on', ['Bill from PO without GRN fails'], ['@settings', '@grn'], 'P0');
scen('Require GRN before bill off', ['Bill without GRN ok'], ['@settings'], 'P1');
scen('GRNI on receipt on', ['GRN posts 5100/2150'], ['@settings', '@grn'], 'P0');
scen('GRNI on receipt off', ['No GRNI path'], ['@settings', '@grn'], 'P1');
scen('Costing last', ['Last unit cost on product'], ['@settings', '@inventory'], 'P0');
scen('Costing average', ['Weighted average unit cost'], ['@settings', '@inventory'], 'P0');
scen('Negative stock allow', ['Oversell ok'], ['@settings', '@inventory'], 'P0');
scen('Negative stock block', ['Oversell fails'], ['@settings', '@inventory'], 'P0');
scen('Create POS register', ['Add register'], ['@settings', '@pos'], 'P0');
scen('POS register with location', ['Assign location'], ['@settings', '@pos', '@location'], 'P0');
scen('POS register print thermal', ['Print mode thermal'], ['@settings', '@pos'], 'P2');
scen('Archive last active register blocked', ['Only one active', 'Archive fails'], ['@settings', '@pos', '@edge'], 'P1');
scen('Archive register when multiple', ['Archive non-last ok'], ['@settings', '@pos'], 'P1');
scen('Default payment terms', ['Net 30 default on forms'], ['@settings'], 'P2');
scen('Default expense account', ['Cash purchase default expense'], ['@settings'], 'P2');

// 6 Products
push('');
push('## 6. Products & stock');
push('');
for (const t of ['physical', 'digital', 'service']) {
  scen(`Create ${t} product minimal`, ['New product', `Type ${t}`, 'SKU prices', 'Listed'], ['@inventory', '@product'], 'P0');
}
scen('Physical with opening stock', ['Opening qty > 0', 'Level increases'], ['@inventory', '@stock'], 'P0');
scen('Product with barcode', ['Barcode set', 'Searchable'], ['@inventory'], 'P1');
scen('Product with category', ['Category set'], ['@inventory'], 'P2');
scen('Product with image', ['Upload image', 'Shows in UI'], ['@inventory'], 'P1');
scen('Product cost < sell', ['Normal margin'], ['@inventory'], 'P0');
scen('Product cost = sell', ['Allowed'], ['@inventory', '@edge'], 'P2');
scen('Product cost > sell', ['Loss leader allowed'], ['@inventory', '@edge'], 'P2');
scen('Duplicate SKU rejected', ['Second same SKU errors'], ['@inventory', '@edge'], 'P0');
scen('Edit product name/prices', ['Update', 'Lists refresh'], ['@inventory'], 'P0');
scen('Type locked when applicable', ['typeLocked disables type change'], ['@inventory', '@edge'], 'P2');
scen('Archive product', ['Archived hidden from active'], ['@inventory'], 'P0');
scen('Restore product', ['Active again'], ['@inventory'], 'P0');
scen('Delete unused product', ['No history', 'Deleted'], ['@inventory'], 'P1');
scen('Delete product with history blocked', ['Blockers shown'], ['@inventory', '@edge'], 'P0');
scen('Search products by name', ['Partial name filter'], ['@inventory'], 'P1');
scen('Search products by SKU', ['SKU filter'], ['@inventory'], 'P1');
scen('Stock levels page', ['Shows on-hand'], ['@inventory', '@stock'], 'P0');
scen('Low stock filter', ['`?low=1`'], ['@inventory'], 'P1');
scen('Stock ledger after movements', ['Shows purchase/sale lines'], ['@inventory', '@stock'], 'P0');
scen('Create 20 products scale', ['20 unique SKUs'], ['@inventory', '@scale'], 'P2');
scen('Digital sale no stock move', ['Invoice digital', 'No qty change'], ['@inventory', '@sales'], 'P0');
scen('Service sale no stock move', ['Invoice service', 'No qty change'], ['@inventory', '@sales'], 'P0');
scen('Physical sale decreases stock', ['Buy then sell', 'qty = buy-sell'], ['@inventory', '@sales'], 'P0');
scen('Physical purchase increases stock', ['Purchase', 'qty up'], ['@inventory', '@purchase'], 'P0');
scen('Transfer A→B', ['Stock moves', 'No GL'], ['@inventory', '@transfer'], 'P0');
scen('Transfer same location rejected', ['from=to error'], ['@inventory', '@transfer', '@edge'], 'P0');
scen('Transfer non-physical rejected', ['Digital transfer error'], ['@inventory', '@transfer', '@edge'], 'P1');
scen('Transfer over qty with block fails', ['Block policy', 'Error'], ['@inventory', '@transfer', '@edge'], 'P0');
scen('Transfer partial qty', ['Half moves'], ['@inventory', '@transfer'], 'P1');
scen('Adjustment increase', ['+qty + GL'], ['@inventory', '@adjustment'], 'P0');
scen('Adjustment decrease', ['-qty + GL'], ['@inventory', '@adjustment'], 'P0');
scen('Adjustment to zero', ['Level 0'], ['@inventory', '@adjustment'], 'P1');
scen('Adjustment negative with block fails', ['Error'], ['@inventory', '@adjustment', '@edge'], 'P0');
scen('Transfers list shows doc', ['After transfer listed'], ['@inventory'], 'P1');
scen('Adjustments list shows doc', ['After adjustment listed'], ['@inventory'], 'P1');
scen('Quick-create product from free-text line', ['Sales line free text save-as product'], ['@inventory', '@sales'], 'P1');

// 7 Parties
push('');
push('## 7. Parties');
push('');
scen('Create customer minimal', ['Name essentials', 'Listed'], ['@parties'], 'P0');
scen('Create customer with code', ['Code set'], ['@parties'], 'P1');
scen('Create customer individual', ['Type individual'], ['@parties'], 'P1');
scen('Create customer company', ['Type company'], ['@parties'], 'P1');
scen('Create customer credit limit', ['Limit 100000'], ['@parties', '@credit'], 'P0');
scen('Create customer tax IDs', ['TIN/VAT'], ['@parties', '@tax'], 'P1');
scen('Create customer addresses', ['Billing/shipping'], ['@parties'], 'P2');
scen('Create customer bank details', ['Bank fields'], ['@parties'], 'P2');
scen('Create vendor minimal', ['Vendor listed'], ['@parties'], 'P0');
scen('Create vendor payment terms', ['Terms days'], ['@parties'], 'P1');
scen('Create dual-role party', ['Customer+vendor'], ['@parties'], 'P1');
scen('Edit customer', ['Rename', 'Selectors update'], ['@parties'], 'P0');
scen('Archive customer', ['Not in active options'], ['@parties'], 'P0');
scen('Restore customer', ['Active'], ['@parties'], 'P0');
scen('Delete unused customer', ['Deleted'], ['@parties'], 'P1');
scen('Delete customer with invoices blocked', ['Blockers'], ['@parties', '@edge'], 'P0');
scen('Blocked customer cannot receive new sales', ['Status blocked', 'Post fails'], ['@parties', '@edge'], 'P0');
scen('Inactive customer cannot post', ['Inactive fails'], ['@parties', '@edge'], 'P0');
scen('Search customers', ['Name/code/phone'], ['@parties'], 'P1');
scen('Search vendors', ['Filters'], ['@parties'], 'P1');
scen('Duplicate TIN handling', ['Per product rules'], ['@parties', '@edge'], 'P1');
scen('Ensure party from free-text name', ['New name on invoice creates party'], ['@parties', '@sales'], 'P0');
scen('Customer open AR display', ['After unpaid invoice'], ['@parties'], 'P1');
scen('Vendor open AP display', ['After unpaid bill'], ['@parties'], 'P1');
scen('Create 50 customers scale', ['List usable'], ['@parties', '@scale'], 'P3');
for (const role of ['customer', 'vendor']) {
  for (const op of ['create', 'edit', 'archive', 'restore']) {
    scen(`${role} ${op} happy path`, [`Perform ${op}`, 'UI consistent'], ['@parties', '@matrix'], 'P1');
  }
}

// 8 Sales
push('');
push('## 8. Sales lifecycle');
push('');
scen('Create quotation', ['Customer+lines', 'Draft listed'], ['@sales', '@quotation'], 'P0');
scen('Quotation brand+location', ['Dimensions saved'], ['@sales', '@brand', '@location'], 'P0');
scen('Quotation multi-line mixed types', ['Physical+service totals'], ['@sales'], 'P0');
scen('Quotation fixed discount', ['Total reduced'], ['@sales', '@discount'], 'P1');
scen('Quotation percent discount', ['Total reduced'], ['@sales', '@discount'], 'P1');
scen('Quotation discount master', ['Select discount entity'], ['@sales', '@discount'], 'P1');
scen('Edit quotation header', ['Notes/date when not posted'], ['@sales'], 'P1');
scen('Convert QT→SO', ['SO created'], ['@sales'], 'P0');
scen('Archive quotation', ['Archived'], ['@sales'], 'P2');
scen('Delete unconverted quotation', ['Deleted'], ['@sales'], 'P1');
scen('Delete converted quotation blocked', ['Error'], ['@sales', '@edge'], 'P0');
scen('Create sales order direct', ['Confirmed SO'], ['@sales', '@order'], 'P0');
scen('Convert SO→invoice', ['Open AR invoice'], ['@sales'], 'P0');
scen('Full SO to invoice', ['SO fully invoiced'], ['@sales'], 'P1');
scen('Multi-SO same customer one invoice', ['Combine'], ['@sales'], 'P0');
scen('Multi-SO different customers fails', ['Error'], ['@sales', '@edge'], 'P0');
scen('SO no GL', ['No journal'], ['@sales', '@accounting'], 'P0');
scen('SO no stock move', ['Stock unchanged'], ['@sales', '@stock'], 'P0');
scen('Commercial credit invoice', ['Open AR + GL'], ['@sales', '@invoice'], 'P0');
scen('Commercial cash invoice', ['Paid + cash GL'], ['@sales', '@invoice'], 'P0');
scen('Tax invoice local VAT', ['Output VAT'], ['@sales', '@tax'], 'P0');
scen('Tax invoice export 0 VAT', ['Export channel'], ['@sales', '@tax'], 'P1');
scen('Invoice physical reduces stock+COGS', ['Stock down'], ['@sales', '@stock'], 'P0');
scen('Invoice services only no stock', ['No stock'], ['@sales'], 'P0');
scen('Invoice print', ['Print route'], ['@sales'], 'P1');
scen('Invoice detail', ['Lines/totals/status'], ['@sales'], 'P0');
scen('Credit limit blocks over-limit', ['Enforce on', 'Blocked'], ['@sales', '@credit', '@edge'], 'P0');
scen('Credit limit allows under', ['Succeeds'], ['@sales', '@credit'], 'P0');
scen('Credit limit off allows over', ['Succeeds'], ['@sales', '@credit'], 'P1');
scen('Invoice missing brand multi-brand fails', ['Error'], ['@sales', '@brand', '@edge'], 'P0');
scen('Invoice missing location multi-loc fails', ['Error'], ['@sales', '@location', '@edge'], 'P0');
scen('Receive full payment', ['Invoice paid'], ['@sales', '@payment'], 'P0');
scen('Receive partial payment', ['Partial status'], ['@sales', '@payment'], 'P0');
scen('Receive remaining payment', ['Paid'], ['@sales', '@payment'], 'P0');
scen('Payment over balance fails', ['Error'], ['@sales', '@payment', '@edge'], 'P0');
scen('Multi-invoice allocation payment', ['Allocate two invoices'], ['@sales', '@payment'], 'P0');
scen('Payment receipt view', ['Receipt page'], ['@sales'], 'P2');
scen('Cannot pay non-AR doc', ['Error'], ['@sales', '@edge'], 'P1');
scen('Sales return full', ['Stock in + GL'], ['@sales', '@return'], 'P0');
scen('Sales return partial', ['Partial restock'], ['@sales', '@return'], 'P0');
scen('Sales return over remaining fails', ['Error'], ['@sales', '@return', '@edge'], 'P0');
scen('Sales return cash refund', ['Cash out'], ['@sales', '@return'], 'P1');
scen('Sales return credit', ['AR credit'], ['@sales', '@return'], 'P1');
scen('Create percent discount master', ['Active'], ['@sales', '@discount'], 'P1');
scen('Create fixed discount master', ['Active'], ['@sales', '@discount'], 'P1');
scen('Deactivate discount', ['Hidden from forms'], ['@sales', '@discount'], 'P1');
scen('Activate discount', ['Available'], ['@sales', '@discount'], 'P1');
scen('Archive discount', ['Hidden'], ['@sales', '@discount'], 'P2');
scen('Discount future window', ['Not applied yet'], ['@sales', '@discount', '@edge'], 'P2');
scen('Discount expired window', ['Not available'], ['@sales', '@discount', '@edge'], 'P2');
scen('Sales list search', ['By number'], ['@sales'], 'P1');
scen('Sales list sort', ['By date'], ['@sales'], 'P2');
scen('Delete posted invoice blocked', ['Error'], ['@sales', '@edge'], 'P0');
scen('AR aging open invoices', ['Matches balances'], ['@sales', '@aging'], 'P0');
scen('AR aging all paid empty', ['Zero open'], ['@sales', '@aging'], 'P1');
for (const k of ['commercial', 'tax_invoice']) {
  for (const ch of ['local', 'export']) {
    for (const t of ['credit', 'cash']) {
      scen(`Invoice matrix kind=${k} channel=${ch} settle=${t}`, [
        'Configure VAT if tax_invoice',
        `Create invoice ${k}/${ch}`,
        t === 'cash' ? 'Cash payment account' : 'Credit',
        'Assert status/GL/tax',
      ], ['@sales', '@matrix', '@tax'], 'P1');
    }
  }
}
for (const t of ['physical', 'digital', 'service']) {
  scen(`Invoice one line type ${t}`, [`Invoice ${t}`, 'Stock impact correct'], ['@sales', '@matrix'], 'P0');
}

// 9 Purchase
push('');
push('## 9. Purchase lifecycle');
push('');
scen('Create PO', ['No GL no stock'], ['@purchase', '@po'], 'P0');
scen('Create multi-line PO', ['Totals ok'], ['@purchase', '@po'], 'P0');
scen('PO→full GRN', ['Stock in'], ['@purchase', '@grn'], 'P0');
scen('PO→partial GRN then rest', ['Cumulative stock'], ['@purchase', '@grn'], 'P0');
scen('GRN with GRNI', ['5100/2150'], ['@purchase', '@grn'], 'P0');
scen('Bill after GRN no double stock', ['Stock once'], ['@purchase', '@grn'], 'P0');
scen('Bill without GRN when required fails', ['Error'], ['@purchase', '@edge'], 'P0');
scen('Bill without GRN when not required', ['OK'], ['@purchase'], 'P0');
scen('Credit purchase bill direct', ['AP+stock+GL'], ['@purchase', '@bill'], 'P0');
scen('Bill with supplier invoice #', ['Saved'], ['@purchase'], 'P0');
scen('Bill missing supplier # when required fails', ['Error'], ['@purchase', '@edge'], 'P0');
scen('Duplicate supplier invoice blocked', ['Error'], ['@purchase', '@edge'], 'P0');
scen('Bill pending approval', ['No GL yet'], ['@purchase', '@approval'], 'P0');
scen('Approve pending bill', ['GL+stock'], ['@purchase', '@approval'], 'P0');
scen('Reject pending bill', ['No GL'], ['@purchase', '@approval'], 'P0');
scen('Approve non-pending fails', ['Error'], ['@purchase', '@edge'], 'P1');
scen('Cash purchase', ['Paid + stock'], ['@purchase', '@cash'], 'P0');
scen('Import purchase landed costs', ['Cost includes freight/duty'], ['@purchase', '@import'], 'P0');
scen('Import zero landed', ['Unit cost only'], ['@purchase', '@import'], 'P2');
scen('Pay vendor full', ['Bill paid'], ['@purchase', '@payment'], 'P0');
scen('Pay vendor partial then rest', ['Statuses'], ['@purchase', '@payment'], 'P0');
scen('Pay multi-bill', ['Allocation'], ['@purchase', '@payment'], 'P0');
scen('Pay over balance fails', ['Error'], ['@purchase', '@payment', '@edge'], 'P0');
scen('Remittance view', ['Renders'], ['@purchase'], 'P2');
scen('Purchase return from bill', ['Stock out AP credit'], ['@purchase', '@return'], 'P0');
scen('Purchase return partial', ['Partial'], ['@purchase', '@return'], 'P1');
scen('Return from cash purchase', ['Cash refund path'], ['@purchase', '@return'], 'P1');
scen('AP aging open bills', ['Matches'], ['@purchase', '@aging'], 'P0');
scen('Supplier performance page', ['Loads'], ['@purchase'], 'P2');
scen('PO convert no remaining fails', ['Error'], ['@purchase', '@edge'], 'P0');
scen('Purchase print', ['Renders'], ['@purchase'], 'P2');
scen('Delete unposted PO', ['OK'], ['@purchase'], 'P1');
scen('Delete posted bill blocked', ['Error'], ['@purchase', '@edge'], 'P0');
scen('Bill brand+location', ['On doc+journal'], ['@purchase', '@brand', '@location'], 'P0');
scen('GRN location A stock only A', ['Independent levels'], ['@purchase', '@location'], 'P0');
for (const t of ['physical', 'digital', 'service']) {
  scen(`Purchase line type ${t}`, [`Purchase ${t}`, 'Stock impact correct'], ['@purchase', '@matrix'], 'P0');
}
const purchaseDocs = [
  'purchase_order',
  'goods_receipt',
  'purchase',
  'cash_purchase',
  'import_purchase',
  'purchase_return',
];
for (const dt of purchaseDocs) {
  scen(`List loads ${dt}`, [`Open list for ${dt}`], ['@purchase', '@matrix'], 'P1');
}

// 10 POS
push('');
push('## 10. POS');
push('');
scen('Open POS with registers', ['Terminal loads'], ['@pos'], 'P0');
scen('Open POS no registers', ['Prompt setup'], ['@pos', '@edge'], 'P1');
scen('Open shift float', ['Shift open'], ['@pos'], 'P0');
scen('Reuse open shift', ['No duplicate open'], ['@pos', '@edge'], 'P1');
scen('POS sale cash', ['Paid stock out'], ['@pos'], 'P0');
scen('POS multi-line sale', ['Totals'], ['@pos'], 'P0');
scen('POS card tender', ['Card GL'], ['@pos'], 'P0');
scen('POS bank tender', ['Bank GL'], ['@pos'], 'P1');
scen('POS mixed tender', ['Recorded'], ['@pos'], 'P1');
scen('POS walk-in', ['OK'], ['@pos'], 'P0');
scen('POS named customer', ['OK'], ['@pos'], 'P1');
scen('POS header discount', ['Total down'], ['@pos', '@discount'], 'P1');
scen('POS tax invoice', ['VAT'], ['@pos', '@tax'], 'P1');
scen('POS commercial', ['OK'], ['@pos'], 'P1');
scen('POS without shift fails', ['Error'], ['@pos', '@edge'], 'P0');
scen('POS oversell block fails', ['Error'], ['@pos', '@edge'], 'P0');
scen('POS auto brand no UI field', ['Succeeds with brands present'], ['@pos', '@brand'], 'P0');
scen('POS uses register location', ['Doc location set'], ['@pos', '@location'], 'P0');
scen('POS return full', ['Stock in'], ['@pos', '@return'], 'P0');
scen('POS return partial', ['OK'], ['@pos', '@return'], 'P0');
scen('POS return over remaining fails', ['Error'], ['@pos', '@edge'], 'P0');
scen('POS free return', ['If allowed'], ['@pos', '@return'], 'P2');
scen('POS recent sales', ['Listed'], ['@pos'], 'P1');
scen('POS receipt page', ['Renders'], ['@pos'], 'P1');
scen('Close shift exact cash', ['Variance 0'], ['@pos'], 'P0');
scen('Close shift over', ['+variance'], ['@pos'], 'P1');
scen('Close shift short', ['-variance'], ['@pos'], 'P1');
scen('Z-report after close', ['Summary'], ['@pos'], 'P0');
scen('Customer display page', ['Loads'], ['@pos'], 'P2');
scen('POS history list', ['/sales/pos'], ['@pos'], 'P1');
scen('POS shifts list', ['/sales/pos/shifts'], ['@pos'], 'P1');
scen('Switch register', ['Needs own shift'], ['@pos'], 'P2');
for (const t of ['cash', 'card', 'bank', 'mixed']) {
  scen(`POS tender matrix ${t}`, ['Shift', 'Sell', `Pay ${t}`, 'GL correct'], ['@pos', '@matrix'], 'P0');
}

// 11 Accounting
push('');
push('## 11. Accounting, reports, reconciliation');
push('');
scen('Money in new sale', ['Balanced journal'], ['@accounting'], 'P0');
scen('Money in customer payment', ['Posts'], ['@accounting'], 'P1');
scen('Money in owner contribution', ['Posts'], ['@accounting'], 'P1');
scen('Money out expense', ['Expense GL'], ['@accounting'], 'P0');
scen('Money out category override', ['Uses override'], ['@accounting'], 'P1');
scen('Move money accounts', ['Both sides'], ['@accounting'], 'P0');
scen('Simple customer invoice path', ['AR-style'], ['@accounting'], 'P1');
scen('Simple vendor bill path', ['AP-style'], ['@accounting'], 'P1');
scen('Simple entry receipt upload', ['Viewable'], ['@accounting'], 'P1');
scen('Simple entry brand/location required', ['With masters'], ['@accounting'], 'P0');
scen('Simple entry locked period fails', ['Error'], ['@accounting', '@period', '@edge'], 'P0');
scen('Duplicate commercial soft warning', ['Warn + force'], ['@accounting', '@edge'], 'P1');
scen('Force duplicate posts', ['Succeeds'], ['@accounting', '@edge'], 'P2');
scen('Reverse transaction', ['Net zero'], ['@accounting'], 'P0');
scen('Reverse open-period rules', ['Per product rules'], ['@accounting', '@edge'], 'P1');
scen('Transactions search party', ['Filters'], ['@accounting'], 'P1');
scen('Filter low confidence', ['Chip'], ['@accounting'], 'P2');
scen('Filter missing receipt', ['Chip'], ['@accounting'], 'P2');
scen('Filter unreconciled', ['Chip'], ['@accounting'], 'P2');
scen('View receipt from tx', ['Opens'], ['@accounting'], 'P1');
scen('Journal integrity OK', ['Debits=credits'], ['@accounting'], 'P0');
scen('Journal expand lines', ['Details'], ['@accounting'], 'P0');
scen('Report P&L', ['Renders'], ['@accounting', '@reports'], 'P0');
scen('Report Balance Sheet', ['Renders'], ['@accounting', '@reports'], 'P0');
scen('Report Cash Flow', ['Renders'], ['@accounting', '@reports'], 'P0');
scen('Report GL', ['Renders'], ['@accounting', '@reports'], 'P0');
scen('Report Trial Balance', ['Balanced'], ['@accounting', '@reports'], 'P0');
scen('Report period changes figures', ['Different numbers'], ['@accounting', '@period'], 'P0');
scen('Accounts balances after post', ['Moves'], ['@accounting'], 'P0');
scen('Dashboard updates after post', ['Metrics change'], ['@accounting'], 'P1');
scen('Recon upload CSV', ['Imported'], ['@recon'], 'P0');
scen('Recon auto match', ['Matched'], ['@recon'], 'P0');
scen('Recon mark reconciled', ['Status'], ['@recon'], 'P0');
scen('Recon mark unmatched', ['Status'], ['@recon'], 'P1');
scen('Lock period when ready', ['Locked'], ['@recon', '@period'], 'P0');
scen('Post into locked period fails', ['Error'], ['@recon', '@edge'], 'P0');
scen('Recon bad CSV', ['Handled'], ['@recon', '@edge'], 'P2');
scen('Recon empty CSV', ['Handled'], ['@recon', '@edge'], 'P3');
for (const m of ['Cash', 'Bank', 'Card']) {
  scen(`Simple Entry money out via ${m}`, [`Method ${m}`], ['@accounting', '@matrix'], 'P1');
  scen(`Simple Entry money in via ${m}`, [`Method ${m}`], ['@accounting', '@matrix'], 'P1');
}

// 12 Journeys
push('');
push('## 12. Full business-day journeys');
push('');
scen('Day setup masters', ['Profile tax brand location FY settings'], ['@journey'], 'P0');
scen('Day products and parties', ['3 physical 2 customers 2 vendors'], ['@journey'], 'P0');
scen('Buy credit pay later', ['PO→GRN→Bill→Pay'], ['@journey'], 'P0');
scen('Cash buy and sell same day', ['Cash purchase then invoice'], ['@journey'], 'P0');
scen('Quote to cash', ['QT→SO→INV→Pay'], ['@journey'], 'P0');
scen('Abandoned quote', ['QT only no GL/stock'], ['@journey'], 'P1');
scen('Order not invoiced', ['SO stock unchanged'], ['@journey'], 'P0');
scen('Sell return restock', ['Buy sell return'], ['@journey'], 'P0');
scen('Multi-location sell', ['Buy A transfer B sell B'], ['@journey', '@location'], 'P0');
scen('POS full shift day', ['Open 10 sales 1 return close Z'], ['@journey', '@pos'], 'P0');
scen('VAT tax invoice day', ['Output VAT in reports'], ['@journey', '@tax'], 'P0');
scen('Import landed then sell', ['Landed cost in COGS path'], ['@journey'], 'P0');
scen('Average cost journey', ['Two buys sell'], ['@journey'], 'P0');
scen('Last cost journey', ['Two buys sell'], ['@journey'], 'P0');
scen('Credit limit journey', ['Block then pay then allow'], ['@journey', '@credit'], 'P0');
scen('Period close journey', ['Post recon lock'], ['@journey', '@period'], 'P0');
scen('Wrong entry reverse', ['Post reverse correct'], ['@journey'], 'P0');
scen('Multi-brand sales', ['Two brands tagged'], ['@journey', '@brand'], 'P1');
scen('Dual-role party buy and sell', ['Same party both sides'], ['@journey'], 'P1');
scen('Approval workflow day', ['Reject one approve one pay'], ['@journey', '@approval'], 'P0');
scen('GRNI full path', ['PO GRN bill TB clean'], ['@journey', '@grn'], 'P0');
scen('Partial GRN multi bill', ['10→4→6'], ['@journey'], 'P0');
scen('Multi-order invoice partial pay', ['2 SO → INV → partial'], ['@journey'], 'P0');
scen('Discounted sale full return', ['Consistent'], ['@journey'], 'P1');
scen('Service-only company day', ['No stock impact'], ['@journey'], 'P1');
scen('Digital goods day', ['No stock'], ['@journey'], 'P1');

// 13 Mid-op edges
push('');
push('## 13. Mid-operation edit/delete edges');
push('');
scen('Edit quote after save', ['Header notes'], ['@edge', '@sales'], 'P1');
scen('Cannot edit posted invoice header', ['Blocked'], ['@edge', '@sales'], 'P0');
scen('Delete draft quote', ['Gone'], ['@edge'], 'P1');
scen('Convert then delete source blocked', ['Error'], ['@edge'], 'P0');
scen('Price change after SO before INV', ['Line prices as entered'], ['@edge'], 'P1');
scen('Cost change after purchase before sale', ['COGS at post time'], ['@edge'], 'P1');
scen('Deactivate discount mid quote', ['Convert still valid'], ['@edge'], 'P2');
scen('Archive product on open SO', ['Defined behavior'], ['@edge'], 'P1');
scen('Block party after quote', ['Invoice fails'], ['@edge'], 'P0');
scen('Lower credit limit below open AR', ['New invoice blocked'], ['@edge', '@credit'], 'P0');
scen('Switch company mid form', ['No cross-tenant leak'], ['@edge', '@security'], 'P0');
scen('Logout mid form', ['No post'], ['@edge'], 'P2');
scen('Double submit invoice', ['One doc not double GL'], ['@edge'], 'P0');
scen('Browser back after create', ['No duplicate'], ['@edge'], 'P1');
scen('Refresh detail page', ['Still loads'], ['@edge'], 'P1');
scen('Invalid UUID route', ['404/safe'], ['@edge'], 'P2');
scen('Other tenant UUID access', ['Not found'], ['@edge', '@security'], 'P0');
scen('Period lock while reconciling', ['Posts fail after lock'], ['@edge'], 'P1');
scen('Toggle neg stock mid oversell', ['Second fails'], ['@edge'], 'P1');
scen('Enable VAT after commercials exist', ['Old remain new tax ok'], ['@edge', '@tax'], 'P1');
scen('Disable module mid session', ['Nav hides'], ['@edge', '@modules'], 'P1');
scen('Suspend tenant while logged in', ['Ops fail'], ['@edge', '@platform'], 'P0');
scen('Master wipe staging', ['Ops cleared profile kept'], ['@edge', '@platform'], 'P0');
scen('Master wipe production blocked', ['Fails'], ['@edge', '@security'], 'P0');
scen('Wrong RESET phrase', ['No wipe'], ['@edge'], 'P1');
scen('Health check production blocked', ['Fails'], ['@edge', '@platform'], 'P0');
scen('Health check full suite staging', ['Steps pass'], ['@platform', '@health'], 'P0');
scen('Health check wipe run', ['Scoped wipe'], ['@platform'], 'P1');
scen('POS after shift close fails', ['Error'], ['@edge', '@pos'], 'P0');
scen('Transfer then sell destination', ['OK'], ['@edge', '@stock'], 'P0');
scen('Adjust then delete product blocked', ['Blockers'], ['@edge'], 'P1');
scen('Return more than sold after pay fails', ['Error'], ['@edge'], 'P0');
scen('Two browser sessions same user', ['TB ok'], ['@edge', '@scale'], 'P2');

// 14 Platform
push('');
push('## 14. Control Room / platform');
push('');
scen('Overview as super_admin', ['Metrics'], ['@platform'], 'P0');
scen('Non-admin control room redirect', ['Home'], ['@platform', '@security'], 'P0');
scen('List companies', ['Table'], ['@platform'], 'P0');
scen('Filter companies by plan', ['Filtered'], ['@platform'], 'P2');
scen('Filter companies by status', ['Filtered'], ['@platform'], 'P2');
scen('Search companies', ['Name/slug'], ['@platform'], 'P1');
scen('Create starter company', ['Owner + plan'], ['@platform'], 'P0');
scen('Create growth company', ['Inventory module'], ['@platform', '@modules'], 'P0');
scen('Create pro company', ['POS module'], ['@platform', '@modules'], 'P0');
scen('Create staging company', ['Env staging'], ['@platform'], 'P0');
scen('Edit company plan modules', ['Save'], ['@platform'], 'P0');
scen('Suspend company', ['Suspended'], ['@platform'], 'P0');
scen('Restore company', ['Active'], ['@platform'], 'P0');
scen('Modules matrix', ['Flags'], ['@platform'], 'P1');
scen('Apply plan module defaults', ['Reset'], ['@platform'], 'P1');
scen('Access users search', ['Cross-tenant'], ['@platform'], 'P1');
scen('Audit after create company', ['Event logged'], ['@platform'], 'P0');
scen('Health check UI super_admin', ['Loads'], ['@platform'], 'P0');
scen('Toggle env staging', ['Saved'], ['@platform'], 'P0');
scen('Run health core suite', ['Report'], ['@platform', '@health'], 'P0');
scen('Run health full suite', ['Report'], ['@platform', '@health'], 'P0');

// 15 Security
push('');
push('## 15. Security & tenancy');
push('');
scen('No cross-tenant invoice', ['Foreign UUID'], ['@security'], 'P0');
scen('No cross-tenant product', ['Foreign UUID'], ['@security'], 'P0');
scen('No cross-tenant party', ['Foreign UUID'], ['@security'], 'P0');
scen('Stock isolated per tenant', ['Two tenants'], ['@security'], 'P0');
scen('Mutation without session fails', ['POST unauthenticated'], ['@security'], 'P1');
scen('XSS party name escaped', ['Script tags'], ['@security'], 'P1');
scen('XSS product name escaped', ['Script tags'], ['@security'], 'P1');
scen('Search SQLi harmless', ['Evil string'], ['@security'], 'P1');
scen('Path traversal image rejected', ['Odd path'], ['@security'], 'P2');
scen('Upload within size limit', ['OK'], ['@security'], 'P2');
scen('Upload over size rejected', ['Error'], ['@security', '@edge'], 'P2');
scen('Rapid failed logins no crash', ['Many attempts'], ['@security'], 'P3');
scen('Docs no tenant secrets', ['Public docs clean'], ['@security', '@docs'], 'P0');
scen('E2E report no password', ['Password not in report'], ['@security', '@e2e'], 'P0');
scen('Suspended tenant blocked', ['Ops fail'], ['@security', '@platform'], 'P0');

// 16 Numeric
push('');
push('## 16. Numeric & data edges');
push('');
scen('Qty fraction 0.5', ['If allowed totals ok'], ['@edge', '@numeric'], 'P1');
scen('Qty zero rejected', ['Error'], ['@edge', '@numeric'], 'P0');
scen('Qty negative rejected', ['Error'], ['@edge', '@numeric'], 'P0');
scen('Price zero free item', ['Allowed'], ['@edge', '@numeric'], 'P1');
scen('Price negative rejected', ['Error'], ['@edge', '@numeric'], 'P0');
scen('Very large amount', ['OK or max validation'], ['@edge', '@numeric'], 'P2');
scen('Money rounding consistency', ['.005 cases'], ['@edge', '@numeric'], 'P0');
scen('Discount > subtotal', ['Clamp or error'], ['@edge', '@numeric'], 'P1');
scen('Line sum equals document total math', ['Assert'], ['@edge', '@numeric'], 'P0');
scen('Unicode Sinhala/Tamil names', ['Save search display'], ['@edge', '@i18n'], 'P1');
scen('Emoji in notes', ['Saved'], ['@edge'], 'P3');
scen('Long name max length', ['Truncate or error'], ['@edge'], 'P2');
scen('Empty line description rejected', ['Error'], ['@edge'], 'P1');
scen('Whitespace-only name rejected', ['Error'], ['@edge'], 'P1');
scen('Far future invoice date', ['Handled'], ['@edge'], 'P2');
scen('Far past invoice date', ['If period open'], ['@edge'], 'P2');
scen('Due before issue date', ['Per rules'], ['@edge'], 'P2');

// 17 Validation catalog
push('');
push('## 17. Validation error catalog (one per class)');
push('');
const errors = [
  ['Select a brand', '@brand'],
  ['Select a location', '@location'],
  ['Party blocked', '@parties'],
  ['Party inactive', '@parties'],
  ['Credit limit exceeded', '@credit'],
  ['Insufficient stock', '@stock'],
  ['Period locked', '@period'],
  ['Supplier invoice required', '@purchase'],
  ['Duplicate supplier invoice', '@purchase'],
  ['GRN required before bill', '@grn'],
  ['No remaining qty to convert', '@purchase'],
  ['Payment exceeds balance', '@payment'],
  ['Approve only pending', '@approval'],
  ['Delete posted doc blocked', '@sales'],
  ['Open shift required', '@pos'],
  ['Return qty exceeds remaining', '@pos'],
  ['Transfer from≠to', '@transfer'],
  ['Transfer physical only', '@transfer'],
  ['Keep one active register', '@pos'],
  ['Account code not found', '@accounting'],
  ['Master wipe staging only', '@platform'],
  ['Health suite staging only', '@platform'],
  ['Duplicate SKU', '@inventory'],
  ['Party delete blockers', '@parties'],
  ['Cannot remove role with docs', '@parties'],
  ['Multi-SO different customers', '@sales'],
  ['Invalid brand for company', '@brand'],
  ['Invalid location for company', '@location'],
  ['Bill rejection only pending', '@approval'],
  ['Pay wrong document type', '@payment'],
];
for (const [msg, tag] of errors) {
  scen(`Error class: ${msg}`, [
    `Construct minimal case for: ${msg}`,
    'Assert user-visible error',
    'Assert no corrupt partial GL/stock',
  ], ['@edge', tag], 'P0');
}

// 18 Route smoke
push('');
push('## 18. Route smoke (load only)');
push('');
const routes = [
  '/', '/dashboard', '/transactions', '/journal', '/reports', '/accounts', '/reconciliation',
  '/parties/customers', '/parties/vendors', '/parties/customers/new', '/parties/vendors/new',
  '/sales/quotations', '/sales/quotations/new', '/sales/orders', '/sales/orders/new',
  '/sales/invoices', '/sales/invoices/new', '/sales/payments', '/sales/payments/new',
  '/sales/aging', '/sales/returns', '/sales/returns/new', '/sales/discounts', '/sales/discounts/new',
  '/sales/pos', '/sales/pos/shifts', '/pos', '/pos/customer-display',
  '/purchase/orders', '/purchase/orders/new', '/purchase/receipts', '/purchase/receipts/new',
  '/purchase/purchases', '/purchase/purchases/new', '/purchase/import', '/purchase/import/new',
  '/purchase/expenses', '/purchase/expenses/new', '/purchase/returns', '/purchase/returns/new',
  '/purchase/payments', '/purchase/payments/new', '/purchase/aging', '/purchase/suppliers',
  '/inventory/products', '/inventory/products/new', '/inventory/levels', '/inventory/ledger',
  '/inventory/transfers', '/inventory/transfers/new', '/inventory/adjustments', '/inventory/adjustments/new',
  '/company/details', '/company/tax', '/company/sales', '/company/purchase', '/company/inventory',
  '/company/brands', '/company/locations', '/company/domains',
  '/docs', '/docs/getting-started', '/docs/sales', '/docs/purchase', '/docs/inventory', '/docs/accounting', '/docs/pos',
  '/e2e', '/login',
];
for (const r of routes) {
  scen(`Route smoke ${r}`, [`Navigate ${r} with appropriate auth`, 'Success; no error boundary'], ['@smoke', '@routes'], 'P1');
}
const adminRoutes = [
  '/control-room',
  '/control-room/companies',
  '/control-room/companies/new',
  '/control-room/modules',
  '/control-room/access',
  '/control-room/audit',
  '/control-room/health-check',
];
for (const r of adminRoutes) {
  scen(`Super-admin smoke ${r}`, [`As super_admin open ${r}`], ['@platform', '@smoke'], 'P1');
  scen(`Non-admin blocked ${r}`, [`As normal user open ${r}`, 'Redirect/forbidden'], ['@platform', '@security'], 'P0');
}

// 19 Integrity
push('');
push('## 19. Integrity after operations');
push('');
scen('TB balanced after mixed day', ['After posts TB balances'], ['@reports', '@integrity'], 'P0');
scen('Journal debits always equal credits', ['Any state'], ['@reports', '@integrity'], 'P0');
scen('AR aging = sum open invoices', ['Compare'], ['@reports', '@integrity'], 'P0');
scen('AP aging = sum open bills', ['Compare'], ['@reports', '@integrity'], 'P0');
scen('Stock on-hand = movement formula', ['Purchases−sales+returns±adj±transfers'], ['@reports', '@integrity'], 'P0');
scen('Cash matches money reports', ['Reconcile'], ['@reports', '@integrity'], 'P1');
scen('After reverse TB still balanced', ['OK'], ['@reports', '@integrity'], 'P0');
scen('After period lock reports readable', ['Read-only reports'], ['@reports', '@period'], 'P1');

// 20 UX
push('');
push('## 20. UI/UX non-functional');
push('');
scen('Product form uses tabs', ['Tabs not endless scroll'], ['@ux'], 'P1');
scen('Lists toolbar no page headers', ['Customers'], ['@ux'], 'P1');
scen('Confirm destructive actions', ['Dialog'], ['@ux'], 'P1');
scen('Success toast/message', ['On save'], ['@ux'], 'P2');
scen('Error message visible', ['On invalid'], ['@ux'], 'P1');
scen('Print layout clean', ['Invoice print'], ['@ux'], 'P2');
scen('Slow network single post', ['Throttle no double'], ['@ux', '@edge'], 'P2');
scen('Large list usable', ['Many rows'], ['@ux', '@scale'], 'P2');

// 21 Rare/stress
push('');
push('## 21. Rare / stress / ops');
push('');
scen('100 invoices same customer', ['AR sum correct'], ['@scale'], 'P3');
scen('100 products', ['Search works'], ['@scale'], 'P3');
scen('POS 50 sales one shift', ['Z totals match'], ['@scale', '@pos'], 'P2');
scen('All modules nav no 500', ['Pro plan every link'], ['@scale'], 'P1');
scen('Starter plan inventory URL denied', ['Direct URL blocked/empty'], ['@modules', '@security'], 'P1');
scen('Future dated payment handled', ['OK/warn'], ['@rare'], 'P3');
scen('TZ boundary Colombo posting', ['OK'], ['@rare'], 'P3');
scen('POS pay refresh storm', ['No double sale'], ['@rare', '@pos'], 'P1');
scen('Deploy no auto demo seed', ['No demo products auto'], ['@ops'], 'P1');
scen('Deploy migrations only logs', ['No seed in entrypoint'], ['@ops'], 'P1');
scen('Public favicon/logo 200', ['Assets'], ['@ops'], 'P3');

// 22 Health-check step mapping
push('');
push('## 22. Health-check suite step scenarios (mirror product suite)');
push('');
const hcSteps = [
  'Preflight CoA/settings',
  'Create physical product',
  'Purchase bill stock+GL',
  'Pay vendor',
  'Sales invoice stock+GL',
  'Sales return',
  'PO+GRN path',
  'Tax VAT invoice',
  'Simple Entry sample',
  'Credit limit block',
  'Negative stock block',
  'POS cash sale',
  'Average cost purchases',
  'Multi-location transfer',
  'Final TB + stock formula',
];
hcSteps.forEach((s, i) => {
  scen(`Health-check step ${i + 1}: ${s}`, [
    'Staging company',
    `Run/assert step: ${s}`,
    'Pass criteria per health-check panel',
  ], ['@health', '@platform'], 'P0');
});

// Expand more mid-scale sales qty combos
push('');
push('## 23. Quantity/price micro-matrix');
push('');
const qtys = [1, 2, 5, 10, 0.5, 12.25];
const prices = [100, 999.99, 1500, 0];
let micro = 0;
for (const q of qtys) {
  for (const p of prices) {
    if (q === 0.5 && p === 0) continue;
    micro += 1;
    if (micro > 40) break;
    scen(`Line math qty=${q} price=${p}`, [
      `Create invoice line qty ${q} price ${p}`,
      'Assert line total and doc total',
    ], ['@numeric', '@matrix'], p === 0 ? 'P2' : 'P1');
  }
  if (micro > 40) break;
}

// Payment method × doc type small matrix
push('');
push('## 24. Payment method matrices');
push('');
for (const method of ['Cash', 'Bank', 'Card']) {
  scen(`Receive AR payment via ${method}`, [`Pay open invoice using ${method} account`], ['@payment', '@matrix'], 'P1');
  scen(`Pay AP bill via ${method}`, [`Pay open bill using ${method}`], ['@payment', '@matrix'], 'P1');
}

// Extra coverage: document status transitions
push('');
push('## 25. Document status transitions');
push('');
const statusFlows = [
  ['quotation', 'draft', 'converted', 'Convert to SO'],
  ['sales_order', 'confirmed', 'fully_invoiced', 'Convert to invoice'],
  ['sales_invoice', 'open', 'partial', 'Partial payment'],
  ['sales_invoice', 'partial', 'paid', 'Final payment'],
  ['sales_invoice', 'open', 'paid', 'Full payment'],
  ['purchase_order', 'confirmed', 'received', 'Full GRN'],
  ['purchase', 'open', 'partial', 'Partial vendor pay'],
  ['purchase', 'partial', 'paid', 'Final vendor pay'],
  ['purchase', 'pending_approval', 'open', 'Approve bill'],
  ['purchase', 'pending_approval', 'rejected', 'Reject bill'],
  ['cash_purchase', 'n/a', 'paid', 'Create cash purchase'],
  ['pos_sale', 'n/a', 'paid', 'Complete POS sale'],
  ['sales_return', 'open', 'refunded', 'Cash return settle if applicable'],
  ['goods_receipt', 'n/a', 'received', 'Post GRN'],
];
for (const [doc, from, to, via] of statusFlows) {
  scen(`Status ${doc}: ${from} -> ${to}`, [`Via: ${via}`, 'Assert status field and side effects'], ['@status', '@matrix'], 'P0');
}

// Extra: report tabs x period
push('');
push('## 26. Reports x period matrix');
push('');
for (const rep of ['pnl', 'balance', 'cashflow', 'ledger', 'trial']) {
  for (const per of ['current_month', 'previous_month', 'all']) {
    scen(`Report ${rep} period=${per}`, [
      `Open /reports?report=${rep}`,
      `Set period ${per}`,
      'Renders without error',
    ], ['@reports', '@matrix'], 'P1');
  }
}

// Extra: company settings save each page
push('');
push('## 27. Company settings pages save');
push('');
for (const p of [
  ['details', 'legal profile'],
  ['tax', 'tax profile'],
  ['sales', 'VAT and registers'],
  ['purchase', 'AP/GRN settings'],
  ['inventory', 'costing/negative stock'],
]) {
  scen(`Save company ${p[0]} settings`, [`Open /company/${p[0]}`, `Change ${p[1]}`, 'Save', 'Reload persists'], ['@company', '@settings'], 'P0');
}

// Final stats
push('');
push('## Catalog statistics');
push('');
push('| Metric | Value |');
push('|--------|------:|');
push(`| **Total scenarios** | **${n}** |`);
push('| ID range | S-0001 … S-' + String(n).padStart(4, '0') + ' |');
push('');
push('## Suggested Playwright packaging (later)');
push('');
push('1. `@smoke` — login + route loads');
push('2. `@p0` / integrity journeys');
push('3. Module packs: `@sales` `@purchase` `@pos` `@inventory` `@accounting`');
push('4. `@edge` validation + mid-op');
push('5. `@platform` super-admin');
push('6. `@matrix` nightly combinatorics');
push('7. `@scale` weekly volume');
push('');
push('## Traceability');
push('');
push('| Area | Primary code |');
push('|------|----------------|');
push('| Commercial docs | `commercial-docs.ts` |');
push('| Settings | sales/purchase/inventory settings actions |');
push('| Stock | `inventory.ts` |');
push('| POS | `pos-session.ts`, `pos-terminal.tsx` |');
push('| Accounting | `record-entry.ts`, workspace reports |');
push('| Platform | `platform.ts`, `health-check.ts` |');
push('| Dimensions | `dimensions.ts` |');
push('');
push('---');
push('');
push('*Catalog complete. Next: implement Playwright specs mapped to these IDs/tags.*');
push('');

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`Wrote ${n} scenarios → ${out}`);
