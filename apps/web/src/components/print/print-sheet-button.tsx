'use client';

/** Isolated from DocumentPrintSheet so server print/receipt pages can render the sheet. */
export function PrintSheetButton({ label = 'Print' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}
