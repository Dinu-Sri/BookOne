import {
  createPartyFromForm,
  updatePartyFromForm,
  type PartyRow,
} from '@/app/actions/parties';
import { Button } from '@/components/ui/bookone-ui';

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

export function PartyForm({
  mode,
  roleContext,
  party,
}: {
  mode: 'create' | 'edit';
  roleContext: 'customer' | 'vendor';
  party?: PartyRow | null;
}) {
  const action = mode === 'edit' ? updatePartyFromForm : createPartyFromForm;
  const isCustomerDefault = party?.isCustomer ?? roleContext === 'customer';
  const isVendorDefault = party?.isVendor ?? roleContext === 'vendor';

  return (
    <form action={action} className="form-grid">
      {mode === 'edit' && party ? <input type="hidden" name="id" value={party.id} /> : null}
      {mode === 'create' && roleContext === 'customer' ? <input type="hidden" name="forceCustomer" value="1" /> : null}
      {mode === 'create' && roleContext === 'vendor' ? <input type="hidden" name="forceVendor" value="1" /> : null}

      <div className="field field-full">
        <p className="eyebrow">Identity</p>
      </div>
      <div className="field">
        <label>Party type</label>
        <select className="input" name="partyType" defaultValue={party?.partyType ?? 'company'}>
          <option value="company">Company</option>
          <option value="individual">Individual</option>
          <option value="government">Government / SOE</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="field">
        <label>Code</label>
        <input className="input" name="code" defaultValue={party?.code ?? ''} placeholder="Auto if blank" />
      </div>
      <div className="field field-full">
        <label>Legal name *</label>
        <input
          className="input"
          name="name"
          required
          defaultValue={party?.legalName || party?.name || ''}
          placeholder="Registered / invoice name"
        />
      </div>
      <div className="field">
        <label>Display / trading name</label>
        <input className="input" name="displayName" defaultValue={party?.displayName ?? ''} placeholder="Shop name" />
      </div>
      <div className="field">
        <label>Legal name (copy)</label>
        <input className="input" name="legalName" defaultValue={party?.legalName || party?.name || ''} />
      </div>
      <div className="field field-full" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="isCustomer" value="on" defaultChecked={isCustomerDefault} />
          Customer (sales)
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="isVendor" value="on" defaultChecked={isVendorDefault} />
          Vendor (purchase)
        </label>
        <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
          Same legal entity can be both — one master record.
        </span>
      </div>

      <div className="field field-full" style={{ marginTop: 8 }}>
        <p className="eyebrow">Tax (Sri Lanka)</p>
      </div>
      <div className="field">
        <label>Tax status</label>
        <select className="input" name="taxStatus" defaultValue={party?.taxStatus ?? 'unknown'}>
          <option value="unknown">Unknown</option>
          <option value="unregistered">Unregistered</option>
          <option value="registered">Registered</option>
          <option value="exempt">Exempt</option>
        </select>
      </div>
      <div className="field">
        <label>TIN</label>
        <input className="input" name="tin" defaultValue={party?.tin ?? party?.taxId ?? ''} />
      </div>
      <div className="field">
        <label>VAT number</label>
        <input className="input" name="vatNumber" defaultValue={party?.vatNumber ?? ''} />
      </div>
      <div className="field">
        <label>SVAT number</label>
        <input className="input" name="svatNumber" defaultValue={party?.svatNumber ?? ''} />
      </div>
      <div className="field">
        <label>BRN (business reg.)</label>
        <input className="input" name="brn" defaultValue={party?.brn ?? ''} />
      </div>
      <div className="field">
        <label>NIC (individual)</label>
        <input className="input" name="nic" defaultValue={party?.nic ?? ''} />
      </div>

      <div className="field field-full" style={{ marginTop: 8 }}>
        <p className="eyebrow">Contact</p>
      </div>
      <div className="field">
        <label>Mobile / WhatsApp</label>
        <input className="input" name="phoneMobile" defaultValue={party?.phoneMobile ?? party?.phone ?? ''} placeholder="+94..." />
      </div>
      <div className="field">
        <label>Landline</label>
        <input className="input" name="phoneLandline" defaultValue={party?.phoneLandline ?? ''} />
      </div>
      <div className="field">
        <label>Email</label>
        <input className="input" name="email" type="email" defaultValue={party?.email ?? ''} />
      </div>
      <div className="field">
        <label>Website</label>
        <input className="input" name="website" defaultValue={party?.website ?? ''} />
      </div>
      <div className="field">
        <label>Contact person</label>
        <input className="input" name="contactPerson" defaultValue={party?.contactPerson ?? ''} />
      </div>
      <div className="field">
        <label>Contact phone</label>
        <input className="input" name="contactPhone" defaultValue={party?.contactPhone ?? ''} />
      </div>
      <div className="field">
        <label>Contact email</label>
        <input className="input" name="contactEmail" type="email" defaultValue={party?.contactEmail ?? ''} />
      </div>

      <div className="field field-full" style={{ marginTop: 8 }}>
        <p className="eyebrow">Address</p>
      </div>
      <div className="field field-full">
        <label>Address line 1</label>
        <input className="input" name="addressLine1" defaultValue={party?.addressLine1 ?? party?.address ?? ''} />
      </div>
      <div className="field field-full">
        <label>Address line 2</label>
        <input className="input" name="addressLine2" defaultValue={party?.addressLine2 ?? ''} />
      </div>
      <div className="field">
        <label>City</label>
        <input className="input" name="city" defaultValue={party?.city ?? ''} />
      </div>
      <div className="field">
        <label>District</label>
        <input className="input" name="district" defaultValue={party?.district ?? ''} />
      </div>
      <div className="field">
        <label>Province</label>
        <select className="input" name="province" defaultValue={party?.province ?? ''}>
          <option value="">—</option>
          {SL_PROVINCES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Postal code</label>
        <input className="input" name="postalCode" defaultValue={party?.postalCode ?? ''} />
      </div>
      <div className="field">
        <label>Country</label>
        <input className="input" name="country" defaultValue={party?.country ?? 'Sri Lanka'} />
      </div>

      <div className="field field-full" style={{ marginTop: 8 }}>
        <p className="eyebrow">Credit & terms</p>
      </div>
      <div className="field">
        <label>Credit limit (LKR)</label>
        <input className="input" name="creditLimit" inputMode="decimal" defaultValue={party?.creditLimit ?? ''} />
      </div>
      <div className="field">
        <label>Payment terms (days)</label>
        <select className="input" name="paymentTermsDays" defaultValue={String(party?.paymentTermsDays ?? '0')}>
          {[0, 7, 14, 30, 45, 60, 90].map((d) => (
            <option key={d} value={d}>{d === 0 ? 'Due on receipt' : `${d} days`}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Currency</label>
        <input className="input" name="preferredCurrency" defaultValue={party?.preferredCurrency ?? 'LKR'} />
      </div>
      <div className="field">
        <label>Status</label>
        <select className="input" name="status" defaultValue={party?.status ?? 'active'}>
          <option value="active">Active</option>
          <option value="inactive">Inactive (archived)</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>

      <div className="field field-full" style={{ marginTop: 8 }}>
        <p className="eyebrow">Banking (payments / refunds)</p>
      </div>
      <div className="field">
        <label>Bank name</label>
        <input className="input" name="bankName" defaultValue={party?.bankName ?? ''} placeholder="e.g. Commercial Bank" />
      </div>
      <div className="field">
        <label>Branch</label>
        <input className="input" name="bankBranch" defaultValue={party?.bankBranch ?? ''} />
      </div>
      <div className="field">
        <label>Account name</label>
        <input className="input" name="bankAccountName" defaultValue={party?.bankAccountName ?? ''} />
      </div>
      <div className="field">
        <label>Account number</label>
        <input className="input" name="bankAccountNo" defaultValue={party?.bankAccountNo ?? ''} />
      </div>
      <div className="field">
        <label>SWIFT</label>
        <input className="input" name="bankSwift" defaultValue={party?.bankSwift ?? ''} />
      </div>

      <div className="field field-full">
        <label>Notes</label>
        <input className="input" name="notes" defaultValue={party?.notes ?? ''} />
      </div>

      <div className="field field-full">
        <Button variant="primary" type="submit">
          {mode === 'edit' ? 'Save changes' : roleContext === 'vendor' ? 'Save vendor' : 'Save customer'}
        </Button>
      </div>
    </form>
  );
}
