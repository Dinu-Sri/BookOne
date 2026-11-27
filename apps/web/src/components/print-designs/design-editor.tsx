'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import {
  BANDS,
  ELEMENTS,
  ELEMENT_KEYS,
  FONTS,
  LINE_COLUMN_LABELS,
  META_FIELD_LABELS,
  PRINT_KIND_INFO,
  TABLE_STYLES,
  elementAllowed,
  paperLabel,
  validateDesign,
  type Band,
  type Block,
  type ElementKey,
  type PrintData,
  type PrintDesign,
  type PrintKind,
} from '@bookone/print-design';
import { savePrintDesignFromEditor } from '@/app/actions/print-designs';
import { DesignPrintSheet } from '@/components/print/design-print-sheet';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { withFormPending } from '@/components/ui/form-busy';
import { SelectField } from '@/components/ui/select-field';
import { TextAreaField, TextField } from '@/components/ui/text-field';

const BAND_LABELS: Record<Band, string> = {
  header: 'Header (top of page)',
  top: 'Under the header',
  body: 'Items area',
  bottom: 'Under the items',
  footer: 'Footer (bottom)',
};

const TABLE_LABELS: Record<string, string> = { lines: 'Lines between rows', boxed: 'Boxed grid', striped: 'Shaded rows', plain: 'Plain' };
const TOTAL_LABELS: Record<string, string> = {
  subtotal: 'Subtotal',
  discount: 'Discount',
  vat: 'VAT',
  total: 'Total',
  paid: 'Paid',
  balance: 'Balance due',
};

function fieldLabel(element: ElementKey, v: string) {
  if (element === 'document_meta') return (META_FIELD_LABELS as Record<string, string>)[v] ?? v;
  if (element === 'lines_table') return (LINE_COLUMN_LABELS as Record<string, string>)[v] ?? v;
  return TOTAL_LABELS[v] ?? v;
}

function newBlock(element: ElementKey, kind: PrintKind, taken: Set<string>): Block {
  const spec = ELEMENTS[element];
  let n = 1;
  while (taken.has(`${element.replace(/_/g, '-')}-${n}`)) n += 1;
  const options: Block['options'] = {};
  for (const [k, o] of Object.entries(spec.options)) options[k] = o.default;
  const band: Band =
    element === 'lines_table' || element === 'notes'
      ? 'body'
      : ['page_footer'].includes(element)
        ? 'footer'
        : ['logo', 'company_name', 'company_details', 'document_title'].includes(element)
          ? 'header'
          : ['party', 'ship_to', 'document_meta'].includes(element)
            ? 'top'
            : 'bottom';
  void kind;
  return {
    id: `${element.replace(/_/g, '-')}-${n}`,
    element,
    band,
    column: 1,
    align: element === 'totals' ? 'right' : 'left',
    options,
    ...(spec.fieldList ? { fields: [...spec.fieldList.default] } : {}),
    ...(spec.textEditable ? { text: spec.textEditable.default } : {}),
  };
}

