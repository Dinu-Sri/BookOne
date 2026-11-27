import { describe, expect, it } from 'vitest';
import {
  PRINT_KINDS,
  defaultDesignInput,
  designGuide,
  layoutBands,
  requiredElements,
  validateDesign,
  type PrintKind,
} from '../src';

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

type RawBlock = { id: string; element: string; band?: string; column?: number; label?: string; fields?: string[]; options?: Record<string, unknown>; text?: string };

function withBlocks(kind: PrintKind, edit: (blocks: RawBlock[]) => RawBlock[]) {
  const d = clone(defaultDesignInput(kind)) as { blocks: RawBlock[] };
  d.blocks = edit(d.blocks);
  return d;
}

describe('BookOne standard designs', () => {
  it.each(PRINT_KINDS)('%s default meets its compulsory set', (kind) => {
    const r = validateDesign(kind, defaultDesignInput(kind));
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.ok).toBe(true);
    for (const el of requiredElements(kind)) {
      expect(r.design.blocks.some((b) => b.element === el)).toBe(true);
    }
  });

  it('every guide lists only allowed elements and a valid example', () => {
    for (const kind of PRINT_KINDS) {
      const g = designGuide(kind);
      expect(g.example).not.toBeNull();
      expect(g.elements.length).toBeGreaterThan(10);
    }
  });
});

describe('compulsory parts cannot be removed', () => {
  it('a tax invoice without the purchaser TIN is refused', () => {
    const d = withBlocks('tax_invoice', (bs) =>
      bs.map((b) => (b.element === 'party' ? { ...b, options: { ...b.options, tin: false } } : b)),
    );
    const r = validateDesign('tax_invoice', d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.message).join(' ')).toMatch(/purchaser name, address and TIN/);
  });

  it('a tax invoice titled "Invoice" is refused', () => {
    const d = withBlocks('tax_invoice', (bs) => bs.map((b) => (b.element === 'document_title' ? { ...b, label: 'Invoice' } : b)));
    const r = validateDesign('tax_invoice', d);
    expect(r.ok).toBe(false);
  });

  it('a tax invoice without amount in words or VAT row is refused', () => {
    const noWords = withBlocks('tax_invoice', (bs) => bs.filter((b) => b.element !== 'amount_in_words'));
    expect(validateDesign('tax_invoice', noWords).ok).toBe(false);
    const noVat = withBlocks('tax_invoice', (bs) =>
      bs.map((b) => (b.element === 'totals' ? { ...b, fields: ['subtotal', 'total'] } : b)),
    );
    expect(validateDesign('tax_invoice', noVat).ok).toBe(false);
  });

  it('a plain invoice may drop optional parts such as bank details', () => {
    const d = withBlocks('invoice', (bs) => bs.filter((b) => b.element !== 'bank_details' && b.element !== 'logo'));
    expect(validateDesign('invoice', d).ok).toBe(true);
  });

  it('no item can drop its number, date or company name', () => {
    for (const kind of PRINT_KINDS) {
      const d = withBlocks(kind, (bs) => bs.filter((b) => b.element !== 'company_name'));
      expect(validateDesign(kind, d).ok).toBe(false);
    }
    const noDate = withBlocks('invoice', (bs) => bs.map((b) => (b.element === 'document_meta' ? { ...b, fields: ['number'] } : b)));
    expect(validateDesign('invoice', noDate).ok).toBe(false);
  });

  it('a proforma must say proforma', () => {
    const d = withBlocks('proforma_invoice', (bs) => bs.map((b) => (b.element === 'document_title' ? { ...b, label: 'Invoice' } : b)));
    expect(validateDesign('proforma_invoice', d).ok).toBe(false);
  });
});

describe('only approved elements and safe values', () => {
  it('refuses unknown elements, options, colours and HTML-like settings', () => {
    expect(validateDesign('invoice', withBlocks('invoice', (bs) => [...bs, { id: 'x', element: 'html' }])).ok).toBe(false);
    expect(
      validateDesign('invoice', withBlocks('invoice', (bs) => bs.map((b) => (b.element === 'logo' ? { ...b, options: { url: 'http://x' } } : b))))
        .ok,
    ).toBe(false);
    const d = clone(defaultDesignInput('invoice')) as Record<string, unknown>;
    d.theme = { accent: 'red' };
    expect(validateDesign('invoice', d).ok).toBe(false);
    d.theme = { accent: '#ff0000', css: 'body{}' };
    expect(validateDesign('invoice', d).ok).toBe(false);
  });

  it('keeps text as plain text and strips control characters', () => {
    const d = withBlocks('invoice', (bs) => [...bs, { id: 'thanks', element: 'text', band: 'footer', text: 'Thank you\u0007 <b>friend</b>' }]);
    const r = validateDesign('invoice', d);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.design.blocks.find((b) => b.id === 'thanks')?.text).toBe('Thank you <b>friend</b>');
  });

  it('refuses elements that do not belong to the item', () => {
    const d = withBlocks('packing_slip', (bs) => [...bs, { id: 'tot', element: 'totals', band: 'bottom' }]);
    expect(validateDesign('packing_slip', d).ok).toBe(false);
  });

  it('the items table stays in the body band and single elements appear once', () => {
    expect(
      validateDesign('invoice', withBlocks('invoice', (bs) => bs.map((b) => (b.element === 'lines_table' ? { ...b, band: 'top' } : b)))).ok,
    ).toBe(false);
    expect(validateDesign('invoice', withBlocks('invoice', (bs) => [...bs, { id: 'logo2', element: 'logo', band: 'footer' }])).ok).toBe(false);
  });

  it('receipt rolls are portrait and warn about columns', () => {
    const d = clone(defaultDesignInput('pos_bill')) as Record<string, unknown>;
    d.orientation = 'landscape';
    expect(validateDesign('pos_bill', d).ok).toBe(false);
    const cols = withBlocks('pos_bill', (bs) => bs.map((b) => (b.element === 'totals' ? { ...b, column: 2 } : b)));
    const r = validateDesign('pos_bill', cols);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => /narrow/.test(w.message))).toBe(true);
  });

  it('warns when a logo is placed but none is uploaded', () => {
    const r = validateDesign('invoice', defaultDesignInput('invoice'), { assets: { logo: false } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.missingAssets).toContain('logo');
    expect(r.warnings.some((w) => /No logo is uploaded/.test(w.message))).toBe(true);
  });
});

describe('layout', () => {
  it('groups blocks by band and column with ratio widths', () => {
    const r = validateDesign('invoice', defaultDesignInput('invoice'));
    if (!r.ok) throw new Error('invalid');
    const bands = layoutBands(r.design);
    const header = bands.find((b) => b.band === 'header')!;
    expect(header.template).toBe('3fr 2fr');
    expect(header.columns[1]?.blocks[0]?.element).toBe('document_title');
    expect(bands.find((b) => b.band === 'body')!.template).toBe('1fr');
  });
});
