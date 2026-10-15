/**
 * Output VAT follows product tax classification + company registration + channel.
 * Document style (commercial vs tax invoice) is presentation only.
 */
export function lineIsOutputTaxable(taxStatus: string | null | undefined): boolean {
  return String(taxStatus ?? 'unknown') !== 'exempt';
}

export function salesOutputVatRatePercent(args: {
  vatRegistered: boolean;
  saleChannel: string;
  domesticRatePercent: number;
  exportRatePercent: number;
}): number {
  if (!args.vatRegistered) return 0;
  if (args.saleChannel === 'export') return Math.max(0, args.exportRatePercent);
  return Math.max(0, args.domesticRatePercent);
}
