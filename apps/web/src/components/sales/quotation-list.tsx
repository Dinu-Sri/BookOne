'use client';

import type { CommercialDocRow } from '@/app/actions/commercial-docs';
import { CommercialDocumentList } from '@/components/sales/commercial-document-list';

export function QuotationList({ rows }: { rows: CommercialDocRow[] }) {
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
        convertTo: 'sales_order',
        convertLabel: 'Convert to order',
      }}
    />
  );
}
