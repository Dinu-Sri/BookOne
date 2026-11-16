import { createHash } from 'node:crypto';
import {
  buildVendorBillPosting,
  purchasePreviewTotals,
} from '@bookone/accounting';
import {
  POLICY_VERSION,
  SCHEMA_VERSION,
  type CompanyPolicy,
  type PreviewEffect,
  type ProposalFacts,
} from './contracts';
import { minorToMajor, money } from './money';

/** Server preview uses the production posting helpers. Oracles must not call this. */
export function calculatePreview(facts: ProposalFacts, policy: CompanyPolicy): PreviewEffect {
  const netMajor = minorToMajor(facts.net);
  const invoiceKind = facts.invoiceKind;
  const totals = purchasePreviewTotals({
    documentType: 'purchase',
    invoiceKind,
    vatRegistered: policy.vatRegistered,
    ratePercent: policy.vatRatePercent,
    net: netMajor,
  });
  const lines = buildVendorBillPosting({
    total: totals.net,
    expenseAccountCode: facts.expenseAccountCode || policy.defaultExpenseAccount,
    isInventoryPurchase: false,
    vatRatePercent: totals.postsInputVat ? totals.vatRate : 0,
    inputVatAccountCode: policy.inputVatAccount,
    memo: `Vendor bill ${facts.supplierInvoiceNumber}`,
  });
  const journal = lines.map((l) => ({
    accountCode: l.accountCode,
    side: l.side,
    minor: Math.round(l.amount * 100),
    memo: l.memo,
  }));
  const vatMinor = Math.round(totals.vatAmount * 100);
  const grossMinor = Math.round(totals.payableGross * 100);
  const previewVersion = createHash('sha256')
    .update(
      JSON.stringify({
        schema: SCHEMA_VERSION,
        policy: policy.policyVersion,
        facts,
        totals,
      }),
    )
    .digest('hex')
    .slice(0, 24);
  const vatLine = totals.postsInputVat
    ? `Input VAT ${totals.vatRate}% is ${totals.vatAmount.toFixed(2)} ${facts.currency}.`
    : 'No input VAT posts for this commercial treatment.';
  return {
    schemaVersion: SCHEMA_VERSION,
    policyVersion: policy.policyVersion || POLICY_VERSION,
    previewVersion,
    documentType: 'purchase',
    invoiceKind,
    net: money(Math.round(totals.net * 100), facts.currency),
    discount: money(0, facts.currency),
    vat: money(vatMinor, facts.currency),
    gross: money(grossMinor, facts.currency),
    expenseAccount: facts.expenseAccountCode || policy.defaultExpenseAccount,
    payableAccount: policy.payableAccount,
    inputVatAccount: totals.postsInputVat ? policy.inputVatAccount : null,
    journal,
    plainLanguage: `BookOne will record an unpaid purchase bill for ${facts.supplierName}: expense ${totals.net.toFixed(2)} ${facts.currency} on ${facts.expenseAccountCode}. ${vatLine} Amount payable ${totals.payableGross.toFixed(2)} ${facts.currency} on ${policy.payableAccount}. Nothing is posted until a person with approval permission confirms this exact revision.`,
    sourceRefs: [facts.supplierInvoiceNumber, facts.issueDate],
  };
}

export function proposalHash(facts: ProposalFacts, previewVersion: string, policyVersion: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ facts, previewVersion, policyVersion, schema: SCHEMA_VERSION }))
    .digest('hex');
}
