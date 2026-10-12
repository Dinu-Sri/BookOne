import Link from 'next/link';
import { Button, Card } from '@/components/ui/bookone-ui';

export function PermissionDeniedCard({
  title,
  body,
  backHref,
  backLabel,
}: {
  title: string;
  body: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="workspace party-workspace">
      <Card>
        <div className="card-body">
          <h2 className="card-title">{title}</h2>
          <p style={{ color: 'var(--ink-muted)', marginTop: 8 }}>{body}</p>
          <div style={{ marginTop: 14 }}>
            <Link href={backHref}>
              <Button variant="secondary" type="button">
                {backLabel}
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
