import { UNPAID_METHOD, type OrderInput, type PaymentSettings } from './types';

export const EMPTY_PAYMENT_SETTINGS: PaymentSettings = { defaultAccountCode: null, methods: {}, seenMethods: [] };

/** Payment method names compare case- and space-insensitively ("PayHere " = "payhere"). */
export function paymentMethodKey(method: string | null | undefined): string {
  return String(method ?? '').trim().toLowerCase().slice(0, 60);
}

export function normalizePaymentSettings(raw: unknown): PaymentSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_PAYMENT_SETTINGS, methods: {}, seenMethods: [] };
  const obj = raw as Record<string, unknown>;
  const code = typeof obj.defaultAccountCode === 'string' && obj.defaultAccountCode.trim() ? obj.defaultAccountCode.trim() : null;
  const methods: Record<string, string> = {};
  if (obj.methods && typeof obj.methods === 'object' && !Array.isArray(obj.methods)) {
    for (const [k, v] of Object.entries(obj.methods as Record<string, unknown>)) {
      const key = paymentMethodKey(k);
      if (key && typeof v === 'string' && v.trim()) methods[key] = v.trim();
    }
  }
  const seen = Array.isArray(obj.seenMethods)
    ? [...new Set(obj.seenMethods.map((m) => paymentMethodKey(String(m))).filter(Boolean))].slice(0, 50)
    : [];
  return { defaultAccountCode: code, methods, seenMethods: seen };
}

export type PaymentResolution =
  | { accountCode: string; source: 'order_code' | 'method' | 'default' }
  | { accountCode: null; source: 'not_paid' | 'unpaid_rule' | 'not_configured'; method: string };

/**
 * Which account settles a paid order. Order of precedence: a 4-digit account
 * code sent as the method (kept for existing integrations), the method's own
 * mapping, then the store default. Unpaid orders never settle.
 */
export function resolvePaymentAccount(settings: PaymentSettings | undefined, input: OrderInput): PaymentResolution {
  const rawMethod = input.payment?.method?.trim() ?? '';
  const method = paymentMethodKey(rawMethod);
  if (input.payment?.status !== 'paid') return { accountCode: null, source: 'not_paid', method };
  if (/^\d{4}$/.test(rawMethod)) return { accountCode: rawMethod, source: 'order_code' };
  const s = settings ?? EMPTY_PAYMENT_SETTINGS;
  const mapped = method ? s.methods[method] : undefined;
  if (mapped === UNPAID_METHOD) return { accountCode: null, source: 'unpaid_rule', method };
  if (mapped) return { accountCode: mapped, source: 'method' };
  if (s.defaultAccountCode) return { accountCode: s.defaultAccountCode, source: 'default' };
  return { accountCode: null, source: 'not_configured', method };
}

/** Remember a method name the store sent, so the settings list fills itself in. */
export function withSeenMethod(settings: PaymentSettings | undefined, method: string | null | undefined): PaymentSettings | null {
  const key = paymentMethodKey(method);
  const s = settings ?? EMPTY_PAYMENT_SETTINGS;
  if (!key || /^\d{4}$/.test(key) || s.seenMethods.includes(key) || s.seenMethods.length >= 50) return null;
  return { ...s, methods: { ...s.methods }, seenMethods: [...s.seenMethods, key] };
}
