/**
 * Financial statements in the presentation of SLFRS for SMEs (Sections 3–7) / LKAS 1:
 * Statement of Profit or Loss (expenses by function), Statement of Financial Position
 * (current / non-current), Statement of Cash Flows (direct method, by activity) and
 * Statement of Changes in Equity, with an optional comparative column.
 *
 * Pure functions: callers pass account totals and cash journal lines. Classification uses
 * account type, subtype, control role, cash-flow class and, last, well-known names/codes,
 * so any chart can be presented. Every line keeps its accounts for the notes.
 */
import { signedAccountBalance } from './statement-sign';

export type StatementAccount = {
  code: string;
  name: string;
  type: string;
  subtype?: string | null;
  controlRole?: string | null;
  liquidity?: string | null;
  cashFlowClass?: string | null;
  isGroup?: boolean;
  debit: number;
  credit: number;
};

export type NoteAccount = { code: string; name: string; amount: number; compare: number | null };

export type StatementLine = {
  key: string;
  label: string;
  kind: 'heading' | 'line' | 'subtotal' | 'total';
  amount: number;
  compare: number | null;
  /** Accounts behind a line (shown in the notes). */
  accounts?: NoteAccount[];
  /** 1 = indented under a heading. */
  level?: number;
};

export type Statement = {
  id: 'profit_or_loss' | 'financial_position' | 'cash_flows' | 'changes_in_equity';
  title: string;
  lines: StatementLine[];
  checks: Array<{ label: string; ok: boolean; difference: number }>;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0));
const lc = (s: string | null | undefined) => String(s ?? '').toLowerCase();

function amountOf(a: StatementAccount) {
  return signedAccountBalance(a.type, Number(a.debit) || 0, Number(a.credit) || 0);
}

// ── Profit or loss classification ────────────────────────────────────────────

export type PlGroup =
  | 'revenue'
  | 'cost_of_sales'
  | 'other_income'
  | 'distribution'
  | 'administrative'
  | 'finance_costs'
  | 'income_tax';

export function plGroup(a: StatementAccount): PlGroup | null {
  const name = lc(a.name);
  const sub = lc(a.subtype);
  const role = lc(a.controlRole);
  if (a.type === 'revenue') {
    if (sub === 'sales' || sub === 'sales_return' || role === 'sales' || role === 'sales_return') return 'revenue';
    if (sub === 'other_income' || /other income|interest|dividend|gain|discount received|commission received/.test(name)) {
      return 'other_income';
    }
    return 'revenue';
  }
  if (a.type === 'expense') {
    if (sub === 'cogs' || role === 'cogs' || /cost of (goods|sales)|purchases|freight in|write-?off/.test(name) || /^5\d{3}$/.test(a.code)) {
      return 'cost_of_sales';
    }
    if (/income tax|tax expense/.test(name)) return 'income_tax';
    if (/interest|finance cost|loan|bank charge|lease interest|overdraft/.test(name)) return 'finance_costs';
    if (/marketing|advertis|selling|distribution|delivery|courier|commission|promotion|sales staff/.test(name)) {
      return 'distribution';
    }
    return 'administrative';
  }
  return null;
}

const PL_LABEL: Record<PlGroup, string> = {
  revenue: 'Revenue',
  cost_of_sales: 'Cost of sales',
  other_income: 'Other income',
  distribution: 'Distribution costs',
  administrative: 'Administrative expenses',
  finance_costs: 'Finance costs',
  income_tax: 'Income tax expense',
};

function notes(current: StatementAccount[], compare: StatementAccount[] | null, pick: (a: StatementAccount) => boolean, sign = 1) {
  const codes = new Map<string, NoteAccount>();
  for (const a of current.filter(pick)) {
    const amt = r2(amountOf(a) * sign);
    codes.set(a.code, { code: a.code, name: a.name, amount: amt, compare: compare ? 0 : null });
  }
  for (const a of (compare ?? []).filter(pick)) {
    const amt = r2(amountOf(a) * sign);
    const row = codes.get(a.code) ?? { code: a.code, name: a.name, amount: 0, compare: 0 };
    row.compare = amt;
    codes.set(a.code, row);
  }
  return [...codes.values()]
    .filter((n) => Math.abs(n.amount) >= 0.005 || Math.abs(n.compare ?? 0) >= 0.005)
    .sort((x, y) => x.code.localeCompare(y.code, 'en', { numeric: true }));
}

