import Link from 'next/link';
import type { ReactNode } from 'react';
import { Badge, Button, Card, type Tone } from '@/components/ui/bookone-ui';

export function ModulePageHeader({
  eyebrow,
  title,
  lead,
  newHref,
  newLabel,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  newHref?: string;
  newLabel?: string;
}) {
  return (
    <div className="page-heading" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 style={{ marginTop: 4, fontSize: 28, lineHeight: 1.2 }}>{title}</h1>
        <p style={{ marginTop: 8, color: 'var(--ink-muted)', maxWidth: 640 }}>{lead}</p>
      </div>
      {newHref && newLabel ? (
        <Link href={newHref}>
          <Button variant="primary" type="button">{newLabel}</Button>
        </Link>
      ) : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Tone =
    status === 'paid' ||
    status === 'posted' ||
    status === 'accepted' ||
    status === 'confirmed' ||
    status === 'active' ||
    status === 'refunded'
      ? 'success'
      : status === 'void' || status === 'cancelled' || status === 'inactive'
        ? 'danger'
        : status === 'draft' || status === 'open' || status === 'sent'
          ? 'info'
          : status === 'converted' ||
              status === 'partial' ||
              status === 'closed' ||
              status === 'archived'
            ? 'warning'
            : 'neutral';
  return <Badge tone={tone}>{status}</Badge>;
}

export function ListTable({
  headers,
  children,
  emptyTitle,
  emptyLead,
  emptyActionHref,
  emptyActionLabel,
}: {
  headers: string[];
  children: ReactNode;
  emptyTitle: string;
  emptyLead: string;
  emptyActionHref?: string;
  emptyActionLabel?: string;
}) {
  return (
    <Card>
      <div className="card-body" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
        {!children || (Array.isArray(children) && children.length === 0) ? (
          <div className="empty-state" style={{ padding: 32 }}>
            <h3>{emptyTitle}</h3>
            <p>{emptyLead}</p>
            {emptyActionHref && emptyActionLabel ? (
              <div style={{ marginTop: 12 }}>
                <Link href={emptyActionHref}>
                  <Button variant="primary" type="button">{emptyActionLabel}</Button>
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function formatLKR(value: number) {
  return `LKR ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function FormPageShell({
  eyebrow,
  title,
  lead,
  backHref,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  backHref: string;
  children: ReactNode;
}) {
  return (
    <div className="workspace">
      <ModulePageHeader eyebrow={eyebrow} title={title} lead={lead} />
      <div style={{ marginBottom: 12 }}>
        <Link href={backHref} style={{ color: 'var(--brand)', fontSize: 14 }}>
          ← Back to list
        </Link>
      </div>
      <Card>
        <div className="card-body">{children}</div>
      </Card>
    </div>
  );
}
