import {
  classifyAccount,
  isProtectedControl,
  isRootClass,
  normalSideFor,
  wizardTemplate,
  type AccountClassificationInput,
  type AccountRootClass,
  type ClassifiedAccount,
  type WizardTemplateId,
} from './account-classification';

export type LifecycleAccount = ClassifiedAccount & {
  id?: string;
  name: string;
  description?: string | null;
  parentCode?: string | null;
  parentId?: string | null;
  isActive?: boolean;
  version?: number;
  postedCount?: number;
  balance?: number;
  childCount?: number;
  advanceOutstanding?: number;
};

export type LifecycleIssue = { field: string; message: string };

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalizeAccountCode(raw: string): string {
  return raw.trim().replace(/\s+/g, '');
}

export function normalizeAccountName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function validateAccountCode(code: string): string | null {
  if (!code) return 'Enter an account code.';
  if (code.length < 2 || code.length > 20) return 'Use 2–20 characters for the account code.';
  if (!/^[0-9A-Za-z]+$/.test(code)) return 'Use letters and digits only for the account code.';
  return null;
}

export function validateAccountName(name: string): string | null {
  if (!name) return 'Enter an account name.';
  if (name.length < 2) return 'Name is too short.';
  if (name.length > 255) return 'Name is too long.';
  return null;
}

export type ExistingAccountLite = {
  id?: string;
  code: string;
  name: string;
  type: string;
  isActive?: boolean;
  voided?: boolean;
  isGroup?: boolean;
};

export function duplicateCodeIssue(code: string, existing: ExistingAccountLite[], exceptId?: string): LifecycleIssue | null {
  const needle = code.toLowerCase();
  const hit = existing.find((row) => row.code.toLowerCase() === needle && row.id !== exceptId);
  if (hit) return { field: 'code', message: `Code ${code} is already used.` };
  return null;
}

export function duplicateActiveNameIssue(
  name: string,
  existing: ExistingAccountLite[],
  exceptId?: string,
): LifecycleIssue | null {
  const needle = name.toLowerCase();
  const hit = existing.find(
    (row) =>
      row.name.toLowerCase() === needle &&
      row.id !== exceptId &&
      row.isActive !== false &&
      row.voided !== true,
  );
  if (hit) return { field: 'name', message: 'An active account with this name already exists.' };
  return null;
}

export function parentIssues(input: {
  parentCode?: string | null;
  type: AccountRootClass;
  code: string;
  existing: ExistingAccountLite[];
}): LifecycleIssue[] {
  const parentCode = input.parentCode?.trim();
  if (!parentCode) return [];
  if (parentCode.toLowerCase() === input.code.toLowerCase()) {
    return [{ field: 'parentCode', message: 'An account cannot be its own parent.' }];
  }
  const parent = input.existing.find((row) => row.code.toLowerCase() === parentCode.toLowerCase());
  if (!parent) return [{ field: 'parentCode', message: 'Parent account was not found in this company.' }];
  if (parent.voided) return [{ field: 'parentCode', message: 'Parent account is archived.' }];
  if (parent.type !== input.type) {
    return [{ field: 'parentCode', message: 'Parent must be the same statement class.' }];
  }
  return [];
}

export function validateCreateAccount(input: {
  templateId?: string;
  code: string;
  name: string;
  type?: string;
  parentCode?: string | null;
  description?: string | null;
  existing: ExistingAccountLite[];
}): { ok: true; account: ClassifiedAccount; name: string } | { ok: false; issues: LifecycleIssue[] } {
  const issues: LifecycleIssue[] = [];
  const code = normalizeAccountCode(input.code);
  const name = normalizeAccountName(input.name);
  const codeErr = validateAccountCode(code);
  if (codeErr) issues.push({ field: 'code', message: codeErr });
  const nameErr = validateAccountName(name);
  if (nameErr) issues.push({ field: 'name', message: nameErr });
  const dupCode = duplicateCodeIssue(code, input.existing);
  if (dupCode) issues.push(dupCode);
  const dupName = duplicateActiveNameIssue(name, input.existing);
  if (dupName) issues.push(dupName);
  const template = input.templateId ? wizardTemplate(input.templateId) : null;
  const type = (isRootClass(input.type) ? input.type : template?.type) ?? 'asset';
  issues.push(...parentIssues({ parentCode: input.parentCode, type, code, existing: input.existing }));
  if (issues.length) return { ok: false, issues };
  const classified = classifyAccount({
    code,
    type,
    subtype: template?.subtype,
    purpose: template?.purpose,
    isGroup: template?.isGroup,
    isSystem: false,
    isContra: template?.isContra,
    cashFlowClass: template?.cashFlowClass,
    liquidity: template?.liquidity,
    reconcilable: template?.reconcilable,
    controlRole: template?.isGroup ? 'none' : template?.controlRole,
  });
  return { ok: true, account: classified, name };
}

