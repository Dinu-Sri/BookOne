'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Plus, Save, Trash2 } from 'lucide-react';
import {
  deleteLocationFromForm,
  getLocationDeleteBlockers,
  saveBrandForm,
  saveLocationForm,
  type CompanyActionState,
  type CompanySettingsData,
} from '@/app/actions/company-settings';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

const initialState: CompanyActionState = { ok: false };

type Brand = CompanySettingsData['brands'][number];
type Location = CompanySettingsData['locations'][number];

export function BrandForms({ brands }: { brands: Brand[] }) {
  return (
    <>
      <BrandForm />
      <div className="inline-edit-list">
        {brands.length === 0 ? <p className="muted-line">No brands yet.</p> : null}
        {brands.map((brand) => (
          <BrandForm brand={brand} key={brand.id} />
        ))}
      </div>
    </>
  );
}

export function LocationForms({ brands, locations }: { brands: Brand[]; locations: Location[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Location | null>(null);
  const [block, setBlock] = useState<{ location: Location; reasons: string[] } | null>(null);

  async function requestDelete(location: Location) {
    setBusy(true);
    try {
      const blockers = await getLocationDeleteBlockers(location.id);
      if (!blockers.ok) {
        setBlock({ location, reasons: blockers.reasons });
        return;
      }
      setConfirm(location);
    } catch (error) {
      setBlock({
        location,
        reasons: [error instanceof Error ? error.message : 'Could not check this location.'],
      });
    } finally {
      setBusy(false);
    }
  }

  async function runDelete() {
    if (!confirm) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('id', confirm.id);
      await deleteLocationFromForm(fd);
      setConfirm(null);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete location.';
      setBlock({ location: confirm, reasons: [message.replace(/^Cannot delete:\s*/i, '')] });
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <LocationForm brands={brands} />
      <div className="inline-edit-list">
        {locations.length === 0 ? <p className="muted-line">No locations yet.</p> : null}
        {locations.map((location) => (
          <LocationForm
            brands={brands}
            location={location}
            key={location.id}
            busy={busy}
            onDelete={() => requestDelete(location)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete location?"
        message={
          confirm
            ? `Remove “${confirm.name}” from this company? This is only allowed because nothing is using it.`
            : undefined
        }
        confirmLabel="Delete"
        tone="danger"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={runDelete}
      />

      <ConfirmDialog
        open={Boolean(block)}
        title="Cannot delete"
        confirmLabel="OK"
        cancelLabel="Close"
        tone="primary"
        onCancel={() => setBlock(null)}
        onConfirm={() => setBlock(null)}
      >
        <p className="modal-message">
          <strong>{block?.location.name}</strong> is already in use:
        </p>
        <ul className="modal-list">
          {(block?.reasons ?? []).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </ConfirmDialog>
    </>
  );
}

function useRefreshOnSuccess(state: CompanyActionState) {
  const router = useRouter();
  const prev = useRef<CompanyActionState>(initialState);
  useEffect(() => {
    if (!state.ok) {
      prev.current = state;
      return;
    }
    // Refresh when a new successful action result arrives (including repeated "Brand added.").
    if (prev.current === state) return;
    prev.current = state;
    router.refresh();
  }, [state, router]);
}

function BrandForm({ brand }: { brand?: Brand }) {
  const [state, action] = useActionState(saveBrandForm, initialState);
  const isEdit = Boolean(brand);
  useRefreshOnSuccess(state);

  return (
    <form action={action} className={`company-inline-form ${isEdit ? 'is-edit' : 'is-create'}`}>
      <input type="hidden" name="id" value={brand?.id ?? ''} />
      <div className="field">
        <label>Brand name</label>
        <input name="name" className="input" defaultValue={brand?.name ?? ''} placeholder="BookOne" required />
      </div>
      <div className="field">
        <label>Code</label>
        <input name="code" className="input" defaultValue={brand?.code ?? ''} placeholder="BOOK" />
      </div>
      <div className="field field-full">
        <label>Notes</label>
        <textarea name="notes" className="input" rows={2} defaultValue={brand?.notes ?? ''} />
      </div>
      <div className="company-form-footer field-full">
        <ActionMessage state={state} />
        <SubmitButton icon={isEdit ? <Save size={16} /> : <Plus size={16} />}>
          {isEdit ? 'Save brand' : 'Add brand'}
        </SubmitButton>
      </div>
    </form>
  );
}

function LocationForm({
  brands,
  location,
  busy,
  onDelete,
}: {
  brands: Brand[];
  location?: Location;
  busy?: boolean;
  onDelete?: () => void;
}) {
  const [state, action] = useActionState(saveLocationForm, initialState);
  const isEdit = Boolean(location);
  useRefreshOnSuccess(state);

  return (
    <form action={action} className={`company-inline-form ${isEdit ? 'is-edit' : 'is-create'}`}>
      <input type="hidden" name="id" value={location?.id ?? ''} />
      <div className="field">
        <label>Location name</label>
        <input name="name" className="input" defaultValue={location?.name ?? ''} placeholder="Colombo showroom" required />
      </div>
      <div className="field">
        <label>Code</label>
        <input name="code" className="input" defaultValue={location?.code ?? ''} placeholder="COL-01" />
      </div>
      <div className="field">
        <label>Brand</label>
        <select name="brandId" className="input" defaultValue={location?.brandId ?? ''}>
          <option value="">No brand</option>
          {brands.map((brand) => (
            <option value={brand.id} key={brand.id}>{brand.code ? `${brand.code} - ${brand.name}` : brand.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Type</label>
        <select name="locationType" className="input" defaultValue={location?.locationType ?? 'branch'}>
          <option value="branch">Branch</option>
          <option value="warehouse">Warehouse</option>
          <option value="counter">POS counter</option>
          <option value="office">Office</option>
        </select>
      </div>
      <div className="field field-full">
        <label>Address</label>
        <textarea name="address" className="input" rows={2} defaultValue={location?.address ?? ''} />
      </div>
      {isEdit ? (
        <div className="field field-full">
          <Badge tone="neutral">{location?.brandName ?? 'No brand'}{location?.locationType ? ` - ${location.locationType}` : ''}</Badge>
        </div>
      ) : null}
      <div className="company-form-footer field-full">
        <ActionMessage state={state} />
        <div className="company-form-footer-actions">
          {isEdit && onDelete ? (
            <Button
              variant="secondary"
              type="button"
              className="modal-confirm-danger"
              onClick={onDelete}
              disabled={busy}
              data-testid="delete-location"
            >
              <Trash2 size={16} />
              Delete
            </Button>
          ) : null}
          <SubmitButton icon={isEdit ? <Save size={16} /> : <Plus size={16} />}>
            {isEdit ? 'Save location' : 'Add location'}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

function ActionMessage({ state }: { state: CompanyActionState }) {
  if (state.error) return <span className="form-error inline">{state.error}</span>;
  if (state.message) return <span className="entry-result success inline">{state.message}</span>;
  return <span />;
}

function SubmitButton({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" type="submit" disabled={pending}>
      {icon}
      {pending ? 'Saving...' : children}
    </Button>
  );
}
