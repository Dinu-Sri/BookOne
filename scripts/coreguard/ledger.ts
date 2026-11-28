import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import {
  centsToString,
  classifiedSeedValues,
  inferTransaction,
  sideTotalsCents,
  toCents,
  previewOpeningBalances,
  validateCreateAccount,
  wizardTemplate,
} from '../../packages/accounting/src/index';
import {
  centsToAmount,
  loadBankReconFixture,
  loadCustomBankFixture,
  type BankReconCashLine,
  type BankReconFixture,
  type CustomBankFixture,
} from './fixture';

export type LedgerSql = postgres.Sql;

export function openLedger(databaseUrl: string): LedgerSql {
  return postgres(databaseUrl, { max: 1 });
}

export async function withTenant<T>(sql: LedgerSql, tenantId: string, fn: () => Promise<T>): Promise<T> {
  await sql`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`;
  try {
    return await fn();
  } finally {
    await sql`SELECT set_config('app.current_tenant_id', '', false)`;
  }
}

export async function existingLite(sql: LedgerSql, tenantId: string) {
  const rows = await sql<{
    id: string;
    code: string;
    name: string;
    type: string;
    is_active: string;
    voided_at: Date | null;
    is_group: string;
  }[]>`
    SELECT id, code, name, type, is_active, voided_at, is_group
    FROM accounts
    WHERE tenant_id = ${tenantId}
  `;
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    isActive: row.is_active === '1',
    voided: Boolean(row.voided_at),
    isGroup: row.is_group === '1',
  }));
}

export async function createCustomBank(
  sql: LedgerSql,
  tenantId: string,
  userId: string,
  fixture: CustomBankFixture = loadCustomBankFixture(),
): Promise<{ id: string; code: string }> {
  return withTenant(sql, tenantId, async () => {
    const existing = await existingLite(sql, tenantId);
    const parsed = validateCreateAccount({
      templateId: fixture.customBank.templateId,
      code: fixture.customBank.code,
      name: fixture.customBank.name,
      existing,
    });
    if (!parsed.ok) {
      throw new Error(parsed.issues[0]?.message ?? 'Invalid custom bank.');
    }
    const template = wizardTemplate('bank');
    const seed = classifiedSeedValues({
      code: parsed.account.code,
      name: parsed.name,
      type: parsed.account.type,
      normalSide: parsed.account.normalSide,
    });
    const id = randomUUID();
    await sql`
      INSERT INTO accounts (
        id, tenant_id, code, name, type, normal_side, parent_code, description, subtype, purpose,
        is_group, is_system, is_contra, cash_flow_class, liquidity, reconcilable, control_role,
        institution, last_digits, is_active, version
      ) VALUES (
        ${id}, ${tenantId}, ${seed.code}, ${seed.name}, ${seed.type}, ${seed.normalSide}, NULL, NULL,
        ${template?.subtype ?? seed.subtype}, ${template?.purpose ?? seed.purpose}, '0', '0', '0',
        ${template?.cashFlowClass ?? seed.cashFlowClass}, ${template?.liquidity ?? seed.liquidity},
        ${template?.reconcilable ? '1' : '0'}, ${template?.controlRole ?? seed.controlRole},
        ${fixture.customBank.institution}, ${fixture.customBank.lastDigits}, '1', 1
      )
    `;
    await sql`
      INSERT INTO audit_log (id, tenant_id, user_id, action, table_name, record_id, new_values)
      VALUES (
        ${randomUUID()}, ${tenantId}, ${userId}, 'CREATE', 'accounts', ${id},
        ${sql.json({ code: seed.code, name: seed.name, template: 'bank' })}
      )
    `;
    return { id, code: seed.code };
  });
}

export type BalanceMap = Record<string, number>;

