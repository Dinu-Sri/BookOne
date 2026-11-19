export type LayoutRoute = 'accounts' | 'new' | 'detail' | 'opening' | 'import' | 'advances';
export type LayoutVariant = 'before' | 'after';

const CHROME = `
.app{display:flex;min-height:100vh;background:var(--bg,#f6f8fb);color:var(--ink,#132238);font-family:var(--font-sans,Inter,sans-serif);}
.sidebar{width:240px;flex-shrink:0;background:#132238;color:#fff;padding:16px 14px;}
.sidebar.collapsed{width:64px;}
.sidebar strong{display:block;font-size:13px;letter-spacing:.04em;text-transform:uppercase;}
.main{flex:1;min-width:0;}
.button:not(.primary):not(.ghost){border-color:var(--line);background:var(--surface);color:var(--ink);}
`;

const BEFORE_OVERRIDES = `
.date-field{display:flex;align-items:center;flex-direction:row;}
.date-field-label{text-align:center;width:100%;}
.party-toolbar{align-items:center;}
.opening-line-head,.opening-line-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) auto;gap:10px;}
`;

function field(id: string, label: string, control: string) {
  return `<div class="field"><label for="${id}">${label}</label>${control}</div>`;
}

function combo(id: string, label: string, value: string, extraClass = '') {
  return field(
    id,
    label,
    `<button id="${id}" type="button" role="combobox" class="input select-field-trigger" aria-haspopup="listbox" aria-expanded="false">${value}</button>`,
  ).replace('class="field"', `class="field select-field ${extraClass}"`.trim());
}

function input(id: string, label: string, value: string, extraClass = '') {
  return field(id, label, `<input id="${id}" class="input" value="${value}" />`).replace(
    'class="field"',
    `class="field ${extraClass}"`.trim(),
  );
}

function dateField(id: string, label: string, value: string, extraClass = '') {
  const shown = value || 'Select date';
  return `<div class="field date-field date-quick ${extraClass}">
    <label class="date-field-label" for="${id}">${label}<span class="field-required"> *</span></label>
    <button id="${id}" type="button" class="date-trigger period-trigger"><span>${shown}</span></button>
  </div>`;
}

function afterAccounts() {
  return `<div class="workspace party-workspace" data-route="accounts">
    <div class="coa-page-head">
      <div>
        <p class="eyebrow">Accounting</p>
        <h1 class="card-title">Chart of Accounts</h1>
        <p class="card-subtitle">Company accounts, banks, advances and opening balances.</p>
      </div>
      <a class="button primary" href="/accounts/new">New account</a>
    </div>
    <div class="coa-toolbar">
      <div class="coa-filters">
        <div class="field coa-search-field">
          <label for="coa-search">Search</label>
          <input id="coa-search" class="input party-search" placeholder="Search by code, name or class" />
        </div>
        ${combo('coa-root', 'Class', 'All classes', 'party-toolbar-filter')}
        ${combo('coa-status', 'Status', 'Active', 'party-toolbar-filter')}
      </div>
      <div class="coa-secondary">
        <a class="button secondary" href="/accounts/opening">Opening balances</a>
        <a class="button secondary" href="/accounts/import">Import CSV</a>
        <button type="button" class="button secondary">Export CSV</button>
        <a class="button secondary" href="/advances">Advances</a>
      </div>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="table-wrap table-wrap-actions">
          <table class="table">
            <thead>
              <tr>
                <th><button type="button" class="th-sort-btn">Code</button></th>
                <th><button type="button" class="th-sort-btn">Name</button></th>
                <th><button type="button" class="th-sort-btn">Class</button></th>
                <th><button type="button" class="th-sort-btn">Subtype</button></th>
                <th><button type="button" class="th-sort-btn">Status</button></th>
                <th class="th-num"><button type="button" class="th-sort-btn th-sort-btn-end">Balance</button></th>
                <th class="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1000</td><td>Cash on Hand</td><td>Asset</td><td>Cash</td><td>Active</td>
                <td class="td-num amount-positive">LKR 12,500.00</td>
                <td class="td-actions"><button type="button" class="button ghost">Actions</button></td>
              </tr>
              <tr>
                <td>6800</td><td>Office supplies with a very long operating name</td><td>Expense</td>
                <td>Operating expense</td><td>Active</td>
                <td class="td-num amount-negative">-LKR 240.50</td>
                <td class="td-actions"><button type="button" class="button ghost">Actions</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="party-pagination"><span>2 accounts</span></div>
      </div>
    </div>
  </div>`;
}

