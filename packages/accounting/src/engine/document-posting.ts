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

/** Purchase line bucket for mixed inventory + expense bills */
export interface PurchaseLineBucket {
  /** Line amount ex-VAT (after discounts) */
  amount: number;
  /** true → inventory 5100; false → expense account */
  isInventory: boolean;
  expenseAccountCode?: string;
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
  settledCashAccountCode?: string | null;
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

  // Allocate net revenue across lines (by line contribution), honour product revenue accounts
  const lineNets = input.lines.map((line) => {
    const lineGross = round2(line.quantity * line.unitPrice);
    const disc = round2(line.discountAmount ?? 0);
    return Math.max(0, lineGross - disc);
  });
  const lineNetSum = lineNets.reduce((s, n) => s + n, 0) || 1;
  // Spread header discount proportionally
  const revByAccount = new Map<string, number>();
  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i]!;
    const share = lineNets[i]! / lineNetSum;
    const lineRev = round2(lineNets[i]! - headerDiscount * share);
    if (lineRev <= 0) continue;
    const code = line.revenueAccountCode || '4000';
    revByAccount.set(code, round2((revByAccount.get(code) ?? 0) + lineRev));
  }
  // Fix rounding so revenue credits equal netTotal
  let revSum = round2([...revByAccount.values()].reduce((s, n) => s + n, 0));
  if (revByAccount.size > 0 && revSum !== netTotal) {
    const firstKey = revByAccount.keys().next().value as string;
    revByAccount.set(firstKey, round2((revByAccount.get(firstKey) ?? 0) + (netTotal - revSum)));
  }
  if (revByAccount.size === 0 && netTotal > 0) {
    revByAccount.set('4000', netTotal);
  }

  const lines: PostingLine[] = [
    {
      accountCode: controlCode,
      side: 'debit',
      amount: grandTotal,
      memo,
    },
  ];
  for (const [code, amt] of revByAccount) {
    if (amt > 0) {
      lines.push({ accountCode: code, side: 'credit', amount: amt, memo });
    }
  }
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

/**
 * Sales return: Dr Sales Returns 4100, optional Dr Output VAT reverse 2200,
 * Cr AR/Cash (incl. VAT); reverse COGS for stocked.
 */
export function buildSalesReturnPosting(input: {
  lines: SaleLineInput[];
  refundCashAccountCode?: string | null;
  /** Reverse output VAT at this % on net (matches tax invoice sales) */
  vatRatePercent?: number;
  outputVatAccountCode?: string;
  memo?: string;
}): BuiltSalePosting {
  const memo = input.memo ?? 'Sales return';
  const vatRate = Math.max(0, input.vatRatePercent ?? 0);
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

  const vatTotal = round2((netTotal * vatRate) / 100);
  const grandTotal = round2(netTotal + vatTotal);
  const controlCode = input.refundCashAccountCode ?? '1300';
  const vatCode = input.outputVatAccountCode ?? '2200';

  const lines: PostingLine[] = [
    {
      accountCode: '4100',
      side: 'debit',
      amount: netTotal,
      memo,
    },
  ];
  if (vatTotal > 0) {
    // Reverse original Cr Output VAT
    lines.push({
      accountCode: vatCode,
      side: 'debit',
      amount: vatTotal,
      memo: `Output VAT reverse ${vatRate}%`,
    });
  }
  lines.push({
    accountCode: controlCode,
    side: 'credit',
    amount: grandTotal,
    memo,
  });
  lines.push(...cogsLines);

  assertBalanced(lines);
  return { netTotal, vatTotal, grandTotal, cogsTotal, lines };
}

