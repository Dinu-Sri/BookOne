'use server';

import { inferCategory } from '@bookone/accounting';
import { requireTenantContext } from '@bookone/auth';

export interface CategoryPreview {
  accountCode: string;
  accountName: string;
  confidence: number; // 0..1
  source: 'rule' | 'default' | 'override';
}

/**
 * Pre-computes the accounting category for a Simple Entry without committing.
 * Used by the form to show "→ Marketing Expense (88%)" before the user submits,
 * and to support an "Override category" picker.
 */
export async function previewCategory(input: {
  description: string;
  party: string;
  direction: 'money_in' | 'money_out' | 'move_money' | 'invoice_bill';
  invoiceType?: 'customer_invoice' | 'vendor_bill';
  categoryOverride?: string;
}): Promise<CategoryPreview | null> {
  await requireTenantContext();

  // Only money_out and vendor_bill can map to an expense account.
  // For money_in and customer_invoice, the engine does not infer an expense
  // category, so we return null and the UI hides the category preview.
  if (input.direction === 'money_out') {
    const cat = inferCategory(input.description, input.party, 'money_out', input.categoryOverride);
    return {
      accountCode: cat.accountCode,
      accountName: cat.categoryName,
      confidence: cat.confidence,
      source: cat.source,
    };
  }
  if (input.direction === 'invoice_bill' && input.invoiceType === 'vendor_bill') {
    const cat = inferCategory(input.description, input.party, 'money_out', input.categoryOverride);
    return {
      accountCode: cat.accountCode,
      accountName: cat.categoryName,
      confidence: cat.confidence,
      source: cat.source,
    };
  }
  return null;
}
