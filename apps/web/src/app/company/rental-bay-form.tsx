'use client';

import { useActionState } from 'react';
import { MapPin } from 'lucide-react';
import {
  ensureFleetBaysFromForm,
  type CompanyActionState,
  type HireBayPresence,
} from '@/app/actions/company-settings';
import { Button } from '@/components/ui/bookone-ui';

const initialState: CompanyActionState = { ok: false };

export function HireBaySetupForm({ bays }: { bays: HireBayPresence[] }) {
  const [state, action] = useActionState(ensureFleetBaysFromForm, initialState);
  const missing = bays.filter((bay) => !bay.present);

  return (
    <form action={action} className="company-inline-form is-create">
      <div className="field field-full">
        <p className="muted-line" style={{ margin: 0 }}>
          Dispatch, dirty return and wash-release need On rent, Wash and Repair locations. Add them
          here, or choose those types under Company → Locations.
        </p>
        <p className="muted-line" style={{ margin: '8px 0 0' }}>
          {missing.length === 0
            ? 'On rent, Wash and Repair locations already exist.'
            : `Missing: ${missing.map((bay) => bay.label).join(', ')}.`}
        </p>
      </div>
      {state.error ? <span className="form-error inline">{state.error}</span> : null}
      {state.message ? <span className="entry-result success inline">{state.message}</span> : null}
      <div className="company-form-footer field-full">
        <div className="company-form-footer-actions">
          <Button type="submit" variant="secondary">
            <MapPin size={16} />
            {missing.length === 0 ? 'Hire bays ready' : 'Create missing hire bays'}
          </Button>
        </div>
      </div>
    </form>
  );
}
