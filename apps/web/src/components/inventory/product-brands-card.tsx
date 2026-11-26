'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveProductBrandFromForm } from '@/app/actions/product-catalog';
import { Button } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { withFormPending } from '@/components/ui/form-busy';
import { TextField } from '@/components/ui/text-field';

/** Manufacturer brands shown on websites (Commerce WP1). Not the company's own trading brands. */
export function ProductBrandsCard({
  brands,
  canWrite,
}: {
  brands: Array<{ id: string; name: string; websiteUrl: string | null; productCount: number }>;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [archive, setArchive] = useState<{ id: string; name: string } | null>(null);

  async function submit(fd: FormData) {
    setError(null);
    const res = await withFormPending(() => saveProductBrandFromForm(fd));
    if (!res.ok) setError(res.error ?? 'Could not save the brand.');
    else router.refresh();
    return res.ok;
  }

  return (
    <div className="commerce-panel-stack">
      <p className="field-help">
        The makers of the products you sell, e.g. Winsor &amp; Newton. Websites show and filter by these. Your company&apos;s
        own trading brands stay under Company → Brands.
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {brands.length ? (
        <div className="commerce-table-scroll" tabIndex={0} role="region" aria-label="Product brands">
          <table className="commerce-table">
            <thead>
              <tr>
                <th>Brand</th>
                <th>Website</th>
                <th>Products</th>
                {canWrite ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.websiteUrl ?? '—'}</td>
                  <td>{b.productCount}</td>
                  {canWrite ? (
                    <td>
                      <Button type="button" variant="ghost" onClick={() => setArchive({ id: b.id, name: b.name })}>
                        Archive
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="field-help">No product brands yet.</p>
      )}
      {canWrite ? (
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            void submit(new FormData(form)).then((ok) => ok && form.reset());
          }}
        >
          <TextField id="brand-name" name="name" label="Brand name" required />
          <TextField id="brand-site" name="websiteUrl" label="Website (optional)" placeholder="https://" />
          <div style={{ alignSelf: 'end' }}>
            <Button type="submit">Add brand</Button>
          </div>
        </form>
      ) : null}
      <ConfirmDialog
        open={Boolean(archive)}
        title={`Archive ${archive?.name ?? 'brand'}?`}
        message="Products keep working; they just show no brand on websites."
        confirmLabel="Archive"
        tone="danger"
        onCancel={() => setArchive(null)}
        onConfirm={() => {
          if (!archive) return;
          const fd = new FormData();
          fd.set('id', archive.id);
          fd.set('archive', '1');
          setArchive(null);
          void submit(fd);
        }}
      />
    </div>
  );
}
