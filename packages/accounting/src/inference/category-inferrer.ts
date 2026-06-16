import { ACCOUNTS_BY_CODE, DEFAULT_CHART_OF_ACCOUNTS, type Account } from '../chart-of-accounts';
import type { CategoryInference, EntryDirection } from './types';

interface CategoryRule {
  accountCode: string;
  patterns: RegExp[];
  defaultTypes: EntryDirection[];
}

export const CATEGORY_RULES: CategoryRule[] = [
  {
    accountCode: '6100',
    patterns: [/\brent\b/i, /\blease\b/i, /office\s*space/i],
    defaultTypes: ['money_out'],
  },
  {
    accountCode: '6300',
    patterns: [/\bsalary\b/i, /\bwages?\b/i, /\bpayroll\b/i, /staff\s*pay/i],
    defaultTypes: ['money_out'],
  },
  {
    accountCode: '6200',
    patterns: [/\belectricity\b/i, /\bwater\s*bill\b/i, /\binternet\b/i, /\bphone\s*bill\b/i, /\butility\b/i],
    defaultTypes: ['money_out'],
  },
  {
    accountCode: '6000',
    patterns: [/\bfacebook\b/i, /\bgoogle\s*ads?\b/i, /\badvertising\b/i, /\bmarketing\b/i, /\bpromot/i, /\bads?\b/i],
    defaultTypes: ['money_out'],
  },
  {
    accountCode: '6400',
    patterns: [/\btravel\b/i, /\btransport\b/i, /\bfuel\b/i, /\btaxi\b/i, /\buber\b/i, /\bbus\b/i],
    defaultTypes: ['money_out'],
  },
  {
    accountCode: '6500',
    patterns: [/\bstationery\b/i, /\bpaper\b/i, /\bpen\b/i, /office\s*supplies/i, /\bprinter\b/i],
    defaultTypes: ['money_out'],
  },
  {
    accountCode: '6700',
    patterns: [/\binsurance\b/i, /\bpolicy\b/i, /\bcoverage\b/i],
    defaultTypes: ['money_out'],
  },
  {
    accountCode: '6600',
    patterns: [/bank\s*charge/i, /bank\s*fee/i, /service\s*charge/i],
    defaultTypes: ['money_out'],
  },
  {
    accountCode: '5000',
    patterns: [/raw\s*material/i, /\bfabric\b/i, /\bwood\b/i, /\bsteel\b/i, /\bcomponent\b/i],
    defaultTypes: ['money_out'],
  },
  {
    accountCode: '5100',
    patterns: [/\binventory\b/i, /\bstock\b/i, /goods\s*for\s*resale/i, /\bmerchandise\b/i],
    defaultTypes: ['money_out'],
  },
  {
    accountCode: '3100',
    patterns: [/\bdrawing\b/i, /\bpersonal\b/i, /\bwithdrawal\b/i, /\bowner\s*draw/i],
    defaultTypes: ['money_out'],
  },
  {
    accountCode: '3000',
    patterns: [/\bowner\b/i, /\bcontribution\b/i, /\bcapital\b/i],
    defaultTypes: ['money_in'],
  },
  {
    accountCode: '4000',
    patterns: [/\bsale\b/i, /\bsold\b/i, /service\s*fee/i, /\bconsulting\b/i, /product\s*sale/i],
    defaultTypes: ['money_in'],
  },
];

const UNCATEGORIZED_ACCOUNT_CODE = '6800';

export function inferCategory(
  description: string,
  party: string,
  direction: EntryDirection,
  categoryOverride?: string,
): CategoryInference {
  if (categoryOverride) {
    const account = ACCOUNTS_BY_CODE[categoryOverride] ?? null;
    if (account) {
      return {
        categoryId: account.code,
        categoryName: account.name,
        accountCode: account.code,
        account,
        confidence: 1,
        source: 'override',
      };
    }
  }

  const haystack = `${description} ${party}`.trim();

  for (const rule of CATEGORY_RULES) {
    if (!rule.defaultTypes.includes(direction)) {
      continue;
    }
    if (rule.patterns.some((pattern) => pattern.test(haystack))) {
      const account = ACCOUNTS_BY_CODE[rule.accountCode];
      if (account) {
        return {
          categoryId: account.code,
          categoryName: account.name,
          accountCode: account.code,
          account,
          confidence: 0.9,
          source: 'rule',
        };
      }
    }
  }

  const fallback = ACCOUNTS_BY_CODE[UNCATEGORIZED_ACCOUNT_CODE];
  if (!fallback) {
    throw new Error('Default chart of accounts is missing the uncategorized fallback account.');
  }

  return {
    categoryId: fallback.code,
    categoryName: fallback.name,
    accountCode: fallback.code,
    account: fallback,
    confidence: 0.3,
    source: 'default',
  };
}

export function listKnownAccounts(): Account[] {
  return [...DEFAULT_CHART_OF_ACCOUNTS];
}
