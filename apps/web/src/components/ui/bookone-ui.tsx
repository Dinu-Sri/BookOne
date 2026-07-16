import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export function LogoMark({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return <img className="brand-mark" src="/favicon.webp" alt="BookOne" width={34} height={34} />;
  }

  return <img className="brand-logo" src="/logo.webp" alt="BookOne" width={284} height={73} />;
}

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-lockup">
      <LogoMark compact={compact} />
      {compact ? <strong>BookOne</strong> : null}
    </div>
  );
}

export function Button({ variant = 'secondary', className = '', ...props }: ComponentPropsWithoutRef<'button'> & { variant?: 'primary' | 'secondary' | 'ghost' | 'icon' }) {
  return <button className={`button ${variant} ${className}`.trim()} type="button" {...props} />;
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Card({ children, padded = false, className = '', style }: { children: ReactNode; padded?: boolean; className?: string; style?: React.CSSProperties }) {
  return <section className={`card ${padded ? 'pad' : ''} ${className}`.trim()} style={style}>{children}</section>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="card-header">
      <div>
        <h2 className="card-title">{title}</h2>
        {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ children }: { children: ReactNode }) {
  return <div className="card-body">{children}</div>;
}

export function MetricCard({ label, value, note, tone = 'neutral' }: { label: string; value: string; note: string; tone?: Tone }) {
  return (
    <Card className="metric-card">
      <div className="cluster" style={{ justifyContent: 'space-between' }}>
        <p className="metric-label">{label}</p>
        <Badge tone={tone}>{tone === 'neutral' ? 'Live' : tone}</Badge>
      </div>
      <p className="metric-value">{value}</p>
      <p className="metric-note">{note}</p>
    </Card>
  );
}

export function SelectLike({ children }: { children: ReactNode }) {
  return (
    <div className="select-like" role="button" tabIndex={0}>
      {children}
      <ChevronDown className="select-chevron" size={15} aria-hidden />
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 style={{ marginTop: 4, fontSize: 28, lineHeight: 1.2 }}>{title}</h1>
        <p style={{ marginTop: 8, color: 'var(--ink-muted)', maxWidth: 640 }}>{lead}</p>
      </div>
      {actions}
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return <div className="confidence" aria-label={`${value}%`}><span style={{ width: `${value}%` }} /></div>;
}
