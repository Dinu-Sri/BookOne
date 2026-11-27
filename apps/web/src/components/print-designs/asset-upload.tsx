'use client';

import { useRef } from 'react';
import { uploadPrintAsset } from '@/app/actions/print-designs';
import { Button } from '@/components/ui/bookone-ui';
import { withFormPending } from '@/components/ui/form-busy';

/** One button: choose an image and it is saved straight away. */
export function AssetUploadButton({ slot, label }: { slot: 'logo' | 'signature' | 'stamp'; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  async function onPick(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.set('slot', slot);
    fd.set('file', file);
    await withFormPending(() => uploadPrintAsset(fd));
  }
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="pdh-file-input"
        aria-label={`${label} image file`}
        onChange={(e) => void onPick(e.target.files?.[0])}
      />
      <Button type="button" variant="secondary" onClick={() => input.current?.click()}>
        {label}
      </Button>
    </>
  );
}
