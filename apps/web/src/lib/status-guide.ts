export type StatusFamily =
  | 'invoice'
  | 'quotation'
  | 'sales_order'
  | 'sales_return'
  | 'purchase_order'
  | 'purchase'
  | 'goods_receipt'
  | 'purchase_return'
  | 'generic';

export type StatusGuideItem = {
  key: string;
  label: string;
  meaning: string;
  next: string;
};

export type StatusGuide = {
  family: StatusFamily;
  title: string;
  intro: string;
  items: StatusGuideItem[];
};

const INVOICE: StatusGuide = {
  family: 'invoice',
  title: 'Invoice statuses',
  intro: 'Accounting and stock move only when an invoice is Posted (Open). Draft is a working copy.',
  items: [
    {
      key: 'draft',
      label: 'Draft',
      meaning: 'Saved but not in the books. No stock movement. Lines can still be changed.',
      next: 'Fix lines if needed, then Post or Post & print.',
    },
    {
      key: 'open',
      label: 'Open',
      meaning: 'Posted. Customer owes the full amount. Journal and stock have been written.',
      next: 'Receive payment. Lines cannot be rewritten — use a sales return if goods come back.',
    },
    {
      key: 'partial',
      label: 'Partial',
      meaning: 'Posted, and some payment has been received. A balance is still due.',
      next: 'Receive the remaining payment.',
    },
    {
      key: 'paid',
      label: 'Paid',
      meaning: 'Posted and fully settled. Nothing left to collect.',
      next: 'Done. Print or archive if you like.',
    },
    {
      key: 'void',
      label: 'Void',
      meaning: 'Cancelled. Not live AR.',
      next: 'Create a new invoice if you still need to bill.',
    },
    {
      key: 'archived',
      label: 'Archived',
      meaning: 'Hidden from the live list. Can be restored.',
      next: 'Restore from the list if you need it again.',
    },
  ],
};

const QUOTATION: StatusGuide = {
  family: 'quotation',
  title: 'Quotation statuses',
  intro: 'Quotes never post to accounting. They become books only after you convert and post an invoice.',
  items: [
    {
      key: 'draft',
      label: 'Draft',
      meaning: 'Working quote. Not sent yet. No journal.',
      next: 'Save & print when ready to issue, or convert to an order.',
    },
    {
      key: 'sent',
      label: 'Sent',
      meaning: 'Issued to the customer. Still no journal.',
      next: 'Mark accepted, or convert to a sales order / invoice.',
    },
    {
      key: 'accepted',
      label: 'Accepted',
      meaning: 'Customer agreed. Still no journal.',
      next: 'Convert to order or invoice, then Post the invoice.',
    },
    {
      key: 'converted',
      label: 'Converted',
      meaning: 'Turned into a sales order. Locked so it is not converted twice.',
      next: 'Continue on the order, then invoice.',
    },
    {
      key: 'archived',
      label: 'Archived',
      meaning: 'Put away from the live list.',
      next: 'Restore if the customer comes back to this quote.',
    },
  ],
};

const SALES_ORDER: StatusGuide = {
  family: 'sales_order',
  title: 'Sales order statuses',
  intro: 'Orders reserve the sale. They do not post to the ledger until you convert to an invoice and Post.',
  items: [
    {
      key: 'confirmed',
      label: 'Confirmed',
      meaning: 'Order is live. No journal yet.',
      next: 'Convert to invoice, then Post the invoice.',
    },
    {
      key: 'fully_invoiced',
      label: 'Fully invoiced',
      meaning: 'All lines have been billed.',
      next: 'Collect on the invoice.',
    },
    {
      key: 'converted',
      label: 'Converted',
      meaning: 'Turned into an invoice.',
      next: 'Open the invoice and Post if it is still a draft.',
    },
    {
      key: 'archived',
      label: 'Archived',
      meaning: 'Hidden from the live list.',
      next: 'Restore if needed.',
    },
  ],
};

const SALES_RETURN: StatusGuide = {
  family: 'sales_return',
  title: 'Sales return statuses',
  intro: 'Saving a return posts credit to the customer and can restock physical items.',
  items: [
    {
      key: 'open',
      label: 'Open',
      meaning: 'Return posted. Credit sits against the original invoice.',
      next: 'Refund cash if needed, or leave it as credit.',
    },
    {
      key: 'refunded',
      label: 'Refunded',
      meaning: 'Money was paid back (cash/bank return).',
      next: 'Done.',
    },
    {
      key: 'void',
      label: 'Void',
      meaning: 'Cancelled return.',
      next: 'Create a new return if goods still came back.',
    },
  ],
};

const PURCHASE_ORDER: StatusGuide = {
  family: 'purchase_order',
  title: 'Purchase order statuses',
  intro: 'POs do not post AP. Bills / GRNs do the accounting and stock.',
  items: [
    {
      key: 'confirmed',
      label: 'Confirmed',
      meaning: 'Order placed with the supplier. No AP yet.',
      next: 'Receive goods (GRN) and/or convert to a purchase bill.',
    },
    {
      key: 'converted',
      label: 'Converted',
      meaning: 'Billed from this PO.',
      next: 'Pay the bill when due.',
    },
    {
      key: 'fully_invoiced',
      label: 'Fully invoiced',
      meaning: 'All PO lines have been billed.',
      next: 'Pay the vendor bill.',
    },
  ],
};

