'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Info, XCircle } from 'lucide-react';

export type StatusKind = 'success' | 'info' | 'error';

export interface StatusPayload {
  kind?: StatusKind;
  message: string;
  durationMs?: number;
}

const FLASH_MAP: Record<string, StatusPayload> = {
  created: { kind: 'success', message: 'Saved successfully' },
  saved: { kind: 'success', message: 'Saved successfully' },
  updated: { kind: 'success', message: 'Updated successfully' },
  deleted: { kind: 'success', message: 'Deleted successfully' },
  archived: { kind: 'success', message: 'Archived successfully' },
  restored: { kind: 'success', message: 'Restored successfully' },
  error: { kind: 'error', message: 'Something went wrong' },
};

/** Fire from any client component: pushStatusToast({ message: 'Saved', kind: 'success' }) */
export function pushStatusToast(payload: StatusPayload) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<StatusPayload>('bookone:status', { detail: payload }));
}

export function StatusToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [toast, setToast] = useState<StatusPayload | null>(null);

  function show(payload: StatusPayload) {
    setToast(payload);
    const ms = payload.durationMs ?? 3200;
    window.setTimeout(() => {
      setToast((current) => (current === payload || current?.message === payload.message ? null : current));
    }, ms);
  }

  useEffect(() => {
    const flash = searchParams.get('flash');
    if (!flash) return;
    const mapped = FLASH_MAP[flash] ?? { kind: 'success' as const, message: decodeURIComponent(flash.replace(/\+/g, ' ')) };
    show(mapped);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('flash');
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [searchParams, pathname, router]);

  useEffect(() => {
    function onStatus(event: Event) {
      const detail = (event as CustomEvent<StatusPayload>).detail;
      if (detail?.message) show(detail);
    }
    window.addEventListener('bookone:status', onStatus as EventListener);
    return () => window.removeEventListener('bookone:status', onStatus as EventListener);
  }, []);

  if (!toast) return null;

  const kind = toast.kind ?? 'success';
  const Icon = kind === 'error' ? XCircle : kind === 'info' ? Info : CheckCircle2;

  return (
    <div className={`status-toast status-toast-${kind}`} role="status" aria-live="polite">
      <Icon size={15} />
      <span>{toast.message}</span>
    </div>
  );
}
