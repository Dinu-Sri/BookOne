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
import { Button } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextAreaField, TextField } from '@/components/ui/text-field';
import { FormSelect } from '@/components/settings/settings-kit';
import {
  FLEET_LOCATION_TYPES,
  LOCATION_TYPE_LABELS,
  OPERATIONAL_LOCATION_TYPES,
  isFleetLocationType,
} from '@/lib/rental-locations';

const initialState: CompanyActionState = { ok: false };

type Brand = CompanySettingsData['brands'][number];
type Location = CompanySettingsData['locations'][number];

export function BrandForms({ brands }: { brands: Brand[] }) {
  return (
    <>
      <div className="co-list">
        {brands.length === 0 ? (
          <div className="ux-empty">
            <strong>No brands yet.</strong>
            <span>Add a brand when you sell under more than one name. Each brand can print its own bank details.</span>
          </div>
        ) : null}
        {brands.map((brand) => (
          <details className="co-item" key={brand.id}>
            <summary>
              <span className="co-item-text">
                <strong>{brand.name}</strong>
                <span>{[brand.code, brand.website].filter(Boolean).join(' · ') || 'No code or website'}</span>
              </span>
              <span className="co-item-open">Edit</span>
            </summary>
            <BrandForm brand={brand} />
          </details>
        ))}
      </div>
      <details className="ux-disclosure set-add" open={brands.length === 0}>
        <summary>Add a brand</summary>
        <BrandForm />
      </details>
    </>
  );
}

export function LocationForms({
  brands,
  locations,
  rentalModuleOn = false,
}: {
  brands: Brand[];
  locations: Location[];
  rentalModuleOn?: boolean;
}) {
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
      <div className="co-list">
        {locations.length === 0 ? (
          <div className="ux-empty">
            <strong>No locations yet.</strong>
            <span>Add the shops, warehouses and offices where you keep stock or take payments.</span>
          </div>
        ) : null}
        {locations.map((location) => (
          <details className="co-item" key={location.id}>
            <summary>
              <span className="co-item-text">
                <strong>
                  {location.name}
                  {location.code ? <span className="co-code"> ({location.code})</span> : null}
                </strong>
                <span>
                  {LOCATION_TYPE_LABELS[location.locationType ?? ''] ?? location.locationType ?? 'Location'}
                  {location.brandName ? ` · ${location.brandName}` : ''}
                </span>
              </span>
              <span className="co-item-open">Edit</span>
            </summary>
            <LocationForm
              brands={brands}
              location={location}
              busy={busy}
              rentalModuleOn={rentalModuleOn}
              onDelete={() => requestDelete(location)}
            />
          </details>
        ))}
      </div>
      <details className="ux-disclosure set-add" open={locations.length === 0}>
        <summary>Add a location</summary>
        <LocationForm brands={brands} rentalModuleOn={rentalModuleOn} />
      </details>

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
      <TextField id={`brand-name-${brand?.id ?? 'new'}`} name="name" label="Brand name" defaultValue={brand?.name ?? ''} placeholder="BookOne" required />
      <TextField id={`brand-code-${brand?.id ?? 'new'}`} name="code" label="Code" defaultValue={brand?.code ?? ''} placeholder="BOOK" />
      <TextField id={`brand-web-${brand?.id ?? 'new'}`} name="website" label="Website" defaultValue={brand?.website ?? ''} placeholder="https://brand.example.com" />
      <TextAreaField
        id={`brand-bank-${brand?.id ?? 'new'}`}
        name="bankDetails"
        label="Bank details"
        help="Printed on this brand's invoices and quotations."
        rows={3}
        defaultValue={brand?.bankDetails ?? ''}
        placeholder="Bank, account name, account number"
        className="field-full"
      />
      <TextAreaField id={`brand-notes-${brand?.id ?? 'new'}`} name="notes" label="Notes" rows={2} defaultValue={brand?.notes ?? ''} className="field-full" />
      <div className="company-form-footer field-full">
        <ActionMessage state={state} />
        <SubmitButton icon={isEdit ? <Save size={16} /> : <Plus size={16} />}>
          {isEdit ? 'Save brand' : 'Add brand'}
        </SubmitButton>
      </div>
    </form>
  );
}

function locationTypeOptions(rentalModuleOn: boolean, currentType?: string | null) {
  const values: string[] = [...OPERATIONAL_LOCATION_TYPES];
  if (rentalModuleOn) {
    values.push(...FLEET_LOCATION_TYPES);
  } else if (currentType && isFleetLocationType(currentType) && !values.includes(currentType)) {
    values.push(currentType);
  }
  return values.map((value) => ({
    value,
    label: LOCATION_TYPE_LABELS[value] ?? value,
  }));
}

function LocationForm({
  brands,
  location,
  busy,
  rentalModuleOn = false,
  onDelete,
}: {
  brands: Brand[];
  location?: Location;
  busy?: boolean;
  rentalModuleOn?: boolean;
  onDelete?: () => void;
}) {
  const [state, action] = useActionState(saveLocationForm, initialState);
  const isEdit = Boolean(location);
  useRefreshOnSuccess(state);

  return (
    <form action={action} className={`company-inline-form ${isEdit ? 'is-edit' : 'is-create'}`}>
      <input type="hidden" name="id" value={location?.id ?? ''} />
      <TextField id={`loc-name-${location?.id ?? 'new'}`} name="name" label="Location name" defaultValue={location?.name ?? ''} placeholder="Colombo showroom" required />
      <TextField id={`loc-code-${location?.id ?? 'new'}`} name="code" label="Code" defaultValue={location?.code ?? ''} placeholder="COL-01" />
      <FormSelect
        id={`loc-brand-${location?.id ?? 'new'}`}
        name="brandId"
        label="Brand"
        defaultValue={location?.brandId ?? ''}
        options={[
          { value: '', label: 'No brand' },
          ...brands.map((brand) => ({ value: brand.id, label: brand.code ? `${brand.name} (${brand.code})` : brand.name })),
        ]}
      />
      <FormSelect
        id={`loc-type-${location?.id ?? 'new'}`}
        name="locationType"
        label="Type"
        defaultValue={location?.locationType ?? 'branch'}
        options={locationTypeOptions(rentalModuleOn, location?.locationType)}
      />
      <TextAreaField id={`loc-address-${location?.id ?? 'new'}`} name="address" label="Address" rows={2} defaultValue={location?.address ?? ''} className="field-full" />
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
  return null;
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
