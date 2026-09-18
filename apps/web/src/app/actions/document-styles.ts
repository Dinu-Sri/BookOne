'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@bookone/auth';
import {
  and,
  brands,
  db,
  documentStyles,
  eq,
  isNull,
  sql,
  withTenantContext,
} from '@bookone/db';
import { assertPermission } from '@/lib/access';
import {
  DOCUMENT_STYLE_KINDS,
  defaultDocumentStyle,
  type DocumentStyleKind,
  type DocumentStyleSnapshot,
} from '@/lib/document-style';
import { resolveProductImageUrl, saveLetterheadLogo } from '@/lib/product-image';

export type DocumentStyleRow = {
  id: string;
  name: string;
  docKind: DocumentStyleKind;
  brandId: string | null;
  brandName: string | null;
  isActive: boolean;
  version: number;
  accentColor: string;
  logoImageKey: string | null;
  logoUrl: string | null;
  logoPosition: 'left' | 'center' | 'right';
  showSku: boolean;
  showTin: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showBank: boolean;
  bankDetails: string;
  footerNotes: string;
  fontFamily: string;
};

function asKind(v: string): DocumentStyleKind {
  return (DOCUMENT_STYLE_KINDS as readonly string[]).includes(v) ? (v as DocumentStyleKind) : 'invoice';
}

function onOff(v: FormDataEntryValue | null) {
  return v === 'on' || v === '1' || v === 'true' ? '1' : '0';
}

export async function listDocumentStyles(): Promise<DocumentStyleRow[]> {
  await assertPermission('company.document_styles.read', 'read');
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const rows = await db()
      .select({
        style: documentStyles,
        brandName: brands.name,
      })
      .from(documentStyles)
      .leftJoin(brands, eq(brands.id, documentStyles.brandId))
      .where(and(eq(documentStyles.tenantId, user.tenantId), isNull(documentStyles.voidedAt)))
      .orderBy(documentStyles.docKind, documentStyles.name);
    return Promise.all(
      rows.map(async ({ style, brandName }) => ({
        id: style.id,
        name: style.name,
        docKind: asKind(style.docKind),
        brandId: style.brandId,
        brandName: brandName ?? null,
        isActive: style.isActive === '1',
        version: style.version,
        accentColor: style.accentColor,
        logoImageKey: style.logoImageKey,
        logoUrl: await resolveProductImageUrl(style.logoImageKey),
        logoPosition: (style.logoPosition as DocumentStyleRow['logoPosition']) || 'left',
        showSku: style.showSku === '1',
        showTin: style.showTin === '1',
        showPhone: style.showPhone === '1',
        showEmail: style.showEmail === '1',
        showBank: style.showBank === '1',
        bankDetails: style.bankDetails ?? '',
        footerNotes: style.footerNotes ?? '',
        fontFamily: style.fontFamily,
      })),
    );
  });
}

export async function getDocumentStyle(id: string): Promise<DocumentStyleRow | null> {
  const rows = await listDocumentStyles();
  return rows.find((r) => r.id === id) ?? null;
}