function lineFrom(key: string, label: string, accounts: NoteAccount[], hasCompare: boolean, level = 1): StatementLine {
  return {
    key,
    label,
    kind: 'line',
    level,
    amount: sum(accounts.map((a) => a.amount)),
    compare: hasCompare ? sum(accounts.map((a) => a.compare ?? 0)) : null,
    accounts,
  };
}

function totalLine(key: string, label: string, parts: StatementLine[], hasCompare: boolean, kind: 'subtotal' | 'total' = 'subtotal', signs?: number[]): StatementLine {
  return {
    key,
    label,
    kind,
    amount: sum(parts.map((p, i) => p.amount * (signs?.[i] ?? 1))),
    compare: hasCompare ? sum(parts.map((p, i) => (p.compare ?? 0) * (signs?.[i] ?? 1))) : null,
  };
}

/** Profit for the period from account totals (revenue − expenses). */
export function profitFrom(accounts: StatementAccount[]): number {
  return sum(accounts.filter((a) => a.type === 'revenue').map(amountOf)) - sum(accounts.filter((a) => a.type === 'expense').map(amountOf));
}

export function statementOfProfitOrLoss(current: StatementAccount[], compare: StatementAccount[] | null = null): Statement {
  const has = compare !== null;
  const live = (xs: StatementAccount[]) => xs.filter((a) => !a.isGroup);
  const cur = live(current);
  const cmp = compare ? live(compare) : null;
  const g = (group: PlGroup) => (a: StatementAccount) => plGroup(a) === group;
  const L = (group: PlGroup) => lineFrom(group, PL_LABEL[group], notes(cur, cmp, g(group)), has, 0);

  const revenue = L('revenue');
  const cos = L('cost_of_sales');
  const gross = totalLine('gross_profit', 'Gross profit', [revenue, cos], has, 'subtotal', [1, -1]);
  const other = L('other_income');
  const dist = L('distribution');
  const admin = L('administrative');
  const operating = totalLine('operating_profit', 'Operating profit', [gross, other, dist, admin], has, 'subtotal', [1, 1, -1, -1]);
  const finance = L('finance_costs');
  const pbt = totalLine('profit_before_tax', 'Profit before tax', [operating, finance], has, 'subtotal', [1, -1]);
  const tax = L('income_tax');
  const pft = totalLine('profit_for_period', 'Profit for the period', [pbt, tax], has, 'total', [1, -1]);
  const oci: StatementLine = { key: 'oci', label: 'Other comprehensive income', kind: 'line', level: 0, amount: 0, compare: has ? 0 : null };
  const tci = totalLine('total_comprehensive_income', 'Total comprehensive income for the period', [pft, oci], has, 'total');

  const expected = profitFrom(cur);
  return {
    id: 'profit_or_loss',
    title: 'Statement of Profit or Loss and Other Comprehensive Income',
    lines: [revenue, cos, gross, other, dist, admin, operating, finance, pbt, tax, pft, oci, tci],
    checks: [{ label: 'Profit agrees with the ledger', ok: Math.abs(pft.amount - expected) < 0.01, difference: r2(pft.amount - expected) }],
  };
}

// ── Financial position ───────────────────────────────────────────────────────

export type FpGroup =
  | 'ppe'
  | 'intangibles'
  | 'other_non_current_assets'
  | 'inventories'
  | 'receivables'
  | 'cash'
  | 'other_current_assets'
  | 'stated_capital'
  | 'drawings'
  | 'retained_earnings'
  | 'non_current_borrowings'
  | 'other_non_current_liabilities'
  | 'payables'
  | 'tax_liabilities'
  | 'current_borrowings'
  | 'other_current_liabilities';

const NON_CURRENT = /long.?term|non.?current|debenture|investment property|deferred/;

