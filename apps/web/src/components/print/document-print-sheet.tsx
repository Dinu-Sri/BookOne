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
  publicView = false,
}: {
  model: DocumentPrintModel;
  backHref?: string;
  backLabel?: string;
  embedded?: boolean;
  publicView?: boolean;
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
    <div
      className={`doc-print-root${publicView ? ' is-public' : ''}`}
      style={{ fontFamily: style.fontFamily, fontSize: `${base}px` }}
    >
      {(!embedded && backHref) || publicView ? (
        <div className="doc-print-toolbar no-print">
          {backHref ? <Link href={backHref}>← {backLabel}</Link> : <span>{model.title}</span>}
          <span className="doc-print-hint">In the print dialog, turn off Headers and footers.</span>
          <button type="button" onClick={() => window.print()}>
            Print
          </button>
        </div>
      ) : null}

      <article className="doc-print-sheet" data-print-title={meta.number}>
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
              {company.website ? <div className="doc-print-muted">{company.website}</div> : null}
              {company.registrationNumber ? (
                <div className="doc-print-muted">Reg. {company.registrationNumber}</div>
              ) : null}
            </div>
          </div>
          <div className="doc-print-titleblock">
            <div className="doc-print-titletext">
              <h1 style={{ color: accent, fontSize: `${t1}px`, margin: 0, letterSpacing: '0.04em', fontWeight: 800 }}>
                {model.title}
              </h1>
              <div className="doc-print-muted" style={{ fontSize: `${small}px` }}>
                {meta.number}
              </div>
            </div>
            {style.showQr && style.qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={style.qrDataUrl} alt="Open this document" className="doc-print-qr" />
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
              {company.website ? <p>{company.website}</p> : null}
              {company.registrationNumber ? <p>Reg. {company.registrationNumber}</p> : null}
              {showTin ? <p>TIN {company.tin || '—'}</p> : null}
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

        <div className="doc-print-tablewrap">
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
        </div>

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
      </article>

      <style>{`
        .doc-print-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:12px 16px; padding:12px 16px; font-family: system-ui,sans-serif; }
        .doc-print-hint { font-size: 12px; color:#6b7280; margin-left:auto; }
        .doc-print-sheet { max-width: 210mm; margin: 0 auto; padding: 16px 20px 24px; color:#111; background:#fff; }
        .doc-print-head { display:flex; justify-content:space-between; gap:16px; padding-bottom:10px; margin-bottom:12px; align-items:center; }
        .doc-print-brand { display:flex; gap:12px; align-items:center; min-width:0; }
        .doc-print-logo { max-height: 56px; max-width: 180px; object-fit: contain; }
        .doc-print-company { font-weight: 800; line-height: 1.2; }
        .doc-print-titleblock { display:flex; align-items:center; gap:12px; text-align:right; flex-shrink:0; }
        .doc-print-titletext { min-width: 0; }
        .doc-print-qr { width: 56px; height: 56px; margin: 0; display:block; flex-shrink:0; }
        .doc-print-muted { color:#555; }
        .doc-print-label { display:block; font-size: 9px; letter-spacing:.08em; text-transform:uppercase; color:#6b7280; margin-bottom:2px; }
        .doc-print-meta { display:flex; flex-wrap:wrap; gap:16px 28px; margin-bottom:14px; }
        .doc-print-parties { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:14px; }
        .doc-print-parties h2 { margin:0 0 6px; letter-spacing:.1em; font-weight:800; }
        .doc-print-parties p { margin: 0 0 3px; }
        .doc-print-notes, .doc-print-box, .doc-print-words { background:#f8fafc; padding:10px 12px; border-radius:6px; margin: 0 0 12px; }
        .doc-print-tablewrap { width:100%; overflow-x:auto; -webkit-overflow-scrolling: touch; }
        .doc-print-lines { width:100%; border-collapse:collapse; margin-top:4px; }
        .doc-print-lines th { text-align:left; font-size: 9px; letter-spacing:.08em; text-transform:uppercase; color:#6b7280; border-bottom:1px solid #e5e7eb; padding:8px 6px; }
        .doc-print-lines td { border-bottom:1px solid #f1f5f9; padding:8px 6px; }
        .doc-print-totals { width: 240px; border-collapse:collapse; margin-left:auto; }
        .doc-print-totals td { padding:6px 0; }
        .doc-print-grand td { border-top: 2px solid ${accent}; padding-top:10px; font-size: 13px; }
        .doc-print-footgrid { display:grid; grid-template-columns: 1fr auto; gap: 20px; margin-top: 16px; align-items:start; }
        .doc-print-footer { margin: 8px 0 0; color:#374151; white-space: pre-wrap; }
        .doc-print-box { white-space: pre-wrap; }
        .num { text-align:right; white-space:nowrap; }
        .doc-print-root.is-public { min-height: 100dvh; background:#f3f4f6; padding: 12px 12px 32px; box-sizing: border-box; }
        .doc-print-root.is-public .doc-print-sheet { box-shadow: 0 8px 28px rgba(15,23,42,.12); border-radius: 8px; }
        @media (max-width: 720px) {
          .doc-print-root.is-public { padding: 0; background:#fff; }
          .doc-print-root.is-public .doc-print-sheet { box-shadow:none; border-radius:0; max-width:100%; padding: 16px 14px 28px; }
          .doc-print-head { flex-direction:column; align-items:stretch; gap:10px; }
          .doc-print-titleblock { justify-content:space-between; text-align:left; width:100%; }
          .doc-print-parties, .doc-print-footgrid { grid-template-columns:1fr; }
          .doc-print-totals { width:100%; }
          .doc-print-logo { max-height:48px; }
          .doc-print-qr { width:64px; height:64px; }
          .doc-print-hint { display:none; }
        }
        @page { size: A4; margin: 10mm; }
        @media print {
          .no-print, .doc-print-toolbar, .doc-print-modal-bar { display:none !important; }
          .doc-print-root, .doc-print-root.is-public { background:#fff; padding:0; min-height:0; }
          .doc-print-sheet { padding:0; max-width:none; box-shadow:none; border-radius:0; }
        }
      `}</style>
    </div>
  );
}
