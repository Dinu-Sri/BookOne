'use client';

import { paymentAllocationFieldError } from '@bookone/accounting';

export function AllocationAmountField({
  id,
  label,
  value,
  balanceDue,
  selected,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  balanceDue: number;
  selected: boolean;
  onChange: (next: string) => void;
}) {
  const error = paymentAllocationFieldError(value, balanceDue, selected);
  const errorId = `${id}-error`;
  return (
    <div>
      <input
        id={id}
        className="input"
        inputMode="decimal"
        disabled={!selected}
        value={value}
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        placeholder={String(balanceDue)}
        style={{ maxWidth: 120 }}
      />
      {error ? (
        <p id={errorId} className="form-error" role="alert" style={{ margin: '4px 0 0', fontSize: 12 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
