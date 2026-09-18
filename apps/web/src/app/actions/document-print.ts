'use server';

import { randomUUID } from 'node:crypto';
import { requireTenantContext } from '@bookone/auth';
import {
  and,
  businessDocumentLines,
  businessDocuments,
  companyProfiles,
  db,
  eq,
  isNull,
  parties,
  taxProfiles,
  withTenantContext,
} from '@bookone/db';
import { resolveActiveStyleSnapshot } from '@/app/actions/document-styles';
import {
  kindFromDocument,
  parseStyleSnapshot,
  type DocumentStyleKind,
  type DocumentStyleSnapshot,
} from '@/lib/document-style';

export type DocumentPrintModel = {
  kind: DocumentStyleKind;
  title: string;
  style: DocumentStyleSnapshot;
  company: {
    name: string;
    address: string;
    phone: string;
    email: string;
    tin: string;
  };
  party: {
    name: string;
    address: string;
    phone: string;
    tin: string;
    label: string;
  };
  meta: {
    dateLabel: string;
    date: string;
    numberLabel: string;
    number: string;
    dueDate: string | null;
    deliveryDate: string | null;
    placeOfSupply: string | null;
    paymentMode: string | null;
    channel: string | null;
  };
  lines: {
    id: string;
    sku: string | null;
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    amount: number;
  }[];
  totals: {
    subtotal: number;
    discount: number;
    vat: number;
    vatRate: number;
    total: number;
    words: string | null;
  };
  notes: string | null;
};

function titleFor(kind: DocumentStyleKind) {
  if (kind === 'quotation') return 'QUOTATION';
  if (kind === 'tax_invoice') return 'TAX INVOICE';
  if (kind === 'receipt') return 'RECEIPT';
  return 'INVOICE';
}

export async function getDocumentPrintModel(
  documentId: string,
  opts?: { tenantId?: string },
): Promise<DocumentPrintModel | null> {
  const tenantId = opts?.tenantId ?? (await requireTenantContext()).tenantId;
  return withTenantContext(tenantId, async () => {
    const [doc] = await db()
      .select()
      .from(businessDocuments)
      .where(
        and(
          eq(businessDocuments.tenantId, tenantId),
          eq(businessDocuments.id, documentId),
          isNull(businessDocuments.voidedAt),
        ),
      )
      .limit(1);
    if (!doc) return null;

    const kind = kindFromDocument(doc.documentType, doc.invoiceKind);
    const [party] = await db().select().from(parties).where(eq(parties.id, doc.partyId)).limit(1);
    const lines = await db()
      .select()
      .from(businessDocumentLines)
      .where(and(eq(businessDocumentLines.documentId, doc.id), isNull(businessDocumentLines.voidedAt)));
    const [company] = await db()
      .select()
      .from(companyProfiles)
      .where(eq(companyProfiles.tenantId, tenantId))
      .limit(1);
    const [tax] = await db().select().from(taxProfiles).where(eq(taxProfiles.tenantId, tenantId)).limit(1);

    const live = await resolveActiveStyleSnapshot(tenantId, kind, doc.brandId ?? null);
    const stored = doc.printStyleSnapshot ? parseStyleSnapshot(doc.printStyleSnapshot, kind) : null;
    const storedIsDefault = !stored || stored.name === 'BookOne default';
    let style = storedIsDefault ? live : stored;
    const { resolveProductImageUrl } = await import('@/lib/product-image');
    style = {
      ...style,
      logoUrl: (await resolveProductImageUrl(style.logoImageKey ?? null)) || style.logoUrl,
    };
    if (storedIsDefault && live.name !== 'BookOne default') {
      try {
        await db()
          .update(businessDocuments)
          .set({ printStyleSnapshot: JSON.stringify(style), updatedAt: new Date() })
          .where(eq(businessDocuments.id, doc.id));
      } catch {
        /* column may not exist until 035 */
      }
    }

    let token = doc.publicToken;
    if (!token) {
      token = randomUUID().replace(/-/g, '').slice(0, 16);
      try {
        await db().update(businessDocuments).set({ publicToken: token, updatedAt: new Date() }).where(eq(businessDocuments.id, doc.id));
      } catch {
        token = null;
      }
    }
    const origin = (process.env.AUTH_URL || process.env.BETTER_AUTH_URL || '').replace(/\/$/, '');
    const publicUrl = token && origin ? `${origin}/i/${token}` : null;
    if (style.showQr && publicUrl) {
      const { toQrDataUrl } = await import('@/lib/qr-dataurl');
      style.qrDataUrl = await toQrDataUrl(publicUrl);
      style.publicUrl = publicUrl;
    }

    const companyName = company?.legalName || company?.tradingName || 'Company';
    const companyAddress = [company?.addressLine1, company?.addressLine2, company?.city, company?.postalCode]
      .filter(Boolean)
      .join(', ');

    return {
      kind,
      title: titleFor(kind),
      style,
      company: {
        name: companyName,
        address: companyAddress,
        phone: company?.phone ?? '',
        email: company?.email ?? '',
        tin: tax?.tin ?? '',
      },
      party: {
        name: party?.legalName || party?.displayName || party?.name || doc.partyName || '',
        address: doc.purchaserAddress || party?.addressLine1 || party?.address || '',
        phone: doc.purchaserPhone || party?.phoneMobile || party?.phone || '',
        tin: doc.purchaserTin || party?.tin || '',
        label: kind === 'quotation' || kind === 'invoice' || kind === 'tax_invoice' ? 'Customer' : 'Party',
      },
      meta: {
        dateLabel: kind === 'quotation' ? 'Quote date' : 'Date of invoice',
        date: doc.issueDate,
        numberLabel: kind === 'tax_invoice' ? 'Tax invoice no.' : kind === 'quotation' ? 'Quote no.' : 'Invoice no.',
        number: (kind === 'tax_invoice' ? doc.taxInvoiceNumber : null) || doc.documentNumber,
        dueDate: doc.dueDate,
        deliveryDate: doc.deliveryDate,
        placeOfSupply: doc.placeOfSupply,
        paymentMode: doc.paymentMode,
        channel: doc.saleChannel,
      },
      lines: lines.map((l) => ({
        id: l.id,
        sku: l.lineRef,
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        discount: Number(l.discountAmount ?? 0),
        amount: Number(l.lineTotal),
      })),
      totals: {
        subtotal: Number(doc.subtotal),
        discount: Number(doc.discountTotal ?? 0),
        vat: Number(doc.taxTotal),
        vatRate: Number(doc.vatRate),
        total: Number(doc.total),
        words: doc.amountInWords,
      },
      notes: doc.additionalInfo || doc.notes,
    };
  });
}