const LOCKED_AFTER_USE = new Set(['type', 'subtype', 'normalSide', 'liquidity', 'controlRole', 'isContra', 'isGroup']);

export function validateEditAccount(input: {
  current: LifecycleAccount;
  patch: Partial<Pick<LifecycleAccount, 'name' | 'description' | 'parentCode' | 'type' | 'subtype' | 'normalSide' | 'liquidity' | 'controlRole' | 'isContra' | 'isGroup' | 'code'>>;
  expectedVersion: number;
  existing: ExistingAccountLite[];
}): { ok: true } | { ok: false; issues: LifecycleIssue[] } {
  const issues: LifecycleIssue[] = [];
  if (input.expectedVersion !== (input.current.version ?? 1)) {
    issues.push({ field: 'version', message: 'This account changed since you opened it. Reload and try again.' });
  }
  if (input.patch.code && normalizeAccountCode(input.patch.code) !== input.current.code) {
    if ((input.current.postedCount ?? 0) > 0) {
      issues.push({ field: 'code', message: 'Account code cannot change after journals exist. The account id stays the reference.' });
    } else {
      const code = normalizeAccountCode(input.patch.code);
      const codeErr = validateAccountCode(code);
      if (codeErr) issues.push({ field: 'code', message: codeErr });
      const dup = duplicateCodeIssue(code, input.existing, input.current.id);
      if (dup) issues.push(dup);
    }
  }
  if (input.patch.name != null) {
    const name = normalizeAccountName(input.patch.name);
    const nameErr = validateAccountName(name);
    if (nameErr) issues.push({ field: 'name', message: nameErr });
    const dup = duplicateActiveNameIssue(name, input.existing, input.current.id);
    if (dup) issues.push(dup);
  }
  const used = (input.current.postedCount ?? 0) > 0 || (input.current.childCount ?? 0) > 0;
  if (used) {
    for (const key of LOCKED_AFTER_USE) {
      const next = (input.patch as Record<string, unknown>)[key];
      if (next != null && String(next) !== String((input.current as Record<string, unknown>)[key])) {
        issues.push({
          field: key,
          message: 'Class, subtype, normal side and control role cannot change after the account is in use.',
        });
      }
    }
  }
  if (isProtectedControl(input.current)) {
    if (input.patch.isGroup === true) {
      issues.push({ field: 'isGroup', message: 'A system control cannot become a group heading.' });
    }
  }
  if (input.patch.parentCode !== undefined) {
    issues.push(
      ...parentIssues({
        parentCode: input.patch.parentCode,
        type: input.current.type,
        code: input.current.code,
        existing: input.existing,
      }),
    );
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true };
}

export function validateArchiveAccount(input: {
  current: LifecycleAccount;
}): { ok: true } | { ok: false; issues: LifecycleIssue[] } {
  const issues: LifecycleIssue[] = [];
  const balance = roundMoney(Math.abs(input.current.balance ?? 0));
  if (balance >= 0.005) {
    issues.push({
      field: 'balance',
      message: `Cannot archive ${input.current.code} while the balance is ${balance.toFixed(2)}. Clear or transfer the balance first.`,
    });
  }
  if ((input.current.advanceOutstanding ?? 0) >= 0.005) {
    issues.push({
      field: 'advances',
      message: 'Cannot archive an account with outstanding advance allocations.',
    });
  }
  if ((input.current.childCount ?? 0) > 0) {
    issues.push({ field: 'children', message: 'Cannot archive a group that still has child accounts.' });
  }
  if (isProtectedControl(input.current) && (input.current.postedCount ?? 0) > 0) {
    issues.push({ field: 'system', message: 'System control accounts with history cannot be archived.' });
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true };
}

export function cosmeticRenameKeepsHistory(previousName: string, nextName: string): boolean {
  return normalizeAccountName(previousName) !== normalizeAccountName(nextName);
}

export function derivedNormalSide(type: AccountRootClass, isContra: boolean): 'debit' | 'credit' {
  return normalSideFor(type, { isContra });
}

export function templateIdFromSubtype(subtype: string): WizardTemplateId | null {
  const map: Record<string, WizardTemplateId> = {
    bank: 'bank',
    cash: 'cash',
    card_clearing: 'card_clearing',
    supplier_advance: 'supplier_advance',
    staff_advance: 'staff_advance',
    customer_advance: 'customer_advance',
    operating_expense: 'expense',
    other_income: 'income',
    other_asset: 'other_asset',
    other_liability: 'liability',
    equity: 'equity',
    group: 'group',
  };
  return map[subtype] ?? null;
}
