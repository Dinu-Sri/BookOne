import { BANDS, FONTS, type Band, type Block, type PrintDesign } from './design';
import { isRoll, type Paper } from './kinds';

export type BandLayout = {
  band: Band;
  /** CSS grid template, e.g. "3fr 2fr". */
  template: string;
  columns: Array<{ column: 1 | 2 | 3; blocks: Block[] }>;
};

/** Group blocks into bands and columns, in reading order. Empty bands are left out. */
export function layoutBands(design: PrintDesign): BandLayout[] {
  const roll = isRoll(design.paper);
  const out: BandLayout[] = [];
  for (const band of BANDS) {
    const inBand = design.blocks.filter((b) => b.band === band);
    if (!inBand.length) continue;
    if (roll || band === 'body') {
      out.push({ band, template: '1fr', columns: [{ column: 1, blocks: inBand }] });
      continue;
    }
    const used = [...new Set(inBand.map((b) => b.column))].sort();
    const count = Math.max(...used);
    const ratio = (design.columns[band] ?? '').split(':').map((n) => Number(n));
    const parts = Array.from({ length: count }, (_, i) => (ratio[i] && ratio[i]! > 0 ? ratio[i]! : 1));
    out.push({
      band,
      template: parts.map((p) => `${p}fr`).join(' '),
      columns: Array.from({ length: count }, (_, i) => ({
        column: (i + 1) as 1 | 2 | 3,
        blocks: inBand.filter((b) => b.column === i + 1),
      })),
    });
  }
  return out;
}

/** Sheet width and printable margins for a paper. */
export function paperBox(paper: Paper, orientation: 'portrait' | 'landscape', margins: PrintDesign['margins']) {
  const m = margins === 'narrow' ? 6 : margins === 'wide' ? 16 : 10;
  const sizes: Record<Paper, [number, number]> = {
    A4: [210, 297],
    A5: [148, 210],
    Letter: [216, 279],
    thermal80: [80, 0],
    thermal58: [58, 0],
  };
  const [w, h] = sizes[paper];
  if (isRoll(paper)) {
    return { widthMm: w, heightMm: null as number | null, marginMm: 3, pageSize: `${w}mm auto` };
  }
  const [W, H] = orientation === 'landscape' ? [h, w] : [w, h];
  return { widthMm: W, heightMm: H as number | null, marginMm: m, pageSize: `${W}mm ${H}mm` };
}

export function fontCss(design: PrintDesign): string {
  return FONTS[design.theme.font]?.css ?? FONTS.inter.css;
}

export function sizeStep(size: unknown, base: number): number {
  if (size === 'sm') return Math.round(base * 0.9 * 10) / 10;
  if (size === 'lg') return Math.round(base * 1.25 * 10) / 10;
  if (size === 'xl') return Math.round(base * 1.6 * 10) / 10;
  return base;
}
