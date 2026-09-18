import Link from 'next/link';
import { formatDateMmDdYyyy } from '@bookone/accounting';
import type { DocumentPrintModel } from '@/app/actions/document-print';

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DocumentPrintSheet({
  model,
  backHref,
  backLabel,
  embedded = false,
}: {
  model: DocumentPrintModel;
  backHref?: string;
  backLabel?: string;
  embedded?: boolean;
}) {
  const { style, company, party, meta, lines, totals, kind } = model;
  const taxLocked = kind === 'tax_invoice';
  const showTin = taxLocked || style.showTin;
  const showSku = kind === 'receipt' ? true : style.showSku;
  const accent = style.accentColor;
  const justify =
    style.logoPosition === 'center' ? 'center' : style.logoPosition === 'right' ? 'flex-end' : 'space-between';

  return (
    <div className="doc-print-root" style={{ fontFamily: style.fontFamily }}>
      {!embedded && backHref ? (
      <div className="doc-print-toolbar no-print">
        <Link href={backHref}>← {backLabel}</Link>
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
      </div>
      ) : null}

      <article className="doc-print-sheet">
        <header
          className="doc-print-head"
          style={{
            borderBottom: `3px solid ${accent}`,
            justifyContent: justify,
            flexDirection: style.logoPosition === 'right' ? 'row-reverse' : 'row',
          }}
        >
          <div className="doc-print-brand">
            {style.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={style.logoUrl} alt="" className="doc-print-logo" />
            ) : null}
            <div>
              <div className="doc-print-company">{company.name}</div>
              {company.address ? <div>{company.address}</div> : null}
              {style.showPhone && company.phone ? <div>Tel: {company.phone}</div> : null}
              {style.showEmail && company.email ? <div>{company.email}</div> : null}
              {showTin && company.tin ? (
                <div>
                  <strong>TIN:</strong> {company.tin}
                </div>
              ) : null}
            </div>
          </div>
          <h1 style={{ color: accent, margin: 0, letterSpacing: '0.08em', fontSize: 22 }}>{model.title}</h1>
        </header>

        <div className="doc-print-meta">
          <div>
            <strong>{meta.dateLabel}:</strong> {formatDateMmDdYyyy(meta.date)}
          </div>
          <div>
            <strong>{meta.numberLabel}:</strong> {meta.number}
          </div>
          {meta.dueDate ? (
            <div>
              <strong>Due date:</strong> {formatDateMmDdYyyy(meta.dueDate)}
            </div>
          ) : null}
          {kind !== 'receipt' && meta.deliveryDate ? (
            <div>
              <strong>Date of delivery:</strong> {formatDateMmDdYyyy(meta.deliveryDate)}
            </div>
          ) : null}
          {taxLocked ? (
            <div>
              <strong>Place of supply:</strong> {meta.placeOfSupply || '—'}
            </div>
          ) : null}
        </div>

        {kind !== 'receipt' ? (
          <div className="doc-print-parties">
            <section>
              <h2 style={{ color: accent }}>Supplier</h2>
              {showTin ? (
                <p>
                  <strong>TIN:</strong> {company.tin || '—'}
                </p>
              ) : null}
              <p>
                <strong>Name:</strong> {company.name}
              </p>
              <p>
                <strong>Address:</strong> {company.address || '—'}
              </p>
              {style.showPhone ? (
                <p>
                  <strong>Telephone:</strong> {company.phone || '—'}
                </p>
              ) : null}
            </section>
            <section>
              <h2 style={{ color: accent }}>{taxLocked ? 'Purchaser' : party.label}</h2>
              {showTin ? (
                <p>
                  <strong>TIN:</strong> {party.tin || '—'}
                </p>
              ) : null}
              <p>
                <strong>Name:</strong> {party.name || '—'}
              </p>
              <p>
                <strong>Address:</strong> {party.address || '—'}
              </p>
              {style.showPhone ? (
                <p>
                  <strong>Telephone:</strong> {party.phone || '—'}
                </p>
              ) : null}
            </section>
          </div>
        ) : (
          <p>
            <strong>{party.label}:</strong> {party.name}
          </p>
        )}

        {model.notes ? (
          <p className="doc-print-notes">
            <strong>Notes:</strong> {model.notes}
          </p>
        ) : null}

        <table className="doc-print-lines">
          <thead>
            <tr style={{ background: `${accent}14` }}>
              {showSku ? <th>{kind === 'receipt' ? 'Invoice no.' : 'SKU / ref'}</th> : null}
              <th>{kind === 'receipt' ? 'Customer' : 'Description'}</th>
              {kind !== 'receipt' ? <th>Qty</th> : null}
              {kind !== 'receipt' ? <th>Unit price</th> : null}
              <th>Amount (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                {showSku ? <td>{line.sku || '—'}</td> : null}
                <td>{line.description}</td>
                {kind !== 'receipt' ? <td className="num">{line.quantity}</td> : null}
                {kind !== 'receipt' ? <td className="num">{money(line.unitPrice)}</td> : null}
                <td className="num">{money(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="doc-print-totals">
          <tbody>
            {kind !== 'receipt' ? (
              <tr>
                <td>Subtotal</td>
                <td className="num">{money(totals.subtotal)}</td>
              </tr>
            ) : null}
            {totals.discount > 0 ? (
              <tr>
                <td>Discount</td>
                <td className="num">{money(totals.discount)}</td>
              </tr>
            ) : null}
            {taxLocked || totals.vat > 0 ? (
              <tr>
                <td>VAT{totals.vatRate > 0 ? ` (${totals.vatRate}%)` : ''}</td>
                <td className="num">{money(totals.vat)}</td>
              </tr>
            ) : null}
            <tr>
              <td>
                <strong>{kind === 'receipt' ? 'Total received' : 'Total'}</strong>
              </td>
              <td className="num">
                <strong>{money(totals.total)}</strong>
              </td>
            </tr>
          </tbody>
        </table>

        {taxLocked || totals.words ? (
          <p className="doc-print-words">
            <strong>Amount in words:</strong> {totals.words || '—'}
          </p>
        ) : null}

        {meta.paymentMode ? (
          <p>
            <strong>Mode of payment:</strong> {meta.paymentMode}
            {meta.channel ? ` · ${meta.channel}` : ''}
          </p>
        ) : null}

        {style.showBank && style.bankDetails ? (
          <p className="doc-print-notes">
            <strong>Bank:</strong> {style.bankDetails}
          </p>
        ) : null}
        {style.footerNotes ? <p className="doc-print-footer">{style.footerNotes}</p> : null}
        <p className="doc-print-version no-print">
          {style.name} · v{style.version}
        </p>
      </article>

      <style>{`
        .doc-print-toolbar { display:flex; gap:16px; padding:12px 16px; font-family: system-ui,sans-serif; }
        .doc-print-sheet { max-width: 820px; margin: 0 auto; padding: 16px 20px 40px; color:#111; font-size: 12px; }
        .doc-print-head { display:flex; align-items:flex-start; gap:16px; padding-bottom:12px; margin-bottom:14px; }
        .doc-print-brand { display:flex; gap:12px; align-items:flex-start; }
        .doc-print-logo { max-height: 56px; max-width: 220px; object-fit: contain; }
        .doc-print-company { font-size: 16px; font-weight: 800; }
        .doc-print-meta { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; }
        .doc-print-meta div { border:1px solid #ccc; padding:6px 8px; }
        .doc-print-parties { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
        .doc-print-parties section { border:1px solid #ccc; padding:10px; min-height:110px; }
        .doc-print-parties h2 { margin:0 0 8px; font-size:12px; text-transform:uppercase; }
        .doc-print-parties p { margin: 0 0 4px; }
        .doc-print-notes, .doc-print-words { border:1px solid #ccc; padding:8px; }
        .doc-print-lines, .doc-print-totals { width:100%; border-collapse:collapse; margin-top:10px; }
        .doc-print-lines th, .doc-print-lines td, .doc-print-totals td { border:1px solid #ccc; padding:6px 8px; }
        .doc-print-lines th { text-align:left; font-size:11px; }
        .num { text-align:right; white-space:nowrap; }
        .doc-print-footer { margin-top:16px; }
        .doc-print-version { margin-top:20px; font-size:10px; color:#888; }
        @media print {
          .no-print, .doc-print-toolbar { display:none !important; }
          .doc-print-sheet { padding:0; max-width:none; }
          body { background:#fff; }
          .app-shell, .sidebar, .topbar { display:none !important; }
          .main { margin:0 !important; padding:0 !important; }
        }
      `}</style>
    </div>
  );
}
