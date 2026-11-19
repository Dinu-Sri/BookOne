import { readFileSync } from 'node:fs';
import path from 'node:path';

export type CustomBankFixture = {
  id: 'custom-bank';
  version: number;
  layer: string;
  period: { from: string; to: string };
  currency: string;
  customBank: {
    templateId: 'bank';
    code: string;
    name: string;
    institution: string;
    lastDigits: string;
  };
  ownedBank: { code: string };
  equity: { code: string };
  opening: {
    date: string;
    debitCents: number;
    creditCents: number;
    debitAccount: string;
    creditAccount: string;
    party: string;
  };
  transfer: {
    date: string;
    amountCents: number;
    from: string;
    to: string;
    party: string;
  };
  afterCreate: Record<string, number>;
  afterOpening: Record<string, number>;
  afterTransfer: Record<string, number | boolean>;
  viewer: { accountsRead: boolean; accountsWrite: boolean; simpleEntryWrite: boolean };
};

const ROOT = path.resolve(__dirname, '../..');

export const FIXTURE_PATH = path.join(ROOT, 'docs/coreguard/fixtures/custom-bank.v1.json');

export function loadCustomBankFixture(): CustomBankFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as CustomBankFixture;
}

export function centsToAmount(cents: number): number {
  return Math.round(cents) / 100;
}

export function amountToCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Independent integer-cent oracle. Does not call production cash helpers. */
export function independentCustomBankOracle(fixture: CustomBankFixture) {
  const opening = fixture.opening.debitCents;
  const xfer = fixture.transfer.amountCents;
  return {
    afterCreate: { custom: 0, owned: 0, spendable: 0 },
    afterOpening: { custom: opening, owned: 0, spendable: opening },
    afterTransfer: {
      custom: opening - xfer,
      owned: xfer,
      spendable: opening,
      externalIn: 0,
      externalOut: 0,
    },
  };
}
