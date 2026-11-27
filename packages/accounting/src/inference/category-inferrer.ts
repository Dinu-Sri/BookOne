import { ACCOUNTS_BY_CODE, DEFAULT_CHART_OF_ACCOUNTS, type Account } from '../chart-of-accounts';
import { chartOfAccountsForEntity, type CoaPackId } from '../coa-packs';
import type { CategoryInference, EntryDirection } from './types';

interface CategoryRule {
  accountCode: string;
  patterns: RegExp[];
  defaultTypes: EntryDirection[];
  /**
   * Charts this rule applies to. Omitted = every chart. Personal and sole-prop
   * charts reuse codes 6300/6500/6600 for household spending (Food & Household,
   * Healthcare, Education), so company rules for those codes must not fire
   * there ("office supplies" would land on Healthcare).
   */
  packs?: CoaPackId[];
}

const COMPANY: CoaPackId[] = ['company'];
const HOUSEHOLD: CoaPackId[] = ['personal', 'sole_prop'];

export const CATEGORY_RULES: CategoryRule[] = [
  {
    accountCode: '6100',
    patterns: [/\brent\b/i, /\blease\b/i, /office\s*space/i],
    defaultTypes: ['money_out'],
  },
  {
    accountCode: '6300',
    patterns: [/\bsalar(y|ies)\b/i, /\bwages?\b/i, /\bpayroll\b/i, /staff\s*pay/i],
    defaultTypes: ['money_out'],
    packs: COMPANY,
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
    packs: COMPANY,
  },
  {
    accountCode: '6700',
    patterns: [/\binsurance\b/i, /\bpolicy\b/i, /\bcoverage\b/i],
    defaultTypes: ['money_out'],
  },
  {
    accountCode: '6600',
    patterns: [/bank\s*charge/i, /bank\s*fee/i, /service\s*charge/i, /\bsms\s*(alert)?\s*(charge|fee)/i, /\bledger\s*fee/i, /\bcheque\s*book/i, /\bcommission\b/i],
    defaultTypes: ['money_out'],
    packs: COMPANY,
  },
  // Personal / sole-prop household categories on the shared codes.
  {
    accountCode: '6300',
    patterns: [/\bfood\b/i, /\bgrocer(y|ies)\b/i, /\bsupermarket\b/i, /\bhousehold\b/i, /\brestaurant\b/i, /\bmeals?\b/i, /\blunch\b/i, /\bdinner\b/i],
    defaultTypes: ['money_out'],
    packs: HOUSEHOLD,
  },
  {
    accountCode: '6500',
    patterns: [/\bdoctor\b/i, /\bhospital\b/i, /\bpharmacy\b/i, /\bmedicines?\b/i, /\bmedical\b/i, /\bclinic\b/i, /\bdental\b/i, /\bchannel+ing\b/i, /\bhealth\s*care\b/i],
    defaultTypes: ['money_out'],
    packs: HOUSEHOLD,
  },
  {
    accountCode: '6600',
    patterns: [/\bschool\b/i, /\btuition\b/i, /\bclass\s*fees?\b/i, /\bcourses?\b/i, /\beducation\b/i, /\buniversity\b/i, /\bbooks?\b/i],
    defaultTypes: ['money_out'],
    packs: HOUSEHOLD,
  },
  // Business costs these charts have no dedicated account for: General Expense,
  // never a household account that happens to share the company code.
  {
    accountCode: '6800',
    patterns: [
      /\bstationery\b/i, /office\s*supplies/i, /\bprinter\b/i,
      /\bsalar(y|ies)\b/i, /\bwages?\b/i, /\bpayroll\b/i, /staff\s*pay/i,
      /bank\s*charge/i, /bank\s*fee/i, /service\s*charge/i, /\bsms\s*(alert)?\s*(charge|fee)/i,
    ],
    defaultTypes: ['money_out'],
    packs: HOUSEHOLD,
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
    accountCode: '4200',
    patterns: [/\bsalar(y|ies)\b/i, /\bwages?\b/i, /\bpayroll\b/i, /\bemployment\b/i, /\bpaycheck\b/i],
    defaultTypes: ['money_in'],
  },
  {
    accountCode: '4300',
    patterns: [/\bgift\b/i, /\binheritance\b/i, /\brefund\b/i, /\bcashback\b/i, /\bother\s*income\b/i, /\binterest\b/i],
    defaultTypes: ['money_in'],
  },
  {
    accountCode: '4000',
    patterns: [/\bsale\b/i, /\bsold\b/i, /service\s*fee/i, /\bconsulting\b/i, /product\s*sale/i],
    defaultTypes: ['money_in'],
  },
  {
    accountCode: '2500',
    patterns: [/\bloan\s*pay/i, /\brepay\b/i, /\bprincipal\b/i],
    defaultTypes: ['money_out'],
  },
  {
    accountCode: '6900',
    patterns: [/\binterest\b/i, /\bloan\s*interest\b/i],
    defaultTypes: ['money_out'],
  },
];

