import { createHash } from 'node:crypto';

const MONEY = /^-?\d+(\.\d{1,2})?$/;
const QTY = /^-?\d+$/;

export function parseMoney(value: string | undefined, label: string): number {
  const raw = (value ?? '').trim();
  if (!MONEY.test(raw)) {
    throw Object.assign(new Error(`${label} must be a decimal string with at most two places.`), {
      code: 'VALIDATION',
    });
  }
  return Number(raw);
}

export function parseQty(value: string, label: string): number {
  const raw = value.trim();
  if (!QTY.test(raw)) {
    throw Object.assign(new Error(`${label} must be a whole number. Fractional quantities are not supported in v1.`), {
      code: 'VALIDATION',
    });
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw Object.assign(new Error(`${label} must be a positive whole number.`), { code: 'VALIDATION' });
  }
  return n;
}

export function moneyString(n: number): string {
  return n.toFixed(2);
}

export function almostEqual(a: number, b: number, epsilon = 0.01): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function stableHash(value: unknown): string {
  return sha256Hex(JSON.stringify(sortKeys(value)));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