export async function accountBalances(sql: LedgerSql, tenantId: string): Promise<BalanceMap> {
  return withTenant(sql, tenantId, async () => {
    const rows = await sql<{ code: string; normal_side: string; debit: string; credit: string }[]>`
      SELECT
        a.code,
        a.normal_side,
        COALESCE(SUM(CASE WHEN jl.voided_at IS NULL AND jl.side = 'debit' THEN jl.amount::numeric ELSE 0 END), 0)::text AS debit,
        COALESCE(SUM(CASE WHEN jl.voided_at IS NULL AND jl.side = 'credit' THEN jl.amount::numeric ELSE 0 END), 0)::text AS credit
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.tenant_id = a.tenant_id
      LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.voided_at IS NULL
      WHERE a.tenant_id = ${tenantId} AND a.voided_at IS NULL
      GROUP BY a.id, a.code, a.normal_side
    `;
    const out: BalanceMap = {};
    for (const row of rows) {
      const debit = Number(row.debit);
      const credit = Number(row.credit);
      out[row.code] = row.normal_side === 'debit' ? debit - credit : credit - debit;
    }
    return out;
  });
}

export async function journalLineReadback(sql: LedgerSql, tenantId: string) {
  return withTenant(sql, tenantId, async () => {
    return sql<{
      journal_id: string;
      date: string;
      account_code: string;
      account_type: string;
      side: string;
      amount: string;
      memo: string | null;
      accounting_type: string;
      direction: string;
    }[]>`
      SELECT
        je.id AS journal_id,
        je.entry_date AS date,
        a.code AS account_code,
        a.type AS account_type,
        jl.side,
        jl.amount::text AS amount,
        jl.memo,
        t.accounting_type,
        t.direction
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounts a ON a.id = jl.account_id
      JOIN transactions t ON t.id = je.transaction_id
      WHERE jl.tenant_id = ${tenantId}
        AND jl.voided_at IS NULL
        AND je.voided_at IS NULL
        AND t.voided_at IS NULL
      ORDER BY je.entry_date, je.created_at, jl.side
    `;
  });
}

