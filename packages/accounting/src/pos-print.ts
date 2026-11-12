/**
 * POS register print modes. Default remains `browser`. Existing registers are
 * not rewritten. `manual` is preview-only: financial commit and Z-close do not
 * open autoprint pages, write the thermal printer, use Web Serial, or kick the drawer.
 */

export const POS_PRINT_MODES = ['browser', 'thermal', 'both', 'manual'] as const;
export type PosPrintMode = (typeof POS_PRINT_MODES)[number];

export type PosPrintEffects = {
  autoprintReceipt: boolean;
  thermalReceipt: boolean;
  autoprintZ: boolean;
  thermalZ: boolean;
  kickDrawerOnCash: boolean;
};

const MANUAL_EFFECTS: PosPrintEffects = {
  autoprintReceipt: false,
  thermalReceipt: false,
  autoprintZ: false,
  thermalZ: false,
  kickDrawerOnCash: false,
};

export function isPosPrintMode(value: string | null | undefined): value is PosPrintMode {
  return value === 'browser' || value === 'thermal' || value === 'both' || value === 'manual';
}

export function normalizePosPrintMode(value: string | null | undefined): PosPrintMode {
  return isPosPrintMode(value) ? value : 'browser';
}

export function posPrintEffects(mode: string | null | undefined): PosPrintEffects {
  const m = normalizePosPrintMode(mode);
  if (m === 'manual') return MANUAL_EFFECTS;
  return {
    autoprintReceipt: m === 'browser' || m === 'both',
    thermalReceipt: m === 'thermal' || m === 'both',
    // Existing auto modes always open the Z sheet; only manual skips it.
    autoprintZ: true,
    thermalZ: m === 'thermal' || m === 'both',
    kickDrawerOnCash: true,
  };
}

export function posPrintModeLabel(mode: string | null | undefined): string {
  switch (normalizePosPrintMode(mode)) {
    case 'thermal':
      return 'Thermal';
    case 'both':
      return 'Browser + thermal';
    case 'manual':
      return 'Manual / preview only';
    default:
      return 'Browser';
  }
}
