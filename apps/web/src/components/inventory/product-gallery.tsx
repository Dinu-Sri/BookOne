'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { updateProductImageFromForm, uploadProductImagesFromForm, type ProductCatalogEditor } from '@/app/actions/product-catalog';
import { Button } from '@/components/ui/bookone-ui';
import { withFormPending } from '@/components/ui/form-busy';
import { TextField } from '@/components/ui/text-field';

/** Product photos for websites (Commerce WP1): upload, reorder, alt text, remove. */
export function ProductGallery({
  productId,
  images,
  canWrite,
}: {
  productId: string;
  images: ProductCatalogEditor['images'];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string; added?: number }>, success: string) {
    setError(null);
    setStatus(null);
    const res = await withFormPending(fn);
    if (!res.ok) setError(res.error ?? 'Something went wrong.');
    else {
      setStatus(res.added ? `${res.added} image${res.added === 1 ? '' : 's'} added.` : success);
      router.refresh();
    }
  }

  function act(imageId: string, op: string, extra?: Record<string, string>) {
    const fd = new FormData();
    fd.set('productId', productId);
    fd.set('imageId', imageId);
    fd.set('op', op);
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    void run(() => updateProductImageFromForm(fd), op === 'delete' ? 'Image removed.' : 'Saved.');
  }

  return (
    <section className="commerce-card" aria-labelledby="gallery-title" style={{ marginTop: 16 }}>
      <h2 className="commerce-section-title" id="gallery-title">
        Photos for online stores
      </h2>
      <p className="field-help">
        Upload large, clear photos (at least 1600 px on the long side). BookOne keeps them up to 2000 px; websites
        download them from a stable link. The first photo is the main one and also becomes the POS photo if none is set.
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="form-success" role="status">
          {status}
        </p>
      ) : null}
      {images.length ? (
        <ol className="commerce-key-list" style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
          {images.map((img, i) => (
            <li key={img.id} style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 12, alignItems: 'start' }}>
              {img.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.url} alt={img.alt ?? ''} width={96} height={96} style={{ objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} />
              ) : (
                <span className="field-help">No preview</span>
              )}
              <div style={{ display: 'grid', gap: 6 }}>
                <span className="field-help">
                  {i === 0 ? 'Main photo · ' : ''}
                  {img.width}×{img.height}px{img.width < 1600 && img.height < 1600 ? ' · smaller than 1600 px' : ''}
                </span>
                {canWrite ? (
                  <form
                    className="form-grid"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const alt = new FormData(e.currentTarget).get('alt');
                      act(img.id, 'alt', { alt: String(alt ?? '') });
                    }}
                  >
                    <TextField id={`img-alt-${img.id}`} name="alt" label="Description (alt text)" defaultValue={img.alt ?? ''} />
                    <div className="commerce-inline-actions" style={{ alignSelf: 'end' }}>
                      <Button type="submit">Save</Button>
                      {i > 0 ? (
                        <Button type="button" onClick={() => act(img.id, 'first')}>
                          Make main
                        </Button>
                      ) : null}
                      {i > 0 ? (
                        <Button type="button" onClick={() => act(img.id, 'up')} aria-label="Move up">
                          ↑
                        </Button>
                      ) : null}
                      {i < images.length - 1 ? (
                        <Button type="button" onClick={() => act(img.id, 'down')} aria-label="Move down">
                          ↓
                        </Button>
                      ) : null}
                      <Button type="button" variant="ghost" onClick={() => act(img.id, 'delete')}>
                        Remove
                      </Button>
                    </div>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="field-help">No photos yet.</p>
      )}
      {canWrite ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set('productId', productId);
            const form = e.currentTarget;
            void run(() => uploadProductImagesFromForm(fd), 'Uploaded.').then(() => form.reset());
          }}
          className="form-grid"
        >
          <div className="field">
            <label htmlFor="gallery-files">Add photos</label>
            <input id="gallery-files" className="input" type="file" name="images" accept="image/jpeg,image/png,image/webp" multiple required />
          </div>
          <div style={{ alignSelf: 'end' }}>
            <Button type="submit" variant="primary">
              Upload
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