const UNCATEGORIZED_MONEY_OUT = '6800';
const UNCATEGORIZED_MONEY_IN = '4300';

/** Which chart's rules apply. Unknown or missing kind keeps the company chart. */
export function categoryPackFor(entityKind?: string | null): CoaPackId {
  const k = String(entityKind ?? 'company').toLowerCase();
  // Sign-up seeds the personal pack before an entity kind is chosen.
  if (k === 'personal' || k === 'pending') return 'personal';
  if (k === 'sole_prop') return 'sole_prop';
  return 'company';
}

function inference(account: Account, confidence: number, source: CategoryInference['source']): CategoryInference {
  return { categoryId: account.code, categoryName: account.name, accountCode: account.code, account, confidence, source };
}

/**
 * Guess the category account for a Simple Entry.
 *
 * `entityKind` picks the chart the tenant was seeded with, so rules only point
 * at codes that chart has and names match what the tenant sees. Postings
 * resolve by code; a rule for a code the chart lacks would either fail to
 * resolve or land on an unrelated account that shares the code.
 */
export function inferCategory(
  description: string,
  party: string,
  direction: EntryDirection,
  categoryOverride?: string,
  entityKind?: string | null,
): CategoryInference {
  const pack = categoryPackFor(entityKind);
  const chart = pack === 'company' ? ACCOUNTS_BY_CODE : Object.fromEntries(chartOfAccountsForEntity(pack).map((a) => [a.code, a]));

  if (categoryOverride) {
    const account = chart[categoryOverride] ?? ACCOUNTS_BY_CODE[categoryOverride] ?? null;
    if (account) return inference(account, 1, 'override');
  }

  const haystack = `${description} ${party}`.trim();

  for (const rule of CATEGORY_RULES) {
    if (!rule.defaultTypes.includes(direction)) continue;
    if (rule.packs && !rule.packs.includes(pack)) continue;
    const account = chart[rule.accountCode];
    if (!account) continue;
    if (rule.patterns.some((pattern) => pattern.test(haystack))) {
      return inference(account, 0.9, 'rule');
    }
  }

  const fallbackCode = direction === 'money_in' ? UNCATEGORIZED_MONEY_IN : UNCATEGORIZED_MONEY_OUT;
  const fallback = chart[fallbackCode];
  if (!fallback) {
    throw new Error('Chart of accounts is missing the uncategorized fallback account.');
  }
  return inference(fallback, 0.3, 'default');
}

export function listKnownAccounts(): Account[] {
  return [...DEFAULT_CHART_OF_ACCOUNTS];
}

/**
 * Show the tenant's own name for the inferred code. Rules return pack names,
 * but postings resolve by code to the tenant's account, which may be renamed
 * (or still carry a personal name on a company tenant: 6500 "Healthcare").
 * The preview, the stored transaction and the ledger must name the same account.
 */
export function categoryWithAccountName(
  category: CategoryInference,
  tenantAccountName: string | null | undefined,
): CategoryInference {
  const name = tenantAccountName?.trim();
  if (!name || name === category.categoryName) return category;
  return { ...category, categoryName: name, account: { ...category.account, name } };
}
