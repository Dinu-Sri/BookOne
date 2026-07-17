/**
 * Minimal ESC/POS command builders for 58/80mm thermal printers.
 * Works with Web Serial (USB-serial adapters) common on POS terminals.
 */

const encoder = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function text(s: string): Uint8Array {
  // ESC/POS often expects CP437/ASCII; strip non-latin for reliability
  const safe = s
    .replace(/[^\x20-\x7E\n\r\t]/g, '?')
    .replace(/\r\n/g, '\n');
  return encoder.encode(safe);
}

export const ESC = 0x1b;
export const GS = 0x1d;

/** Initialize printer */
export function escInit(): Uint8Array {
  return new Uint8Array([ESC, 0x40]);
}

/** Align: 0 left, 1 center, 2 right */
export function escAlign(n: 0 | 1 | 2): Uint8Array {
  return new Uint8Array([ESC, 0x61, n]);
}

/** Bold on/off */
export function escBold(on: boolean): Uint8Array {
  return new Uint8Array([ESC, 0x45, on ? 1 : 0]);
}

/** Double size */
export function escDouble(on: boolean): Uint8Array {
  return new Uint8Array([GS, 0x21, on ? 0x11 : 0x00]);
}

/** Feed n lines */
export function escFeed(n = 1): Uint8Array {
  return new Uint8Array([ESC, 0x64, Math.max(0, Math.min(255, n))]);
}

/** Partial cut (most 80mm printers) */
export function escCut(): Uint8Array {
  return new Uint8Array([GS, 0x56, 0x00]);
}

/**
 * Cash drawer kick via printer RJ11/RJ12.
 * pin 0 = pin2, 1 = pin5; pulse ~100ms
 */
export function escDrawerKick(pin: 0 | 1 = 0, t1 = 50, t2 = 50): Uint8Array {
  return new Uint8Array([ESC, 0x70, pin, Math.max(0, Math.min(255, t1)), Math.max(0, Math.min(255, t2))]);
}

export interface EscposReceiptLine {
  description: string;
  quantity: number;
  amount: number;
}

export interface EscposReceiptInput {
  storeName: string;
  registerLabel?: string;
  title?: string;
  documentNumber: string;
  dateLabel: string;
  customer?: string;
  paymentMode?: string;
  lines: EscposReceiptLine[];
  subtotal: number;
  tax?: number;
  total: number;
  footer?: string | null;
  paperChars?: 32 | 42 | 48;
}

function money(n: number) {
  return n.toFixed(2);
}

function padLine(left: string, right: string, width: number): string {
  const gap = Math.max(1, width - left.length - right.length);
  if (left.length + right.length >= width) {
    return `${left.slice(0, Math.max(0, width - right.length - 1))} ${right}`.slice(0, width);
  }
  return left + ' '.repeat(gap) + right;
}

/** Build full receipt bytes (init + body + feed + cut). Does not include drawer. */
export function buildEscposReceipt(input: EscposReceiptInput): Uint8Array {
  const w = input.paperChars ?? 42;
  const parts: Uint8Array[] = [];
  parts.push(escInit());
  parts.push(escAlign(1));
  parts.push(escDouble(true));
  parts.push(text(`${input.storeName}\n`));
  parts.push(escDouble(false));
  if (input.registerLabel) parts.push(text(`${input.registerLabel}\n`));
  parts.push(text(`${input.title ?? 'SALES RECEIPT'}\n`));
  parts.push(escAlign(0));
  parts.push(text(`${'-'.repeat(w)}\n`));
  parts.push(text(`${input.documentNumber}\n`));
  parts.push(text(`${input.dateLabel}\n`));
  if (input.customer) parts.push(text(`Customer: ${input.customer}\n`));
  if (input.paymentMode) parts.push(text(`Pay: ${input.paymentMode}\n`));
  parts.push(text(`${'-'.repeat(w)}\n`));

  for (const line of input.lines) {
    const desc = line.description.slice(0, w);
    parts.push(text(`${desc}\n`));
    const left = `  x${line.quantity}`;
    const right = money(line.amount);
    parts.push(text(`${padLine(left, right, w)}\n`));
  }

  parts.push(text(`${'-'.repeat(w)}\n`));
  parts.push(text(`${padLine('Subtotal', money(input.subtotal), w)}\n`));
  if (input.tax && input.tax > 0) {
    parts.push(text(`${padLine('VAT', money(input.tax), w)}\n`));
  }
  parts.push(escBold(true));
  parts.push(text(`${padLine('TOTAL LKR', money(input.total), w)}\n`));
  parts.push(escBold(false));
  if (input.footer) {
    parts.push(text(`${'-'.repeat(w)}\n`));
    parts.push(escAlign(1));
    parts.push(text(`${input.footer}\n`));
    parts.push(escAlign(0));
  }
  parts.push(escAlign(1));
  parts.push(text('Thank you\n'));
  parts.push(escAlign(0));
  parts.push(escFeed(4));
  parts.push(escCut());
  return concat(...parts);
}

export function buildEscposZReportText(lines: string[], paperChars: 32 | 42 | 48 = 42): Uint8Array {
  const w = paperChars;
  const parts: Uint8Array[] = [escInit(), escAlign(1), escBold(true), text('Z-REPORT\n'), escBold(false), escAlign(0)];
  parts.push(text(`${'-'.repeat(w)}\n`));
  for (const line of lines) {
    parts.push(text(`${line.slice(0, w)}\n`));
  }
  parts.push(escFeed(4));
  parts.push(escCut());
  return concat(...parts);
}