const PURCHASE: StatusGuide = {
  family: 'purchase',
  title: 'Purchase / bill statuses',
  intro: 'A posted bill is AP. Draft-style approval may delay the journal until Approve.',
  items: [
    {
      key: 'pending_approval',
      label: 'Pending approval',
      meaning: 'Saved but GL and stock wait until someone Approves (Purchase settings).',
      next: 'Approve, or reject.',
    },
    {
      key: 'open',
      label: 'Open',
      meaning: 'Posted. You owe the supplier the full amount.',
      next: 'Pay vendor.',
    },
    {
      key: 'partial',
      label: 'Partial',
      meaning: 'Some of the bill has been paid.',
      next: 'Pay the remainder.',
    },
    {
      key: 'paid',
      label: 'Paid',
      meaning: 'Fully settled.',
      next: 'Done.',
    },
    {
      key: 'rejected',
      label: 'Rejected',
      meaning: 'Approval was declined. Not in AP.',
      next: 'Fix and create again if needed.',
    },
  ],
};

const GRN: StatusGuide = {
  family: 'goods_receipt',
  title: 'Goods receipt statuses',
  intro: 'GRN puts stock away. It may post GRNI depending on Purchase settings.',
  items: [
    {
      key: 'received',
      label: 'Received',
      meaning: 'Goods are in stock at the location.',
      next: 'Bill the PO / GRN when the supplier invoice arrives.',
    },
  ],
};

const PURCHASE_RETURN: StatusGuide = {
  family: 'purchase_return',
  title: 'Purchase return statuses',
  intro: 'Returns credit AP and can take stock back out.',
  items: [
    {
      key: 'open',
      label: 'Open',
      meaning: 'Return posted against the supplier.',
      next: 'Collect a refund or wait for a credit note.',
    },
    {
      key: 'void',
      label: 'Void',
      meaning: 'Cancelled.',
      next: 'Create a new return if needed.',
    },
  ],
};

const GENERIC: StatusGuide = {
  family: 'generic',
  title: 'Statuses',
  intro: 'Hover a status chip for a short meaning.',
  items: [
    { key: 'draft', label: 'Draft', meaning: 'Not final.', next: 'Complete and save/post.' },
    { key: 'open', label: 'Open', meaning: 'Live and unfinished.', next: 'Complete the next step on the document.' },
    { key: 'paid', label: 'Paid', meaning: 'Settled.', next: 'Done.' },
    { key: 'archived', label: 'Archived', meaning: 'Hidden from the live list.', next: 'Restore if needed.' },
  ],
};

const GUIDES: Record<StatusFamily, StatusGuide> = {
  invoice: INVOICE,
  quotation: QUOTATION,
  sales_order: SALES_ORDER,
  sales_return: SALES_RETURN,
  purchase_order: PURCHASE_ORDER,
  purchase: PURCHASE,
  goods_receipt: GRN,
  purchase_return: PURCHASE_RETURN,
  generic: GENERIC,
};

export function statusFamilyFromTitle(title: string): StatusFamily {
  const t = title.toLowerCase();
  if (t.includes('quotation')) return 'quotation';
  if (t.includes('sales order')) return 'sales_order';
  if (t.includes('sales return')) return 'sales_return';
  if (t.includes('purchase order')) return 'purchase_order';
  if (t.includes('goods') || t.includes('receipt')) return 'goods_receipt';
  if (t.includes('purchase return')) return 'purchase_return';
  if (t.includes('invoice')) return 'invoice';
  if (t.includes('purchase') || t.includes('bill') || t.includes('expense')) return 'purchase';
  return 'generic';
}

export function statusFamilyFromDocType(documentType: string): StatusFamily {
  if (documentType === 'quotation') return 'quotation';
  if (documentType === 'sales_order') return 'sales_order';
  if (documentType === 'sales_return') return 'sales_return';
  if (documentType === 'sales_invoice' || documentType === 'customer_invoice' || documentType === 'pos_sale') {
    return 'invoice';
  }
  if (documentType === 'purchase_order') return 'purchase_order';
  if (documentType === 'goods_receipt') return 'goods_receipt';
  if (documentType === 'purchase_return') return 'purchase_return';
  if (
    documentType === 'purchase' ||
    documentType === 'import_purchase' ||
    documentType === 'vendor_bill' ||
    documentType === 'cash_purchase'
  ) {
    return 'purchase';
  }
  return 'generic';
}

export function getStatusGuide(family: StatusFamily): StatusGuide {
  return GUIDES[family] ?? GENERIC;
}

export function statusHelp(family: StatusFamily | undefined, status: string): StatusGuideItem | null {
  if (!family) {
    for (const g of Object.values(GUIDES)) {
      const hit = g.items.find((i) => i.key === status);
      if (hit) return hit;
    }
    return null;
  }
  return getStatusGuide(family).items.find((i) => i.key === status) ?? null;
}