export function fpGroup(a: StatementAccount): FpGroup | null {
  const name = lc(a.name);
  const sub = lc(a.subtype);
  const role = lc(a.controlRole);
  const liq = lc(a.liquidity);
  if (a.type === 'asset') {
    if (sub === 'cash' || sub === 'bank' || sub === 'card_clearing' || (liq && liq !== 'none') || role === 'cash' || role === 'bank') return 'cash';
    if (sub === 'inventory' || role === 'inventory' || /inventor|stock in trade/.test(name)) return 'inventories';
    if (/property|plant|equipment|machinery|vehicle|motor|furniture|fixture|computer|building|land|fleet|accumulated depreciation|ppe/.test(name)) return 'ppe';
    if (/goodwill|software|intangible|trademark|licen[cs]e/.test(name)) return 'intangibles';
    if (NON_CURRENT.test(name)) return 'other_non_current_assets';
    if (
      ['receivable', 'supplier_advance', 'staff_advance', 'deposit', 'tax'].includes(sub) ||
      ['ar', 'tax', 'supplier_advance', 'staff_advance', 'deposit'].includes(role) ||
      /receivable|advance|prepay|deposit|vat|loan/.test(name)
    ) {
      return 'receivables';
    }
    return 'other_current_assets';
  }
  if (a.type === 'liability') {
    if (NON_CURRENT.test(name)) return /loan|borrow|debenture|lease/.test(name) ? 'non_current_borrowings' : 'other_non_current_liabilities';
    if (sub === 'tax' || role.startsWith('vat') || role === 'tax' || /vat|tax|epf|etf|apit|paye|wht|nbt/.test(name)) return 'tax_liabilities';
    if (/loan|borrow|overdraft|lease/.test(name)) return 'current_borrowings';
    if (sub === 'payable' || role === 'ap' || role === 'grni' || /payable|accrued|accrual|received not invoiced|advance|deposit/.test(name)) return 'payables';
    return 'other_current_liabilities';
  }
  if (a.type === 'equity') {
    if (/drawing/.test(name)) return 'drawings';
    if (/retained|accumulated (profit|loss)|reserve/.test(name)) return 'retained_earnings';
    return 'stated_capital';
  }
  return null;
}

const FP_LABEL: Record<FpGroup, string> = {
  ppe: 'Property, plant and equipment',
  intangibles: 'Intangible assets',
  other_non_current_assets: 'Other non-current assets',
  inventories: 'Inventories',
  receivables: 'Trade and other receivables',
  cash: 'Cash and cash equivalents',
  other_current_assets: 'Other current assets',
  stated_capital: 'Stated capital',
  drawings: 'Drawings',
  retained_earnings: 'Retained earnings',
  non_current_borrowings: 'Interest-bearing borrowings',
  other_non_current_liabilities: 'Other non-current liabilities',
  payables: 'Trade and other payables',
  tax_liabilities: 'Tax payable',
  current_borrowings: 'Interest-bearing borrowings (current)',
  other_current_liabilities: 'Other current liabilities',
};

function heading(key: string, label: string): StatementLine {
  return { key, label, kind: 'heading', amount: 0, compare: null };
}

function section(key: string, label: string, lines: StatementLine[], total: StatementLine): StatementLine[] {
  return lines.length ? [heading(key, label), ...lines, total] : [];
}

/**
 * Closing balances (cumulative to the reporting date). Retained earnings include every
 * unclosed profit to date, so the statement balances without closing entries.
 */