export function DesignEditor({
  basedOnId,
  kind,
  initialName,
  initial,
  data,
  assets,
}: {
  basedOnId: string;
  kind: PrintKind;
  initialName: string;
  initial: PrintDesign;
  data: PrintData;
  assets: { logo: boolean; signature: boolean; stamp: boolean };
}) {
  const router = useRouter();
  const info = PRINT_KIND_INFO[kind];
  const [design, setDesign] = useState<PrintDesign>(initial);
  const [name, setName] = useState(initialName);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [lastValid, setLastValid] = useState<PrintDesign>(initial);

  const check = useMemo(() => validateDesign(kind, design, { assets }), [kind, design, assets]);
  const errors = check.ok ? [] : check.errors;
  if (check.ok && check.design !== lastValid && JSON.stringify(check.design) !== JSON.stringify(lastValid)) {
    // Keep the preview on the last design that meets the rules.
    setLastValid(check.design);
  }
  const dirty = JSON.stringify(design) !== JSON.stringify(initial) || name !== initialName;

  const required = (element: ElementKey) => !!ELEMENTS[element].requiredFor[kind];
  const countOf = (element: ElementKey) => design.blocks.filter((b) => b.element === element).length;

  function update(next: Partial<PrintDesign>) {
    setDesign((d) => ({ ...d, ...next }));
    setServerError(null);
  }
  function updateTheme(next: Partial<PrintDesign['theme']>) {
    setDesign((d) => ({ ...d, theme: { ...d.theme, ...next } }));
    setServerError(null);
  }
  function updateBlock(id: string, next: Partial<Block>) {
    setDesign((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...next } : b)) }));
    setServerError(null);
  }
  function move(id: string, dir: -1 | 1) {
    setDesign((d) => {
      const i = d.blocks.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.blocks.length) return d;
      const blocks = [...d.blocks];
      [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
      return { ...d, blocks };
    });
  }
  function remove(id: string) {
    setDesign((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }));
  }
  function add() {
    if (!adding) return;
    const el = adding as ElementKey;
    const b = newBlock(el, kind, new Set(design.blocks.map((x) => x.id)));
    setDesign((d) => ({ ...d, blocks: [...d.blocks, b] }));
    setOpen(b.id);
    setAdding('');
  }

  async function save(asNewDesign: boolean) {
    if (!check.ok) return;
    setSaving(true);
    setServerError(null);
    try {
      const res = await withFormPending(() =>
        savePrintDesignFromEditor({ basedOnId, designJson: JSON.stringify(check.design), name, changeNote: note, asNewDesign }),
      );
      if (res.ok) router.push(`/company/print-designs/${res.designId}?done=saved`);
      else setServerError(res.problems?.length ? `${res.error} ${res.problems.map((p) => p.problem).join(' ')}` : res.error);
    } finally {
      setSaving(false);
    }
  }

  const addable = ELEMENT_KEYS.filter((e) => elementAllowed(e, kind) && !(ELEMENTS[e].single && countOf(e) > 0));
  const blockErrors = (b: Block, i: number) =>
    errors.filter((e) => e.path.startsWith(`blocks[${i}]`) || e.path.startsWith(`blocks.${b.id}.`)).map((e) => e.message);
  const generalErrors = errors.filter((e) => !/^blocks\[\d+\]|^blocks\.[^.]+\./.test(e.path)).map((e) => e.message);

  return (
    <div className="pde">
      <div className="pde-panel">
        <section className="pde-section">
          <TextField id="pde-name" label="Design name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          <TextField
            id="pde-note"
            label="What changed (optional)"
            value={note}
            maxLength={500}
            placeholder="e.g. Blue header, bank details added"
            onChange={(e) => setNote(e.target.value)}
          />
        </section>

        <section className="pde-section">
          <h2>Paper and look</h2>
          <div className="pde-two">
            <SelectField
              id="pde-paper"
              label="Paper"
              value={design.paper}
              onChange={(v) => update({ paper: v as PrintDesign['paper'], ...(v.startsWith('thermal') ? { orientation: 'portrait' } : {}) })}
              options={info.papers.map((p) => ({ value: p, label: paperLabel(p) }))}
            />
            <SelectField
              id="pde-font"
              label="Font"
              value={design.theme.font}
              onChange={(v) => updateTheme({ font: v as PrintDesign['theme']['font'] })}
              options={Object.entries(FONTS).map(([value, f]) => ({ value, label: f.label }))}
            />
            <SelectField
              id="pde-size"
              label="Text size"
              value={String(design.theme.baseSize)}
              onChange={(v) => updateTheme({ baseSize: Number(v) })}
              options={['8', '9', '10', '11', '12'].map((v) => ({ value: v, label: `${v} pt` }))}
            />
            <SelectField
              id="pde-title"
              label="Title size"
              value={String(design.theme.headingScale)}
              onChange={(v) => updateTheme({ headingScale: Number(v) })}
              options={[
                { value: '1.4', label: 'Small' },
                { value: '1.8', label: 'Medium' },
                { value: '2', label: 'Large' },
                { value: '2.6', label: 'Extra large' },
              ].concat(
                ['1.4', '1.8', '2', '2.6'].includes(String(design.theme.headingScale))
                  ? []
                  : [{ value: String(design.theme.headingScale), label: `Custom (${design.theme.headingScale}×)` }],
              )}
            />
            <SelectField
              id="pde-table"
              label="Items table"
              value={design.theme.tableStyle}
              onChange={(v) => updateTheme({ tableStyle: v as PrintDesign['theme']['tableStyle'] })}
              options={TABLE_STYLES.map((t) => ({ value: t, label: TABLE_LABELS[t] ?? t }))}
            />
            <SelectField
              id="pde-case"
              label="Title letters"
              value={design.theme.titleCase}
              onChange={(v) => updateTheme({ titleCase: v as PrintDesign['theme']['titleCase'] })}
              options={[
                { value: 'as_typed', label: 'As typed (Invoice)' },
                { value: 'upper', label: 'Capitals (INVOICE)' },
              ]}
            />
          </div>
          <div className="pde-colours">
            <label className="pde-colour">
              <input type="color" className="input pde-colour-input" value={design.theme.accent} onChange={(e) => updateTheme({ accent: e.target.value })} />
              <span>Main colour</span>
            </label>
            <label className="pde-colour">
              <input
                type="color"
                className="input pde-colour-input"
                value={design.theme.headerBackground ?? '#ffffff'}
                onChange={(e) => updateTheme({ headerBackground: e.target.value, headerText: design.theme.headerText ?? '#ffffff' })}
              />
              <span>Header band</span>
            </label>
            {design.theme.headerBackground ? (
              <>
                <label className="pde-colour">
                  <input type="color" className="input pde-colour-input" value={design.theme.headerText ?? '#ffffff'} onChange={(e) => updateTheme({ headerText: e.target.value })} />
                  <span>Header text</span>
                </label>
                <Button type="button" variant="ghost" onClick={() => updateTheme({ headerBackground: null, headerText: null })}>
                  No header band
                </Button>
              </>
            ) : null}
          </div>
        </section>

        <section className="pde-section">
          <h2>Parts of the page</h2>
          <p className="pde-help">
            Parts marked Required are needed on every {info.label.toLowerCase()} and cannot be removed. Parts in the same area
            and column stack in this order.
          </p>
          {generalErrors.length ? (
            <ul className="pde-errors" role="alert">
              {generalErrors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
          <ol className="pde-blocks">
            {design.blocks.map((b, i) => {
              const spec = ELEMENTS[b.element];
              const rule = spec.requiredFor[kind];
              const locked = !!rule && countOf(b.element) <= 1;
              const mine = blockErrors(b, i);
              const isOpen = open === b.id;
              return (
                <li key={b.id} className={`pde-block${mine.length ? ' has-error' : ''}`}>
                  <div className="pde-block-head">
                    <button type="button" className="pde-toggle" onClick={() => setOpen(isOpen ? null : b.id)} aria-expanded={isOpen}>
                      {isOpen ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
                      <strong>{spec.label}</strong>
                      <span className="pde-where">
                        {BAND_LABELS[b.band].split(' (')[0]}
                        {b.band !== 'body' ? ` · column ${b.column}` : ''}
                      </span>
                    </button>
                    {required(b.element) ? <Badge tone="info">Required</Badge> : null}
                    <div className="pde-block-actions">
                      <button type="button" onClick={() => move(b.id, -1)} aria-label={`Move ${spec.label} up`} disabled={i === 0}>
                        <ArrowUp size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(b.id, 1)}
                        aria-label={`Move ${spec.label} down`}
                        disabled={i === design.blocks.length - 1}
                      >
                        <ArrowDown size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(b.id)}
                        aria-label={`Remove ${spec.label}`}
                        disabled={locked}
                        title={locked ? rule?.why : undefined}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                  </div>
                  {mine.length ? (
                    <ul className="pde-errors">
                      {mine.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  ) : null}
                  {isOpen ? (
                    <div className="pde-block-body">
                      <p className="pde-help">{spec.description}</p>
                      <div className="pde-two">
                        <SelectField
                          id={`pde-${b.id}-band`}
                          label="Area"
                          value={b.band}
                          onChange={(v) => updateBlock(b.id, { band: v as Band, ...(v === 'body' ? { column: 1 } : {}) })}
                          options={BANDS.filter((x) => b.element !== 'lines_table' || x === 'body').map((x) => ({ value: x, label: BAND_LABELS[x] }))}
                        />
                        {b.band !== 'body' ? (
                          <SelectField
                            id={`pde-${b.id}-col`}
                            label="Column"
                            value={String(b.column)}
                            onChange={(v) => updateBlock(b.id, { column: Number(v) as Block['column'] })}
                            options={[
                              { value: '1', label: 'Left (1)' },
                              { value: '2', label: 'Middle or right (2)' },
                              { value: '3', label: 'Right (3)' },
                            ]}
                          />
                        ) : null}
                        <SelectField
                          id={`pde-${b.id}-align`}
                          label="Align"
                          value={b.align}
                          onChange={(v) => updateBlock(b.id, { align: v as Block['align'] })}
                          options={[
                            { value: 'left', label: 'Left' },
                            { value: 'center', label: 'Centre' },
                            { value: 'right', label: 'Right' },
                          ]}
                        />
                      </div>
                      {spec.labelEditable ? (
                        <TextField
                          id={`pde-${b.id}-label`}
                          label={b.element === 'document_title' ? 'Title text' : 'Heading'}
                          value={b.label ?? ''}
                          maxLength={spec.labelEditable.maxLength}
                          placeholder={b.element === 'document_title' ? info.defaultTitle : spec.labelEditable.default || info.partyLabel}
                          help={rule?.labelIncludes ? `Must contain "${rule.labelIncludes}".` : undefined}
                          onChange={(e) => updateBlock(b.id, { label: e.target.value })}
                        />
                      ) : null}
                      {spec.textEditable ? (
                        <TextAreaField
                          id={`pde-${b.id}-text`}
                          label={b.element === 'bank_details' ? 'Text (leave empty to use the brand bank details)' : 'Text'}
                          value={b.text ?? ''}
                          rows={3}
                          maxLength={spec.textEditable.maxLength}
                          onChange={(e) => updateBlock(b.id, { text: e.target.value })}
                        />
                      ) : null}
                      {spec.fieldList ? (
                        <fieldset className="pde-fields">
                          <legend>{spec.fieldList.label}</legend>
                          {spec.fieldList.values.map((f) => {
                            const must = rule?.fields?.includes(f) ?? false;
                            const on = (b.fields ?? []).includes(f);
                            return (
                              <label key={f} className="pde-check">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  disabled={must && on}
                                  onChange={(e) =>
                                    updateBlock(b.id, {
                                      fields: e.target.checked ? [...(b.fields ?? []), f] : (b.fields ?? []).filter((x) => x !== f),
                                    })
                                  }
                                />
                                {fieldLabel(b.element, f)}
                                {must ? <span className="pde-must">required</span> : null}
                              </label>
                            );
                          })}
                        </fieldset>
                      ) : null}
                      {Object.keys(spec.options).length ? (
                        <div className="pde-options">
                          {Object.entries(spec.options).map(([key, o]) => {
                            const must = rule?.options?.includes(key) ?? false;
                            if (o.type === 'boolean') {
                              return (
                                <label key={key} className="pde-check">
                                  <input
                                    type="checkbox"
                                    checked={b.options[key] === true}
                                    disabled={must && b.options[key] === true}
                                    onChange={(e) => updateBlock(b.id, { options: { ...b.options, [key]: e.target.checked } })}
                                  />
                                  {o.label}
                                  {must ? <span className="pde-must">required</span> : null}
                                </label>
                              );
                            }
                            if (o.type === 'enum') {
                              return (
                                <SelectField
                                  key={key}
                                  id={`pde-${b.id}-${key}`}
                                  label={o.label}
                                  value={String(b.options[key] ?? o.default)}
                                  onChange={(v) => updateBlock(b.id, { options: { ...b.options, [key]: v } })}
                                  options={o.values.map((v) => ({
                                    value: v,
                                    label: { sm: 'Small', md: 'Medium', lg: 'Large', xl: 'Extra large', list: 'List', grid: 'Grid', boxed: 'In a box', lines: 'One per line', inline: 'On one line', text: 'Text colour', muted: 'Grey', accent: 'Main colour', line: 'Grey' }[v] ?? v,
                                  }))}
                                />
                              );
                            }
                            return (
                              <TextField
                                key={key}
                                id={`pde-${b.id}-${key}`}
                                label={o.label}
                                value={String(b.options[key] ?? '')}
                                maxLength={o.maxLength}
                                onChange={(e) => updateBlock(b.id, { options: { ...b.options, [key]: e.target.value } })}
                              />
                            );
                          })}
                        </div>
                      ) : null}
                      {spec.asset && !assets[spec.asset] ? (
                        <p className="pde-warn">
                          No {spec.asset} uploaded yet. <Link href="/company/print-designs#images">Upload it</Link>.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <div className="pde-add">
            <SelectField
              id="pde-add"
              label="Add a part"
              value={adding}
              onChange={setAdding}
              placeholder="Choose a part"
              options={addable.map((e) => ({ value: e, label: ELEMENTS[e].label, description: ELEMENTS[e].description }))}
              searchable
            />
            <Button type="button" variant="secondary" onClick={add} disabled={!adding}>
              <Plus size={14} aria-hidden /> Add
            </Button>
          </div>
        </section>
      </div>

      <section className="pde-preview" aria-label="Preview">
        <div className="pde-preview-note">
          {check.ok ? 'Preview with your company details and sample items.' : 'Fix the problems on the left. The preview shows the last version that met the rules.'}
        </div>
        <DesignPrintSheet design={check.ok ? check.design : lastValid} data={data} preview embedded />
      </section>

      <footer className="pde-bar">
        <span className={`pde-bar-status${errors.length ? ' is-error' : ''}`} role="status">
          {serverError
            ? serverError
            : errors.length
              ? `${errors.length} problem${errors.length === 1 ? '' : 's'} to fix before saving.`
              : dirty
                ? 'Not saved yet. Saving keeps every earlier version.'
                : 'No changes yet.'}
        </span>
        <Link href={`/company/print-designs/${basedOnId}`} className="button ghost">
          Cancel
        </Link>
        <Button type="button" variant="secondary" disabled={!check.ok || saving || !name.trim()} onClick={() => void save(true)}>
          Save as a new design
        </Button>
        <Button type="button" variant="primary" disabled={!check.ok || saving || !dirty || !name.trim()} onClick={() => void save(false)}>
          Save as new version
        </Button>
      </footer>
    </div>
  );
}