function beforeAccounts() {
  return `<div class="workspace party-workspace" data-route="accounts">
    <div class="party-toolbar">
      <div class="party-search-form">
        <label class="sr-only" for="coa-search">Search</label>
        <input id="coa-search" class="input party-search" placeholder="Search by code, name or class" />
      </div>
      ${combo('coa-root', 'Class', 'All classes', 'party-toolbar-filter')}
      ${combo('coa-status', 'Status', 'Active', 'party-toolbar-filter')}
      <a class="button primary" href="/accounts/new">New account</a>
    </div>
    <div class="card">
      <div class="card-header">
        <div>
          <p class="eyebrow">Accounting</p>
          <h1 class="card-title">Chart of Accounts</h1>
        </div>
        <div class="cluster" style="display:flex;gap:8px;flex-wrap:wrap">
          <a class="button" href="/accounts/opening">Opening balances</a>
          <a class="button" href="/accounts/import">Import CSV</a>
          <button type="button" class="button">Export CSV</button>
          <a class="button" href="/advances">Advances</a>
        </div>
      </div>
      <div class="card-body">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Code</th><th>Name</th><th>Class</th><th>Balance</th></tr></thead>
            <tbody>
              <tr><td>1000</td><td>Cash on Hand</td><td>Asset</td><td style="text-align:right">LKR 12,500.00</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>`;
}

function afterNew() {
  return `<div class="workspace party-workspace" data-route="new">
    <div class="party-form-shell form-shell form-shell-form">
      <div class="party-form-top">
        <a class="party-back-btn" href="/accounts"><span aria-hidden>←</span><span><strong>Back</strong><small>Accounts</small></span></a>
        <span class="form-shell-title">New account</span>
      </div>
      <div class="party-form-body">
        <form class="coa-form">
          <section class="coa-section">
            <h2>Account type</h2>
            ${combo('coa-template', 'What are you adding?', 'Bank account')}
          </section>
          <section class="coa-section">
            <h2>Account identity</h2>
            <div class="coa-code-row">
              ${input('coa-code', 'Code', '1101')}
              <button type="button" class="button" id="coa-suggest">Suggest code</button>
            </div>
            ${input('coa-name', 'Name', 'Hatton National Bank')}
            ${input('coa-desc', 'Description', '')}
          </section>
          <section class="coa-section">
            <h2>Hierarchy</h2>
            ${combo('coa-parent', 'Parent (optional)', 'No parent')}
          </section>
          <section class="coa-section">
            <h2>Bank details</h2>
            <div class="coa-bank-row">
              ${input('coa-bank', 'Institution', 'Hatton National Bank')}
              ${input('coa-digits', 'Last digits', '4421')}
            </div>
          </section>
        </form>
      </div>
      <div class="party-form-footer">
        <button type="button" class="button">Cancel</button>
        <button type="submit" class="button primary">Create account</button>
      </div>
    </div>
  </div>`;
}

function beforeNew() {
  return `<div class="workspace party-workspace" data-route="new">
    <div class="party-form-shell">
      <div class="party-form-top">
        <a class="party-back-btn" href="/accounts"><span><strong>Back</strong><small>Accounts</small></span></a>
        <span class="form-shell-title">New account</span>
      </div>
      <div class="party-form-body">
        <form class="party-tab-grid">
          ${combo('coa-template', 'What are you adding?', 'Bank account', 'field-full')}
          ${input('coa-code', 'Code', '1101')}
          <div class="field"><label for="coa-suggest">&nbsp;</label><button type="button" class="button" id="coa-suggest">Suggest code</button></div>
          ${input('coa-name', 'Name', 'Hatton National Bank', 'field-full')}
          ${input('coa-bank', 'Institution', 'Hatton National Bank')}
          ${input('coa-digits', 'Last digits', '4421')}
        </form>
      </div>
      <div class="party-form-footer">
        <button type="button" class="button">Cancel</button>
        <button type="submit" class="button primary">Create account</button>
      </div>
    </div>
  </div>`;
}