export function statementOfFinancialPosition(current: StatementAccount[], compare: StatementAccount[] | null = null): Statement {
  const has = compare !== null;
  const cur = current.filter((a) => !a.isGroup);
  const cmp = compare ? compare.filter((a) => !a.isGroup) : null;
  const g = (group: FpGroup) => (a: StatementAccount) => fpGroup(a) === group;
  const L = (group: FpGroup) => lineFrom(group, FP_LABEL[group], notes(cur, cmp, g(group)), has);
  const keep = (lines: StatementLine[]) => lines.filter((l) => Math.abs(l.amount) >= 0.005 || Math.abs(l.compare ?? 0) >= 0.005);

  const nca = keep([L('ppe'), L('intangibles'), L('other_non_current_assets')]);
  const ncaTotal = totalLine('total_non_current_assets', 'Total non-current assets', nca, has);
  const ca = keep([L('inventories'), L('receivables'), L('cash'), L('other_current_assets')]);
  const caTotal = totalLine('total_current_assets', 'Total current assets', ca, has);
  const assets = totalLine('total_assets', 'Total assets', [ncaTotal, caTotal], has, 'total');

  // Equity: posted equity accounts plus all unclosed profit to date.
  const unclosed: NoteAccount = {
    code: 'profit',
    name: 'Profit to date not yet closed to retained earnings',
    amount: r2(profitFrom(cur)),
    compare: cmp ? r2(profitFrom(cmp)) : null,
  };
  const retained = lineFrom('retained_earnings', FP_LABEL.retained_earnings, [...notes(cur, cmp, g('retained_earnings')), unclosed], has);
  const eq = keep([L('stated_capital'), L('drawings'), retained]);
  const eqTotal = totalLine('total_equity', 'Total equity', eq, has);
  const ncl = keep([L('non_current_borrowings'), L('other_non_current_liabilities')]);
  const nclTotal = totalLine('total_non_current_liabilities', 'Total non-current liabilities', ncl, has);
  const cl = keep([L('payables'), L('tax_liabilities'), L('current_borrowings'), L('other_current_liabilities')]);
  const clTotal = totalLine('total_current_liabilities', 'Total current liabilities', cl, has);
  const liabilities = totalLine('total_liabilities', 'Total liabilities', [nclTotal, clTotal], has, 'subtotal');
  const eqAndLiab = totalLine('total_equity_and_liabilities', 'Total equity and liabilities', [eqTotal, liabilities], has, 'total');

  const diff = r2(assets.amount - eqAndLiab.amount);
  return {
    id: 'financial_position',
    title: 'Statement of Financial Position',
    // Sections with nothing in either column are left out, as on a printed statement.
    lines: [
      heading('h_assets', 'Assets'),
      ...section('h_nca', 'Non-current assets', nca, ncaTotal),
      ...section('h_ca', 'Current assets', ca, caTotal),
      assets,
      heading('h_eq_liab', 'Equity and liabilities'),
      ...section('h_eq', 'Equity', eq, eqTotal),
      ...section('h_ncl', 'Non-current liabilities', ncl, nclTotal),
      ...section('h_cl', 'Current liabilities', cl, clTotal),
      ...(ncl.length && cl.length ? [liabilities] : []),
      eqAndLiab,
    ],
    checks: [{ label: 'Assets equal equity and liabilities', ok: Math.abs(diff) < 0.01, difference: diff }],
  };
}

// ── Cash flows (direct method) ───────────────────────────────────────────────

/** One journal line, with its account, from an entry in the period. */
export type CashJournalLine = {
  entryId: string;
  account: Pick<StatementAccount, 'code' | 'name' | 'type' | 'subtype' | 'controlRole' | 'liquidity' | 'cashFlowClass'>;
  side: 'debit' | 'credit';
  amount: number;
};

export type CashFlowGroup =
  | 'receipts_customers'
  | 'payments_suppliers_employees'
  | 'taxes_paid'
  | 'other_operating'
  | 'ppe'
  | 'other_investing'
  | 'capital'
  | 'drawings'
  | 'borrowings'
  | 'other_financing';

const CF_LABEL: Record<CashFlowGroup, string> = {
  receipts_customers: 'Cash receipts from customers',
  payments_suppliers_employees: 'Cash paid to suppliers and employees',
  taxes_paid: 'Taxes paid',
  other_operating: 'Other operating cash flows',
  ppe: 'Purchase or sale of property, plant and equipment',
  other_investing: 'Other investing cash flows',
  capital: 'Capital introduced',
  drawings: 'Drawings and dividends paid',
  borrowings: 'Borrowings received or repaid',
  other_financing: 'Other financing cash flows',
};

export function isCashAccount(a: Pick<StatementAccount, 'type' | 'subtype' | 'liquidity' | 'controlRole' | 'name' | 'code'>) {
  return a.type === 'asset' && fpGroup({ ...a, debit: 0, credit: 0 } as StatementAccount) === 'cash';
}