async function accountId(sql: LedgerSql, tenantId: string, code: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM accounts WHERE tenant_id = ${tenantId} AND code = ${code} AND voided_at IS NULL LIMIT 1
  `;
  if (!row) throw new Error(`Account ${code} was not found.`);
  return row.id;
}

async function insertBalancedJournal(
  sql: LedgerSql,
  input: {
    tenantId: string;
    userId: string;
    date: string;
    party: string;
    description: string;
    accountingType: string;
    direction: string;
    paymentMethod: string;
    paymentAccountCode: string;
    transferSourceCode?: string;
    lines: Array<{ accountCode: string; side: 'debit' | 'credit'; amount: number; memo?: string }>;
  },
): Promise<{ transactionId: string; journalId: string }> {
  // Exact cents, no tolerance (CoreGuard D3).
  const { debit, credit } = sideTotalsCents(input.lines);
  if (debit !== credit) {
    throw new Error(`Journal is not balanced (debits ${centsToString(debit)}, credits ${centsToString(credit)}).`);
  }
  const paymentAccountId = await accountId(sql, input.tenantId, input.paymentAccountCode);
  const transferSourceAccountId = input.transferSourceCode
    ? await accountId(sql, input.tenantId, input.transferSourceCode)
    : null;
  const transactionId = randomUUID();
  const journalId = randomUUID();
  // Resolve accounts before the transaction: the pilot pool has one connection.
  const lineAccounts: string[] = [];
  for (const line of input.lines) lineAccounts.push(await accountId(sql, input.tenantId, line.accountCode));
  // One DB transaction: transaction, entry and lines (CoreGuard G07/G09 refuse anything else).
  await sql.begin(async (tx) => {
  await tx`
    INSERT INTO transactions (
      id, tenant_id, user_id, accounting_type, direction, party, description, amount, currency,
      payment_method, payment_account_id, transfer_source_account_id, date, is_already_settled
    ) VALUES (
      ${transactionId}, ${input.tenantId}, ${input.userId}, ${input.accountingType}, ${input.direction},
      ${input.party}, ${input.description}, ${centsToString(debit)}, 'LKR',
      ${input.paymentMethod}, ${paymentAccountId}, ${transferSourceAccountId}, ${input.date}, '1'
    )
  `;
  await tx`
    INSERT INTO journal_entries (id, tenant_id, user_id, transaction_id, memo, entry_date, is_balanced)
    VALUES (${journalId}, ${input.tenantId}, ${input.userId}, ${transactionId}, ${input.description}, ${input.date}, '1')
  `;
  for (const [i, line] of input.lines.entries()) {
    await tx`
      INSERT INTO journal_lines (id, tenant_id, journal_entry_id, account_id, side, amount, memo)
      VALUES (${randomUUID()}, ${input.tenantId}, ${journalId}, ${lineAccounts[i]!}, ${line.side}, ${centsToString(toCents(line.amount))}, ${line.memo ?? null})
    `;
  }
  });
  return { transactionId, journalId };
}

export async function postOpening(
  sql: LedgerSql,
  tenantId: string,
  userId: string,
  fixture: CustomBankFixture = loadCustomBankFixture(),
): Promise<{ runId: string; journalId: string; fingerprint: string }> {
  return withTenant(sql, tenantId, async () => {
    const lines = [
      {
        accountCode: fixture.opening.debitAccount,
        debit: centsToAmount(fixture.opening.debitCents),
        credit: 0,
      },
      {
        accountCode: fixture.opening.creditAccount,
        debit: 0,
        credit: centsToAmount(fixture.opening.creditCents),
      },
    ];
    const preview = previewOpeningBalances(lines);
    if (!preview.balanced || preview.issues.length) {
      throw new Error(preview.issues[0] ?? 'Opening is not balanced.');
    }
    const [dup] = await sql<{ id: string }[]>`
      SELECT id FROM opening_balance_runs
      WHERE tenant_id = ${tenantId} AND fingerprint = ${preview.fingerprint} AND status = 'posted' AND voided_at IS NULL
      LIMIT 1
    `;
    if (dup) throw new Error('These opening balances were already posted.');
    const posted = await insertBalancedJournal(sql, {
      tenantId,
      userId,
      date: fixture.opening.date,
      party: fixture.opening.party,
      description: `Opening balances ${fixture.opening.date}`,
      accountingType: 'transfer',
      direction: 'in',
      paymentMethod: 'Bank',
      paymentAccountCode: fixture.equity.code,
      lines: [
        {
          accountCode: fixture.opening.debitAccount,
          side: 'debit',
          amount: centsToAmount(fixture.opening.debitCents),
          memo: 'Opening balance',
        },
        {
          accountCode: fixture.opening.creditAccount,
          side: 'credit',
          amount: centsToAmount(fixture.opening.creditCents),
          memo: 'Opening balance',
        },
      ],
    });
    const runId = randomUUID();
    await sql`
      INSERT INTO opening_balance_runs (
        id, tenant_id, effective_date, status, fingerprint, debit_total, credit_total,
        source_transaction_id, source_journal_id, created_by, posted_at
      ) VALUES (
        ${runId}, ${tenantId}, ${fixture.opening.date}, 'posted', ${preview.fingerprint},
        ${preview.debitTotal.toFixed(2)}, ${preview.creditTotal.toFixed(2)},
        ${posted.transactionId}, ${posted.journalId}, ${userId}, NOW()
      )
    `;
    for (const line of lines) {
      const id = await accountId(sql, tenantId, line.accountCode);
      await sql`
        INSERT INTO opening_balance_lines (id, tenant_id, run_id, account_id, debit, credit)
        VALUES (${randomUUID()}, ${tenantId}, ${runId}, ${id}, ${line.debit.toFixed(2)}, ${line.credit.toFixed(2)})
      `;
    }
    return { runId, journalId: posted.journalId, fingerprint: preview.fingerprint };
  });
}

export async function postInternalTransfer(
  sql: LedgerSql,
  tenantId: string,
  userId: string,
  fixture: CustomBankFixture = loadCustomBankFixture(),
): Promise<{ journalId: string }> {
  return withTenant(sql, tenantId, async () => {
    const amount = centsToAmount(fixture.transfer.amountCents);
    const { journal, transaction } = inferTransaction({
      tenantId,
      userId,
      direction: 'move_money',
      fromAccount: { kind: 'code', value: fixture.transfer.from },
      toAccount: { kind: 'code', value: fixture.transfer.to },
      paymentAccount: { kind: 'code', value: fixture.transfer.to },
      party: fixture.transfer.party,
      description: 'Internal bank transfer',
      amount,
      currency: 'LKR',
      paymentMethod: 'Bank',
      date: fixture.transfer.date,
    });
    const posted = await insertBalancedJournal(sql, {
      tenantId,
      userId,
      date: fixture.transfer.date,
      party: fixture.transfer.party,
      description: transaction.description,
      accountingType: transaction.accountingType,
      direction: transaction.direction,
      paymentMethod: 'Bank',
      paymentAccountCode: fixture.transfer.to,
      transferSourceCode: fixture.transfer.from,
      lines: journal.lines.map((line) => ({
        accountCode: line.account.code,
        side: line.side,
        amount: line.amount,
        memo: line.memo,
      })),
    });
    return { journalId: posted.journalId };
  });
}

export function independentSpendableCents(balances: BalanceMap): number {
  let cents = 0;
  for (const [code, amount] of Object.entries(balances)) {
    if (/^10\d{2}$/.test(code) || /^11\d{2}$/.test(code)) {
      cents += Math.round(amount * 100);
    }
  }
  return cents;
}

export async function journalCount(sql: LedgerSql, tenantId: string): Promise<number> {
  return withTenant(sql, tenantId, async () => {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM journal_entries
      WHERE tenant_id = ${tenantId} AND voided_at IS NULL
    `;
    return row?.n ?? 0;
  });
}