function afterDetail() {
  return `<div class="workspace party-workspace" data-route="detail">
    <div class="party-form-shell form-shell form-shell-form">
      <div class="party-form-top">
        <a class="party-back-btn" href="/accounts"><span aria-hidden>←</span><span><strong>Back</strong><small>Accounts</small></span></a>
        <span class="form-shell-title">1101</span>
      </div>
      <div class="party-form-body">
        <div class="coa-identity">
          <div class="coa-identity-row">
            <h1 class="card-title">Hatton National Bank operating account</h1>
            <span class="badge">Active</span>
          </div>
          <p class="coa-code-line">1101</p>
          <p class="coa-balance">LKR 0.00</p>
          <p class="field-help">Creating an account starts at zero; opening balances are a separate posting.</p>
          <div class="coa-secondary"><a class="button secondary" href="/journal?account=1101">Open ledger</a></div>
        </div>
        <section class="coa-section">
          <h2>Account facts</h2>
          <dl class="coa-meta-grid">
            <div><dt>Class</dt><dd>Asset</dd></div>
            <div><dt>Subtype</dt><dd>Bank</dd></div>
            <div><dt>Normal side</dt><dd>Debit</dd></div>
            <div><dt>Currency</dt><dd>LKR</dd></div>
          </dl>
        </section>
        <section class="coa-section">
          <h2>Edit details</h2>
          <form class="coa-form">
            ${input('coa-edit-name', 'Name', 'Hatton National Bank operating account')}
            ${input('coa-edit-desc', 'Description', '')}
          </form>
        </section>
      </div>
      <div class="party-form-footer">
        <button type="button" class="button">Cancel</button>
        <button type="submit" class="button primary">Save details</button>
      </div>
    </div>
  </div>`;
}

function beforeDetail() {
  return `<div class="workspace party-workspace" data-route="detail">
    <div class="party-form-shell">
      <div class="party-form-top">
        <a class="party-back-btn" href="/accounts"><span><strong>Back</strong><small>Accounts</small></span></a>
        <span class="form-shell-title">1101</span>
      </div>
      <div class="party-form-body">
        <div class="coa-detail-header" style="display:flex;justify-content:space-between">
          <div>
            <h1 class="card-title">Hatton National Bank operating account</h1>
            <p class="card-subtitle">Balance LKR 0.00. Creating an account starts at zero; opening balances are a separate posting.</p>
          </div>
        </div>
        <dl class="coa-meta-grid">
          <div><dt>Class</dt><dd>Asset</dd></div>
          <div><dt>Subtype</dt><dd>Bank</dd></div>
          <div><dt>Normal side</dt><dd>Debit</dd></div>
          <div><dt>Liquidity</dt><dd>Bank</dd></div>
          <div><dt>Control role</dt><dd>None</dd></div>
          <div><dt>Posting</dt><dd>Posting account</dd></div>
          <div><dt>Currency</dt><dd>LKR</dd></div>
        </dl>
      </div>
      <div class="party-form-footer">
        <button type="button" class="button">Back</button>
        <a class="button" href="/journal">Open ledger</a>
        <button type="submit" class="button primary">Save name</button>
      </div>
    </div>
  </div>`;
}

function afterOpening() {
  return `<div class="workspace party-workspace" data-route="opening">
    <div class="party-form-shell form-shell form-shell-wide">
      <div class="party-form-top">
        <a class="party-back-btn" href="/accounts"><span aria-hidden>←</span><span><strong>Back</strong><small>Accounts</small></span></a>
        <span class="form-shell-title">Opening balances</span>
      </div>
      <div class="party-form-body">
        <p class="field-help">Creating an account does not write equity or journals. Preview must balance before posting.</p>
        ${dateField('open-date', 'Effective date', '2026-04-01', 'opening-date')}
        <div class="opening-editor">
          <div class="opening-line-head" aria-hidden>
            <span>Account</span><span class="num">Debit</span><span class="num">Credit</span><span></span>
          </div>
          <div class="opening-line-grid" data-line="1">
            ${combo('open-code-1', 'Account, line 1', '1000 · Cash on Hand')}
            ${input('open-dr-1', 'Debit, line 1', '1000.00')}
            ${input('open-cr-1', 'Credit, line 1', '')}
            <div class="opening-action"><button type="button" class="button opening-remove" aria-label="Remove line 1">Remove</button></div>
          </div>
          <div class="opening-line-grid" data-line="2">
            ${combo('open-code-2', 'Account, line 2', '3000 · Opening equity')}
            ${input('open-dr-2', 'Debit, line 2', '')}
            ${input('open-cr-2', 'Credit, line 2', '1000.00')}
            <div class="opening-action"><button type="button" class="button opening-remove" aria-label="Remove line 2">Remove</button></div>
          </div>
          <div class="opening-review">
            <span>Totals</span>
            <span class="num">Debits 1000.00</span>
            <span class="num">Credits 1000.00</span>
            <span>Diff 0.00</span>
          </div>
          <div class="opening-editor-actions"><button type="button" class="button">Add line</button></div>
        </div>
      </div>
      <div class="party-form-footer">
        <p class="field-help" id="open-post-reason">Preview this exact date and these lines before posting.</p>
        <button type="button" class="button">Cancel</button>
        <button type="button" class="button">Preview</button>
        <button type="submit" class="button primary" disabled aria-describedby="open-post-reason">Post opening</button>
      </div>
    </div>
  </div>`;
}

