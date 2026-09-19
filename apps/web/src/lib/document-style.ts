export const DOCUMENT_STYLE_KINDS = ['quotation', 'invoice', 'tax_invoice', 'receipt'] as const;
export type DocumentStyleKind = (typeof DOCUMENT_STYLE_KINDS)[number];

/** Stored on a style row. `all` applies to every print kind unless a more specific style is active. */
export const DOCUMENT_STYLE_SCOPES = ['all', ...DOCUMENT_STYLE_KINDS] as const;
export type DocumentStyleScope = (typeof DOCUMENT_STYLE_SCOPES)[number];

export type DocumentStyleSnapshot = {
  name: string;
  docKind: DocumentStyleKind;
  version: number;
  accentColor: string;
  logoImageKey?: string | null;
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
  showQr: boolean;
  typeScale: string;
  baseFontPx: number;
  publicUrl?: string | null;
  qrDataUrl?: string | null;
};

export function defaultDocumentStyle(kind: DocumentStyleKind): DocumentStyleSnapshot {
  const tax = kind === 'tax_invoice';
  return {
    name: 'BookOne default',
    docKind: kind,
    version: 1,
    accentColor: '#1e3a8a',
    logoImageKey: null,
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
    showQr: false,
    typeScale: 'major_second',
    baseFontPx: 11,
  };
}

export const TYPE_SCALES: { key: string; label: string; ratio: number }[] = [
  { key: 'minor_second', label: 'Minor second (1.067)', ratio: 1.067 },
  { key: 'major_second', label: 'Major second (1.125)', ratio: 1.125 },
  { key: 'minor_third', label: 'Minor third (1.200)', ratio: 1.2 },
  { key: 'major_third', label: 'Major third (1.250)', ratio: 1.25 },
  { key: 'perfect_fourth', label: 'Perfect fourth (1.333)', ratio: 1.333 },
  { key: 'golden', label: 'Golden ratio (1.618)', ratio: 1.618 },
];

export function scaleRatio(key: string | undefined): number {
  return TYPE_SCALES.find((s) => s.key === key)?.ratio ?? 1.125;
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
      showQr: j.showQr === true,
      typeScale: String(j.typeScale || base.typeScale),
      baseFontPx: Number(j.baseFontPx) || base.baseFontPx,
      version: Number(j.version) || 1,
      name: String(j.name || base.name),
      logoImageKey: j.logoImageKey ?? null,
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

export function kindLabel(kind: DocumentStyleKind | DocumentStyleScope): string {
  if (kind === 'all') return 'All documents';
  if (kind === 'quotation') return 'Quotation';
  if (kind === 'tax_invoice') return 'Tax invoice';
  if (kind === 'receipt') return 'Receipt';
  return 'Invoice';
}

export function isDocumentStyleKind(v: string): v is DocumentStyleKind {
  return (DOCUMENT_STYLE_KINDS as readonly string[]).includes(v);
}

export function isDocumentStyleScope(v: string): v is DocumentStyleScope {
  return (DOCUMENT_STYLE_SCOPES as readonly string[]).includes(v);
}
