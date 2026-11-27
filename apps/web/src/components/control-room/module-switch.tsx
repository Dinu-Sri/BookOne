'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setPlatformModule } from '@/app/actions/platform';
import { pushStatusToast } from '@/components/layout/status-toast';

/** One switch per company and module: changes straight away and is audited. */
export function ModuleSwitch({ companyId, companyName, moduleKey, moduleName, on }: {
  companyId: string;
  companyName: string;
  moduleKey: string;
  moduleName: string;
  on: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(on);
  const [busy, setBusy] = useState(false);
  async function change(next: boolean) {
    setValue(next);
    setBusy(true);
    const res = await setPlatformModule({ id: companyId, key: moduleKey, on: next });
    setBusy(false);
    if (!res.ok) {
      setValue(!next);
      pushStatusToast({ kind: 'error', message: res.error });
      return;
    }
    pushStatusToast({ kind: 'success', message: `${moduleName} ${next ? 'on' : 'off'} for ${companyName}` });
    router.refresh();
  }
  return (
    <label className="ux-switch" title={`${moduleName} for ${companyName}: ${value ? 'on' : 'off'}`}>
      <input
        type="checkbox"
        role="switch"
        checked={value}
        disabled={busy}
        aria-label={`${moduleName} for ${companyName}`}
        onChange={(e) => void change(e.target.checked)}
      />
      <span aria-hidden />
    </label>
  );
}
