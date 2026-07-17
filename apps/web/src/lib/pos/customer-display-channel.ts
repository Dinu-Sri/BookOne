/**
 * Sync POS cart to a customer-facing display window via BroadcastChannel.
 */

export const POS_DISPLAY_CHANNEL = 'bookone-pos-customer-display';

export type PosDisplayCartLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type PosDisplayMessage =
  | {
      type: 'cart';
      storeName: string;
      registerLabel: string;
      mode: 'sale' | 'return';
      lines: PosDisplayCartLine[];
      subtotal: number;
      discount: number;
      tax: number;
      total: number;
      updatedAt: number;
    }
  | {
      type: 'idle';
      storeName: string;
      registerLabel: string;
      updatedAt: number;
    }
  | {
      type: 'thankyou';
      storeName: string;
      registerLabel: string;
      total: number;
      mode: 'sale' | 'return';
      updatedAt: number;
    };

export function createPosDisplayChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(POS_DISPLAY_CHANNEL);
  } catch {
    return null;
  }
}

export function publishPosDisplay(msg: PosDisplayMessage): void {
  const ch = createPosDisplayChannel();
  if (!ch) return;
  try {
    ch.postMessage(msg);
    // Also mirror to localStorage for same-origin windows that missed the channel
    localStorage.setItem(POS_DISPLAY_CHANNEL, JSON.stringify(msg));
  } catch {
    /* ignore */
  } finally {
    ch.close();
  }
}

export function openCustomerDisplayWindow(): Window | null {
  if (typeof window === 'undefined') return null;
  return window.open(
    '/pos/customer-display',
    'bookone_pos_cfd',
    'noopener,width=900,height=700',
  );
}