export async function getPublicPrintModel(token: string): Promise<DocumentPrintModel | null> {
  const clean = token.trim();
  if (!clean) return null;
  const [hit] = await db()
    .select({ id: businessDocuments.id, tenantId: businessDocuments.tenantId })
    .from(businessDocuments)
    .where(and(eq(businessDocuments.publicToken, clean), isNull(businessDocuments.voidedAt)))
    .limit(1);
  if (!hit) return null;
  return getDocumentPrintModel(hit.id, { tenantId: hit.tenantId });
}

export async function getReceiptPrintModel(opts: {
  date: string;
  account: string;
  customer: string;
  rows: { number: string; customer: string; amount: number }[];
  total: number;
}): Promise<DocumentPrintModel> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const style = await resolveActiveStyleSnapshot(user.tenantId, 'receipt', null);
    const [company] = await db()
      .select()
      .from(companyProfiles)
      .where(eq(companyProfiles.tenantId, user.tenantId))
      .limit(1);
    const [tax] = await db().select().from(taxProfiles).where(eq(taxProfiles.tenantId, user.tenantId)).limit(1);
    const companyAddress = [company?.addressLine1, company?.addressLine2, company?.city, company?.postalCode]
      .filter(Boolean)
      .join(', ');
    return {
      kind: 'receipt',
      title: 'PAYMENT RECEIPT',
      style,
      company: {
        name: company?.legalName || company?.tradingName || 'Company',
        address: companyAddress,
        phone: company?.phone ?? '',
        email: company?.email ?? '',
        tin: tax?.tin ?? '',
      },
      party: {
        name: opts.customer,
        address: '',
        phone: '',
        tin: '',
        label: 'Received from',
      },
      meta: {
        dateLabel: 'Payment date',
        date: opts.date,
        numberLabel: 'Deposited to',
        number: opts.account || '—',
        dueDate: null,
        deliveryDate: null,
        placeOfSupply: null,
        paymentMode: null,
        channel: null,
      },
      lines: opts.rows.map((r, i) => ({
        id: String(i),
        sku: r.number,
        description: r.customer,
        quantity: 1,
        unitPrice: r.amount,
        discount: 0,
        amount: r.amount,
      })),
      totals: {
        subtotal: opts.total,
        discount: 0,
        vat: 0,
        vatRate: 0,
        total: opts.total,
        words: null,
      },
      notes: null,
    };
  });
}