function beforeOpening() {
  return `<div class="workspace party-workspace" data-route="opening">
    <div class="party-form-shell">
      <div class="party-form-top">
        <a class="party-back-btn" href="/accounts"><span><strong>Back</strong><small>Accounts</small></span></a>
        <span class="form-shell-title">Opening balances</span>
      </div>
      <div class="party-form-body">
        ${dateField('open-date', 'Effective date', '2026-04-01')}
        <div class="opening-line-head" aria-hidden><span>Account</span><span>Debit</span><span>Credit</span><span></span></div>
        <div class="opening-line-grid">
          ${combo('open-code-1', 'Account', '1000 · Cash on Hand')}
          ${input('open-dr-1', 'Debit', '1000.00')}
          ${input('open-cr-1', 'Credit', '')}
          <div class="field"><label for="open-remove-1">&nbsp;</label><button id="open-remove-1" type="button" class="button">Remove</button></div>
        </div>
        <div class="opening-totals" style="display:flex;gap:16px"><span>Debits 1000.00</span><span>Credits 1000.00</span><span>Difference 0.00</span></div>
        <button type="button" class="button">Add line</button>
      </div>
      <div class="party-form-footer">
        <button type="button" class="button">Cancel</button>
        <button type="button" class="button">Preview</button>
        <button type="submit" class="button primary" disabled>Post opening</button>
      </div>
    </div>
  </div>`;
}

function afterImport() {
  return `<div class="workspace party-workspace" data-route="import">
    <div class="party-form-shell form-shell form-shell-wide">
      <div class="party-form-top">
        <a class="party-back-btn" href="/accounts"><span aria-hidden>←</span><span><strong>Back</strong><small>Accounts</small></span></a>
        <span class="form-shell-title">Import chart CSV</span>
      </div>
      <div class="party-form-body">
        <p class="import-guide">Metadata only — codes, names, classes and groups. Columns: <code>code,name,type,subtype,parent_code,description,is_group</code></p>
        <div class="import-editor">
          ${field(
            'coa-csv',
            'CSV',
            `<textarea id="coa-csv" class="input" rows="8">code,name,type,subtype,parent_code,description,is_group
6800,Office supplies,expense,operating_expense,,,0</textarea>`,
          )}
        </div>
        <div class="import-review" role="region" aria-label="Import review">
          <p class="field-help" role="status">Dry-run: 1 to create, 0 already present, 1 issues.</p>
          <ul class="import-issue-list"><li>Line 2 · type: Unknown class value.</li></ul>
        </div>
      </div>
      <div class="party-form-footer">
        <button type="button" class="button">Cancel</button>
        <button type="button" class="button">Dry-run</button>
        <button type="submit" class="button primary">Import</button>
      </div>
    </div>
  </div>`;
}

function beforeImport() {
  return `<div class="workspace party-workspace" data-route="import">
    <div class="party-form-shell">
      <div class="party-form-top">
        <a class="party-back-btn" href="/accounts"><span><strong>Back</strong><small>Accounts</small></span></a>
        <span class="form-shell-title">Import chart CSV</span>
      </div>
      <div class="party-form-body">
        <p class="field-help">Metadata only — codes, names, classes and groups. Monetary openings use Opening balances. This does not post journals.</p>
        ${field('coa-csv', 'CSV', `<textarea id="coa-csv" class="input" rows="12">code,name,type,subtype,parent_code,description,is_group</textarea>`)}
      </div>
      <div class="party-form-footer">
        <button type="button" class="button">Cancel</button>
        <button type="button" class="button">Dry-run</button>
        <button type="submit" class="button primary">Import</button>
      </div>
    </div>
  </div>`;
}