function buildPurchaseDebits(input: {
  goodsTotal: number;
  landedExtra: number;
  expenseAccountCode: string;
  isInventoryPurchase?: boolean;
  lineBuckets?: PurchaseLineBucket[];
  memo: string;
}): { debits: PostingLine[]; inventoryDebit: number; expenseDebit: number } {
  const goods = round2(input.goodsTotal);
  const landed = round2(Math.max(0, input.landedExtra));
  const memo = input.memo;

  // Mixed-line path: per-line inventory vs expense
  if (input.lineBuckets && input.lineBuckets.length > 0) {
    let inv = 0;
    const expMap = new Map<string, number>();
    for (const b of input.lineBuckets) {
      const amt = round2(Math.max(0, b.amount));
      if (amt <= 0) continue;
      if (b.isInventory) inv = round2(inv + amt);
      else {
        const code = b.expenseAccountCode || input.expenseAccountCode || '6800';
        expMap.set(code, round2((expMap.get(code) ?? 0) + amt));
      }
    }
    // Landed extras capitalise into inventory if any stock lines, else default expense
    if (landed > 0) {
      if (inv > 0) inv = round2(inv + landed);
      else {
        const code = input.expenseAccountCode || '6800';
        expMap.set(code, round2((expMap.get(code) ?? 0) + landed));
      }
    }
    const debits: PostingLine[] = [];
    if (inv > 0) debits.push({ accountCode: '5100', side: 'debit', amount: inv, memo });
    for (const [code, amt] of expMap) {
      if (amt > 0) debits.push({ accountCode: code, side: 'debit', amount: amt, memo });
    }
    if (debits.length === 0) {
      debits.push({
        accountCode: input.isInventoryPurchase ? '5100' : input.expenseAccountCode || '6800',
        side: 'debit',
        amount: round2(goods + landed),
        memo,
      });
    }
    const expenseDebit = round2(
      debits.filter((d) => d.accountCode !== '5100').reduce((s, d) => s + d.amount, 0),
    );
    const inventoryDebit = round2(
      debits.filter((d) => d.accountCode === '5100').reduce((s, d) => s + d.amount, 0),
    );
    return { debits, inventoryDebit, expenseDebit };
  }

  // Legacy all-or-nothing
  const base = round2(goods + landed);
  const debitCode = input.isInventoryPurchase ? '5100' : input.expenseAccountCode || '6800';
  return {
    debits: [{ accountCode: debitCode, side: 'debit', amount: base, memo }],
    inventoryDebit: input.isInventoryPurchase ? base : 0,
    expenseDebit: input.isInventoryPurchase ? 0 : base,
  };
}

/**
 * Vendor bill: Dr Inventory and/or Expense (+ Input VAT), Cr AP.
 * Prefer `lineBuckets` for mixed goods/services; else `isInventoryPurchase` all-or-nothing.
 */
export function buildVendorBillPosting(input: {
  total: number;
  expenseAccountCode: string;
  memo?: string;
  isInventoryPurchase?: boolean;
  vatRatePercent?: number;
  inputVatAccountCode?: string;
  landedExtra?: number;
  /** Mixed-line split (amounts ex-VAT, before landed) */
  lineBuckets?: PurchaseLineBucket[];
}): PostingLine[] {
  const goods = round2(input.total);
  const landed = round2(Math.max(0, input.landedExtra ?? 0));
  const vatRate = Math.max(0, input.vatRatePercent ?? 0);
  const vatTotal = round2((goods * vatRate) / 100);
  const vatCode = input.inputVatAccountCode ?? '2300';
  const memo = input.memo ?? 'Vendor bill';

  const { debits } = buildPurchaseDebits({
    goodsTotal: goods,
    landedExtra: landed,
    expenseAccountCode: input.expenseAccountCode,
    isInventoryPurchase: input.isInventoryPurchase,
    lineBuckets: input.lineBuckets,
    memo,
  });

  const baseDebit = round2(debits.reduce((s, d) => s + d.amount, 0));
  const apTotal = round2(baseDebit + vatTotal);
  const lines: PostingLine[] = [...debits];
  if (vatTotal > 0) {
    lines.push({ accountCode: vatCode, side: 'debit', amount: vatTotal, memo: `Input VAT ${vatRate}%` });
  }
  lines.push({ accountCode: '2100', side: 'credit', amount: apTotal, memo });
  assertBalanced(lines);
  return lines;
}

