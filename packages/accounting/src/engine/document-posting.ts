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

export interface SaleLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discountAmount?: number;
  productType?: 'stocked' | 'service';
  revenueAccountCode?: string;
  cogsAccountCode?: string;
  inventoryAccountCode?: string;
}

export interface BuiltSalePosting {
  netTotal: number;
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

/** Credit sale: Dr AR, Cr Revenue (net); optional COGS/Inventory per stocked line */
export function buildSalesInvoicePosting(input: {
  lines: SaleLineInput[];
  headerDiscount?: number;
  settledCashAccountCode?: string | null; // if set, cash sale instead of AR
  memo?: string;
}): BuiltSalePosting {
  const memo = input.memo ?? 'Sales invoice';
  const headerDiscount = round2(input.headerDiscount ?? 0);

  let gross = 0;
  let lineDiscounts = 0;
  let cogsTotal = 0;
  const cogsLines: PostingLine[] = [];

  for (const line of input.lines) {
    const lineGross = round2(line.quantity * line.unitPrice);
    const disc = round2(line.discountAmount ?? 0);
    gross = round2(gross + lineGross);
    lineDiscounts = round2(lineDiscounts + disc);

    if (line.productType === 'stocked' && line.quantity > 0) {
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
  const settleCode = input.settledCashAccountCode ?? null;
  const controlCode = settleCode ?? '1300';

  const lines: PostingLine[] = [
    {
      accountCode: controlCode,
      side: 'debit',
      amount: netTotal,
      memo,
    },
    {
      accountCode: '4000',
      side: 'credit',
      amount: netTotal,
      memo,
    },
    ...cogsLines,
  ];

  assertBalanced(lines);
  return { netTotal, cogsTotal, lines };
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
    if (line.productType === 'stocked' && line.quantity > 0) {
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
  return { netTotal, cogsTotal, lines };
}

/** Vendor bill / local or import purchase: Dr Expense/Inventory, Cr AP */
export function buildVendorBillPosting(input: {
  total: number;
  expenseAccountCode: string;
  memo?: string;
  isInventoryPurchase?: boolean;
}): PostingLine[] {
  const total = round2(input.total);
  const debitCode = input.isInventoryPurchase ? '5100' : input.expenseAccountCode;
  const lines: PostingLine[] = [
    { accountCode: debitCode, side: 'debit', amount: total, memo: input.memo ?? 'Vendor bill' },
    { accountCode: '2100', side: 'credit', amount: total, memo: input.memo ?? 'Vendor bill' },
  ];
  assertBalanced(lines);
  return lines;
}

/**
 * Purchase return: reverse a bill.
 * Dr AP 2100, Cr Inventory 5100 (stocked) or expense account.
 */
export function buildPurchaseReturnPosting(input: {
  total: number;
  expenseAccountCode?: string;
  isInventoryPurchase?: boolean;
  memo?: string;
}): PostingLine[] {
  const total = round2(input.total);
  const creditCode = input.isInventoryPurchase ? '5100' : input.expenseAccountCode ?? '6800';
  const memo = input.memo ?? 'Purchase return';
  const lines: PostingLine[] = [
    { accountCode: '2100', side: 'debit', amount: total, memo },
    { accountCode: creditCode, side: 'credit', amount: total, memo },
  ];
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
