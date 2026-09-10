'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Plus, Save, Trash2 } from 'lucide-react';
import {
  createProductCategoryFromForm,
  deleteProductCategoryFromForm,
  getCategoryDeleteBlockers,
  renameProductCategoryFromForm,
  type ProductCategoryRow,
} from '@/app/actions/product-categories';
import { Badge, Button } from '@/components/ui/bookone-ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type ActionState = { ok: boolean; error?: string; message?: string };
const initialState: ActionState = { ok: false };

function useRefreshOnSuccess(state: ActionState) {
  const router = useRouter();
  const prev = useRef(initialState);
  useEffect(() => {
    if (!state.ok) {
      prev.current = state;
      return;
    }
    if (prev.current === state) return;
    prev.current = state;
    router.refresh();
  }, [state, router]);
}

export function CategoryForms({ categories }: { categories: ProductCategoryRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ProductCategoryRow | null>(null);
  const [block, setBlock] = useState<{ category: ProductCategoryRow; reasons: string[] } | null>(null);

  async function requestDelete(category: ProductCategoryRow) {
    setBusy(true);
    try {
      const blockers = await getCategoryDeleteBlockers(category.id);
      if (!blockers.ok) {
        setBlock({ category, reasons: blockers.reasons });
        return;
      }
      setConfirm(category);
    } catch (error) {
      setBlock({
        category,
        reasons: [error instanceof Error ? error.message : 'Could not check this category.'],
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
      await deleteProductCategoryFromForm(fd);
      setConfirm(null);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not delete category.';
      setBlock({ category: confirm, reasons: [message.replace(/^Cannot delete:\s*/i, '')] });
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <CategoryForm />
      <div className="inline-edit-list">
        {categories.length === 0 ? <p className="muted-line">No categories yet. Add one above, or from a product.</p> : null}
        {categories.map((category) => (
          <CategoryForm
            key={category.id}
            category={category}
            busy={busy}
            onDelete={() => requestDelete(category)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete category?"
        message={confirm ? `Remove “${confirm.name}”? Nothing is using it.` : undefined}
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
          <strong>{block?.category.name}</strong> is already in use:
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

function CategoryForm({
  category,
  busy,
  onDelete,
}: {
  category?: ProductCategoryRow;
  busy?: boolean;
  onDelete?: () => void;
}) {
  const action = category ? renameProductCategoryFromForm : createProductCategoryFromForm;
  const [state, formAction] = useActionState(action, initialState);
  const isEdit = Boolean(category);
  useRefreshOnSuccess(state);

  return (
    <form action={formAction} className={`company-inline-form ${isEdit ? 'is-edit' : 'is-create'}`}>
      {category ? <input type="hidden" name="id" value={category.id} /> : null}
      <div className="field">
        <label>Category name</label>
        <input
          className="input"
          name="name"
          required
          defaultValue={category?.name ?? ''}
          placeholder="e.g. Chairs"
        />
      </div>
      {isEdit ? (
        <div className="field">
          <label>Products</label>
          <Badge tone="neutral">{category?.productCount ?? 0} product{(category?.productCount ?? 0) === 1 ? '' : 's'}</Badge>
        </div>
      ) : (
        <div className="field">
          <p className="party-hint" style={{ marginTop: 22 }}>
            Used on products, POS filters, and a later website sync.
          </p>
        </div>
      )}
      <div className="company-form-footer field-full">
        {state.error ? <span className="form-error inline">{state.error}</span> : null}
        {state.message ? <span className="entry-result success inline">{state.message}</span> : <span />}
        <div className="company-form-footer-actions">
          {isEdit && onDelete ? (
            <Button
              variant="secondary"
              type="button"
              className="modal-confirm-danger"
              onClick={onDelete}
              disabled={busy}
              data-testid="delete-category"
            >
              <Trash2 size={16} />
              Delete
            </Button>
          ) : null}
          <SubmitButton icon={isEdit ? <Save size={16} /> : <Plus size={16} />}>
            {isEdit ? 'Save category' : 'Add category'}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
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
