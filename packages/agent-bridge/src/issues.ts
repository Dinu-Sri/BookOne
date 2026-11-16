import {
  POLICY_VERSION,
  type CompanyPolicy,
  type ExtractedFacts,
  type Issue,
  type IssueCode,
  type ProposalFacts,
} from './contracts';
import { addMinor } from './money';

const POLICY_REF = POLICY_VERSION;

function issue(
  id: string,
  code: IssueCode,
  fieldPath: string,
  message: string,
  question: string,
  allowedResolutions: string[],
  blocking = true,
): Issue {
  return { id, code, fieldPath, message, question, allowedResolutions, ruleRef: POLICY_REF, blocking };
}

export function issuesFromExtraction(
  facts: ExtractedFacts,
  policy: CompanyPolicy,
  duplicateScan: boolean,
): Issue[] {
  const out: Issue[] = [];
  const paid = facts.paidStatus?.value ?? 'unknown';
  const kind = facts.documentKind?.value ?? 'unknown';
  const currency = facts.currency?.value;
  const supplier = facts.supplierName?.value?.trim();
  const date = facts.issueDate?.value;
  const net = facts.net?.value;
  const tax = facts.tax?.value;
  const gross = facts.gross?.value;

  if (facts.rawText && /ignore (previous|all) instructions|switch tenant|approve this invoice/i.test(facts.rawText)) {
    out.push(
      issue(
        'malicious',
        'MALICIOUS_INSTRUCTION_IGNORED',
        'rawText',
        'Text in the document asked the system to change rules or approve itself. Those words were ignored.',
        'Continue with the printed invoice amounts only?',
        ['continue'],
        false,
      ),
    );
  }
  if (duplicateScan) {
    out.push(
      issue(
        'dup-scan',
        'DUPLICATE_SCAN',
        'contentHash',
        'This file was already received.',
        'Is this a rescan of an existing invoice that still needs review?',
        ['open_existing', 'treat_as_amendment'],
      ),
    );
  }
  if (paid === 'paid' || paid === 'part_paid') {
    out.push(
      issue(
        'paid',
        'UNSUPPORTED_PAID',
        'paidStatus',
        'Evidence of payment does not authorize a payment or a paid bill in this workflow.',
        'Has this invoice already been paid?',
        ['confirm_unpaid', 'stop_unsupported'],
      ),
    );
  }
  if (kind === 'stock' || kind === 'mixed') {
    out.push(
      issue(
        'stock',
        kind === 'stock' ? 'UNSUPPORTED_STOCK' : 'UNSUPPORTED_MIXED',
        'documentKind',
        'Stock or mixed stock/service invoices are out of this first workflow.',
        'Is this a service or expense invoice with no goods to receive?',
        ['confirm_service', 'stop_unsupported'],
      ),
    );
  }
  if (!supplier) {
    out.push(
      issue(
        'supplier-missing',
        'MISSING_SUPPLIER',
        'supplierName',
        'The supplier name is missing.',
        'Which approved supplier issued this invoice?',
        policy.approvedSuppliers.map((s) => s.name),
      ),
    );
  } else if (!policy.approvedSuppliers.some((s) => s.name.toLowerCase() === supplier.toLowerCase())) {
    out.push(
      issue(
        'supplier-unknown',
        'UNKNOWN_SUPPLIER',
        'supplierName',
        'That supplier is not on the approved list. BookOne will not create a new supplier from a guess.',
        'Pick an approved supplier, or stop until master data is added.',
        [...policy.approvedSuppliers.map((s) => s.name), 'stop_unsupported'],
      ),
    );
  }
  if (!facts.supplierInvoiceNumber?.value) {
    out.push(
      issue(
        'inv-no',
        'MISSING_INVOICE_NUMBER',
        'supplierInvoiceNumber',
        'The supplier invoice number is missing.',
        'What is the supplier invoice number printed on the document?',
        ['enter_number'],
      ),
    );
  }
  if (!date) {
    out.push(
      issue(
        'date',
        'MISSING_DATE',
        'issueDate',
        'The invoice date is missing.',
        'What is the invoice date (YYYY-MM-DD)?',
        ['enter_date'],
      ),
    );
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    out.push(
      issue(
        'date-amb',
        'AMBIGUOUS_DATE',
        'issueDate',
        'The invoice date is not a clear calendar day.',
        'Confirm the invoice date as YYYY-MM-DD.',
        ['enter_date'],
      ),
    );
  }
  if (currency && currency !== policy.currency) {
    out.push(
      issue(
        'fx',
        'CURRENCY_MISMATCH',
        'currency',
        `This company books ${policy.currency}. Foreign-currency invoices are out of this workflow.`,
        `Is the invoice in ${policy.currency}?`,
        ['confirm_local', 'stop_unsupported'],
      ),
    );
  }
  if (!currency) {
    out.push(
      issue(
        'fx-amb',
        'AMBIGUOUS_CURRENCY',
        'currency',
        'The invoice currency is not clear.',
        `Confirm the currency is ${policy.currency}.`,
        ['confirm_local', 'stop_unsupported'],
      ),
    );
  }
  if (net && tax && gross && addMinor(net.minor, tax.minor) !== gross.minor) {
    out.push(
      issue(
        'totals',
        'CONFLICTING_TOTALS',
        'gross',
        'Printed net plus tax does not equal the printed total.',
        'Which printed total should BookOne use after you check the document?',
        ['use_net_plus_tax', 'stop_unsupported'],
      ),
    );
  }
  if (!policy.vatRegistered && facts.tax?.value && facts.tax.value.minor > 0) {
    out.push(
      issue(
        'tax-policy',
        'MISSING_TAX_POLICY',
        'tax',
        'Input VAT is not configured for this company. BookOne will not invent a tax rule.',
        'Treat this as a commercial (no input VAT) invoice, or stop for accounting review?',
        ['treat_commercial', 'stop_unsupported'],
      ),
    );
  }
  return out;
}

export function issuesFromProposal(facts: ProposalFacts, policy: CompanyPolicy): Issue[] {
  const synthetic: ExtractedFacts = {
    supplierName: { value: facts.supplierName, origin: 'user' },
    supplierInvoiceNumber: { value: facts.supplierInvoiceNumber, origin: 'user' },
    issueDate: { value: facts.issueDate, origin: 'user' },
    currency: { value: facts.currency, origin: 'user' },
    paidStatus: { value: facts.paidStatus, origin: 'user' },
    documentKind: { value: facts.documentKind, origin: 'user' },
    net: { value: facts.net, origin: 'user' },
    tax: { value: facts.tax, origin: 'user' },
    gross: { value: facts.gross, origin: 'user' },
  };
  const issues = issuesFromExtraction(synthetic, policy, false);
  if (!policy.approvedCategories.some((c) => c.accountCode === facts.expenseAccountCode)) {
    issues.push(
      issue(
        'category',
        'AMBIGUOUS_CATEGORY',
        'expenseAccountCode',
        'The expense category is not an approved mapping.',
        'Which approved expense category applies?',
        policy.approvedCategories.map((c) => c.label),
      ),
    );
  }
  return issues.filter((i) => i.code !== 'MALICIOUS_INSTRUCTION_IGNORED');
}

export function blockingIssues(issues: Issue[]): Issue[] {
  return issues.filter((i) => i.blocking);
}
