'use client';

import { useState, type ReactNode } from 'react';
import {
  createPartyFromForm,
  updatePartyFromForm,
  type PartyRow,
} from '@/app/actions/parties';
import { Button } from '@/components/ui/bookone-ui';
import Link from 'next/link';

const SL_PROVINCES = [
  'Western',
  'Central',
  'Southern',
  'Northern',
  'Eastern',
  'North Western',
  'North Central',
  'Uva',
  'Sabaragamuwa',
];

const TABS = [
  { id: 'identity', label: 'Identity' },
  { id: 'tax', label: 'Tax' },
  { id: 'contact', label: 'Contact' },
  { id: 'address', label: 'Address' },
  { id: 'terms', label: 'Terms' },
  { id: 'bank', label: 'Bank' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function PartyForm({
  mode,
  roleContext,
  party,
  backHref,
}: {
  mode: 'create' | 'edit';
  roleContext: 'customer' | 'vendor';
  party?: PartyRow | null;
  backHref: string;
}) {
  const action = mode === 'edit' ? updatePartyFromForm : createPartyFromForm;
  const isCustomerDefault = party?.isCustomer ?? roleContext === 'customer';
  const isVendorDefault = party?.isVendor ?? roleContext === 'vendor';
  const [tab, setTab] = useState<TabId>('identity');

  return (
    <div className="party-form-shell">
      <div className="party-form-top">
        <Link href={backHref} className="party-back-btn">
          <span className="party-back-arrow" aria-hidden>
            ←
          </span>
          <span>
            <strong>Back to list</strong>
            <small>{roleContext === 'vendor' ? 'Vendors' : 'Customers'}</small>
          </span>
        </Link>
        <div className="party-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`party-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <form action={action} className="party-form-body">
        {mode === 'edit' && party ? <input type="hidden" name="id" value={party.id} /> : null}
        {mode === 'create' && roleContext === 'customer' ? (
          <input type="hidden" name="forceCustomer" value="1" />
        ) : null}
        {mode === 'create' && roleContext === 'vendor' ? (
          <input type="hidden" name="forceVendor" value="1" />
        ) : null}

        {/* Hidden fields so all values submit regardless of active tab */}
        <div className="party-tab-panel" hidden={tab !== 'identity'}>
          <div className="party-tab-grid">
            <Field label="Party type">
              <select className="input" name="partyType" defaultValue={party?.partyType ?? 'company'}>
                <option value="company">Company</option>
                <option value="individual">Individual</option>
                <option value="government">Government / SOE</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Code">
              <input className="input" name="code" defaultValue={party?.code ?? ''} placeholder="Auto if blank" />
            </Field>
            <Field label="Legal name *" full>
              <input
                className="input"
                name="name"
                required
                defaultValue={party?.legalName || party?.name || ''}
                placeholder="Registered / invoice name"
              />
            </Field>
            <Field label="Display / trading name">
              <input className="input" name="displayName" defaultValue={party?.displayName ?? ''} />
            </Field>
            <Field label="Legal name (copy)">
              <input className="input" name="legalName" defaultValue={party?.legalName || party?.name || ''} />
            </Field>
            <div className="party-role-row">
              <label className="party-check">
                <input type="checkbox" name="isCustomer" value="on" defaultChecked={isCustomerDefault} />
                Customer
              </label>
              <label className="party-check">
                <input type="checkbox" name="isVendor" value="on" defaultChecked={isVendorDefault} />
                Vendor
              </label>
              <span className="party-hint">Same entity can be both roles</span>
            </div>
            <Field label="Status">
              <select className="input" name="status" defaultValue={party?.status ?? 'active'}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="blocked">Blocked</option>
              </select>
            </Field>
            <Field label="Notes" full>
              <input className="input" name="notes" defaultValue={party?.notes ?? ''} />
            </Field>
          </div>
        </div>

        <div className="party-tab-panel" hidden={tab !== 'tax'}>
          <div className="party-tab-grid">
            <Field label="Tax status">
              <select className="input" name="taxStatus" defaultValue={party?.taxStatus ?? 'unknown'}>
                <option value="unknown">Unknown</option>
                <option value="unregistered">Unregistered</option>
                <option value="registered">Registered</option>
                <option value="exempt">Exempt</option>
              </select>
            </Field>
            <Field label="TIN">
              <input className="input" name="tin" defaultValue={party?.tin ?? party?.taxId ?? ''} />
            </Field>
            <Field label="VAT number">
              <input className="input" name="vatNumber" defaultValue={party?.vatNumber ?? ''} />
            </Field>
            <Field label="SVAT number">
              <input className="input" name="svatNumber" defaultValue={party?.svatNumber ?? ''} />
            </Field>
            <Field label="BRN">
              <input className="input" name="brn" defaultValue={party?.brn ?? ''} />
            </Field>
            <Field label="NIC">
              <input className="input" name="nic" defaultValue={party?.nic ?? ''} />
            </Field>
          </div>
        </div>

        <div className="party-tab-panel" hidden={tab !== 'contact'}>
          <div className="party-tab-grid">
            <Field label="Mobile / WhatsApp">
              <input
                className="input"
                name="phoneMobile"
                defaultValue={party?.phoneMobile ?? party?.phone ?? ''}
                placeholder="+94..."
              />
            </Field>
            <Field label="Landline">
              <input className="input" name="phoneLandline" defaultValue={party?.phoneLandline ?? ''} />
            </Field>
            <Field label="Email">
              <input className="input" name="email" type="email" defaultValue={party?.email ?? ''} />
            </Field>
            <Field label="Website">
              <input className="input" name="website" defaultValue={party?.website ?? ''} />
            </Field>
            <Field label="Contact person">
              <input className="input" name="contactPerson" defaultValue={party?.contactPerson ?? ''} />
            </Field>
            <Field label="Contact phone">
              <input className="input" name="contactPhone" defaultValue={party?.contactPhone ?? ''} />
            </Field>
            <Field label="Contact email">
              <input className="input" name="contactEmail" type="email" defaultValue={party?.contactEmail ?? ''} />
            </Field>
          </div>
        </div>

        <div className="party-tab-panel" hidden={tab !== 'address'}>
          <div className="party-tab-grid">
            <Field label="Address line 1" full>
              <input
                className="input"
                name="addressLine1"
                defaultValue={party?.addressLine1 ?? party?.address ?? ''}
              />
            </Field>
            <Field label="Address line 2" full>
              <input className="input" name="addressLine2" defaultValue={party?.addressLine2 ?? ''} />
            </Field>
            <Field label="City">
              <input className="input" name="city" defaultValue={party?.city ?? ''} />
            </Field>
            <Field label="District">
              <input className="input" name="district" defaultValue={party?.district ?? ''} />
            </Field>
            <Field label="Province">
              <select className="input" name="province" defaultValue={party?.province ?? ''}>
                <option value="">—</option>
                {SL_PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Postal code">
              <input className="input" name="postalCode" defaultValue={party?.postalCode ?? ''} />
            </Field>
            <Field label="Country">
              <input className="input" name="country" defaultValue={party?.country ?? 'Sri Lanka'} />
            </Field>
          </div>
        </div>

        <div className="party-tab-panel" hidden={tab !== 'terms'}>
          <div className="party-tab-grid">
            <Field label="Credit limit (LKR)">
              <input
                className="input"
                name="creditLimit"
                inputMode="decimal"
                defaultValue={party?.creditLimit ?? ''}
              />
            </Field>
            <Field label="Payment terms">
              <select
                className="input"
                name="paymentTermsDays"
                defaultValue={String(party?.paymentTermsDays ?? '0')}
              >
                {[0, 7, 14, 30, 45, 60, 90].map((d) => (
                  <option key={d} value={d}>
                    {d === 0 ? 'Due on receipt' : `${d} days`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Currency">
              <input className="input" name="preferredCurrency" defaultValue={party?.preferredCurrency ?? 'LKR'} />
            </Field>
          </div>
        </div>

        <div className="party-tab-panel" hidden={tab !== 'bank'}>
          <div className="party-tab-grid">
            <Field label="Bank name">
              <input className="input" name="bankName" defaultValue={party?.bankName ?? ''} />
            </Field>
            <Field label="Branch">
              <input className="input" name="bankBranch" defaultValue={party?.bankBranch ?? ''} />
            </Field>
            <Field label="Account name">
              <input className="input" name="bankAccountName" defaultValue={party?.bankAccountName ?? ''} />
            </Field>
            <Field label="Account number">
              <input className="input" name="bankAccountNo" defaultValue={party?.bankAccountNo ?? ''} />
            </Field>
            <Field label="SWIFT">
              <input className="input" name="bankSwift" defaultValue={party?.bankSwift ?? ''} />
            </Field>
          </div>
        </div>

        <div className="party-form-footer">
          <Link href={backHref}>
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </Link>
          <Button variant="primary" type="submit">
            {mode === 'edit' ? 'Save changes' : roleContext === 'vendor' ? 'Save vendor' : 'Save customer'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`field ${full ? 'field-full' : ''}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}
