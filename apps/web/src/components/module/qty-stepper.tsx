'use client';

/** Compact − / input / + control for document line quantities. */

export function QtyStepper({
  name,
  value,
  onChange,
  min = 0,
  step = 1,
}: {
  name?: string;
  value: string;
  onChange: (next: string) => void;
  min?: number;
  step?: number;
}) {
  const num = Number(String(value).replace(/[^0-9.-]/g, '')) || 0;

  function setNum(n: number) {
    const next = Math.max(min, Math.round(n * 10000) / 10000);
    onChange(String(next));
  }

  return (
    <div className="qty-stepper">
      <button type="button" className="qty-stepper-btn" aria-label="Decrease quantity" onClick={() => setNum(num - step)}>
        −
      </button>
      <input
        className="input qty-stepper-input"
        name={name}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="qty-stepper-btn" aria-label="Increase quantity" onClick={() => setNum(num + step)}>
        +
      </button>
    </div>
  );
}