/** Cash purchase: Dr Inv/Expense (+ Input VAT), Cr Bank/Cash — no AP */
export function buildCashPurchasePosting(input: {
  total: number;
  expenseAccountCode: string;
  paymentAccountCode: string;
  memo?: string;
  isInventoryPurchase?: boolean;
  vatRatePercent?: number;
  inputVatAccountCode?: string;
  landedExtra?: number;
  lineBuckets?: PurchaseLineBucket[];
}): PostingLine[] {
  const goods = round2(input.total);
  const landed = round2(Math.max(0, input.landedExtra ?? 0));
  const vatRate = Math.max(0, input.vatRatePercent ?? 0);
  const vatTotal = round2((goods * vatRate) / 100);
  const payCode = input.paymentAccountCode || '1000';
  const vatCode = input.inputVatAccountCode ?? '2300';
  const memo = input.memo ?? 'Cash purchase';

  const { debits } = buildPurchaseDebits({
    goodsTotal: goods,
    landedExtra: landed,
    expenseAccountCode: input.expenseAccountCode,
    isInventoryPurchase: input.isInventoryPurchase,
    lineBuckets: input.lineBuckets,
    memo,
  });

  const baseDebit = round2(debits.reduce((s, d) => s + d.amount, 0));
  const payTotal = round2(baseDebit + vatTotal);
  const lines: PostingLine[] = [...debits];
  if (vatTotal > 0) {
    lines.push({ accountCode: vatCode, side: 'debit', amount: vatTotal, memo: `Input VAT ${vatRate}%` });
  }
  lines.push({ accountCode: payCode, side: 'credit', amount: payTotal, memo });
  assertBalanced(lines);
  return lines;
}

/**
 * Purchase return.
 * Credit purchase: Dr AP 2100 …
 * Cash purchase return: Dr refund cash account (not AP) …
 * Cr Inventory/Expense (+ reverse Input VAT).
 */
export function buildPurchaseReturnPosting(input: {
  total: number;
  expenseAccountCode?: string;
  isInventoryPurchase?: boolean;
  memo?: string;
  vatRatePercent?: number;
  inputVatAccountCode?: string;
  /**
   * When set (e.g. 1000/1100), refunds cash/bank instead of reducing AP.
   * Use for returns of cash purchases.
   */
  refundCashAccountCode?: string | null;
  lineBuckets?: PurchaseLineBucket[];
}): PostingLine[] {
  const goods = round2(input.total);
  const vatRate = Math.max(0, input.vatRatePercent ?? 0);
  const vatTotal = round2((goods * vatRate) / 100);
  const vatCode = input.inputVatAccountCode ?? '2300';
  const memo = input.memo ?? 'Purchase return';
  const settleCode = input.refundCashAccountCode?.trim() || '2100';
  const settleTotal = round2(goods + vatTotal);

  // Credit inventory / expense
  const creditLines: PostingLine[] = [];
  if (input.lineBuckets && input.lineBuckets.length > 0) {
    let inv = 0;
    const expMap = new Map<string, number>();
    for (const b of input.lineBuckets) {
      const amt = round2(Math.max(0, b.amount));
      if (amt <= 0) continue;
      if (b.isInventory) inv = round2(inv + amt);
      else {
        const code = b.expenseAccountCode || input.expenseAccountCode || '6800';
        expMap.set(code, round2((expMap.get(code) ?? 0) + amt));
      }
    }
    if (inv > 0) creditLines.push({ accountCode: '5100', side: 'credit', amount: inv, memo });
    for (const [code, amt] of expMap) {
      if (amt > 0) creditLines.push({ accountCode: code, side: 'credit', amount: amt, memo });
    }
  }
  if (creditLines.length === 0) {
    const creditCode = input.isInventoryPurchase ? '5100' : input.expenseAccountCode ?? '6800';
    creditLines.push({ accountCode: creditCode, side: 'credit', amount: goods, memo });
  }

  const lines: PostingLine[] = [
    { accountCode: settleCode, side: 'debit', amount: settleTotal, memo },
    ...creditLines,
  ];
  if (vatTotal > 0) {
    lines.push({
      accountCode: vatCode,
      side: 'credit',
      amount: vatTotal,
      memo: `Input VAT reverse ${vatRate}%`,
    });
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

/**
 * Opening stock: capitalise inventory against equity (SME opening balance).
 * Dr 5100 Inventory · Cr 3000 Owner Equity (or opening equity code).
 */
export function buildOpeningStockPosting(input: {
  quantity: number;
  unitCost: number;
  equityAccountCode?: string;
  memo?: string;
}): PostingLine[] {
  const amount = round2(Math.abs(input.quantity) * input.unitCost);
  if (amount === 0 || input.quantity <= 0) return [];
  const equity = input.equityAccountCode ?? '3000';
  const memo = input.memo ?? 'Opening stock';
  const lines: PostingLine[] = [
    { accountCode: '5100', side: 'debit', amount, memo },
    { accountCode: equity, side: 'credit', amount, memo },
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
