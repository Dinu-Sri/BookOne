'use client';

import { useState } from 'react';
import { deletePrintDesign } from '@/app/actions/print-designs';
import { Button } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { withFormPending } from '@/components/ui/form-busy';

/** Delete is a person-only action in BookOne. Assistants have no delete tool. */
export function DeleteDesignVersion({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    const fd = new FormData();
    fd.set('id', id);
    try {
      await withFormPending(() => deletePrintDesign(fd));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        Delete version
      </Button>
      <ConfirmDialog
        open={open}
        title={`Delete ${label}?`}
        message="This version is removed from Print designs and cannot be chosen again. Documents already printed with it keep their look. Other versions stay."
        confirmLabel="Delete version"
        tone="danger"
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={run}
      />
    </>
  );
}
