import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { seed } from './env';
import {
  addManualDocLine,
  clickPrimary,
  fillBrandLocationIfPresent,
  tableHasText,
} from './forms';
import { go } from './nav';

async function pickParty(page: Page, name?: string) {
  const select = page.locator('select[name="partyName"], select[name="partyId"]').first();
  if (await select.isVisible().catch(() => false)) {
    if (name) {
      await select.selectOption({ label: new RegExp(name.slice(0, 12), 'i') }).catch(async () => {
        await select.selectOption({ index: 1 }).catch(() => undefined);
      });
    } else {
      await select.selectOption({ index: 1 }).catch(() => undefined);
    }
  }
  const override = page.locator('input[name="partyNameOverride"], input[name="partyName"]').first();
  if (await override.isVisible().catch(() => false)) {
    if (name) await override.fill(name);
    else if (!(await override.inputValue().catch(() => ''))) {
      await override.fill(`E2E Party ${seed()}`);
    }
  }
}

export async function createSalesDoc(
  page: Page,
  kind: 'quotation' | 'order' | 'invoice' | 'return',
  opts: { party?: string; line?: string; price?: string; qty?: string } = {},
) {
  const paths = {
    quotation: '/sales/quotations/new',
    order: '/sales/orders/new',
    invoice: '/sales/invoices/new',
    return: '/sales/returns/new',
  } as const;
  const lists = {
    quotation: '/sales/quotations',
    order: '/sales/orders',
    invoice: '/sales/invoices',
    return: '/sales/returns',
  } as const;
  await go(page, paths[kind]);
  await pickParty(page, opts.party);
  await fillBrandLocationIfPresent(page);
  await addManualDocLine(
    page,
    opts.line || `E2E ${kind} ${seed()}`,
    opts.price || '1000',
    opts.qty || '1',
  );
  await clickPrimary(page, /Save|Create|Post|Confirm|Quote|Invoice/i);
  await page.waitForTimeout(1500);
  await go(page, lists[kind]);
  await expect(page.locator('table, .empty-state, .workspace').first()).toBeVisible();
}

export async function createPurchaseDoc(
  page: Page,
  kind: 'order' | 'purchase' | 'expense' | 'receipt' | 'return' | 'payment',
  opts: { party?: string; line?: string; price?: string; qty?: string } = {},
) {
  const paths: Record<string, string> = {
    order: '/purchase/orders/new',
    purchase: '/purchase/purchases/new',
    expense: '/purchase/expenses/new',
    receipt: '/purchase/receipts/new',
    return: '/purchase/returns/new',
    payment: '/purchase/payments/new',
  };
  const lists: Record<string, string> = {
    order: '/purchase/orders',
    purchase: '/purchase/purchases',
    expense: '/purchase/expenses',
    receipt: '/purchase/receipts',
    return: '/purchase/returns',
    payment: '/purchase/payments',
  };
  await go(page, paths[kind]);
  await pickParty(page, opts.party);
  await fillBrandLocationIfPresent(page);
  if (kind !== 'payment') {
    await addManualDocLine(
      page,
      opts.line || `E2E purch ${seed()}`,
      opts.price || '500',
      opts.qty || '1',
    );
  }
  await clickPrimary(page, /Save|Create|Post|Confirm|Receive|Pay/i);
  await page.waitForTimeout(1500);
  await go(page, lists[kind]);
  await expect(page.locator('table, .empty-state, .workspace').first()).toBeVisible();
}

export async function createDiscount(page: Page, mode: 'percent' | 'fixed' = 'percent') {
  await go(page, '/sales/discounts/new');
  const name = `E2E Disc ${seed()}`;
  const nameInput = page.locator('input[name="name"]').first();
  if (!(await nameInput.isVisible().catch(() => false))) {
    await go(page, '/sales/discounts');
    return name;
  }
  await nameInput.fill(name);
  const typeSel = page.locator('select[name="type"], select[name="discountType"]').first();
  if (await typeSel.isVisible().catch(() => false)) {
    await typeSel.selectOption({ label: new RegExp(mode, 'i') }).catch(async () => {
      await typeSel.selectOption({ index: mode === 'percent' ? 0 : 1 }).catch(() => undefined);
    });
  }
  const val = page.locator('input[name="value"], input[name="amount"], input[name="rate"]').first();
  if (await val.isVisible().catch(() => false)) {
    await val.fill(mode === 'percent' ? '10' : '100');
  }
  await clickPrimary(page, /Save|Create/i);
  await page.waitForTimeout(1000);
  await go(page, '/sales/discounts');
  await expect(tableHasText(page, name).or(page.locator('.workspace')).first()).toBeVisible();
  return name;
}

