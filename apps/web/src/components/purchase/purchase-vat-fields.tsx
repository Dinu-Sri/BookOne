'use client';

export function PurchaseVatFields({
  vatRegistered,
  vatRatePercent = 18,
  defaultInvoiceKind = 'commercial',
  informational = false,
  compact = false,
  hint,
}: {
  vatRegistered?: boolean;
  vatRatePercent?: number;
  defaultInvoiceKind?: string;
  informational?: boolean;
  compact?: boolean;
  hint?: string;
}) {
  if (!vatRegistered) return null;
  const kind = defaultInvoiceKind === 'tax_invoice' ? 'tax_invoice' : 'commercial';
  const select = (
    <select className="input" name="invoiceKind" defaultValue={kind} aria-label="Input VAT" style={compact ? { minWidth: 180 } : undefined}>
      <option value="commercial">No input VAT</option>
      <option value="tax_invoice">Claim input VAT ({vatRatePercent}%)</option>
    </select>
  );
  if (compact) return select;
  const help =
    hint ??
    (informational
      ? `Input VAT is not posted on this document. Claiming it adds ${vatRatePercent}% on the purchase bill.`
      : null);
  return (
    <div className="field">
      <label>Input VAT</label>
      {select}
      {help ? (
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--ink-soft)' }}>{help}</p>
      ) : null}
    </div>
  );
}
