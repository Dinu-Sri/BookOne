'use client';

import Link from 'next/link';
import { activateDocumentStyle, saveDocumentStyle, type DocumentStyleRow } from '@/app/actions/document-styles';
import { DOCUMENT_STYLE_KINDS, kindLabel, type DocumentStyleKind } from '@/lib/document-style';
import { Button } from '@/components/ui/bookone-ui';

export function DocumentStyleForm({
  style,
  brands,
}: {
  style?: DocumentStyleRow | null;
  brands: { id: string; name: string }[];
}) {
  const kind = (style?.docKind ?? 'invoice') as DocumentStyleKind;
  const taxLocked = kind === 'tax_invoice' || !style;

  return (
    <form action={saveDocumentStyle} className="party-form-body" style={{ padding: 16 }}>
      {style ? <input type="hidden" name="id" value={style.id} /> : null}
      <div className="party-tab-grid">
        <div className="field">
          <label>Style name</label>
          <input className="input" name="name" required defaultValue={style?.name ?? ''} placeholder="Shop invoice" />
        </div>
        <div className="field">
          <label>Document</label>
          <select className="input" name="docKind" defaultValue={style?.docKind ?? 'invoice'}>
            {DOCUMENT_STYLE_KINDS.map((k) => (
              <option value={k} key={k}>
                {kindLabel(k)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Brand (optional)</label>
          <select className="input" name="brandId" defaultValue={style?.brandId ?? ''}>
            <option value="">All brands</option>
            {brands.map((b) => (
              <option value={b.id} key={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Accent colour</label>
          <input className="input" name="accentColor" type="color" defaultValue={style?.accentColor ?? '#1e3a8a'} />
        </div>
        <div className="field">
          <label>Logo position</label>
          <select className="input" name="logoPosition" defaultValue={style?.logoPosition ?? 'left'}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
        <div className="field">
          <label>Font</label>
          <select className="input" name="fontFamily" defaultValue={style?.fontFamily ?? 'Arial, Helvetica, sans-serif'}>
            <option value="Arial, Helvetica, sans-serif">Arial</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="Trebuchet MS, sans-serif">Trebuchet</option>
          </select>
        </div>
        <div className="field field-full">
          <label>Letterhead logo</label>
          <input className="input" name="logo" type="file" accept="image/*" />
          {style?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={style.logoUrl} alt="" style={{ maxHeight: 48, marginTop: 8 }} />
          ) : null}
        </div>
        <label className="auth-check" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="showSku" defaultChecked={style?.showSku ?? true} />
          Show SKU / ref column
        </label>
        <label className="auth-check" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="showTin" defaultChecked={style?.showTin ?? true} disabled={taxLocked && kind === 'tax_invoice'} />
          Show TIN
        </label>
        {kind === 'tax_invoice' ? <input type="hidden" name="showTin" value="1" /> : null}
        <label className="auth-check" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="showPhone" defaultChecked={style?.showPhone ?? true} />
          Show phone
        </label>
        <label className="auth-check" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="showEmail" defaultChecked={style?.showEmail ?? true} />
          Show email
        </label>
        <label className="auth-check" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="showBank" defaultChecked={style?.showBank ?? false} />
          Show bank details
        </label>
        <div className="field field-full">
          <label>Bank details</label>
          <textarea className="input" name="bankDetails" rows={3} defaultValue={style?.bankDetails ?? ''} />
        </div>
        <label className="auth-check field-full" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="makeActive" defaultChecked />
          Make this the active style for this document type
        </label>
        <div className="field field-full">
          <label>Footer notes</label>
          <textarea className="input" name="footerNotes" rows={3} defaultValue={style?.footerNotes ?? ''} />
          {kind === 'tax_invoice' ? (
            <p className="party-hint">Tax invoice always prints supplier/purchaser TIN, tax invoice number, VAT, and amount in words. Those blocks cannot be turned off.</p>
          ) : null}
        </div>
      </div>
      <div className="company-form-footer">
        <div className="company-form-footer-actions">
          <Link href="/company/document-styles" className="btn-secondary" style={{ padding: '8px 12px' }}>
            Cancel
          </Link>
          <Button variant="primary" type="submit">
            {style ? 'Save style' : 'Create style'}
          </Button>
        </div>
      </div>
      {style ? (
        <p className="muted-line">Version {style.version}. Saving makes v{style.version + 1}. Posted documents keep the version they first printed.</p>
      ) : null}
    </form>
  );
}

export function ActivateStyleButton({ id, active }: { id: string; active: boolean }) {
  if (active) return <span className="muted-line">Active</span>;
  return (
    <form action={activateDocumentStyle}>
      <input type="hidden" name="id" value={id} />
      <Button variant="secondary" type="submit">
        Make active
      </Button>
    </form>
  );
}
