import { parseEntityKind } from '@/lib/entity-kind';

/** Personal 1 · sole lite 2 · sole full 5 · starter 5 · growth 15 · pro 50 */
export function teamSeatCap(opts: {
  entityKind?: string | null;
  capabilityTier?: string | null;
  plan?: string | null;
}): number {
  const kind = parseEntityKind(opts.entityKind);
  if (kind === 'personal' || kind === 'pending') return 1;
  if (kind === 'sole_prop') return opts.capabilityTier === 'full' ? 5 : 2;
  const plan = (opts.plan ?? 'starter').toLowerCase();
  if (plan === 'growth') return 15;
  if (plan === 'pro' || plan === 'enterprise') return 50;
  return 5;
}