function afterAdvances() {
  return `<div class="workspace party-workspace" data-route="advances">
    <div class="party-form-top" style="margin-bottom:12px;border-radius:var(--radius-lg)">
      <a class="party-back-btn" href="/accounts"><span aria-hidden>←</span><span><strong>Back</strong><small>Accounts</small></span></a>
      <span class="form-shell-title">Advances</span>
    </div>
    <div class="adv-stack">
      <div class="card">
        <div class="card-header"><div><h2 class="card-title">Issue an advance</h2></div></div>
        <div class="card-body">
          <form class="party-tab-grid">
            ${combo('adv-kind', 'Kind', 'Customer advance')}
            ${combo('adv-party', 'Party', 'Acme Traders')}
            ${input('adv-amount', 'Amount', '2500.00')}
            ${dateField('adv-date', 'Date', '2026-04-02')}
            ${combo('adv-cash', 'Cash or bank', '1000 · Cash on Hand', 'field-full')}
            <div class="field field-full"><button type="submit" class="button primary">Issue advance</button></div>
          </form>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div><h2 class="card-title">Open advances</h2></div></div>
        <div class="card-body" style="padding:0">
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Date</th><th>Kind</th><th>Party</th><th class="th-num">Issued</th><th class="th-num">Remaining</th><th>Status</th></tr></thead>
              <tbody>
                <tr><td>2026-04-01</td><td>Customer advance</td><td>Acme Traders</td><td class="td-num">2500.00</td><td class="td-num">2500.00</td><td>open</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div><h2 class="card-title">Allocate or settle</h2></div></div>
        <div class="card-body">
          <form class="party-tab-grid">
            ${combo('adv-open', 'Open advance', 'Select…', 'field-full')}
          </form>
        </div>
      </div>
    </div>
  </div>`;
}

function beforeAdvances() {
  return `<div class="workspace party-workspace" data-route="advances">
    <div class="party-form-top" style="margin-bottom:12px">
      <a class="party-back-btn" href="/accounts"><span><strong>Back</strong><small>Accounts</small></span></a>
      <span class="form-shell-title">Advances</span>
    </div>
    <div class="card">
      <div class="card-header"><div><h2 class="card-title">Issue an advance</h2></div></div>
      <div class="card-body">
        <form class="party-tab-grid">
          ${combo('adv-kind', 'Kind', 'Customer advance')}
          ${combo('adv-party', 'Party', 'Acme Traders')}
          ${input('adv-amount', 'Amount', '2500.00')}
          ${dateField('adv-date', 'Date', '2026-04-02')}
          ${combo('adv-cash', 'Cash or bank', '1000 · Cash on Hand', 'field-full')}
        </form>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-header"><div><h2 class="card-title">Allocate or settle</h2></div></div>
      <div class="card-body">
        <form class="party-tab-grid">
          ${combo('adv-open', 'Open advance', 'Select…', 'field-full')}
          ${combo('adv-apply-kind', 'Action', 'Apply to invoice or bill')}
          <p class="field-help">Select an open advance first.</p>
          ${input('adv-apply-amt', 'Amount', '')}
        </form>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-header"><div><h2 class="card-title">Open advances</h2></div></div>
      <div class="card-body"><p>No advances yet.</p></div>
    </div>
  </div>`;
}

const SCREENS: Record<LayoutRoute, { before: () => string; after: () => string }> = {
  accounts: { before: beforeAccounts, after: afterAccounts },
  new: { before: beforeNew, after: afterNew },
  detail: { before: beforeDetail, after: afterDetail },
  opening: { before: beforeOpening, after: afterOpening },
  import: { before: beforeImport, after: afterImport },
  advances: { before: beforeAdvances, after: afterAdvances },
};

export function layoutHtml(opts: {
  css: string;
  route: LayoutRoute;
  variant: LayoutVariant;
  sidebar?: 'expanded' | 'collapsed';
}) {
  const sidebar = opts.sidebar ?? 'expanded';
  const body = SCREENS[opts.route][opts.variant]();
  const extra = opts.variant === 'before' ? BEFORE_OVERRIDES : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>UI-02 ${opts.variant} ${opts.route}</title>
  <style>${opts.css}\n${CHROME}\n${extra}</style>
</head>
<body>
  <div class="app">
    <aside class="sidebar ${sidebar === 'collapsed' ? 'collapsed' : ''}"><strong>BookOne</strong></aside>
    <main class="main">${body}</main>
  </div>
</body>
</html>`;
}

export const LAYOUT_ROUTES: LayoutRoute[] = ['accounts', 'new', 'detail', 'opening', 'import', 'advances'];
