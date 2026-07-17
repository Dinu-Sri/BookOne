/**
 * Browser-side thermal printer bridge via Web Serial API.
 * User must grant port access once (Chrome/Edge on HTTPS or localhost).
 */

import {
  buildEscposReceipt,
  buildEscposZReportText,
  escDrawerKick,
  escInit,
  type EscposReceiptInput,
} from '@/lib/pos/escpos';

type SerialPortLike = {
  open: (opts: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  writable: WritableStream<Uint8Array> | null;
  readable: ReadableStream<Uint8Array> | null;
  getInfo?: () => { usbVendorId?: number; usbProductId?: number };
};

function getSerial(): { requestPort: () => Promise<SerialPortLike>; getPorts: () => Promise<SerialPortLike[]> } | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & {
    serial?: { requestPort: () => Promise<SerialPortLike>; getPorts: () => Promise<SerialPortLike[]> };
  };
  return nav.serial ?? null;
}

export function isWebSerialSupported(): boolean {
  return Boolean(getSerial());
}

let port: SerialPortLike | null = null;
let baudRate = 9600;

export type ThermalStatus = {
  supported: boolean;
  connected: boolean;
  baudRate: number;
  label: string;
};

export function getThermalStatus(): ThermalStatus {
  return {
    supported: isWebSerialSupported(),
    connected: Boolean(port?.writable),
    baudRate,
    label: port ? `Serial ${baudRate}` : isWebSerialSupported() ? 'Not connected' : 'Web Serial unavailable',
  };
}

export async function connectThermalPrinter(options?: { baudRate?: number }): Promise<{
  ok: boolean;
  error?: string;
}> {
  const serial = getSerial();
  if (!serial) {
    return {
      ok: false,
      error: 'Web Serial not supported. Use Chrome/Edge on HTTPS, or browser print.',
    };
  }
  try {
    baudRate = options?.baudRate ?? 9600;
    // Prefer previously granted port
    const existing = await serial.getPorts();
    if (existing.length > 0 && !port) {
      port = existing[0];
    } else if (!port) {
      port = await serial.requestPort();
    }
    // Re-open if needed
    try {
      await port.open({ baudRate });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Already open is ok
      if (!/already open/i.test(msg)) {
        // try request fresh
        port = await serial.requestPort();
        await port.open({ baudRate });
      }
    }
    return { ok: true };
  } catch (e) {
    port = null;
    return { ok: false, error: e instanceof Error ? e.message : 'Could not open serial port.' };
  }
}

export async function disconnectThermalPrinter(): Promise<void> {
  if (!port) return;
  try {
    await port.close();
  } catch {
    /* ignore */
  }
  port = null;
}

async function writeBytes(data: Uint8Array): Promise<void> {
  if (!port?.writable) {
    throw new Error('Printer not connected. Click Connect printer first.');
  }
  const writer = port.writable.getWriter();
  try {
    await writer.write(data);
  } finally {
    writer.releaseLock();
  }
}

export async function printThermalReceipt(input: EscposReceiptInput): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!port?.writable) {
      const c = await connectThermalPrinter();
      if (!c.ok) return c;
    }
    const bytes = buildEscposReceipt(input);
    await writeBytes(bytes);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Thermal print failed.' };
  }
}

export async function printThermalZReport(lines: string[]): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!port?.writable) {
      const c = await connectThermalPrinter();
      if (!c.ok) return c;
    }
    await writeBytes(buildEscposZReportText(lines));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Thermal Z print failed.' };
  }
}

/** Pulse cash drawer (via printer). */
export async function openCashDrawer(): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!port?.writable) {
      const c = await connectThermalPrinter();
      if (!c.ok) return c;
    }
    await writeBytes(concatBytes(escInit(), escDrawerKick(0), escDrawerKick(1)));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Drawer kick failed.' };
  }
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
