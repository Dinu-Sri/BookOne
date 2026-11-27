import { BANDS, BAND_INFO, DESIGN_SCHEMA, FONTS, MARGINS, TABLE_STYLES, validateDesign } from './design';
import { defaultDesignInput } from './defaults';
import { ELEMENTS, ELEMENT_KEYS, LINE_COLUMN_LABELS, META_FIELD_LABELS, elementAllowed } from './elements';
import { PRINT_KIND_INFO, paperLabel, type PrintKind } from './kinds';

/**
 * Everything an assistant needs to design one print item: allowed elements with their options,
 * the compulsory minimum, the layout bands and theme limits, and the BookOne standard design
 * as a working example.
 */
export function designGuide(kind: PrintKind) {
  const info = PRINT_KIND_INFO[kind];
  const example = validateDesign(kind, defaultDesignInput(kind));
  return {
    kind,
    label: info.label,
    description: info.description,
    schema: DESIGN_SCHEMA,
    papers: info.papers.map((p) => ({ value: p, label: paperLabel(p) })),
    defaultPaper: info.defaultPaper,
    howLayoutWorks:
      'A design is a list of blocks. Each block is one approved element placed in a band (header, top, body, bottom, footer) ' +
      'and a column (1–3) inside that band. Blocks in the same band and column stack in list order. Band column widths are ' +
      'set with "columns", e.g. {"header":"2:1"}. Text is plain text only. Images come only from the company logo, signature ' +
      'and stamp uploaded in BookOne. To copy a document from a picture, pick the closest elements, place them in the same bands ' +
      'and columns, and match the colours, font, table style and labels.',
    bands: BANDS.map((band) => ({ band, use: BAND_INFO[band] })),
    theme: {
      colours: 'accent, text, muted, headerBackground, headerText, tableHeaderBackground: "#rrggbb" (header/table backgrounds may be null).',
      fonts: Object.entries(FONTS).map(([key, f]) => ({ key, label: f.label })),
      baseSize: '7 to 14 (points)',
      headingScale: '1.2 to 3',
      tableStyles: TABLE_STYLES,
      corners: ['square', 'rounded'],
      titleCase: ['upper', 'as_typed'],
      margins: MARGINS,
    },
    elements: ELEMENT_KEYS.filter((e) => elementAllowed(e, kind)).map((e) => {
      const spec = ELEMENTS[e];
      const rule = spec.requiredFor[kind];
      return {
        element: e,
        label: spec.label,
        description: spec.description,
        compulsory: rule
          ? {
              why: rule.why,
              optionsThatMustStayOn: rule.options ?? [],
              fieldsThatMustStay: rule.fields ?? [],
              labelMustInclude: rule.labelIncludes ?? null,
            }
          : null,
        onlyOnce: spec.single,
        usesImage: spec.asset ?? null,
        labelEditable: spec.labelEditable ? { editable: true, maxLength: spec.labelEditable.maxLength } : { editable: false },
        text: spec.textEditable ? { editable: true, maxLength: spec.textEditable.maxLength } : { editable: false },
        fields: spec.fieldList
          ? {
              label: spec.fieldList.label,
              allowed: spec.fieldList.values.map((v) => ({
                value: v,
                label:
                  (META_FIELD_LABELS as Record<string, string>)[v] ?? (LINE_COLUMN_LABELS as Record<string, string>)[v] ?? v,
              })),
              default: spec.fieldList.default,
            }
          : null,
        options: Object.entries(spec.options).map(([key, o]) => ({
          key,
          label: o.label,
          type: o.type,
          values: o.type === 'enum' ? o.values : undefined,
          maxLength: o.type === 'text' ? o.maxLength : undefined,
          default: o.default,
        })),
      };
    }),
    example: example.ok ? example.design : null,
  };
}