async function postCashLine(
  sql: LedgerSql,
  tenantId: string,
  userId: string,
  paymentCode: string,
  line: BankReconCashLine,
): Promise<{ journalId: string }> {
  const amount = centsToAmount(line.amountCents);
  const isIn = line.direction === 'in';
  const posted = await insertBalancedJournal(sql, {
    tenantId,
    userId,
    date: line.date,
    party: line.description,
    description: line.description,
    accountingType: isIn ? 'income' : 'expense',
    direction: isIn ? 'money_in' : 'money_out',
    paymentMethod: 'Bank',
    paymentAccountCode: paymentCode,
    lines: isIn
      ? [
          { accountCode: paymentCode, side: 'debit', amount, memo: line.ref },
          { accountCode: line.category, side: 'credit', amount, memo: line.ref },
        ]
      : [
          { accountCode: line.category, side: 'debit', amount, memo: line.ref },
          { accountCode: paymentCode, side: 'credit', amount, memo: line.ref },
        ],
  });
  await sql`
    UPDATE transactions
    SET receipt_ref = ${line.ref}
    WHERE id = ${posted.transactionId}
  `;
  return { journalId: posted.journalId };
}

export async function seedBankReconLedger(
  sql: LedgerSql,
  tenantId: string,
  userId: string,
  fixture: BankReconFixture = loadBankReconFixture(),
): Promise<{ bankId: string; journalCount: number }> {
  const asCustom: CustomBankFixture = {
    ...loadCustomBankFixture(),
    customBank: {
      templateId: 'bank',
      code: fixture.bank.code,
      name: fixture.bank.name,
      institution: fixture.bank.institution,
      lastDigits: fixture.bank.lastDigits,
    },
    equity: fixture.equity,
    opening: fixture.opening,
  };
  const created = await createCustomBank(sql, tenantId, userId, asCustom);
  return withTenant(sql, tenantId, async () => {
    const openingAmount = centsToAmount(fixture.opening.debitCents);
    await insertBalancedJournal(sql, {
      tenantId,
      userId,
      date: fixture.opening.date,
      party: fixture.opening.party,
      description: `Opening balances ${fixture.opening.date}`,
      accountingType: 'transfer',
      direction: 'money_in',
      paymentMethod: 'Bank',
      paymentAccountCode: fixture.bank.code,
      lines: [
        {
          accountCode: fixture.opening.debitAccount,
          side: 'debit',
          amount: openingAmount,
          memo: 'Opening balance',
        },
        {
          accountCode: fixture.opening.creditAccount,
          side: 'credit',
          amount: openingAmount,
          memo: 'Opening balance',
        },
      ],
    });
    for (const line of fixture.matching) {
      await postCashLine(sql, tenantId, userId, fixture.bank.code, line);
    }
    await postCashLine(sql, tenantId, userId, fixture.bank.code, fixture.bookOnly);
    const count = await journalCount(sql, tenantId);
    return { bankId: created.id, journalCount: count };
  });
}