export async function saveDocumentStyle(formData: FormData) {
  await assertPermission('company.document_styles.write', 'write');
  const user = await requireTenantContext();
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim() || 'Untitled style';
  const docKind = asKind(String(formData.get('docKind') ?? 'invoice'));
  const brandId = String(formData.get('brandId') ?? '').trim() || null;
  const accentColor = String(formData.get('accentColor') ?? '#1e3a8a');
  const logoPosition = String(formData.get('logoPosition') ?? 'left');
  const fontFamily = String(formData.get('fontFamily') ?? 'Arial, Helvetica, sans-serif');

  const idOut = await withTenantContext(user.tenantId, async () => {
    if (id) {
      const [existing] = await db()
        .select()
        .from(documentStyles)
        .where(and(eq(documentStyles.id, id), eq(documentStyles.tenantId, user.tenantId)))
        .limit(1);
      if (!existing) throw new Error('Style not found.');
      await db()
        .update(documentStyles)
        .set({
          name,
          docKind,
          brandId,
          accentColor: /^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : existing.accentColor,
          logoPosition: ['left', 'center', 'right'].includes(logoPosition) ? logoPosition : 'left',
          showSku: onOff(formData.get('showSku')),
          showTin: docKind === 'tax_invoice' ? '1' : onOff(formData.get('showTin')),
          showPhone: onOff(formData.get('showPhone')),
          showEmail: onOff(formData.get('showEmail')),
          showBank: onOff(formData.get('showBank')),
          bankDetails: String(formData.get('bankDetails') ?? ''),
          footerNotes: String(formData.get('footerNotes') ?? ''),
          fontFamily,
          version: existing.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(documentStyles.id, id));
      const logo = formData.get('logo');
      if (logo instanceof File && logo.size > 0) {
        const { imageKey } = await saveLetterheadLogo({ tenantId: user.tenantId, styleId: id, file: logo });
        await db().update(documentStyles).set({ logoImageKey: imageKey, updatedAt: new Date() }).where(eq(documentStyles.id, id));
      }
      return id;
    }

    const [created] = await db()
      .insert(documentStyles)
      .values({
        tenantId: user.tenantId,
        name,
        docKind,
        brandId,
        accentColor: /^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#1e3a8a',
        logoPosition: ['left', 'center', 'right'].includes(logoPosition) ? logoPosition : 'left',
        showSku: onOff(formData.get('showSku')),
        showTin: docKind === 'tax_invoice' ? '1' : onOff(formData.get('showTin')),
        showPhone: onOff(formData.get('showPhone')),
        showEmail: onOff(formData.get('showEmail')),
        showBank: onOff(formData.get('showBank')),
        bankDetails: String(formData.get('bankDetails') ?? ''),
        footerNotes: String(formData.get('footerNotes') ?? ''),
        fontFamily,
        isActive: '0',
        version: 1,
      })
      .returning({ id: documentStyles.id });
    const logo = formData.get('logo');
    if (logo instanceof File && logo.size > 0 && created) {
      const { imageKey } = await saveLetterheadLogo({ tenantId: user.tenantId, styleId: created.id, file: logo });
      await db().update(documentStyles).set({ logoImageKey: imageKey }).where(eq(documentStyles.id, created.id));
    }
    return created!.id;
  });

  revalidatePath('/company/document-styles');
  const { redirect } = await import('next/navigation');
  redirect(`/company/document-styles/${idOut}`);
}

export async function activateDocumentStyle(formData: FormData) {
  await assertPermission('company.document_styles.write', 'write');
  const user = await requireTenantContext();
  const id = String(formData.get('id') ?? '');
  await withTenantContext(user.tenantId, async () => {
    const [row] = await db()
      .select()
      .from(documentStyles)
      .where(and(eq(documentStyles.id, id), eq(documentStyles.tenantId, user.tenantId), isNull(documentStyles.voidedAt)))
      .limit(1);
    if (!row) throw new Error('Style not found.');
    await db()
      .update(documentStyles)
      .set({ isActive: '0', updatedAt: new Date() })
      .where(
        and(
          eq(documentStyles.tenantId, user.tenantId),
          eq(documentStyles.docKind, row.docKind),
          row.brandId ? eq(documentStyles.brandId, row.brandId) : sql`${documentStyles.brandId} is null`,
          isNull(documentStyles.voidedAt),
        ),
      );
    await db().update(documentStyles).set({ isActive: '1', updatedAt: new Date() }).where(eq(documentStyles.id, id));
  });
  revalidatePath('/company/document-styles');
}

export async function voidDocumentStyle(formData: FormData) {
  await assertPermission('company.document_styles.write', 'write');
  const user = await requireTenantContext();
  const id = String(formData.get('id') ?? '');
  await withTenantContext(user.tenantId, async () => {
    await db()
      .update(documentStyles)
      .set({ voidedAt: new Date(), isActive: '0', updatedAt: new Date() })
      .where(and(eq(documentStyles.id, id), eq(documentStyles.tenantId, user.tenantId)));
  });
  revalidatePath('/company/document-styles');
}

export async function styleToSnapshot(row: DocumentStyleRow): Promise<DocumentStyleSnapshot> {
  return {
    name: row.name,
    docKind: row.docKind,
    version: row.version,
    accentColor: row.accentColor,
    logoUrl: row.logoUrl,
    logoPosition: row.logoPosition,
    showSku: row.showSku,
    showTin: row.docKind === 'tax_invoice' ? true : row.showTin,
    showPhone: row.showPhone,
    showEmail: row.showEmail,
    showBank: row.showBank,
    bankDetails: row.bankDetails,
    footerNotes: row.footerNotes,
    fontFamily: row.fontFamily,
  };
}

export async function resolveActiveStyleSnapshot(
  tenantId: string,
  kind: DocumentStyleKind,
  brandId: string | null,
): Promise<DocumentStyleSnapshot> {
  const brandMatch = brandId
    ? await db()
        .select()
        .from(documentStyles)
        .where(
          and(
            eq(documentStyles.tenantId, tenantId),
            eq(documentStyles.docKind, kind),
            eq(documentStyles.brandId, brandId),
            eq(documentStyles.isActive, '1'),
            isNull(documentStyles.voidedAt),
          ),
        )
        .limit(1)
    : [];
  const [row] =
    brandMatch[0] ??
    (
      await db()
        .select()
        .from(documentStyles)
        .where(
          and(
            eq(documentStyles.tenantId, tenantId),
            eq(documentStyles.docKind, kind),
            sql`${documentStyles.brandId} is null`,
            eq(documentStyles.isActive, '1'),
            isNull(documentStyles.voidedAt),
          ),
        )
        .limit(1)
    );
  if (!row) return defaultDocumentStyle(kind);
  return {
    name: row.name,
    docKind: kind,
    version: row.version,
    accentColor: row.accentColor,
    logoUrl: await resolveProductImageUrl(row.logoImageKey),
    logoPosition: (row.logoPosition as DocumentStyleSnapshot['logoPosition']) || 'left',
    showSku: row.showSku === '1',
    showTin: kind === 'tax_invoice' ? true : row.showTin === '1',
    showPhone: row.showPhone === '1',
    showEmail: row.showEmail === '1',
    showBank: row.showBank === '1',
    bankDetails: row.bankDetails ?? '',
    footerNotes: row.footerNotes ?? '',
    fontFamily: row.fontFamily,
  };
}
