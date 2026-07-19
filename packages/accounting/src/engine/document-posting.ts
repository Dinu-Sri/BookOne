/**
 * Pure journal builders for Sales / Purchase / Inventory documents.
 * Used for accounting accuracy tests without DB coupling.
 */

export type JournalSide = 'debit' | 'credit';

export interface PostingLine {
  accountCode: string;
  side: JournalSide;
  amount: number;
  memo: string;
}

/** Physical goods track qty + COGS. Legacy 'stocked' is treated as physical. */
export function isPhysicalProduct(type?: string | null): boolean {
  return type === 'physical' || type === 'stocked';
}

export interface SaleLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discountAmount?: number;
  /** physical | digital | service | stocked (legacy) */
  productType?: string;
  revenueAccountCode?: string;
  cogsAccountCode?: string;
  inventoryAccountCode?: string;
}

export interface BuiltSalePosting {
  /** Amount excluding VAT (revenue base) */
  netTotal: number;
  /** VAT amount (0 if commercial / zero-rated) */
  vatTotal: number;
  /** Inclusive total charged to customer */
  grandTotal: number;
  cogsTotal: number;
  lines: PostingLine[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function assertBalanced(lines: PostingLine[]) {
  const debit = round2(lines.filter((l) => l.side === 'debit').reduce((s, l) => s + l.amount, 0));
  const credit = round2(lines.filter((l) => l.side === 'credit').reduce((s, l) => s + l.amount, 0));
  if (debit !== credit) {
    throw new Error(`Unbalanced journal: debit ${debit} != credit ${credit}`);
  }
}

/**
 * Credit sale: Dr AR/Cash (incl. VAT), Cr Revenue (ex-VAT), optional Cr Output VAT 2200,
 * optional COGS/Inventory for physical lines.
 * unitPrice is treated as **excluding VAT**.
 */
export function buildSalesInvoicePosting(input: {
  lines: SaleLineInput[];
  headerDiscount?: number;
  settledCashAccountCode?: string | null; // if set, cash sale instead of AR
  /** VAT % applied on supply (e.g. 18). 0 = commercial / zero-rated */
  vatRatePercent?: number;
  outputVatAccountCode?: string;
  memo?: string;
}): BuiltSalePosting {
  const memo = input.memo ?? 'Sales invoice';
  const headerDiscount = round2(input.headerDiscount ?? 0);
  const vatRate = Math.max(0, input.vatRatePercent ?? 0);

  let gross = 0;
  let lineDiscounts = 0;
  let cogsTotal = 0;
  const cogsLines: PostingLine[] = [];

  for (const line of input.lines) {
    const lineGross = round2(line.quantity * line.unitPrice);
    const disc = round2(line.discountAmount ?? 0);
    gross = round2(gross + lineGross);
    lineDiscounts = round2(lineDiscounts + disc);

    if (isPhysicalProduct(line.productType) && line.quantity > 0) {
      const cogs = round2(line.quantity * line.unitCost);
      cogsTotal = round2(cogsTotal + cogs);
      if (cogs > 0) {
        cogsLines.push(
          {
            accountCode: line.cogsAccountCode ?? '5000',
            side: 'debit',
            amount: cogs,
            memo: `COGS ${line.description}`,
          },
          {
            accountCode: line.inventoryAccountCode ?? '5100',
            side: 'credit',
            amount: cogs,
            memo: `Inventory out ${line.description}`,
          },
        );
      }
    }
  }

  const netTotal = round2(Math.max(0, gross - lineDiscounts - headerDiscount));
  const vatTotal = round2((netTotal * vatRate) / 100);
  const grandTotal = round2(netTotal + vatTotal);
  const settleCode = input.settledCashAccountCode ?? null;
  const controlCode = settleCode ?? '1300';
  const vatCode = input.outputVatAccountCode ?? '2200';

  const lines: PostingLine[] = [
    {
      accountCode: controlCode,
      side: 'debit',
      amount: grandTotal,
      memo,
    },
    {
      accountCode: '4000',
      side: 'credit',
      amount: netTotal,
      memo,
    },
  ];
  if (vatTotal > 0) {
    lines.push({
      accountCode: vatCode,
      side: 'credit',
      amount: vatTotal,
      memo: `Output VAT ${vatRate}%`,
    });
  }
  lines.push(...cogsLines);

  assertBalanced(lines);
  return { netTotal, vatTotal, grandTotal, cogsTotal, lines };
}

/** Sales return: Dr Sales Returns 4100, Cr AR/Cash; reverse COGS for stocked */
export function buildSalesReturnPosting(input: {
  lines: SaleLineInput[];
  refundCashAccountCode?: string | null;
  memo?: string;
}): BuiltSalePosting {
  const memo = input.memo ?? 'Sales return';
  let netTotal = 0;
  let cogsTotal = 0;
  const cogsLines: PostingLine[] = [];

  for (const line of input.lines) {
    const lineNet = round2(line.quantity * line.unitPrice - (line.discountAmount ?? 0));
    netTotal = round2(netTotal + lineNet);
    if (isPhysicalProduct(line.productType) && line.quantity > 0) {
      const cogs = round2(line.quantity * line.unitCost);
      cogsTotal = round2(cogsTotal + cogs);
      if (cogs > 0) {
        cogsLines.push(
          {
            accountCode: line.inventoryAccountCode ?? '5100',
            side: 'debit',
            amount: cogs,
            memo: `Restock ${line.description}`,
          },
          {
            accountCode: line.cogsAccountCode ?? '5000',
            side: 'credit',
            amount: cogs,
            memo: `COGS reverse ${line.description}`,
          },
        );
      }
    }
  }

  const controlCode = input.refundCashAccountCode ?? '1300';
  const lines: PostingLine[] = [
    {
      accountCode: '4100',
      side: 'debit',
      amount: netTotal,
      memo,
    },
    {
      accountCode: controlCode,
      side: 'credit',
      amount: netTotal,
      memo,
    },
    ...cogsLines,
  ];

  assertBalanced(lines);
  return { netTotal, vatTotal: 0, grandTotal: netTotal, cogsTotal, lines };
}

/**
 * Vendor bill / local or import purchase: Dr Expense/Inventory (+ optional Input VAT), Cr AP.
 * `total` is **ex-VAT** goods/landed base. `vatRatePercent` adds recoverable input VAT.
 * `landedExtra` is added into inventory/expense debit (freight/duty/other) and into AP.
 */
export function buildVendorBillPosting(input: {
  total: number;
  expenseAccountCode: string;
  memo?: string;
  isInventoryPurchase?: boolean;
  vatRatePercent?: number;
  inputVatAccountCode?: string;
  /** Extra costs capitalized into inventory / expense (freight, duty, other) */
  landedExtra?: number;
}): PostingLine[] {
  const goods = round2(input.total);
  const landed = round2(Math.max(0, input.landedExtra ?? 0));
  const base = round2(goods + landed);
  const vatRate = Math.max(0, input.vatRatePercent ?? 0);
  // Input VAT typically on goods only (not always on freight/duty) — use goods base for SL SME simplicity
  const vatBase = goods;
  const vatTotal = round2((vatBase * vatRate) / 100);
  const debitCode = input.isInventoryPurchase ? '5100' : input.expenseAccountCode;
  const vatCode = input.inputVatAccountCode ?? '2300';
  const apTotal = round2(base + vatTotal);
  const memo = input.memo ?? 'Vendor bill';
  const lines: PostingLine[] = [
    { accountCode: debitCode, side: 'debit', amount: base, memo },
  ];
  if (vatTotal > 0) {
    lines.push({ accountCode: vatCode, side: 'debit', amount: vatTotal, memo: `Input VAT ${vatRate}%` });
  }
  lines.push({ accountCode: '2100', side: 'credit', amount: apTotal, memo });
  assertBalanced(lines);
  return lines;
}

/** Cash purchase (QBO Expense): Dr Expense/Inventory (+ Input VAT), Cr Bank/Cash — no AP */
export function buildCashPurchasePosting(input: {
  total: number;
  expenseAccountCode: string;
  paymentAccountCode: string;
  memo?: string;
  isInventoryPurchase?: boolean;
  vatRatePercent?: number;
  inputVatAccountCode?: string;
  landedExtra?: number;
}): PostingLine[] {
  const goods = round2(input.total);
  const landed = round2(Math.max(0, input.landedExtra ?? 0));
  const base = round2(goods + landed);
  const vatRate = Math.max(0, input.vatRatePercent ?? 0);
  const vatTotal = round2((goods * vatRate) / 100);
  const debitCode = input.isInventoryPurchase ? '5100' : input.expenseAccountCode;
  const payCode = input.paymentAccountCode || '1000';
  const vatCode = input.inputVatAccountCode ?? '2300';
  const payTotal = round2(base + vatTotal);
  const memo = input.memo ?? 'Cash purchase';
  const lines: PostingLine[] = [{ accountCode: debitCode, side: 'debit', amount: base, memo }];
  if (vatTotal > 0) {
    lines.push({ accountCode: vatCode, side: 'debit', amount: vatTotal, memo: `Input VAT ${vatRate}%` });
  }
  lines.push({ accountCode: payCode, side: 'credit', amount: payTotal, memo });
  assertBalanced(lines);
  return lines;
}

/**
 * Purchase return: reverse a bill.
 * Dr AP 2100, Cr Inventory 5100 (stocked) or expense account (+ reverse Input VAT).
 */
export function buildPurchaseReturnPosting(input: {
  total: number;
  expenseAccountCode?: string;
  isInventoryPurchase?: boolean;
  memo?: string;
  vatRatePercent?: number;
  inputVatAccountCode?: string;
}): PostingLine[] {
  const goods = round2(input.total);
  const vatRate = Math.max(0, input.vatRatePercent ?? 0);
  const vatTotal = round2((goods * vatRate) / 100);
  const creditCode = input.isInventoryPurchase ? '5100' : input.expenseAccountCode ?? '6800';
  const vatCode = input.inputVatAccountCode ?? '2300';
  const apTotal = round2(goods + vatTotal);
  const memo = input.memo ?? 'Purchase return';
  const lines: PostingLine[] = [
    { accountCode: '2100', side: 'debit', amount: apTotal, memo },
    { accountCode: creditCode, side: 'credit', amount: goods, memo },
  ];
  if (vatTotal > 0) {
    lines.push({ accountCode: vatCode, side: 'credit', amount: vatTotal, memo: `Input VAT reverse ${vatRate}%` });
  }
  assertBalanced(lines);
  return lines;
}

/** Stock adjustment: qty delta * cost; positive qty increases inventory asset */
export function buildStockAdjustmentPosting(input: {
  quantityDelta: number;
  unitCost: number;
  expenseAccountCode?: string;
  memo?: string;
}): PostingLine[] {
  const amount = round2(Math.abs(input.quantityDelta) * input.unitCost);
  if (amount === 0) return [];
  const expense = input.expenseAccountCode ?? '6800';
  const memo = input.memo ?? 'Stock adjustment';
  const increase = input.quantityDelta > 0;
  const lines: PostingLine[] = increase
    ? [
        { accountCode: '5100', side: 'debit', amount, memo },
        { accountCode: expense, side: 'credit', amount, memo },
      ]
    : [
        { accountCode: expense, side: 'debit', amount, memo },
        { accountCode: '5100', side: 'credit', amount, memo },
      ];
  assertBalanced(lines);
  return lines;
}

export function sumSides(lines: PostingLine[]) {
  return {
    debit: round2(lines.filter((l) => l.side === 'debit').reduce((s, l) => s + l.amount, 0)),
    credit: round2(lines.filter((l) => l.side === 'credit').reduce((s, l) => s + l.amount, 0)),
  };
}