export function cashFlowGroup(a: CashJournalLine['account']): CashFlowGroup {
  const name = lc(a.name);
  const cls = lc(a.cashFlowClass);
  const full = { ...a, debit: 0, credit: 0 } as StatementAccount;
  const fp = a.type === 'asset' || a.type === 'liability' || a.type === 'equity' ? fpGroup(full) : null;
  if (a.type === 'equity') return /drawing|dividend/.test(name) ? 'drawings' : 'capital';
  if (fp === 'ppe' || fp === 'intangibles' || fp === 'other_non_current_assets' || cls === 'investing') return fp === 'ppe' ? 'ppe' : 'other_investing';
  if (a.type === 'asset' && /loan/.test(name)) return 'other_investing';
  if (fp === 'non_current_borrowings' || fp === 'current_borrowings' || (a.type === 'liability' && /loan|borrow/.test(name))) return 'borrowings';
  if (cls === 'financing') return 'other_financing';
  if (fp === 'tax_liabilities' || (a.type === 'asset' && /vat|tax/.test(name)) || /income tax/.test(name)) return 'taxes_paid';
  if (a.type === 'revenue' || fp === 'receivables' && /receivable|customer/.test(name) || lc(a.controlRole) === 'ar' || /customer/.test(name)) {
    return 'receipts_customers';
  }
  if (a.type === 'expense' || fp === 'payables' || fp === 'inventories' || /supplier|staff|salar/.test(name)) return 'payments_suppliers_employees';
  return 'other_operating';
}

function cashGroupsOf(lines: CashJournalLine[]) {
  const byEntry = new Map<string, CashJournalLine[]>();
  for (const l of lines) byEntry.set(l.entryId, [...(byEntry.get(l.entryId) ?? []), l]);
  const totals = new Map<CashFlowGroup, Map<string, NoteAccount>>();
  for (const entry of byEntry.values()) {
    const cash = entry.filter((l) => isCashAccount(l.account));
    const other = entry.filter((l) => !isCashAccount(l.account));
    const delta = sum(cash.map((l) => (l.side === 'debit' ? l.amount : -l.amount)));
    if (Math.abs(delta) < 0.005 || other.length === 0) continue; // transfers between cash accounts
    // Each non-cash line explains part of the cash change, in proportion to its amount.
    const weight = sum(other.map((l) => (l.side === 'credit' ? l.amount : -l.amount)));
    if (Math.abs(weight) < 0.005) continue;
    for (const l of other) {
      const share = r2(((l.side === 'credit' ? l.amount : -l.amount) / weight) * delta);
      const grp = cashFlowGroup(l.account);
      const m = totals.get(grp) ?? new Map<string, NoteAccount>();
      const row = m.get(l.account.code) ?? { code: l.account.code, name: l.account.name, amount: 0, compare: null };
      row.amount = r2(row.amount + share);
      m.set(l.account.code, row);
      totals.set(grp, m);
    }
  }
  return totals;
}

export function statementOfCashFlows(input: {
  lines: CashJournalLine[];
  openingCash: number;
  closingCash: number;
  compare?: { lines: CashJournalLine[]; openingCash: number; closingCash: number } | null;
}): Statement {
  const has = !!input.compare;
  const cur = cashGroupsOf(input.lines);
  const cmp = input.compare ? cashGroupsOf(input.compare.lines) : null;
  const L = (grp: CashFlowGroup): StatementLine => {
    const accs = new Map<string, NoteAccount>();
    for (const [code, a] of cur.get(grp) ?? []) accs.set(code, { ...a, compare: has ? 0 : null });
    for (const [code, a] of cmp?.get(grp) ?? []) {
      const row = accs.get(code) ?? { code, name: a.name, amount: 0, compare: 0 };
      row.compare = a.amount;
      accs.set(code, row);
    }
    const accounts = [...accs.values()].filter((n) => Math.abs(n.amount) >= 0.005 || Math.abs(n.compare ?? 0) >= 0.005);
    return lineFrom(grp, CF_LABEL[grp], accounts, has);
  };
  const keep = (lines: StatementLine[]) => lines.filter((l) => Math.abs(l.amount) >= 0.005 || Math.abs(l.compare ?? 0) >= 0.005);
  const op = keep([L('receipts_customers'), L('payments_suppliers_employees'), L('taxes_paid'), L('other_operating')]);
  const opTotal = totalLine('net_operating', 'Net cash from operating activities', op, has);
  const inv = keep([L('ppe'), L('other_investing')]);
  const invTotal = totalLine('net_investing', 'Net cash used in investing activities', inv, has);
  const fin = keep([L('capital'), L('drawings'), L('borrowings'), L('other_financing')]);
  const finTotal = totalLine('net_financing', 'Net cash from financing activities', fin, has);
  const net = totalLine('net_change', 'Net increase (decrease) in cash and cash equivalents', [opTotal, invTotal, finTotal], has);
  const opening: StatementLine = {
    key: 'opening_cash',
    label: 'Cash and cash equivalents at the beginning of the period',
    kind: 'line',
    level: 0,
    amount: r2(input.openingCash),
    compare: has ? r2(input.compare!.openingCash) : null,
  };
  const closing = totalLine('closing_cash', 'Cash and cash equivalents at the end of the period', [net, opening], has, 'total');
  const diff = r2(closing.amount - input.closingCash);
  return {
    id: 'cash_flows',
    title: 'Statement of Cash Flows',
    lines: [
      heading('h_op', 'Cash flows from operating activities'),
      ...op,
      opTotal,
      ...section('h_inv', 'Cash flows from investing activities', inv, invTotal),
      ...section('h_fin', 'Cash flows from financing activities', fin, finTotal),
      net,
      opening,
      closing,
    ],
    checks: [{ label: 'Closing cash agrees with the ledger', ok: Math.abs(diff) < 0.01, difference: diff }],
  };
}

