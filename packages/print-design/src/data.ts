import type { MetaField, TotalRow } from './elements';
import { PRINT_KIND_INFO, type PrintKind } from './kinds';

/** Everything a print design can show, gathered from one document. Plain values only. */
export type PrintData = {
  kind: PrintKind;
  currency: string;
  company: {
    name: string;
    tradingName: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    registration: string;
    tin: string;
  };
  party: { name: string; address: string; phone: string; tin: string } | null;
  shipTo: { name: string; address: string; phone: string } | null;
  number: string;
  meta: Partial<Record<MetaField, string>>;
  lines: Array<{
    sku: string;
    description: string;
    quantity: number | null;
    unit: string;
    unitPrice: number | null;
    discount: number;
    tax: number;
    amount: number | null;
  }>;
  totals: Partial<Record<TotalRow, number>>;
  vatRate: number;
  amountInWords: string;
  payment: { method: string; tendered: number | null; change: number | null } | null;
  notes: string;
  bankDetails: string;
  qrUrl: string | null;
  /** QR code image (data URL) for qrUrl, made on the server when a design shows a QR code. */
  qrImage: string | null;
  /** Image URLs for the company's uploaded assets. */
  assets: { logo: string | null; signature: string | null; stamp: string | null };
};

const SAMPLE_COMPANY: PrintData['company'] = {
  name: 'Your Company (Pvt) Ltd',
  tradingName: 'Your Company',
  address: '12 Galle Road, Colombo 03',
  phone: '011 234 5678',
  email: 'hello@yourcompany.lk',
  website: 'yourcompany.lk',
  registration: 'PV 12345',
  tin: '123456789-7000',
};

/** Realistic sample data for previews, so a design can be judged before it is used. */
export function samplePrintData(kind: PrintKind): PrintData {
  const info = PRINT_KIND_INFO[kind];
  const money = info.hasMoney;
  const lines: PrintData['lines'] = [
    { sku: 'TS-001', description: 'Cotton T-shirt, navy, size M', quantity: 4, unit: 'pcs', unitPrice: 1850, discount: 0, tax: 1332, amount: 7400 },
    { sku: 'CP-010', description: 'Canvas cap, black', quantity: 2, unit: 'pcs', unitPrice: 1200, discount: 200, tax: 396, amount: 2200 },
    { sku: 'SV-DEL', description: 'Delivery within Colombo', quantity: 1, unit: 'trip', unitPrice: 500, discount: 0, tax: 90, amount: 500 },
  ];
  const subtotal = 10300;
  const discount = 200;
  const vat = kind === 'tax_invoice' || kind === 'pos_bill' ? 1818 : 0;
  const total = subtotal - discount + vat;
  return {
    kind,
    currency: 'LKR',
    company: SAMPLE_COMPANY,
    party:
      kind === 'packing_slip'
        ? null
        : {
            name: kind === 'purchase_order' ? 'Lanka Textile Mills' : kind === 'payment_voucher' ? 'City Electricity Board' : 'Nimal Perera',
            address: '45 Kandy Road, Kadawatha',
            phone: '077 123 4567',
            tin: '987654321-7000',
          },
    shipTo: { name: 'Nimal Perera', address: '45 Kandy Road, Kadawatha', phone: '077 123 4567' },
    number: kind === 'tax_invoice' ? 'TAX-000123' : `${info.defaultTitle.slice(0, 3).toUpperCase()}-000123`,
    meta: {
      number: kind === 'tax_invoice' ? 'TAX-000123' : `${info.defaultTitle.slice(0, 3).toUpperCase()}-000123`,
      date: '27 Nov 2026',
      due_date: '27 Dec 2026',
      valid_until: '11 Dec 2026',
      delivery_date: '29 Nov 2026',
      reference: kind === 'credit_note' ? 'INV-000101' : 'PO-7781',
      payment_mode: 'Bank transfer',
      place_of_supply: 'Colombo',
      channel: 'Website',
      cashier: 'Sanduni',
      deposited_to: 'Commercial Bank (1100)',
    },
    lines: money ? lines : lines.map((l) => ({ ...l, unitPrice: null, amount: null, tax: 0, discount: 0 })),
    totals: money ? { subtotal, discount, vat, total, paid: total, balance: 0 } : {},
    vatRate: vat ? 18 : 0,
    amountInWords: money ? 'Eleven thousand nine hundred and eighteen rupees only' : '',
    payment: kind === 'pos_bill' || kind === 'receipt' ? { method: 'Cash', tendered: 12000, change: 82 } : null,
    notes: kind === 'packing_slip' ? 'Gift wrap please.' : 'Thank you for your order.',
    bankDetails: 'Commercial Bank, Colombo 03\nAccount 1234 5678 90 (Your Company (Pvt) Ltd)',
    qrUrl: 'https://bookone.lk/i/sample',
    qrImage: null,
    assets: { logo: null, signature: null, stamp: null },
  };
}
