'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireTenantContext } from '@bookone/auth';
import { withTenantContext } from '@bookone/db';
import { defaultDesignInput, isPrintKind, type AssetSlot, type PrintKind } from '@bookone/print-design';
import { assertPermission, requireWriteOrRedirect } from '@/lib/access';
import {
  approveAndUse,
  deleteVersion,
  getVersion,
  removeAsset,
  saveAsset,
  saveDesign,
  stopUsing,
} from '@/lib/print-designs';

const HOME = '/company/print-designs';

function back(kind?: string | null) {
  return kind && isPrintKind(kind) ? `${HOME}?item=${kind}` : HOME;
}

function err(path: string, message: string) {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}err=${encodeURIComponent(message)}`;
}

/** Person only: approve a version and print with it from now on. */
export async function approvePrintDesign(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  await requireWriteOrRedirect('company.document_styles.write', `${HOME}/${id}`);
  const user = await requireTenantContext();
  const res = await approveAndUse(user.tenantId, id, user.id);
  if (!res.ok) redirect(err(`${HOME}/${id}`, res.error));
  revalidatePath(HOME);
  redirect(`${HOME}/${id}?done=approved`);
}

/** Person only: go back to the BookOne standard print for this item. */
export async function stopUsingPrintDesign(formData: FormData) {
  const kind = String(formData.get('kind') ?? '');
  const id = String(formData.get('id') ?? '');
  await requireWriteOrRedirect('company.document_styles.write', back(kind));
  if (!isPrintKind(kind)) redirect(HOME);
  const user = await requireTenantContext();
  await stopUsing(user.tenantId, kind);
  revalidatePath(HOME);
  redirect(id ? `${HOME}/${id}?done=stopped` : `${back(kind)}&done=stopped`);
}

/** Person only. Assistants have no delete tool. Documents that printed with it keep their copy. */
export async function deletePrintDesign(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  await requireWriteOrRedirect('company.document_styles.write', `${HOME}/${id}`);
  const user = await requireTenantContext();
  const res = await deleteVersion(user.tenantId, id, user.id);
  if (!res.ok) redirect(err(`${HOME}/${id}`, res.error));
  revalidatePath(HOME);
  redirect(`${back(res.kind)}&done=deleted`);
}

/** Start a new design for a print item from the BookOne starting design, then open the editor. */
export async function startPrintDesign(formData: FormData) {
  const kind = String(formData.get('kind') ?? '');
  await requireWriteOrRedirect('company.document_styles.write', back(kind));
  if (!isPrintKind(kind)) redirect(HOME);
  const user = await requireTenantContext();
  const name = String(formData.get('name') ?? '').trim() || 'My design';
  const res = await saveDesign({
    tenantId: user.tenantId,
    author: { via: 'person', userId: user.id },
    kind: kind as PrintKind,
    name,
    design: defaultDesignInput(kind as PrintKind),
    changeNote: 'Started from the BookOne starting design.',
  });
  if (!res.ok) redirect(err(back(kind), res.error));
  revalidatePath(HOME);
  redirect(`${HOME}/${res.designId}/edit`);
}

export type SaveDesignState =
  | { ok: true; designId: string }
  | { ok: false; error: string; problems?: Array<{ where: string; problem: string }> };

/** Save the editor's design as the next version (or a copy as a new design). Never overwrites. */
export async function savePrintDesignFromEditor(input: {
  basedOnId: string;
  designJson: string;
  name?: string;
  changeNote?: string;
  asNewDesign?: boolean;
}): Promise<SaveDesignState> {
  try {
    await assertPermission('company.document_styles.write', 'write');
  } catch {
    return { ok: false, error: 'Your job can view print designs but not change them.' };
  }
  const user = await requireTenantContext();
  let design: unknown;
  try {
    design = JSON.parse(input.designJson);
  } catch {
    return { ok: false, error: 'The design could not be read. Reload and try again.' };
  }
  const base = await getVersion(user.tenantId, input.basedOnId);
  if (!base) return { ok: false, error: 'That design was not found.' };
  const res = await saveDesign({
    tenantId: user.tenantId,
    author: { via: 'person', userId: user.id },
    ...(input.asNewDesign ? { kind: base.kind } : { basedOnId: base.id }),
    name: input.name,
    design,
    changeNote: input.changeNote,
  });
  if (!res.ok) return { ok: false, error: res.error, problems: res.problems };
  revalidatePath(HOME);
  return { ok: true, designId: res.designId };
}

const SLOTS: AssetSlot[] = ['logo', 'signature', 'stamp'];

export async function uploadPrintAsset(formData: FormData) {
  await requireWriteOrRedirect('company.document_styles.write', `${HOME}#images`);
  const slot = String(formData.get('slot') ?? '') as AssetSlot;
  const file = formData.get('file');
  if (!SLOTS.includes(slot)) redirect(HOME);
  if (!(file instanceof File) || file.size === 0) redirect(`${err(HOME, 'Choose an image file first.')}#images`);
  if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.type)) {
    redirect(`${err(HOME, 'Use a PNG, JPG, WebP or SVG image.')}#images`);
  }
  const user = await requireTenantContext();
  let imageKey: string;
  try {
    const { saveLetterheadLogo } = await import('@/lib/product-image');
    ({ imageKey } = await saveLetterheadLogo({ tenantId: user.tenantId, styleId: `print-${slot}`, file }));
  } catch (e) {
    redirect(`${err(HOME, e instanceof Error ? e.message : 'The image could not be saved.')}#images`);
  }
  await saveAsset(user.tenantId, slot, imageKey, user.id);
  revalidatePath(HOME);
  redirect(`${HOME}?done=image#images`);
}

export async function removePrintAsset(formData: FormData) {
  await requireWriteOrRedirect('company.document_styles.write', `${HOME}#images`);
  const slot = String(formData.get('slot') ?? '') as AssetSlot;
  if (!SLOTS.includes(slot)) redirect(HOME);
  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, () => removeAsset(user.tenantId, slot));
  revalidatePath(HOME);
  redirect(`${HOME}?done=image-removed#images`);
}
