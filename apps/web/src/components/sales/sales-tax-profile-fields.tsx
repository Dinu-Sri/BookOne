'use client';

export type SalesTaxSettings = {
  vatRegistered: boolean;
  vatRatePercent: number;
  defaultSaleChannel?: string;
  defaultInvoiceKind?: string;
};

export function SalesTaxProfileFields({
  settings,
  saleChannel,
  invoiceKind,
  onSaleChannel,
  onInvoiceKind,
  informational = false,
  defaultSaleChannel,
  defaultInvoiceKind,
}: {
  settings?: SalesTaxSettings | null;
  saleChannel?: string;
  invoiceKind?: string;
  onSaleChannel?: (value: string) => void;
  onInvoiceKind?: (value: string) => void;
  informational?: boolean;
  defaultSaleChannel?: string;
  defaultInvoiceKind?: string;
}) {
  const vatRegistered = Boolean(settings?.vatRegistered);
  const rate = settings?.vatRatePercent ?? 18;
  if (!vatRegistered) {
    return (
      <>
        <input type="hidden" name="saleChannel" value="local" />
        <input type="hidden" name="invoiceKind" value="commercial" />
      </>
    );
  }

  const channelSelect = onSaleChannel ? (
    <select
      className="input"
      name="saleChannel"
      value={saleChannel || 'local'}
      onChange={(e) => onSaleChannel(e.target.value)}
    >
      <option value="local">Local sales</option>
      <option value="export">Export sales</option>
    </select>
  ) : (
    <select className="input" name="saleChannel" defaultValue={defaultSaleChannel || 'local'}>
      <option value="local">Local sales</option>
      <option value="export">Export sales</option>
    </select>
  );

  const kindSelect = onInvoiceKind ? (
    <select
      className="input"
      name="invoiceKind"
      value={invoiceKind || 'commercial'}
      onChange={(e) => onInvoiceKind(e.target.value)}
    >
      <option value="commercial">Commercial invoice</option>
      <option value="tax_invoice">TAX INVOICE (VAT {rate}%)</option>
    </select>
  ) : (
    <select className="input" name="invoiceKind" defaultValue={defaultInvoiceKind || 'commercial'}>
      <option value="commercial">Commercial invoice</option>
      <option value="tax_invoice">TAX INVOICE (VAT {rate}%)</option>
    </select>
  );

  return (
    <>
      <div className="field">
        <label>Sale channel</label>
        {channelSelect}
      </div>
      <div className="field">
        <label>{informational ? 'Intended invoice kind' : 'Invoice kind'}</label>
        {kindSelect}
        {informational ? (
          <small className="muted-line">
            VAT is not posted on this document. A tax invoice adds {rate}% VAT when converted or posted.
          </small>
        ) : null}
      </div>
    </>
  );
}