// ── Changes in equity ────────────────────────────────────────────────────────

/**
 * Opening equity (day before the period) → profit, capital introduced, drawings → closing equity,
 * by component (stated capital / retained earnings / drawings).
 */
export function statementOfChangesInEquity(input: {
  opening: StatementAccount[];
  closing: StatementAccount[];
  periodProfit: number;
}): Statement {
  const eqParts = (accs: StatementAccount[]) => {
    const live = accs.filter((a) => !a.isGroup);
    const cap = sum(live.filter((a) => a.type === 'equity' && fpGroup(a) === 'stated_capital').map(amountOf));
    const dr = sum(live.filter((a) => a.type === 'equity' && fpGroup(a) === 'drawings').map(amountOf));
    const re = r2(sum(live.filter((a) => a.type === 'equity' && fpGroup(a) === 'retained_earnings').map(amountOf)) + profitFrom(live));
    return { cap, dr, re, total: r2(cap + dr + re) };
  };
  const o = eqParts(input.opening);
  const c = eqParts(input.closing);
  const capitalIntroduced = r2(c.cap - o.cap);
  const drawings = r2(c.dr - o.dr);
  const otherRe = r2(c.re - o.re - input.periodProfit);
  const line = (key: string, label: string, amount: number, kind: StatementLine['kind'] = 'line'): StatementLine => ({
    key,
    label,
    kind,
    level: 0,
    amount: r2(amount),
    compare: null,
    accounts: [],
  });
  const lines: StatementLine[] = [
    line('opening', 'Balance at the beginning of the period', o.total, 'subtotal'),
    line('profit', 'Profit for the period', input.periodProfit),
    line('capital', 'Capital introduced', capitalIntroduced),
    line('drawings', 'Drawings', drawings),
  ];
  if (Math.abs(otherRe) >= 0.005) lines.push(line('other', 'Other movements in retained earnings', otherRe));
  lines.push(line('closing', 'Balance at the end of the period', c.total, 'total'));
  const diff = r2(o.total + input.periodProfit + capitalIntroduced + drawings + otherRe - c.total);
  return {
    id: 'changes_in_equity',
    title: 'Statement of Changes in Equity',
    lines,
    checks: [{ label: 'Movements add up to closing equity', ok: Math.abs(diff) < 0.01, difference: diff }],
  };
}

/** Comparative period: previous month, previous financial year, or the same length just before. */
export function comparativeRange(from: string | null, to: string | null): { from: string; to: string } | null {
  if (!from || !to) return null;
  const d = (s: string) => new Date(`${s}T12:00:00Z`);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const a = d(from);
  const b = d(to);
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0, 12)).getUTCDate();
  const fullMonths =
    a.getUTCDate() === 1 && b.getUTCDate() === lastDay(b.getUTCFullYear(), b.getUTCMonth());
  if (fullMonths) {
    const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
    const pf = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() - months, 1, 12));
    const pt = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 0, 12));
    return { from: iso(pf), to: iso(pt) };
  }
  const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  const pt = new Date(a.getTime() - 86400000);
  const pf = new Date(pt.getTime() - (days - 1) * 86400000);
  return { from: iso(pf), to: iso(pt) };
}
