export const TEAM_SOD_MESSAGE =
  'This person can record supplier bills and also pay them. Many companies split those jobs.';

/** Never banner stock Owner/Admin. Armed when the job is customized or an extra job is set. */
export function teamSodArmed(opts: {
  templateKey: string | null | undefined;
  customized: boolean;
  hasExtra: boolean;
}): boolean {
  const key = (opts.templateKey ?? '').toLowerCase();
  if (key === 'owner' || key === 'admin') return false;
  return opts.customized || opts.hasExtra;
}

export function grantsHaveBillAndPay(keys: Iterable<string>): boolean {
  const set = keys instanceof Set ? keys : new Set(keys);
  return set.has('purchase.bills.write') && set.has('purchase.payments.write');
}