export type SimpleEntryMode = 'money_out' | 'money_in' | 'transfer';

/** Post a Simple Entry on `/` with optional mode strip. */
export async function simpleEntry(
  page: Page,
  opts: { mode?: SimpleEntryMode; amount?: string; party?: string; skipDimensions?: boolean } = {},
) {
  const amount = opts.amount ?? '100';
  await go(page, '/');
  const mode = opts.mode ?? 'money_out';
  const modeRe =
    mode === 'money_in'
      ? /money in|income|receive|sale/i
      : mode === 'transfer'
        ? /transfer|move money|between/i
        : /money out|expense|pay/i;
  const modeBtn = page
    .locator('.entry-mode, button, [role="tab"]')
    .filter({ hasText: modeRe })
    .first();
  if (await modeBtn.isVisible().catch(() => false)) {
    await modeBtn.click().catch(() => undefined);
  }
  if (!opts.skipDimensions) {
    await fillBrandLocationIfPresent(page);
  }
  const partyInput = page.locator('.entry-form input.large, .entry-form input, input[name="partyName"]').first();
  if (await partyInput.isVisible().catch(() => false) && opts.party) {
    await partyInput.fill(opts.party);
  } else if (await partyInput.isVisible().catch(() => false)) {
    const v = await partyInput.inputValue().catch(() => '');
    if (!v) await partyInput.fill(`E2E Party ${seed()}`);
  }
  const amountField = page.locator('.field.amount-field input, .amount-field input, input[name="amount"]').first();
  if (await amountField.isVisible().catch(() => false)) {
    await amountField.fill(amount);
  } else {
    const inputs = page.locator('.entry-form input.large, input[type="number"]');
    const c = await inputs.count();
    if (c > 0) await inputs.nth(Math.min(c - 1, 1)).fill(amount).catch(() => undefined);
  }
  const note = page.locator('input[name="memo"], input[name="description"], textarea').first();
  if (await note.isVisible().catch(() => false)) {
    await note.fill(`E2E simple entry ${seed()}`);
  }
  for (const name of ['debitAccountId', 'creditAccountId', 'accountId', 'fromAccountId', 'toAccountId']) {
    const sel = page.locator(`select[name="${name}"]`).first();
    if (await sel.isVisible().catch(() => false)) {
      const optsEl = sel.locator('option');
      const c = await optsEl.count();
      for (let i = 0; i < c; i++) {
        const v = await optsEl.nth(i).getAttribute('value');
        if (v) {
          await sel.selectOption({ index: i });
          break;
        }
      }
    }
  }
  await clickPrimary(page, /Post|Save|Submit|Record/i).catch(() => undefined);
  await page.waitForTimeout(1200);
}

export async function simpleEntryMoneyOut(page: Page, amount = '100') {
  await simpleEntry(page, { mode: 'money_out', amount });
}

export async function simpleEntryMoneyIn(page: Page, amount = '100') {
  await simpleEntry(page, { mode: 'money_in', amount });
}

export async function simpleEntryTransfer(page: Page, amount = '100') {
  await simpleEntry(page, { mode: 'transfer', amount });
}

export async function openReportTab(page: Page, tab: string | RegExp) {
  await go(page, '/reports');
  const t = page.getByRole('tab', { name: tab }).or(page.getByRole('button', { name: tab }));
  if (await t.first().isVisible().catch(() => false)) {
    await t.first().click();
  }
  await expect(page.locator('.workspace, .report, table').first()).toBeVisible();
}
