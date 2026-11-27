import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import {
  LINE_COLUMN_LABELS,
  META_FIELD_LABELS,
  blockLabel,
  fontCss,
  isRoll,
  layoutBands,
  paperBox,
  sizeStep,
  type Block,
  type LineColumn,
  type MetaField,
  type PrintData,
  type PrintDesign,
  type TotalRow,
} from '@bookone/print-design';
import { PrintSheetButton } from '@/components/print/print-sheet-button';

function money(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '';
  return n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function qty(n: number | null | undefined) {
  if (n == null) return '';
  return Number.isInteger(n) ? String(n) : n.toLocaleString('en-LK', { maximumFractionDigits: 3 });
}

const TOTAL_LABELS: Record<TotalRow, string> = {
  subtotal: 'Subtotal',
  discount: 'Discount',
  vat: 'VAT',
  total: 'Total',
  paid: 'Paid',
  balance: 'Balance due',
};

/** Columns a designer may hide automatically when no line uses them. */
const OPTIONAL_EMPTY: LineColumn[] = ['sku', 'unit', 'discount', 'tax'];

function Title({ block, data, design }: { block: Block; data: PrintData; design: PrintDesign }) {
  const label = blockLabel(block, data.kind);
  const text = design.theme.titleCase === 'upper' ? label.toUpperCase() : label;
  const base = design.theme.baseSize;
  const size =
    block.options.size === 'md' ? base * 1.35 : block.options.size === 'lg' ? base * design.theme.headingScale * 0.8 : base * design.theme.headingScale;
  return (
    <div className="pd-title">
      <h1 style={{ fontSize: `${Math.round(size * 10) / 10}pt` }}>{text}</h1>
      {block.options.showNumber ? <div className="pd-muted">{data.number}</div> : null}
    </div>
  );
}

function renderBlock(block: Block, data: PrintData, design: PrintDesign, preview: boolean): ReactNode {
  const base = design.theme.baseSize;
  const o = block.options;
  switch (block.element) {
    case 'logo': {
      const h = o.size === 'sm' ? 36 : o.size === 'lg' ? 84 : 56;
      if (data.assets.logo) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img className="pd-logo" src={data.assets.logo} alt="" style={{ maxHeight: h }} />;
      }
      return preview ? (
        <div className="pd-placeholder" style={{ height: h }}>
          Logo (not uploaded)
        </div>
      ) : null;
    }
    case 'company_name':
      return (
        <div className="pd-company" style={{ fontSize: `${sizeStep(o.size, base * 1.3)}pt` }}>
          {o.useTradingName && data.company.tradingName ? data.company.tradingName : data.company.name}
        </div>
      );
    case 'company_details': {
      const c = data.company;
      const parts = [
        o.address && c.address,
        o.phone && c.phone && `Tel ${c.phone}`,
        o.email && c.email,
        o.website && c.website,
        o.registration && c.registration && `Reg. ${c.registration}`,
        o.tin && `TIN ${c.tin || '—'}`,
      ].filter(Boolean) as string[];
      if (!parts.length) return null;
      return o.layout === 'inline' ? (
        <div className="pd-muted">{parts.join(' · ')}</div>
      ) : (
        <div className="pd-muted pd-lines">
          {parts.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </div>
      );
    }
    case 'document_title':
      return <Title block={block} data={data} design={design} />;
    case 'document_meta': {
      const fields = (block.fields ?? []) as MetaField[];
      const rows = fields
        .map((f) => ({ f, label: META_FIELD_LABELS[f], value: f === 'number' ? data.number : data.meta[f] }))
        .filter((r) => r.value || r.f === 'number' || r.f === 'date' || r.f === 'place_of_supply' || r.f === 'payment_mode');
      if (!rows.length) return null;
      return (
        <dl className={`pd-meta is-${o.layout}`}>
          {rows.map((r) => (
            <div key={r.f}>
              <dt>{r.label} </dt>
              <dd>{r.value || '—'}</dd>
            </div>
          ))}
        </dl>
      );
    }
    case 'party': {
      if (!data.party) return null;
      const p = data.party;
      return (
        <section className={`pd-party${o.boxed ? ' is-boxed' : ''}`}>
          <h2>{blockLabel(block, data.kind)}</h2>
          <strong>{p.name || '—'}</strong>
          {o.address && p.address ? <div>{p.address}</div> : null}
          {o.phone && p.phone ? <div>{p.phone}</div> : null}
          {o.tin ? <div>TIN {p.tin || '—'}</div> : null}
        </section>
      );
    }
    case 'ship_to': {
      const s = data.shipTo;
      if (!s || (!s.name && !s.address)) return null;
      return (
        <section className={`pd-party${o.boxed ? ' is-boxed' : ''}`}>
          <h2>{blockLabel(block, data.kind)}</h2>
          {s.name ? <strong>{s.name}</strong> : null}
          {s.address ? <div>{s.address}</div> : null}
          {s.phone ? <div>{s.phone}</div> : null}
        </section>
      );
    }
    case 'lines_table': {
      const chosen = (block.fields ?? []) as LineColumn[];
      const cols = chosen.filter((c) => {
        if (!OPTIONAL_EMPTY.includes(c)) return true;
        return data.lines.some((l) =>
          c === 'sku' ? !!l.sku : c === 'unit' ? !!l.unit : c === 'discount' ? l.discount > 0.004 : l.tax > 0.004,
        );
      });
      const num = (c: LineColumn) => c === 'quantity' || c === 'unit_price' || c === 'discount' || c === 'tax' || c === 'amount';
      return (
        <table className={`pd-lines is-${design.theme.tableStyle}${o.zebra ? ' is-zebra' : ''}${o.compact ? ' is-compact' : ''}`}>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} className={num(c) ? 'num' : undefined}>
                  {LINE_COLUMN_LABELS[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c} className={num(c) ? 'num' : undefined}>
                    {c === 'line_no'
                      ? i + 1
                      : c === 'sku'
                        ? l.sku
                        : c === 'description'
                          ? l.description
                          : c === 'quantity'
                            ? qty(l.quantity)
                            : c === 'unit'
                              ? l.unit
                              : c === 'unit_price'
                                ? money(l.unitPrice)
                                : c === 'discount'
                                  ? l.discount > 0.004
                                    ? money(l.discount)
                                    : ''
                                  : c === 'tax'
                                    ? l.tax > 0.004
                                      ? money(l.tax)
                                      : ''
                                    : money(l.amount)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'totals': {
      const rows = ((block.fields ?? []) as TotalRow[]).filter((r) => {
        const v = data.totals[r];
        if (v == null) return r === 'total' || r === 'vat' || r === 'subtotal';
        if (r === 'discount') return v > 0.004;
        if (r === 'paid' || r === 'balance') return true;
        return true;
      });
      return (
        <table className={`pd-totals${o.boxed ? ' is-boxed' : ''}`}>
          <tbody>
            {rows.map((r) => (
              <tr key={r} className={r === 'total' && o.highlightTotal ? 'is-total' : r === 'total' ? 'is-total-plain' : undefined}>
                <td>
                  {r === 'vat' && data.vatRate ? `VAT ${data.vatRate}%` : TOTAL_LABELS[r]}
                  {r === 'total' ? ` (${data.currency})` : ''}
                </td>
                <td className="num">
                  {r === 'discount' ? '− ' : ''}
                  {money(data.totals[r] ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'amount_in_words':
      return data.amountInWords ? (
        <p className="pd-box">
          <strong>{blockLabel(block, data.kind)}:</strong> {data.amountInWords}
        </p>
      ) : null;
    case 'payment_info': {
      const p = data.payment;
      if (!p) return null;
      return (
        <dl className="pd-meta is-list">
          <div>
            <dt>Paid by </dt>
            <dd>{p.method || '—'}</dd>
          </div>
          {p.tendered != null ? (
            <div>
              <dt>Received </dt>
              <dd>{money(p.tendered)}</dd>
            </div>
          ) : null}
          {o.showChange && p.change != null ? (
            <div>
              <dt>Change </dt>
              <dd>{money(p.change)}</dd>
            </div>
          ) : null}
        </dl>
      );
    }
    case 'notes':
      return data.notes ? (
        <div className="pd-note">
          <h2>{blockLabel(block, data.kind)}</h2>
          <p>{data.notes}</p>
        </div>
      ) : null;
    case 'terms':
      return block.text ? (
        <div className="pd-note">
          <h2>{blockLabel(block, data.kind)}</h2>
          <p>{block.text}</p>
        </div>
      ) : null;
    case 'bank_details': {
      const text = block.text || data.bankDetails;
      return text ? (
        <div className="pd-box">
          <h2>{blockLabel(block, data.kind)}</h2>
          <p>{text}</p>
        </div>
      ) : null;
    }
    case 'signature': {
      const lines = [o.first, o.second, o.third].filter((v) => typeof v === 'string' && v.trim()) as string[];
      if (!lines.length) return null;
      return (
        <div className="pd-signs" style={{ gridTemplateColumns: `repeat(${lines.length}, minmax(0, 1fr))` }}>
          {lines.map((l, i) => (
            <div key={l + i} className="pd-sign">
              <div className="pd-sign-space">
                {i === 0 && o.useImage && data.assets.signature ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.assets.signature} alt="" />
                ) : null}
              </div>
              <span>{l}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'stamp': {
      const h = o.size === 'sm' ? 48 : o.size === 'lg' ? 110 : 76;
      if (data.assets.stamp) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img className="pd-logo" src={data.assets.stamp} alt="" style={{ maxHeight: h }} />;
      }
      return preview ? (
        <div className="pd-placeholder" style={{ height: h, width: h }}>
          Stamp
        </div>
      ) : null;
    }
    case 'qr_code': {
      const s = o.size === 'sm' ? 56 : o.size === 'lg' ? 110 : 80;
      if (data.qrImage) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img className="pd-qr" src={data.qrImage} alt="Open this document online" style={{ width: s, height: s }} />;
      }
      return preview ? (
        <div className="pd-placeholder" style={{ height: s, width: s }}>
          QR
        </div>
      ) : null;
    }
    case 'text':
      return block.text ? (
        <p
          className={`pd-text is-${o.color}`}
          style={{ fontSize: `${sizeStep(o.size, base)}pt`, fontWeight: o.bold ? 700 : undefined }}
        >
          {block.text}
        </p>
      ) : null;
    case 'divider':
      return <hr className={`pd-divider${o.color === 'accent' ? ' is-accent' : ''}${o.thick ? ' is-thick' : ''}`} />;
    case 'spacer':
      return <div style={{ height: o.size === 'sm' ? 6 : o.size === 'lg' ? 28 : 14 }} aria-hidden />;
    case 'page_footer':
      return block.text ? <p className="pd-footer">{block.text}</p> : null;
    default:
      return null;
  }
}

/**
 * Prints a document with a saved print design. Everything shown comes from the approved
 * element set; text is rendered as text, never as HTML.
 */
export function DesignPrintSheet({
  design,
  data,
  backHref,
  backLabel,
  preview = false,
  embedded = false,
  title,
}: {
  design: PrintDesign;
  data: PrintData;
  backHref?: string;
  backLabel?: string;
  /** Shows placeholders for missing images and a sample-data note. */
  preview?: boolean;
  embedded?: boolean;
  title?: string;
}) {
  const box = paperBox(design.paper, design.orientation, design.margins);
  const roll = isRoll(design.paper);
  const t = design.theme;
  const vars = {
    '--pd-accent': t.accent,
    '--pd-text': t.text,
    '--pd-muted': t.muted,
    '--pd-head-bg': t.headerBackground ?? 'transparent',
    '--pd-head-ink': t.headerText ?? t.text,
    '--pd-th-bg': t.tableHeaderBackground ?? 'transparent',
    '--pd-radius': t.corners === 'rounded' ? '6px' : '0',
    fontFamily: fontCss(design),
    fontSize: `${t.baseSize}pt`,
  } as CSSProperties;
  const sheetStyle: CSSProperties = {
    width: `${box.widthMm}mm`,
    minHeight: box.heightMm ? `${box.heightMm}mm` : undefined,
    padding: `${box.marginMm}mm`,
  };
  const bands = layoutBands(design);

  return (
    <div className={`pd-root${roll ? ' is-roll' : ''}${embedded ? ' is-embedded' : ''}`} style={vars}>
      {!embedded && (backHref || title) ? (
        <div className="pd-toolbar no-print">
          {backHref ? <Link href={backHref}>← {backLabel ?? 'Back'}</Link> : <span>{title}</span>}
          <span className="pd-hint">In the print dialog, turn off Headers and footers.</span>
          <PrintSheetButton />
        </div>
      ) : null}
      <article className="pd-sheet" style={sheetStyle} data-print-title={data.number}>
        {bands.map((band) => (
          <div
            key={band.band}
            className={`pd-band is-${band.band}${band.band === 'header' && t.headerBackground ? ' has-bg' : ''}`}
            style={{ gridTemplateColumns: band.template }}
          >
            {band.columns.map((col) => (
              <div key={col.column} className="pd-col">
                {col.blocks.map((block) => {
                  const node = renderBlock(block, data, design, preview);
                  return node ? (
                    <div key={block.id} className={`pd-block is-${block.element}`} style={{ textAlign: block.align }}>
                      {node}
                    </div>
                  ) : null;
                })}
              </div>
            ))}
          </div>
        ))}
      </article>
      <style>{`
        .pd-root { color: var(--pd-text); line-height: 1.4; }
        .pd-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:12px 16px; padding:12px 16px; font-family: system-ui, sans-serif; font-size: 14px; }
        .pd-hint { font-size: 12px; color:#6b7280; margin-left:auto; }
        .pd-sheet { box-sizing: border-box; margin: 0 auto 24px; background:#fff; box-shadow: 0 8px 28px rgba(15,23,42,.12); display:flex; flex-direction:column; gap: 10px; max-width: 100%; }
        .pd-root.is-embedded .pd-sheet { margin: 0 auto; }
        .pd-band { display:grid; gap: 6px 18px; align-items:start; }
        .pd-band.is-header.has-bg { background: var(--pd-head-bg); color: var(--pd-head-ink); padding: 10px 12px; border-radius: var(--pd-radius); }
        .pd-band.is-header.has-bg .pd-muted, .pd-band.is-header.has-bg .pd-title h1 { color: var(--pd-head-ink); }
        .pd-band.is-body { display:block; }
        .pd-band.is-footer { margin-top: auto; }
        .pd-col { display:flex; flex-direction:column; gap: 6px; min-width: 0; }
        .pd-block { min-width: 0; }
        .pd-block.is-totals { display:flex; justify-content: flex-end; }
        .pd-block.is-totals[style*="left"] { justify-content: flex-start; }
        .pd-block.is-totals[style*="center"] { justify-content: center; }
        .pd-logo { max-width: 100%; object-fit: contain; display:inline-block; }
        .pd-qr { display:inline-block; }
        .pd-placeholder { display:inline-flex; align-items:center; justify-content:center; min-width: 90px; border: 1px dashed #cbd5e1; border-radius: 6px; color:#94a3b8; font-size: 8pt; }
        .pd-company { font-weight: 800; line-height: 1.2; }
        .pd-muted { color: var(--pd-muted); }
        .pd-lines div { margin: 0; }
        .pd-title h1 { margin: 0; color: var(--pd-accent); font-weight: 800; letter-spacing: .01em; line-height: 1.15; }
        .pd-meta { margin: 0; display:grid; gap: 2px; }
        .pd-meta > div { display:flex; gap: 10px; justify-content: space-between; }
        .pd-meta dt { color: var(--pd-muted); }
        .pd-meta dd { margin: 0; font-weight: 600; text-align: right; }
        .pd-meta.is-grid { grid-template-columns: repeat(auto-fit, minmax(28mm, 1fr)); gap: 6px 14px; }
        .pd-meta.is-grid > div { display:grid; gap: 0; }
        .pd-meta.is-grid dd { text-align: left; }
        .pd-meta.is-boxed { border: 1px solid #e5e7eb; border-radius: var(--pd-radius); padding: 6px 8px; }
        .pd-party h2, .pd-note h2, .pd-box h2 { margin: 0 0 3px; font-size: .85em; font-weight: 700; color: var(--pd-accent); }
        .pd-party > div, .pd-party > strong { display:block; }
        .pd-party.is-boxed { border: 1px solid #e5e7eb; border-radius: var(--pd-radius); padding: 6px 8px; }
        .pd-lines { width:100%; border-collapse: collapse; }
        .pd-lines th { text-align:left; font-size: .85em; font-weight: 700; color: var(--pd-muted); background: var(--pd-th-bg); padding: 6px; border-bottom: 1.5px solid var(--pd-accent); }
        .pd-lines td { padding: 6px; vertical-align: top; }
        .pd-lines.is-compact td, .pd-lines.is-compact th { padding: 3px 4px; }
        .pd-lines.is-lines td { border-bottom: 1px solid #e5e7eb; }
        .pd-lines.is-boxed th, .pd-lines.is-boxed td { border: 1px solid #d1d5db; }
        .pd-lines.is-striped tbody tr:nth-child(even), .pd-lines.is-zebra tbody tr:nth-child(even) { background: #f8fafc; }
        .pd-lines.is-plain th { border-bottom: 1px solid #e5e7eb; }
        .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .pd-totals { border-collapse: collapse; min-width: 55%; }
        .pd-totals td { padding: 3px 0 3px 12px; }
        .pd-totals td:first-child { padding-left: 0; color: var(--pd-muted); }
        .pd-totals .is-total td { border-top: 2px solid var(--pd-accent); padding-top: 6px; font-weight: 800; font-size: 1.15em; color: var(--pd-text); }
        .pd-totals .is-total-plain td { font-weight: 800; color: var(--pd-text); }
        .pd-totals.is-boxed { border: 1px solid #e5e7eb; }
        .pd-totals.is-boxed td { padding: 4px 8px; }
        .pd-box { background: #f8fafc; border-radius: var(--pd-radius); padding: 6px 8px; margin: 0; white-space: pre-wrap; }
        .pd-box p, .pd-note p { margin: 0; white-space: pre-wrap; }
        .pd-text { margin: 0; white-space: pre-wrap; }
        .pd-text.is-muted { color: var(--pd-muted); }
        .pd-text.is-accent { color: var(--pd-accent); }
        .pd-divider { border: 0; border-top: 1px solid #e5e7eb; margin: 2px 0; }
        .pd-divider.is-accent { border-top-color: var(--pd-accent); }
        .pd-divider.is-thick { border-top-width: 2px; }
        .pd-signs { display:grid; gap: 18px; margin-top: 18px; }
        .pd-sign { display:grid; gap: 4px; text-align:center; }
        .pd-sign-space { height: 40px; border-bottom: 1px solid var(--pd-text); display:flex; align-items:flex-end; justify-content:center; }
        .pd-sign-space img { max-height: 38px; }
        .pd-sign span { font-size: .85em; color: var(--pd-muted); }
        .pd-footer { margin: 0; color: var(--pd-muted); font-size: .9em; }
        .pd-root.is-roll .pd-sheet { gap: 6px; }
        .pd-root.is-roll .pd-lines th { border-bottom-style: dashed; }
        .pd-root.is-roll .pd-totals { width: 100%; }
        @media (max-width: 760px) {
          .pd-sheet { width: 100% !important; min-height: 0 !important; box-shadow: none; }
          .pd-hint { display:none; }
        }
        @page { size: ${box.pageSize}; margin: 0; }
        @media print {
          .no-print, .pd-toolbar { display:none !important; }
          .pd-root { background:#fff; }
          .pd-sheet { margin: 0; box-shadow: none; width: ${box.widthMm}mm !important; }
          .pd-placeholder { display: none; }
        }
      `}</style>
    </div>
  );
}
