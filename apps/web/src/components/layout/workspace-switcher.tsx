'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ChevronDown, Loader2 } from 'lucide-react';
import {
  listMyWorkspaces,
  switchWorkspace,
  type WorkspaceOption,
} from '@/app/actions/workspace-switch';
import { entityKindLabel } from '@/lib/entity-labels';

export function WorkspaceSwitcher({
  currentName,
  compact = false,
}: {
  currentName?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<WorkspaceOption[]>([]);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listMyWorkspaces()
      .then((list) => {
        if (!cancelled) {
          setRows(list);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function pick(ws: WorkspaceOption) {
    if (ws.isCurrent) {
      setOpen(false);
      return;
    }
    start(async () => {
      setError('');
      const res = await switchWorkspace(ws.tenantId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.push(res.homePath);
      router.refresh();
    });
  }

  const label = currentName ?? rows.find((r) => r.isCurrent)?.name ?? 'Workspace';
  const multi = rows.length > 1;

  return (
    <div className="workspace-switcher" style={{ position: 'relative' }}>
      <button
        type="button"
        className="workspace-switcher-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={multi ? 'Switch workspace' : label}
      >
        <Building2 size={16} />
        <span className="workspace-switcher-name">{label}</span>
        {multi || !compact ? <ChevronDown size={14} /> : null}
        {pending ? <Loader2 size={14} className="spin" /> : null}
      </button>
      {open ? (
        <div className="workspace-switcher-menu" role="listbox">
          {!loaded ? (
            <div className="workspace-switcher-item muted">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="workspace-switcher-item muted">No workspaces</div>
          ) : (
            rows.map((ws) => (
              <button
                key={ws.tenantId}
                type="button"
                role="option"
                aria-selected={ws.isCurrent}
                className={`workspace-switcher-item ${ws.isCurrent ? 'current' : ''}`}
                disabled={pending}
                onClick={() => pick(ws)}
              >
                <span className="workspace-switcher-item-name">
                  {ws.name}
                  {ws.status === 'archived' ? (
                    <em className="workspace-archived"> archived</em>
                  ) : null}
                </span>
                <span className="workspace-switcher-item-meta">
                  {entityKindLabel(ws.entityKind, ws.capabilityTier)}
                  {ws.isCurrent ? ' · current' : ''}
                </span>
              </button>
            ))
          )}
          {error ? <div className="workspace-switcher-item error">{error}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
