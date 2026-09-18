'use client';

import type { CommercialDocRow } from '@/app/actions/commercial-docs';
import { CommercialDocumentList } from '@/components/sales/commercial-document-list';

export function QuotationList({ rows, editLockDays = 0 }: { rows: CommercialDocRow[]; editLockDays?: number }) {
  return (
    <CommercialDocumentList
      rows={rows}
      config={{
        title: 'Quotation',
        searchPlaceholder: 'Search by customer name or number…',
        newHref: '/sales/quotations/new',
        newLabel: 'New quotation',
        editHrefPattern: '/sales/quotations/:id/edit',
        detailHrefPattern: '/sales/quotations/:id',
        printHrefPattern: '/sales/quotations/:id/print',
        editLockDays,
        convertTo: 'sales_order',
        convertLabel: 'Convert to order',
      }}
    />
  );
}
