import Link from 'next/link';
import { formatDateMmDdYyyy } from '@bookone/accounting';
import type { DocumentPrintModel } from '@/app/actions/document-print';
import { scaleRatio } from '@/lib/document-style';

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
  const showTin = taxLocked;
  const anySku = lines.some((l) => l.sku && l.sku !== '—');
  const anyDisc = lines.some((l) => l.discount > 0.004);
  const showSku = kind === 'receipt' ? true : style.showSku && anySku;
  const accent = style.accentColor;
  const ratio = scaleRatio(style.typeScale);
  const base = style.baseFontPx || 11;
  const t1 = Math.round(base * ratio * ratio * ratio * 10) / 10;
  const t2 = Math.round(base * ratio * ratio * 10) / 10;
  const small = Math.round((base / ratio) * 10) / 10;

  return (
    <div className="doc-print-root" style={{ fontFamily: style.fontFamily, fontSize: `${base}px` }}>
      {!embedded && backHref ? (
        <div className="doc-print-toolbar no-print">
          <Link href={backHref}>← {backLabel}</Link>
          <button type="button" onClick={() => window.print()}>
            Print
          </button>
        </div>
      ) : null}

      <article className="doc-print-sheet">
        <header className="doc-print-head" style={{ borderBottom: `2px solid ${accent}` }}>
          <div className="doc-print-brand">
            {style.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={style.logoUrl} alt="" className="doc-print-logo" />
            ) : null}
            <div>
              <div className="doc-print-company" style={{ fontSize: `${t2}px` }}>
                {company.name}
              </div>
              {company.address ? <div className="doc-print-muted">{company.address}</div> : null}
              {style.showPhone && company.phone ? <div className="doc-print-muted">Tel {company.phone}</div> : null}
              {style.showEmail && company.email ? <div className="doc-print-muted">{company.email}</div> : null}
            </div>
          </div>
          <div className="doc-print-titleblock">
            <div className="doc-print-kicker" style={{ color: accent }}>
              {kind === 'tax_invoice' ? 'VAT' : kind === 'quotation' ? 'QUOTE' : kind === 'receipt' ? 'RECEIPT' : 'INVOICE'}
            </div>
            <h1 style={{ color: accent, fontSize: `${t1}px`, margin: 0, letterSpacing: '0.04em', fontWeight: 800 }}>
              {model.title}
            </h1>
            <div className="doc-print-muted" style={{ fontSize: `${small}px` }}>
              {meta.number}
            </div>
            {style.showQr && style.qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={style.qrDataUrl} alt="Invoice link" className="doc-print-qr" />
            ) : null}
          </div>
        </header>

        <div className="doc-print-meta">
          <div>
            <span className="doc-print-label">{meta.dateLabel}</span>
            <strong>{formatDateMmDdYyyy(meta.date)}</strong>
          </div>
          {meta.dueDate ? (
            <div>
              <span className="doc-print-label">Due</span>
              <strong>{formatDateMmDdYyyy(meta.dueDate)}</strong>
            </div>
          ) : null}
          {kind !== 'receipt' && meta.deliveryDate ? (
            <div>
              <span className="doc-print-label">Delivery</span>
              <strong>{formatDateMmDdYyyy(meta.deliveryDate)}</strong>
            </div>
          ) : null}
          {taxLocked ? (
            <div>
              <span className="doc-print-label">Place of supply</span>
              <strong>{meta.placeOfSupply || '—'}</strong>
            </div>
          ) : null}
        </div>

        {kind !== 'receipt' ? (
          <div className="doc-print-parties">
            <section>
              <h2 style={{ color: accent, fontSize: `${small}px` }}>From</h2>
              <p>
                <strong>{company.name}</strong>
              </p>
              {company.address ? <p>{company.address}</p> : null}
              {style.showPhone && company.phone ? <p>{company.phone}</p> : null}
              {style.showEmail && company.email ? <p>{company.email}</p> : null}
              {showTin ? (
                <p>
                  TIN {company.tin || '—'}
                </p>
              ) : null}
            </section>
            <section>
              <h2 style={{ color: accent, fontSize: `${small}px` }}>{taxLocked ? 'Bill to (purchaser)' : 'Bill to'}</h2>
              <p>
                <strong>{party.name || '—'}</strong>
              </p>
              {party.address ? <p>{party.address}</p> : null}
              {style.showPhone && party.phone ? <p>{party.phone}</p> : null}
              {showTin ? <p>TIN {party.tin || '—'}</p> : null}
            </section>
          </div>
        ) : (
          <p>
            <strong>{party.label}:</strong> {party.name}
          </p>
        )}

        {model.notes ? <p className="doc-print-notes">{model.notes}</p> : null}

        <table className="doc-print-lines">
          <thead>
            <tr>
              {showSku ? <th>{kind === 'receipt' ? 'Invoice no.' : 'SKU'}</th> : null}
              <th>{kind === 'receipt' ? 'Customer' : 'Description'}</th>
              {kind !== 'receipt' ? <th className="num">Qty</th> : null}
              {kind !== 'receipt' ? <th className="num">Price</th> : null}
              {anyDisc ? <th className="num">Disc.</th> : null}
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                {showSku ? <td>{line.sku || '—'}</td> : null}
                <td>{line.description}</td>
                {kind !== 'receipt' ? <td className="num">{line.quantity}</td> : null}
                {kind !== 'receipt' ? <td className="num">{money(line.unitPrice)}</td> : null}
                {anyDisc ? <td className="num">{line.discount ? money(line.discount) : '—'}</td> : null}
                <td className="num">{money(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="doc-print-footgrid">
          <div>
            {style.showBank && style.bankDetails ? (
              <div className="doc-print-box">
                <div className="doc-print-label">Bank</div>
                {style.bankDetails}
              </div>
            ) : null}
            {style.footerNotes ? <p className="doc-print-footer">{style.footerNotes}</p> : null}
            {taxLocked && totals.words ? (
              <p className="doc-print-words">
                <strong>In words:</strong> {totals.words}
              </p>
            ) : null}
          </div>
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
                  <td className="num">− {money(totals.discount)}</td>
                </tr>
              ) : null}
              {taxLocked || totals.vat > 0 ? (
                <tr>
                  <td>VAT{totals.vatRate > 0 ? ` ${totals.vatRate}%` : ''}</td>
                  <td className="num">{money(totals.vat)}</td>
                </tr>
              ) : null}
              <tr className="doc-print-grand">
                <td>
                  <strong>{kind === 'receipt' ? 'Received' : 'Total'}</strong>
                </td>
                <td className="num">
                  <strong>{money(totals.total)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {meta.paymentMode ? (
          <p className="doc-print-muted">
            Payment: {meta.paymentMode}
            {meta.channel ? ` · ${meta.channel}` : ''}
          </p>
        ) : null}
      </article>

      <style>{`
        .doc-print-toolbar { display:flex; gap:16px; padding:12px 16px; font-family: system-ui,sans-serif; }
        .doc-print-sheet { max-width: 210mm; margin: 0 auto; padding: 18px 22px 28px; color:#111; background:#fff; }
        .doc-print-head { display:flex; justify-content:space-between; gap:16px; padding-bottom:14px; margin-bottom:16px; align-items:flex-start; }
        .doc-print-brand { display:flex; gap:12px; align-items:flex-start; }
        .doc-print-logo { max-height: 52px; max-width: 200px; object-fit: contain; }
        .doc-print-company { font-weight: 800; line-height: 1.2; }
        .doc-print-titleblock { text-align:right; }
        .doc-print-kicker { font-size: 10px; font-weight: 800; letter-spacing: .12em; }
        .doc-print-qr { width: 72px; height: 72px; margin-top: 8px; margin-left: auto; display:block; }
        .doc-print-muted { color:#555; }
        .doc-print-label { display:block; font-size: 9px; letter-spacing:.08em; text-transform:uppercase; color:#6b7280; margin-bottom:2px; }
        .doc-print-meta { display:flex; flex-wrap:wrap; gap:16px 28px; margin-bottom:16px; }
        .doc-print-parties { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:16px; }
        .doc-print-parties h2 { margin:0 0 6px; letter-spacing:.1em; font-weight:800; }
        .doc-print-parties p { margin: 0 0 3px; }
        .doc-print-notes, .doc-print-box, .doc-print-words { background:#f8fafc; padding:10px 12px; border-radius:6px; margin: 0 0 12px; }
        .doc-print-lines { width:100%; border-collapse:collapse; margin-top:4px; }
        .doc-print-lines th { text-align:left; font-size: 9px; letter-spacing:.08em; text-transform:uppercase; color:#6b7280; border-bottom:1px solid #e5e7eb; padding:8px 6px; }
        .doc-print-lines td { border-bottom:1px solid #f1f5f9; padding:8px 6px; }
        .doc-print-totals { width: 240px; border-collapse:collapse; margin-left:auto; }
        .doc-print-totals td { padding:6px 0; }
        .doc-print-grand td { border-top: 2px solid ${accent}; padding-top:10px; font-size: 13px; }
        .doc-print-footgrid { display:grid; grid-template-columns: 1fr auto; gap: 20px; margin-top: 16px; align-items:start; }
        .doc-print-footer { margin: 8px 0 0; color:#374151; }
        .num { text-align:right; white-space:nowrap; }
        @media print {
          .no-print, .doc-print-toolbar, .doc-print-modal-bar { display:none !important; }
          .doc-print-sheet { padding:0; max-width:none; box-shadow:none; }
        }
      `}</style>
    </div>
  );
}
