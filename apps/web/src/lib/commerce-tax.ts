/**
 * QA-1126-20: how a paid web order is taxed when it posts.
 * BookOne posts output VAT only on tax invoices. A VAT-registered company must
 * not book shop sales without VAT, and BookOne cannot guess whether a shop price
 * includes VAT, so anything it cannot reconcile is held for review.
 */
export type CommerceTaxDecision =
  | { kind: 'commercial' }
  | { kind: 'tax_invoice' }
  | { kind: 'review'; reason: string };

export function commerceTaxDecision(args: {
  vatRegistered: boolean;
  ratePercent: number;
  /** Sum of line quantity × unit price − line discounts, before order discount. */
  linesNet: number;
  headerDiscount: number;
  /** Order tax plus line tax as sent by the shop. */
  storeTax: number;
  lineCount: number;
}): CommerceTaxDecision {
  const tax = round2(args.storeTax);
  if (!args.vatRegistered) {
    if (tax > 0.005) {
      return {
        kind: 'review',
        reason: `The shop charged tax of ${tax.toFixed(2)}, but this company is not VAT registered in BookOne (Company → Tax). Held for review.`,
      };
    }
    return { kind: 'commercial' };
  }
  if (tax <= 0.005) {
    return {
      kind: 'review',
      reason:
        'This company is VAT registered, but the shop order carries no tax, so BookOne cannot tell whether the price includes VAT. Set the shop to charge tax on prices excluding tax, then use Retry, or post the invoice by hand.',
    };
  }
  const base = Math.max(0, args.linesNet - args.headerDiscount);
  const expected = round2((base * args.ratePercent) / 100);
  const tolerance = 0.01 + 0.005 * Math.max(1, args.lineCount);
  if (Math.abs(expected - tax) <= tolerance) return { kind: 'tax_invoice' };
  return {
    kind: 'review',
    reason: `Shop tax ${tax.toFixed(2)} does not match BookOne VAT ${expected.toFixed(2)} (${args.ratePercent}% of ${round2(base).toFixed(2)}). Check the shop's tax rate or whether prices include tax, then use Retry.`,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
