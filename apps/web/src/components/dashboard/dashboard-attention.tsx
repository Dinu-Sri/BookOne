'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AttentionItem } from '@/app/actions/dashboard';
import { Button } from '@/components/ui/bookone-ui';
import { DashboardPanelDialog } from '@/components/dashboard/dashboard-panel-dialog';

function Item({ item }: { item: AttentionItem }) {
  return (
    <li>
      <Link href={item.href}>
        <strong>{item.label}</strong>
        <span>
          {item.count}
          {item.amountDisplay ? ` · ${item.amountDisplay}` : ''}
        </span>
      </Link>
    </li>
  );
}

export function DashboardAttention({ items }: { items: AttentionItem[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) {
    return <p className="dash-all-clear">All clear — no flagged items.</p>;
  }
  const shown = items.slice(0, 3);
  return (
    <div>
      <ul className="dash-attention">
        {shown.map((item) => (
          <Item key={item.id} item={item} />
        ))}
      </ul>
      {items.length > 3 ? (
        <>
          <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
            View all ({items.length})
          </Button>
          <DashboardPanelDialog open={open} title="Flagged items" onClose={() => setOpen(false)}>
            <ul className="dash-attention">
              {items.map((item) => (
                <Item key={item.id} item={item} />
              ))}
            </ul>
          </DashboardPanelDialog>
        </>
      ) : null}
    </div>
  );
}
