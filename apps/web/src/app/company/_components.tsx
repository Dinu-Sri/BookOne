import type { ReactNode } from 'react';
import { Badge, Button, Card, CardBody, CardHeader } from '@/components/ui/bookone-ui';

export function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  placeholder,
  wide = false,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <div className={`field ${wide ? 'field-full' : ''}`.trim()}>
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} className="input" defaultValue={defaultValue ?? ''} placeholder={placeholder} />
    </div>
  );
}

export function SelectField({ label, name, defaultValue, children }: { label: string; name: string; defaultValue: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} className="input" defaultValue={defaultValue}>
        {children}
      </select>
    </div>
  );
}

export function TextAreaField({ label, name, wide = false }: { label: string; name: string; wide?: boolean }) {
  return (
    <div className={`field ${wide ? 'field-full' : ''}`.trim()}>
      <label htmlFor={name}>{label}</label>
      <textarea id={name} name={name} className="input" rows={3} />
    </div>
  );
}

export function EmptyLine({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null;
  return <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>{children}</p>;
}

export function CompanyCard({ title, subtitle, action, children }: { title: string; subtitle: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} action={action} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

export function SaveButton({ children }: { children: ReactNode }) {
  return (
    <div className="field field-full">
      <Button variant="primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
        {children}
      </Button>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={status === 'verified' || status === 'open' || status === 'active' ? 'success' : 'neutral'}>{status}</Badge>;
}
