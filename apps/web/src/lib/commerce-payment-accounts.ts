import { classifiedSeedValues, isCashUniverseCode, nextSuggestedCode } from '@bookone/accounting';
import { accounts, and, db, eq, isNull, withTenantContext } from '@bookone/db';

export type PaymentAccountOption = { code: string; name: string };

/** Accounts a paid web order may settle into: active, postable cash/bank/clearing (10xx–12xx). */
export async function listCommercePaymentAccounts(tenantId: string): Promise<PaymentAccountOption[]> {
  return withTenantContext(tenantId, async () => {
    const rows = await db()
      .select({ code: accounts.code, name: accounts.name, type: accounts.type, isActive: accounts.isActive, isGroup: accounts.isGroup })
      .from(accounts)
      .where(and(eq(accounts.tenantId, tenantId), isNull(accounts.voidedAt)));
    return rows
      .filter((r) => r.type === 'asset' && r.isActive === '1' && r.isGroup !== '1' && isCashUniverseCode(r.code))
      .map((r) => ({ code: r.code, name: r.name }))
      .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
  });
}

/**
 * New clearing account for a payment gateway or channel, in the card-clearing
 * range 1201–1299 (BookOne accepts it as a payment account and it reconciles).
 */
export async function createGatewayClearingAccount(tenantId: string, gatewayName: string): Promise<PaymentAccountOption> {
  const label = gatewayName.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (label.length < 2) throw new Error('Enter the gateway or channel name, for example the provider your shop uses.');
  const name = /clearing$/i.test(label) ? label : `${label} clearing`;
  return withTenantContext(tenantId, async () => {
    const existing = await db()
      .select({ code: accounts.code, name: accounts.name, voidedAt: accounts.voidedAt })
      .from(accounts)
      .where(eq(accounts.tenantId, tenantId));
    const same = existing.find((e) => !e.voidedAt && e.name.toLowerCase() === name.toLowerCase());
    if (same) return { code: same.code, name: same.name };
    const code = nextSuggestedCode({ from: 1201, to: 1299 }, existing.map((e) => e.code));
    if (!code) throw new Error('No free clearing account code is left (1201–1299).');
    const seed = classifiedSeedValues({ code, name, type: 'asset', normalSide: 'debit' });
    await db().insert(accounts).values({
      tenantId,
      code,
      name,
      type: 'asset',
      normalSide: 'debit',
      isActive: '1',
      subtype: seed.subtype,
      purpose: seed.purpose,
      isGroup: '0',
      isSystem: '0',
      isContra: '0',
      cashFlowClass: seed.cashFlowClass,
      liquidity: seed.liquidity,
      reconcilable: '1',
      controlRole: seed.controlRole,
      description: 'Holds paid web-store receipts until the gateway pays out to the bank.',
    });
    return { code, name };
  });
}
