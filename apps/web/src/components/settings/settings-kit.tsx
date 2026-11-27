'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/bookone-ui';
import { SelectField, type SelectOption } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { askConfirm } from '@/components/ui/ask';

/**
 * Calm settings screens (UI rule book rules 1, 3 and 4): one card per form, a sticky header with
 * Save, a sticky unsaved bar at the bottom, and plain rows (name, one sentence, control on the right).
 * Field names are passed straight through, so the existing server actions read the same FormData.
 */

type Ctx = { markDirty: () => void; readOnly: boolean };
const SettingsCtx = createContext<Ctx>({ markDirty: () => {}, readOnly: false });

export function SettingsForm({
  id,
  action,
  title,
  sentence,
  saveLabel,
  readOnly = false,
  readOnlyNote,
  children,
}: {
  id: string;
  action?: (formData: FormData) => void | Promise<void>;
  title: string;
  sentence?: string;
  saveLabel: string;
  readOnly?: boolean;
  readOnlyNote?: string;
  children: ReactNode;
}) {
  const [dirty, setDirty] = useState(false);
  const markDirty = () => {
    if (!readOnly) setDirty(true);
  };
  return (
    <SettingsCtx.Provider value={{ markDirty, readOnly }}>
      <section className="ux-card set-card" aria-labelledby={`${id}-title`}>
        <header className="ux-card-head set-card-head">
          <div>
            <h2 id={`${id}-title`}>{title}</h2>
            {sentence ? <p>{sentence}</p> : null}
          </div>
          {readOnly ? null : (
            <Button variant={dirty ? 'primary' : 'secondary'} type="submit" form={id} disabled={!dirty}>
              {saveLabel}
            </Button>
          )}
        </header>
        <form
          id={id}
          action={readOnly ? undefined : action}
          onChange={markDirty}
          onSubmit={() => setDirty(false)}
        >
          <fieldset disabled={readOnly} className="set-fieldset">
            {children}
          </fieldset>
          <div className="set-bar">
            {readOnly ? (
              <span>{readOnlyNote ?? 'Read only: this job cannot change these settings.'}</span>
            ) : (
              <>
                <span className={dirty ? 'is-dirty' : ''} role="status">
                  {dirty ? 'You have unsaved changes.' : 'No unsaved changes.'}
                </span>
                <Button variant="primary" type="submit" disabled={!dirty}>
                  {saveLabel}
                </Button>
              </>
            )}
          </div>
        </form>
      </section>
    </SettingsCtx.Provider>
  );
}

/** A titled group of rows inside a settings form. */
export function SettingsSection({ title, help, children }: { title: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="set-section">
      <div className="set-section-head">
        <h3>{title}</h3>
        {help ? <p>{help}</p> : null}
      </div>
      <div className="ux-rows">{children}</div>
    </div>
  );
}

function RowText({ label, help, htmlFor }: { label: string; help?: ReactNode; htmlFor?: string }) {
  return (
    <div className="ux-row-text">
      {htmlFor ? (
        <label htmlFor={htmlFor}>
          <strong>{label}</strong>
        </label>
      ) : (
        <strong>{label}</strong>
      )}
      {help ? <span>{help}</span> : null}
    </div>
  );
}

/** Yes/no setting as a switch. Posts `name=on` when on, nothing when off (like a checkbox). */
export function SwitchRow({
  name,
  label,
  help,
  defaultChecked,
}: {
  name: string;
  label: string;
  help?: ReactNode;
  defaultChecked?: boolean;
}) {
  const id = `set-${name}`;
  return (
    <div className="ux-row set-row">
      <RowText label={label} help={help} htmlFor={id} />
      <label className="ux-switch">
        <input id={id} type="checkbox" role="switch" name={name} value="on" defaultChecked={defaultChecked} />
        <span aria-hidden />
      </label>
    </div>
  );
}

/** Pick-one setting with the registry SelectField. */
export function SelectRow({
  name,
  label,
  help,
  defaultValue,
  options,
  wide = false,
}: {
  name: string;
  label: string;
  help?: ReactNode;
  defaultValue: string;
  options: SelectOption[];
  wide?: boolean;
}) {
  const { markDirty, readOnly } = useContext(SettingsCtx);
  const [value, setValue] = useState(defaultValue);
  const id = `set-${name}`;
  return (
    <div className={`ux-row set-row ${wide ? 'is-wide' : ''}`.trim()}>
      <RowText label={label} help={help} />
      <div className="set-control">
        <SelectField
          id={id}
          name={name}
          label={label}
          value={value}
          options={options}
          disabled={readOnly}
          onChange={(v) => {
            setValue(v);
            markDirty();
          }}
        />
      </div>
    </div>
  );
}

/** Short text or number setting with the registry TextField. */
export function TextRow({
  name,
  label,
  help,
  defaultValue,
  inputMode,
  placeholder,
}: {
  name: string;
  label: string;
  help?: ReactNode;
  defaultValue?: string | number | null;
  inputMode?: 'decimal' | 'numeric' | 'text';
  placeholder?: string;
}) {
  const id = `set-${name}`;
  return (
    <div className="ux-row set-row">
      <RowText label={label} help={help} />
      <div className="set-control">
        <TextField
          id={id}
          name={name}
          label={label}
          defaultValue={defaultValue == null ? '' : String(defaultValue)}
          inputMode={inputMode}
          placeholder={placeholder}
          autoComplete="off"
        />
      </div>
    </div>
  );
}

/** A SelectField for plain server-action forms (posts its value under `name`). */
export function FormSelect({
  id,
  name,
  label,
  defaultValue,
  options,
  className,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  options: SelectOption[];
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <SelectField id={id} name={name} label={label} value={value} options={options} onChange={setValue} className={className} />
  );
}

/** Submit button that asks first in a BookOne dialog (never a browser pop-up). */
export function ConfirmSubmitButton({
  children,
  title,
  message,
  confirmLabel,
  tone = 'danger',
}: {
  children: ReactNode;
  title: string;
  message?: string;
  confirmLabel: string;
  tone?: 'danger' | 'warning' | 'primary';
}) {
  return (
    <Button
      variant="ghost"
      type="submit"
      onClick={async (e) => {
        e.preventDefault();
        const form = e.currentTarget.form;
        if (!form) return;
        if (await askConfirm({ title, message, confirmLabel, tone })) form.requestSubmit();
      }}
    >
      {children}
    </Button>
  );
}
