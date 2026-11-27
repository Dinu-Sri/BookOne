/**
 * Small, dependency-free SVG charts that read at a glance. Colours come from the app
 * tokens; every chart has a text summary (aria-label) and values printed on the bars.
 */

export function compactMoney(n: number) {
  const a = Math.abs(n);
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M` : a >= 1_000 ? `${(a / 1_000).toFixed(a >= 100_000 ? 0 : 1)}K` : a.toFixed(0);
  return `${n < 0 ? '−' : ''}${s}`;
}

export type Bar = { label: string; value: number; tone?: 'brand' | 'success' | 'danger' | 'warning' | 'muted' };

const TONE: Record<NonNullable<Bar['tone']>, string> = {
  brand: 'var(--brand)',
  success: 'var(--success)',
  danger: 'var(--danger)',
  warning: 'var(--warning)',
  muted: 'var(--line-strong)',
};

/** Horizontal bars with the value at the end: ranking, composition, comparisons. */
export function HBarChart({ bars, title, max }: { bars: Bar[]; title: string; max?: number }) {
  const top = Math.max(0.01, max ?? Math.max(...bars.map((b) => Math.abs(b.value)), 0));
  return (
    <div className="ch-hbars" role="img" aria-label={`${title}: ${bars.map((b) => `${b.label} ${compactMoney(b.value)}`).join(', ')}`}>
      {bars.map((b) => (
        <div className="ch-hbar" key={b.label}>
          <span className="ch-hbar-label" title={b.label}>
            {b.label}
          </span>
          <span className="ch-hbar-track">
            <span
              className="ch-hbar-fill"
              style={{ width: `${Math.max(1.5, (Math.abs(b.value) / top) * 100)}%`, background: TONE[b.tone ?? 'brand'] }}
            />
          </span>
          <span className="ch-hbar-value">{compactMoney(b.value)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Waterfall: a starting amount, steps up or down, and the result.
 * Used for "Revenue → costs → profit" and "Opening cash → activities → closing cash".
 */
export function Waterfall({
  steps,
  title,
  height = 150,
}: {
  steps: Array<{ label: string; value: number; kind: 'start' | 'step' | 'end' }>;
  title: string;
  height?: number;
}) {
  const W = 100 * steps.length;
  let run = 0;
  const bars = steps.map((s) => {
    if (s.kind === 'start' || s.kind === 'end') {
      const b = { ...s, from: 0, to: s.value };
      run = s.value;
      return b;
    }
    const b = { ...s, from: run, to: run + s.value };
    run += s.value;
    return b;
  });
  const vals = bars.flatMap((b) => [b.from, b.to, 0]);
  const hi = Math.max(...vals);
  const lo = Math.min(...vals);
  const span = Math.max(0.01, hi - lo);
  const y = (v: number) => 18 + ((hi - v) / span) * (height - 44);
  return (
    <svg
      className="ch-waterfall"
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${title}: ${steps.map((s) => `${s.label} ${compactMoney(s.value)}`).join(', ')}`}
    >
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="ch-axis" />
      {bars.map((b, i) => {
        const top = y(Math.max(b.from, b.to));
        const h = Math.max(1.5, Math.abs(y(b.from) - y(b.to)));
        const fill = b.kind === 'step' ? (b.value >= 0 ? 'var(--success)' : 'var(--danger)') : b.to >= 0 ? 'var(--brand)' : 'var(--danger)';
        return (
          <g key={b.label}>
            <rect x={i * 100 + 18} width={64} y={top} height={h} rx={3} fill={fill} opacity={b.kind === 'step' ? 0.85 : 1} />
            <text x={i * 100 + 50} y={top - 5} textAnchor="middle" className="ch-val">
              {compactMoney(b.kind === 'step' ? b.value : b.to)}
            </text>
            <text x={i * 100 + 50} y={height - 6} textAnchor="middle" className="ch-lbl">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Two stacked columns side by side: what you own vs how it is funded. */
export function BalanceColumns({
  left,
  right,
  title,
}: {
  left: { label: string; parts: Bar[] };
  right: { label: string; parts: Bar[] };
  title: string;
}) {
  const total = (p: Bar[]) => p.reduce((s, b) => s + Math.max(0, b.value), 0);
  const top = Math.max(0.01, total(left.parts), total(right.parts));
  const col = (c: { label: string; parts: Bar[] }) => (
    <div className="ch-col">
      <div className="ch-col-stack">
        {c.parts
          .filter((p) => p.value > 0.005)
          .map((p) => (
            <span
              key={p.label}
              className="ch-col-seg"
              style={{ height: `${(p.value / top) * 100}%`, background: TONE[p.tone ?? 'brand'] }}
              title={`${p.label}: ${compactMoney(p.value)}`}
            >
              {p.value / top > 0.12 ? <em>{p.label}</em> : null}
            </span>
          ))}
      </div>
      <strong>{c.label}</strong>
      <span>{compactMoney(total(c.parts))}</span>
    </div>
  );
  return (
    <div
      className="ch-cols"
      role="img"
      aria-label={`${title}: ${left.label} ${compactMoney(total(left.parts))}, ${right.label} ${compactMoney(total(right.parts))}`}
    >
      {col(left)}
      {col(right)}
    </div>
  );
}
