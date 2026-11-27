import { Badge } from '@/components/ui/bookone-ui';
import type { DesignVersionRow } from '@/lib/print-designs';

export function DesignStatusBadge({ v }: { v: Pick<DesignVersionRow, 'status' | 'inUse'> }) {
  if (v.inUse) return <Badge tone="success">In use</Badge>;
  if (v.status === 'awaiting_approval') return <Badge tone="warning">Waiting for your approval</Badge>;
  if (v.status === 'approved') return <Badge tone="info">Approved</Badge>;
  if (v.status === 'retired') return <Badge tone="neutral">Retired</Badge>;
  return <Badge tone="neutral">Draft</Badge>;
}

export function madeBy(v: Pick<DesignVersionRow, 'createdVia' | 'agentLabel'>) {
  if (v.createdVia === 'assistant') return `by ${v.agentLabel || 'an assistant'}`;
  if (v.createdVia === 'system') return 'by BookOne';
  return 'by a person';
}

export function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo' });
}
