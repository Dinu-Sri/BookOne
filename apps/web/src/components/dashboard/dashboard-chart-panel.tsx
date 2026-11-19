'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/bookone-ui';
import { DashboardPanelDialog } from '@/components/dashboard/dashboard-panel-dialog';

export type ChartPoint = {
  key: string;
  label: string;
  value?: number;
  moneyIn?: number;
  moneyOut?: number;
  previous?: number | null;
};

function seriesMax(points: ChartPoint[], mode: 'sales' | 'cash'): number {
  return Math.max(
    0.01,
    ...points.map((p) =>
      mode === 'cash'
        ? Math.max(Math.abs(p.moneyIn ?? 0), Math.abs(p.moneyOut ?? 0), Math.abs(p.previous ?? 0))
        : Math.max(Math.abs(p.value ?? 0), Math.abs(p.previous ?? 0)),
    ),
  );
}

function isIdle(points: ChartPoint[], mode: 'sales' | 'cash'): boolean {
  return points.every((p) =>
    mode === 'cash'
      ? Math.abs(p.moneyIn ?? 0) < 0.005 && Math.abs(p.moneyOut ?? 0) < 0.005
      : Math.abs(p.value ?? 0) < 0.005,
  );
}

function labelIndexes(n: number): number[] {
  if (n <= 7) return Array.from({ length: n }, (_, i) => i);
  const picks = new Set([0, n - 1, Math.floor((n - 1) / 2)]);
  const step = Math.ceil(n / 6);
  for (let i = 0; i < n; i += step) picks.add(i);
  return [...picks].sort((a, b) => a - b);
}

export function SeriesChart({
  points,
  mode,
}: {
  points: ChartPoint[];
  mode: 'sales' | 'cash';
}) {
  const width = 640;
  const height = 240;
  const pad = { l: 44, r: 10, t: 16, b: 32 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = seriesMax(points, mode);
  const hasNeg = mode === 'sales' && points.some((p) => (p.value ?? 0) < -0.005);
  const zeroY = hasNeg ? pad.t + innerH / 2 : pad.t + innerH;
  const usable = hasNeg ? innerH / 2 - 4 : innerH - 4;
  const n = Math.max(points.length, 1);
  const gap = 4;
  const slot = innerW / n;
  const barW = Math.max(2, slot - gap);
  const ticks = labelIndexes(points.length);

  return (
    <div className="dash-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true">
        <line x1={pad.l} x2={width - pad.r} y1={zeroY} y2={zeroY} stroke="currentColor" opacity="0.35" />
        <text x={4} y={pad.t + 10} fontSize="11" fill="currentColor">
          {max.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </text>
        {hasNeg ? (
          <text x={4} y={height - pad.b} fontSize="11" fill="currentColor">
            -{max.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </text>
        ) : (
          <text x={4} y={zeroY} fontSize="11" fill="currentColor">
            0
          </text>
        )}
        {points.map((p, i) => {
          const x = pad.l + i * slot + gap / 2;
          if (mode === 'cash') {
            const inH = ((p.moneyIn ?? 0) / max) * usable;
            const outH = ((p.moneyOut ?? 0) / max) * usable;
            const half = Math.max(1, barW / 2 - 1);
            return (
              <g key={p.key}>
                <rect
                  data-cash-in={p.key}
                  x={x}
                  y={zeroY - inH}
                  width={half}
                  height={inH}
                  fill="var(--success)"
                  rx="1"
                />
                <rect
                  data-cash-out={p.key}
                  x={x + half + 1}
                  y={zeroY - outH}
                  width={half}
                  height={outH}
                  fill="var(--danger)"
                  rx="1"
                />
              </g>
            );
          }
          const h = (Math.abs(p.value ?? 0) / max) * usable;
          const y = (p.value ?? 0) < 0 ? zeroY : zeroY - h;
          return <rect key={p.key} x={x} y={y} width={barW} height={h} fill="var(--brand)" rx="1" />;
        })}
        {ticks.map((i) => {
          const p = points[i];
          if (!p) return null;
          const x = pad.l + i * slot + slot / 2;
          return (
            <text key={p.key} x={x} y={height - 8} fontSize="11" textAnchor="middle" fill="currentColor">
              {p.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export function DashboardChartPanel({
  title,
  mode,
  points,
  summary,
  tableId,
  viewDataId,
  extra,
}: {
  title: string;
  mode: 'sales' | 'cash';
  points: ChartPoint[];
  summary?: string;
  tableId: string;
  viewDataId: string;
  extra?: string;
}) {
  const [open, setOpen] = useState(false);
  const idle = useMemo(() => isIdle(points, mode), [points, mode]);
  const caption = mode === 'sales' ? 'Sales by period' : 'Cash received and paid';

  return (
    <section className="card dash-chart-card">
      <div className="card-header dash-chart-head">
        <h2 className="card-title">{title}</h2>
        <Button type="button" variant="secondary" id={viewDataId} onClick={() => setOpen(true)}>
          View data
        </Button>
      </div>
      <div className="card-body">
        {idle ? (
          <p className="dash-empty">No activity in selected period.</p>
        ) : (
          <>
            {mode === 'cash' ? (
              <p className="dash-chart-legend">
                <span className="dash-legend-in">Received</span>
                <span className="dash-legend-out">Paid</span>
              </p>
            ) : (
              <p className="dash-chart-legend">
                <span className="dash-legend-sales">Net sales</span>
              </p>
            )}
            <SeriesChart points={points} mode={mode} />
          </>
        )}
        {summary ? <p className="dash-chart-summary">{summary}</p> : null}
      </div>
      <DashboardPanelDialog open={open} title={caption} onClose={() => setOpen(false)}>
        <table className="dash-chart-table" id={tableId}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Bucket</th>
              {mode === 'sales' ? (
                <th scope="col">Net sales</th>
              ) : (
                <>
                  <th scope="col">Received</th>
                  <th scope="col">Paid</th>
                </>
              )}
              <th scope="col">Previous</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.key}>
                <th scope="row">{p.label}</th>
                {mode === 'sales' ? (
                  <td>{p.value ?? 0}</td>
                ) : (
                  <>
                    <td>{p.moneyIn ?? 0}</td>
                    <td>{p.moneyOut ?? 0}</td>
                  </>
                )}
                <td>{p.previous ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {extra ? (
          <p className="dash-recon" id={mode === 'cash' ? 'funding' : undefined}>
            {extra}
          </p>
        ) : null}
      </DashboardPanelDialog>
    </section>
  );
}
