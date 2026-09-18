export const DOCUMENT_STYLE_KINDS = ['quotation', 'invoice', 'tax_invoice', 'receipt'] as const;
export type DocumentStyleKind = (typeof DOCUMENT_STYLE_KINDS)[number];

export type DocumentStyleSnapshot = {
  name: string;
  docKind: DocumentStyleKind;
  version: number;
  accentColor: string;
  logoUrl: string | null;
  logoPosition: 'left' | 'center' | 'right';
  showSku: boolean;
  showTin: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showBank: boolean;
  bankDetails: string;
  footerNotes: string;
  fontFamily: string;
};

export function defaultDocumentStyle(kind: DocumentStyleKind): DocumentStyleSnapshot {
  const tax = kind === 'tax_invoice';
  return {
    name: 'BookOne default',
    docKind: kind,
    version: 1,
    accentColor: '#1e3a8a',
    logoUrl: null,
    logoPosition: 'left',
    showSku: kind !== 'tax_invoice' && kind !== 'receipt',
    showTin: true,
    showPhone: true,
    showEmail: true,
    showBank: false,
    bankDetails: '',
    footerNotes: tax ? 'This is a tax invoice for VAT purposes.' : '',
    fontFamily: 'Arial, Helvetica, sans-serif',
  };
}

export function parseStyleSnapshot(raw: string | null | undefined, kind: DocumentStyleKind): DocumentStyleSnapshot {
  if (!raw) return defaultDocumentStyle(kind);
  try {
    const j = JSON.parse(raw) as Partial<DocumentStyleSnapshot>;
    const base = defaultDocumentStyle(kind);
    return {
      ...base,
      ...j,
      docKind: kind,
      accentColor: /^#[0-9a-fA-F]{6}$/.test(String(j.accentColor ?? '')) ? String(j.accentColor) : base.accentColor,
      logoPosition: j.logoPosition === 'center' || j.logoPosition === 'right' ? j.logoPosition : 'left',
      showSku: j.showSku !== false,
      showTin: j.showTin !== false,
      showPhone: j.showPhone !== false,
      showEmail: j.showEmail !== false,
      showBank: j.showBank === true,
      bankDetails: String(j.bankDetails ?? ''),
      footerNotes: String(j.footerNotes ?? ''),
      fontFamily: String(j.fontFamily || base.fontFamily),
      version: Number(j.version) || 1,
      name: String(j.name || base.name),
      logoUrl: j.logoUrl ?? null,
    };
  } catch {
    return defaultDocumentStyle(kind);
  }
}

export function kindFromDocument(documentType: string, invoiceKind?: string | null): DocumentStyleKind {
  if (documentType === 'quotation') return 'quotation';
  if (documentType === 'sales_invoice' || documentType === 'customer_invoice' || documentType === 'pos_sale') {
    return invoiceKind === 'tax_invoice' ? 'tax_invoice' : 'invoice';
  }
  return 'invoice';
}

export function kindLabel(kind: DocumentStyleKind): string {
  if (kind === 'quotation') return 'Quotation';
  if (kind === 'tax_invoice') return 'Tax invoice';
  if (kind === 'receipt') return 'Receipt';
  return 'Invoice';
}
