'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

type FieldChrome = {
  id: string;
  label: string;
  help?: string;
  error?: string;
  required?: boolean;
  className?: string;
};

function FieldWrap({
  id,
  label,
  help,
  error,
  required,
  className,
  children,
}: FieldChrome & { children: ReactNode }) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={`field ${className ?? ''}`.trim()}>
      <label htmlFor={id}>
        {label}
        {required ? (
          <span className="field-required" aria-hidden>
            {' '}
            *
          </span>
        ) : null}
      </label>
      {children}
      {help ? (
        <p id={helpId} className="field-help">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="form-error inline" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const TextField = forwardRef<
  HTMLInputElement,
  FieldChrome & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>
>(function TextField({ id, label, help, error, required, className, ...props }, ref) {
  const describedBy = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <FieldWrap id={id} label={label} help={help} error={error} required={required} className={className}>
      <input
        ref={ref}
        id={id}
        className="input"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
    </FieldWrap>
  );
});

export const AmountField = forwardRef<
  HTMLInputElement,
  FieldChrome &
    Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className' | 'type' | 'inputMode'> & { currency?: string }
>(function AmountField({ id, label, help, error, required, className, currency, ...props }, ref) {
  const describedBy = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  const shown = currency ? `${label} (${currency})` : label;
  return (
    <FieldWrap id={id} label={shown} help={help} error={error} required={required} className={className}>
      <input
        ref={ref}
        id={id}
        className="input"
        inputMode="decimal"
        autoComplete="off"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
    </FieldWrap>
  );
});

export const TextAreaField = forwardRef<
  HTMLTextAreaElement,
  FieldChrome & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'>
>(function TextAreaField({ id, label, help, error, required, className, ...props }, ref) {
  const describedBy = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <FieldWrap id={id} label={label} help={help} error={error} required={required} className={className}>
      <textarea
        ref={ref}
        id={id}
        className="input"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
    </FieldWrap>
  );
});

export const SearchField = forwardRef<
  HTMLInputElement,
  { id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string }
>(function SearchField({ id, label, value, onChange, placeholder }, ref) {
  return (
    <div className="party-search-form">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        className="input party-search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
});
