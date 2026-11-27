import {
  ELEMENTS,
  ELEMENT_KEYS,
  elementAllowed,
  isElementKey,
  type AssetSlot,
  type ElementKey,
} from './elements';
import { PRINT_KIND_INFO, isPaper, isRoll, type Paper, type PrintKind } from './kinds';

export const DESIGN_SCHEMA = 'bookone.print-design.v1';

export const BANDS = ['header', 'top', 'body', 'bottom', 'footer'] as const;
export type Band = (typeof BANDS)[number];

export const BAND_INFO: Record<Band, string> = {
  header: 'Top of the page: logo, company, title.',
  top: 'Under the header: customer, delivery address, number and date.',
  body: 'The items table and anything that runs the full width with it. One column.',
  bottom: 'Under the items: totals, amount in words, bank details, terms, signatures.',
  footer: 'The last line(s) of the page.',
};

export const FONTS = {
  inter: { label: 'Inter (clean)', css: 'Inter, "Segoe UI", Arial, sans-serif' },
  arial: { label: 'Arial', css: 'Arial, Helvetica, sans-serif' },
  helvetica: { label: 'Helvetica', css: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  roboto: { label: 'Roboto', css: 'Roboto, Arial, sans-serif' },
  noto_sans: { label: 'Noto Sans (Sinhala and Tamil ready)', css: '"Noto Sans", "Noto Sans Sinhala", "Noto Sans Tamil", Arial, sans-serif' },
  georgia: { label: 'Georgia (classic serif)', css: 'Georgia, "Times New Roman", serif' },
  times: { label: 'Times New Roman', css: '"Times New Roman", Times, serif' },
  courier: { label: 'Courier (typewriter / receipt)', css: '"Courier New", Courier, monospace' },
} as const;
export type FontKey = keyof typeof FONTS;

export const TABLE_STYLES = ['lines', 'boxed', 'striped', 'plain'] as const;
export const ALIGNS = ['left', 'center', 'right'] as const;
export const MARGINS = ['narrow', 'normal', 'wide'] as const;

export type Theme = {
  accent: string;
  text: string;
  muted: string;
  font: FontKey;
  /** Body text size in points (7–14). */
  baseSize: number;
  /** Title size as a multiple of the body size (1.2–3). */
  headingScale: number;
  /** Optional coloured header band. */
  headerBackground: string | null;
  headerText: string | null;
  tableStyle: (typeof TABLE_STYLES)[number];
  tableHeaderBackground: string | null;
  corners: 'square' | 'rounded';
  titleCase: 'upper' | 'as_typed';
};

export type Block = {
  id: string;
  element: ElementKey;
  band: Band;
  /** Column inside the band (1–3). The body band has one column. */
  column: 1 | 2 | 3;
  align: (typeof ALIGNS)[number];
  label?: string;
  text?: string;
  fields?: string[];
  options: Record<string, boolean | string>;
};

export type PrintDesign = {
  schema: typeof DESIGN_SCHEMA;
  paper: Paper;
  orientation: 'portrait' | 'landscape';
  margins: (typeof MARGINS)[number];
  /** Column width ratios per band, e.g. "2:1" or "1:1:1". Missing = equal columns. */
  columns: Partial<Record<Band, string>>;
  theme: Theme;
  blocks: Block[];
};

export type DesignIssue = { path: string; message: string };

export type ValidationResult =
  | { ok: true; design: PrintDesign; warnings: DesignIssue[]; missingAssets: AssetSlot[] }
  | { ok: false; errors: DesignIssue[]; warnings: DesignIssue[] };

const HEX = /^#[0-9a-fA-F]{6}$/;
const RATIO = /^[1-9](:[1-9]){0,2}$/;
const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const MAX_BLOCKS = 40;

/** Plain text: no control characters except new lines and tabs; trimmed; length-limited. */
export function cleanText(v: unknown, max: number): string {
  const s = typeof v === 'string' ? v : '';
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function defaultTheme(kind: PrintKind): Theme {
  const roll = isRoll(PRINT_KIND_INFO[kind].defaultPaper);
  return {
    accent: '#1e3a8a',
    text: '#111827',
    muted: '#4b5563',
    font: roll ? 'courier' : 'inter',
    baseSize: roll ? 9 : 10,
    headingScale: roll ? 1.4 : 2,
    headerBackground: null,
    headerText: null,
    tableStyle: 'lines',
    tableHeaderBackground: null,
    corners: 'rounded',
    titleCase: 'as_typed',
  };
}

/** Effective label of a block: its own label, else the element default, else the kind's title. */
export function blockLabel(block: Pick<Block, 'element' | 'label'>, kind: PrintKind): string {
  if (block.label && block.label.trim()) return block.label.trim();
  const spec = ELEMENTS[block.element];
  if (block.element === 'document_title') return PRINT_KIND_INFO[kind].defaultTitle;
  if (block.element === 'party') return PRINT_KIND_INFO[kind].partyLabel;
  return spec.labelEditable?.default || spec.label;
}

/**
 * Check a design for a print item and return a clean copy with every option filled.
 * Errors block saving. Warnings (e.g. a logo block with no logo uploaded) do not.
 */
export function validateDesign(
  kind: PrintKind,
  input: unknown,
  ctx: { assets?: Partial<Record<AssetSlot, boolean>> } = {},
): ValidationResult {
  const errors: DesignIssue[] = [];
  const warnings: DesignIssue[] = [];
  const info = PRINT_KIND_INFO[kind];
  if (!isObj(input)) return { ok: false, errors: [{ path: '', message: 'The design must be an object.' }], warnings };

  const known = new Set(['schema', 'paper', 'orientation', 'margins', 'columns', 'theme', 'blocks']);
  for (const k of Object.keys(input)) {
    if (!known.has(k)) errors.push({ path: k, message: `"${k}" is not part of a print design.` });
  }
  if (input.schema !== undefined && input.schema !== DESIGN_SCHEMA) {
    errors.push({ path: 'schema', message: `Use schema "${DESIGN_SCHEMA}".` });
  }

  const paper = input.paper ?? info.defaultPaper;
  if (!isPaper(paper) || !info.papers.includes(paper)) {
    errors.push({ path: 'paper', message: `${info.label} can use: ${info.papers.join(', ')}.` });
  }
  const roll = isPaper(paper) && isRoll(paper);
  const orientation = input.orientation ?? 'portrait';
  if (orientation !== 'portrait' && orientation !== 'landscape') {
    errors.push({ path: 'orientation', message: 'Orientation is portrait or landscape.' });
  } else if (roll && orientation === 'landscape') {
    errors.push({ path: 'orientation', message: 'Receipt rolls print portrait only.' });
  }
  const margins = input.margins ?? 'normal';
  if (!(MARGINS as readonly string[]).includes(String(margins))) {
    errors.push({ path: 'margins', message: 'Margins are narrow, normal or wide.' });
  }

  // Theme
  const base = defaultTheme(kind);
  const t = isObj(input.theme) ? input.theme : {};
  if (input.theme !== undefined && !isObj(input.theme)) errors.push({ path: 'theme', message: 'Theme must be an object.' });
  const theme: Theme = { ...base };
  for (const [k, v] of Object.entries(t)) {
    const path = `theme.${k}`;
    switch (k) {
      case 'accent':
      case 'text':
      case 'muted':
        if (typeof v === 'string' && HEX.test(v)) theme[k] = v.toLowerCase();
        else errors.push({ path, message: 'Use a colour like #1e3a8a.' });
        break;
      case 'headerBackground':
      case 'headerText':
      case 'tableHeaderBackground':
        if (v === null) theme[k] = null;
        else if (typeof v === 'string' && HEX.test(v)) theme[k] = v.toLowerCase();
        else errors.push({ path, message: 'Use a colour like #1e3a8a, or null for none.' });
        break;
      case 'font':
        if (typeof v === 'string' && v in FONTS) theme.font = v as FontKey;
        else errors.push({ path, message: `Fonts: ${Object.keys(FONTS).join(', ')}.` });
        break;
      case 'baseSize':
        if (typeof v === 'number' && v >= 7 && v <= 14) theme.baseSize = Math.round(v * 2) / 2;
        else errors.push({ path, message: 'Text size is 7 to 14 points.' });
        break;
      case 'headingScale':
        if (typeof v === 'number' && v >= 1.2 && v <= 3) theme.headingScale = Math.round(v * 100) / 100;
        else errors.push({ path, message: 'Title scale is 1.2 to 3.' });
        break;
      case 'tableStyle':
        if ((TABLE_STYLES as readonly string[]).includes(String(v))) theme.tableStyle = v as Theme['tableStyle'];
        else errors.push({ path, message: `Table styles: ${TABLE_STYLES.join(', ')}.` });
        break;
      case 'corners':
        if (v === 'square' || v === 'rounded') theme.corners = v;
        else errors.push({ path, message: 'Corners are square or rounded.' });
        break;
      case 'titleCase':
        if (v === 'upper' || v === 'as_typed') theme.titleCase = v;
        else errors.push({ path, message: 'Title case is upper or as_typed.' });
        break;
      default:
        errors.push({ path, message: `"${k}" is not a theme setting.` });
    }
  }
  if (theme.headerBackground && !theme.headerText) theme.headerText = '#ffffff';

  // Column ratios
  const columns: Partial<Record<Band, string>> = {};
  if (input.columns !== undefined) {
    if (!isObj(input.columns)) errors.push({ path: 'columns', message: 'Columns must be an object by band.' });
    else
      for (const [band, ratio] of Object.entries(input.columns)) {
        if (!(BANDS as readonly string[]).includes(band)) errors.push({ path: `columns.${band}`, message: 'Unknown band.' });
        else if (band === 'body') errors.push({ path: 'columns.body', message: 'The body band has one column.' });
        else if (typeof ratio !== 'string' || !RATIO.test(ratio)) {
          errors.push({ path: `columns.${band}`, message: 'Use a ratio such as "1:1", "2:1" or "1:1:1".' });
        } else columns[band as Band] = ratio;
      }
  }

  // Blocks
  const blocks: Block[] = [];
  if (!Array.isArray(input.blocks)) {
    errors.push({ path: 'blocks', message: 'blocks must be a list.' });
  } else {
    if (input.blocks.length > MAX_BLOCKS) errors.push({ path: 'blocks', message: `At most ${MAX_BLOCKS} blocks.` });
    const ids = new Set<string>();
    const seenSingle = new Set<ElementKey>();
    input.blocks.slice(0, MAX_BLOCKS).forEach((raw, i) => {
      const path = `blocks[${i}]`;
      if (!isObj(raw)) {
        errors.push({ path, message: 'Each block must be an object.' });
        return;
      }
      for (const k of Object.keys(raw)) {
        if (!['id', 'element', 'band', 'column', 'align', 'label', 'text', 'fields', 'options'].includes(k)) {
          errors.push({ path: `${path}.${k}`, message: `"${k}" is not a block setting.` });
        }
      }
      if (!isElementKey(raw.element)) {
        errors.push({ path: `${path}.element`, message: `Unknown element. Allowed: ${ELEMENT_KEYS.join(', ')}.` });
        return;
      }
      const element = raw.element;
      const spec = ELEMENTS[element];
      if (!elementAllowed(element, kind)) {
        errors.push({ path: `${path}.element`, message: `${spec.label} cannot be used on a ${info.label.toLowerCase()}.` });
        return;
      }
      if (spec.single) {
        if (seenSingle.has(element)) errors.push({ path, message: `${spec.label} can appear only once.` });
        seenSingle.add(element);
      }
      const id = typeof raw.id === 'string' && raw.id ? raw.id : `${element}-${i + 1}`;
      if (!ID.test(id)) errors.push({ path: `${path}.id`, message: 'Block ids use a-z, 0-9, - and _ (up to 40).' });
      else if (ids.has(id)) errors.push({ path: `${path}.id`, message: `Block id "${id}" is used twice.` });
      ids.add(id);
      const band = (raw.band ?? 'body') as Band;
      if (!(BANDS as readonly string[]).includes(band)) {
        errors.push({ path: `${path}.band`, message: `Bands: ${BANDS.join(', ')}.` });
      }
      if (element === 'lines_table' && band !== 'body') {
        errors.push({ path: `${path}.band`, message: 'The items table goes in the body band.' });
      }
      const column = raw.column ?? 1;
      if (column !== 1 && column !== 2 && column !== 3) errors.push({ path: `${path}.column`, message: 'Column is 1, 2 or 3.' });
      if (band === 'body' && column !== 1) errors.push({ path: `${path}.column`, message: 'The body band has one column.' });
      const align = raw.align ?? (element === 'totals' ? 'right' : 'left');
      if (!(ALIGNS as readonly string[]).includes(String(align))) errors.push({ path: `${path}.align`, message: 'Align is left, center or right.' });

      const block: Block = {
        id,
        element,
        band,
        column: (column === 2 || column === 3 ? column : 1) as Block['column'],
        align: align as Block['align'],
        options: {},
      };
      // Label
      if (raw.label !== undefined) {
        if (!spec.labelEditable) errors.push({ path: `${path}.label`, message: `${spec.label} has no label to change.` });
        else {
          const label = cleanText(raw.label, spec.labelEditable.maxLength);
          if (typeof raw.label !== 'string') errors.push({ path: `${path}.label`, message: 'Label must be text.' });
          else if (raw.label.trim().length > spec.labelEditable.maxLength) {
            errors.push({ path: `${path}.label`, message: `Label is at most ${spec.labelEditable.maxLength} characters.` });
          }
          if (label) block.label = label;
        }
      }
      // Text
      if (raw.text !== undefined) {
        if (!spec.textEditable) errors.push({ path: `${path}.text`, message: `${spec.label} has no text to change.` });
        else if (typeof raw.text !== 'string') errors.push({ path: `${path}.text`, message: 'Text must be text.' });
        else if (raw.text.trim().length > spec.textEditable.maxLength) {
          errors.push({ path: `${path}.text`, message: `Text is at most ${spec.textEditable.maxLength} characters.` });
        } else block.text = cleanText(raw.text, spec.textEditable.maxLength);
      } else if (spec.textEditable) block.text = spec.textEditable.default;
      if (element === 'text' && !block.text) warnings.push({ path: `${path}.text`, message: 'This text block is empty.' });
      // Fields
      if (spec.fieldList) {
        if (raw.fields === undefined) block.fields = [...spec.fieldList.default];
        else if (!Array.isArray(raw.fields) || raw.fields.some((f) => typeof f !== 'string')) {
          errors.push({ path: `${path}.fields`, message: 'fields must be a list of names.' });
        } else {
          const bad = raw.fields.filter((f) => !(spec.fieldList!.values as readonly string[]).includes(f as string));
          if (bad.length) {
            errors.push({ path: `${path}.fields`, message: `Unknown: ${bad.join(', ')}. Allowed: ${spec.fieldList.values.join(', ')}.` });
          }
          const uniq = [...new Set(raw.fields as string[])];
          // Keep the catalogue order so columns and rows always read the same way.
          block.fields = (spec.fieldList.values as readonly string[]).filter((v) => uniq.includes(v));
          if (!block.fields.length) errors.push({ path: `${path}.fields`, message: 'Choose at least one.' });
        }
      } else if (raw.fields !== undefined) {
        errors.push({ path: `${path}.fields`, message: `${spec.label} has no field list.` });
      }
      // Options
      const opts = raw.options === undefined ? {} : raw.options;
      if (!isObj(opts)) errors.push({ path: `${path}.options`, message: 'options must be an object.' });
      else {
        for (const [ok, ov] of Object.entries(opts)) {
          const os = spec.options[ok];
          if (!os) {
            errors.push({ path: `${path}.options.${ok}`, message: `${spec.label} has no "${ok}" option.` });
            continue;
          }
          if (os.type === 'boolean' && typeof ov !== 'boolean') {
            errors.push({ path: `${path}.options.${ok}`, message: 'Use true or false.' });
          } else if (os.type === 'enum' && !os.values.includes(String(ov))) {
            errors.push({ path: `${path}.options.${ok}`, message: `Use one of: ${os.values.join(', ')}.` });
          } else if (os.type === 'text' && (typeof ov !== 'string' || ov.trim().length > os.maxLength)) {
            errors.push({ path: `${path}.options.${ok}`, message: `Text up to ${os.maxLength} characters.` });
          }
        }
        for (const [ok, os] of Object.entries(spec.options)) {
          const ov = opts[ok];
          if (os.type === 'boolean') block.options[ok] = typeof ov === 'boolean' ? ov : os.default;
          else if (os.type === 'enum') block.options[ok] = os.values.includes(String(ov)) ? String(ov) : os.default;
          else block.options[ok] = typeof ov === 'string' ? cleanText(ov, os.maxLength) : os.default;
        }
      }
      if (spec.asset) {
        const needs = spec.asset === 'signature' ? block.options.useImage === true : true;
        if (needs && ctx.assets && !ctx.assets[spec.asset]) {
          warnings.push({
            path,
            message:
              spec.asset === 'logo'
                ? 'No logo is uploaded yet. Upload it in Company → Print designs → Logo and images; until then the space stays empty.'
                : `No ${spec.asset} image is uploaded yet. Upload it in Company → Print designs → Logo and images.`,
          });
        }
      }
      if (roll && block.column !== 1) {
        warnings.push({ path: `${path}.column`, message: 'Receipt rolls are narrow: columns print one under another.' });
      }
      blocks.push(block);
    });
  }

  // Compulsory minimum set for this print item
  for (const element of ELEMENT_KEYS) {
    const rule = ELEMENTS[element].requiredFor[kind];
    if (!rule) continue;
    const found = blocks.filter((b) => b.element === element);
    if (!found.length) {
      errors.push({ path: 'blocks', message: `${ELEMENTS[element].label} is required. ${rule.why}` });
      continue;
    }
    for (const b of found.length && ELEMENTS[element].single ? found : found.slice(0, 1)) {
      for (const opt of rule.options ?? []) {
        if (b.options[opt] !== true) {
          errors.push({ path: `blocks.${b.id}.options.${opt}`, message: `${ELEMENTS[element].label}: "${opt}" must stay on. ${rule.why}` });
        }
      }
      if (rule.labelIncludes && !blockLabel(b, kind).toLowerCase().includes(rule.labelIncludes)) {
        errors.push({ path: `blocks.${b.id}.label`, message: `The title must contain "${rule.labelIncludes}". ${rule.why}` });
      }
    }
    if (rule.fields?.length) {
      const listed = new Set(found.flatMap((b) => b.fields ?? []));
      const missing = rule.fields.filter((f) => !listed.has(f));
      if (missing.length) {
        errors.push({ path: `blocks.${found[0]!.id}.fields`, message: `${ELEMENTS[element].label} must include ${missing.join(', ')}. ${rule.why}` });
      }
    }
  }

  if (errors.length) return { ok: false, errors, warnings };
  const missingAssets = [...new Set(blocks.map((b) => ELEMENTS[b.element].asset).filter(Boolean) as AssetSlot[])].filter(
    (slot) => ctx.assets && !ctx.assets[slot],
  );
  return {
    ok: true,
    design: {
      schema: DESIGN_SCHEMA,
      paper: paper as Paper,
      orientation: orientation as PrintDesign['orientation'],
      margins: margins as PrintDesign['margins'],
      columns,
      theme,
      blocks,
    },
    warnings,
    missingAssets,
  };
}

/** Parse a stored design (JSON text). Stored designs were validated on save; this never throws. */
export function parseStoredDesign(kind: PrintKind, raw: string | null | undefined): PrintDesign | null {
  if (!raw) return null;
  try {
    const res = validateDesign(kind, JSON.parse(raw));
    return res.ok ? res.design : null;
  } catch {
    return null;
  }
}
