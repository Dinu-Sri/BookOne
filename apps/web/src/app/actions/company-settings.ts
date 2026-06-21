'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { DEFAULT_CHART_OF_ACCOUNTS } from '@bookone/accounting';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  auditLog,
  brands,
  companyProfiles,
  db,
  eq,
  and,
  isNull,
  asc,
  financialYears,
  locations,
  taxProfiles,
  tenantMemberships,
  tenants,
  users,
  withTenantContext,
} from '@bookone/db';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const companyProfileSchema = z.object({
  legalName: z.string().min(1).max(255),
  tradingName: z.string().max(255).optional(),
  registrationNumber: z.string().max(100).optional(),
  country: z.string().min(1).max(100).default('Sri Lanka'),
  baseCurrency: z.string().min(3).max(5).default('LKR'),
  timezone: z.string().min(1).max(80).default('Asia/Colombo'),
  addressLine1: z.string().max(255).optional(),
  addressLine2: z.string().max(255).optional(),
  city: z.string().max(120).optional(),
  postalCode: z.string().max(40).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().or(z.literal('')).optional(),
});

const taxProfileSchema = z.object({
  tin: z.string().max(100).optional(),
  vatNumber: z.string().max(100).optional(),
  svatNumber: z.string().max(100).optional(),
  taxOffice: z.string().max(255).optional(),
  defaultTaxRate: z.string().max(20).default('0'),
  taxBasis: z.string().max(50).default('standard'),
  invoicePrefix: z.string().min(1).max(20).default('INV'),
  billPrefix: z.string().min(1).max(20).default('BILL'),
});

const financialYearSchema = z.object({
  label: z.string().min(1).max(80),
  startDate: dateSchema,
  endDate: dateSchema,
  status: z.enum(['open', 'closed']).default('open'),
});

const brandSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(40).optional(),
  notes: z.string().max(1000).optional(),
});

const locationSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(40).optional(),
  brandId: z.string().uuid().or(z.literal('')).optional(),
  locationType: z.string().max(50).default('branch'),
  address: z.string().max(500).optional(),
});

const createCompanySchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
  country: z.string().min(1).max(100).default('Sri Lanka'),
  baseCurrency: z.string().min(3).max(5).default('LKR'),
});

export interface CompanyActionState {
  ok: boolean;
  message?: string;
  error?: string;
}

const emptyActionState: CompanyActionState = { ok: false };

export interface CompanySettingsData {
  profile: {
    legalName: string;
    tradingName: string | null;
    registrationNumber: string | null;
    country: string;
    baseCurrency: string;
    timezone: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postalCode: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  tax: {
    tin: string | null;
    vatNumber: string | null;
    svatNumber: string | null;
    taxOffice: string | null;
    defaultTaxRate: string;
    taxBasis: string;
    invoicePrefix: string;
    billPrefix: string;
  } | null;
  financialYears: {
    id: string;
    label: string;
    startDate: string;
    endDate: string;
    status: string;
  }[];
  brands: {
    id: string;
    name: string;
    code: string | null;
    notes: string | null;
  }[];
  locations: {
    id: string;
    name: string;
    code: string | null;
    brandId: string | null;
    brandName: string | null;
    locationType: string;
    address: string | null;
  }[];
  companies: {
    id: string;
    name: string;
    slug: string;
    role: string;
    active: boolean;
  }[];
}

function nullable(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '');
}

function duplicateText(label: string): CompanyActionState {
  return { ok: false, error: `${label} already exists for this company.` };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

async function ensureMembership(tenantId: string, userId: string, role: string) {
  const [existing] = await db()
    .select({ id: tenantMemberships.id })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.tenantId, tenantId),
        eq(tenantMemberships.userId, userId),
        isNull(tenantMemberships.voidedAt),
      ),
    )
    .limit(1);

  if (!existing) {
    await db().insert(tenantMemberships).values({ tenantId, userId, role, status: 'active' });
  }
}

export async function getCompanySettingsData(): Promise<CompanySettingsData> {
  const user = await requireTenantContext();
  await ensureMembership(user.tenantId, user.id, user.role === 'admin' ? 'owner' : user.role);

  return withTenantContext(user.tenantId, async () => {
    const [profile] = await db()
      .select({
        legalName: companyProfiles.legalName,
        tradingName: companyProfiles.tradingName,
        registrationNumber: companyProfiles.registrationNumber,
        country: companyProfiles.country,
        baseCurrency: companyProfiles.baseCurrency,
        timezone: companyProfiles.timezone,
        addressLine1: companyProfiles.addressLine1,
        addressLine2: companyProfiles.addressLine2,
        city: companyProfiles.city,
        postalCode: companyProfiles.postalCode,
        phone: companyProfiles.phone,
        email: companyProfiles.email,
      })
      .from(companyProfiles)
      .where(and(eq(companyProfiles.tenantId, user.tenantId), isNull(companyProfiles.voidedAt)))
      .limit(1);

    const [tax] = await db()
      .select({
        tin: taxProfiles.tin,
        vatNumber: taxProfiles.vatNumber,
        svatNumber: taxProfiles.svatNumber,
        taxOffice: taxProfiles.taxOffice,
        defaultTaxRate: taxProfiles.defaultTaxRate,
        taxBasis: taxProfiles.taxBasis,
        invoicePrefix: taxProfiles.invoicePrefix,
        billPrefix: taxProfiles.billPrefix,
      })
      .from(taxProfiles)
      .where(and(eq(taxProfiles.tenantId, user.tenantId), isNull(taxProfiles.voidedAt)))
      .limit(1);

    const fyRows = await db()
      .select({
        id: financialYears.id,
        label: financialYears.label,
        startDate: financialYears.startDate,
        endDate: financialYears.endDate,
        status: financialYears.status,
      })
      .from(financialYears)
      .where(and(eq(financialYears.tenantId, user.tenantId), isNull(financialYears.voidedAt)))
      .orderBy(asc(financialYears.startDate));

    const brandRows = await db()
      .select({ id: brands.id, name: brands.name, code: brands.code, notes: brands.notes })
      .from(brands)
      .where(and(eq(brands.tenantId, user.tenantId), isNull(brands.voidedAt)))
      .orderBy(asc(brands.name));

    const locationRows = await db()
      .select({
        id: locations.id,
        name: locations.name,
        code: locations.code,
        brandId: locations.brandId,
        brandName: brands.name,
        locationType: locations.locationType,
        address: locations.address,
      })
      .from(locations)
      .leftJoin(brands, eq(brands.id, locations.brandId))
      .where(and(eq(locations.tenantId, user.tenantId), isNull(locations.voidedAt)))
      .orderBy(asc(locations.name));

    const companyRows = await db()
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        role: tenantMemberships.role,
      })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
      .where(and(eq(tenantMemberships.userId, user.id), isNull(tenantMemberships.voidedAt), isNull(tenants.voidedAt)))
      .orderBy(asc(tenants.name));

    return {
      profile: profile ?? null,
      tax: tax ?? null,
      financialYears: fyRows,
      brands: brandRows,
      locations: locationRows,
      companies: companyRows.map((company) => ({ ...company, active: company.id === user.tenantId })),
    };
  });
}

export async function saveCompanyProfile(formData: FormData): Promise<void> {
  const user = await requireTenantContext();
  const parsed = companyProfileSchema.parse({
    legalName: String(formData.get('legalName') ?? ''),
    tradingName: String(formData.get('tradingName') ?? ''),
    registrationNumber: String(formData.get('registrationNumber') ?? ''),
    country: String(formData.get('country') ?? 'Sri Lanka'),
    baseCurrency: String(formData.get('baseCurrency') ?? 'LKR'),
    timezone: String(formData.get('timezone') ?? 'Asia/Colombo'),
    addressLine1: String(formData.get('addressLine1') ?? ''),
    addressLine2: String(formData.get('addressLine2') ?? ''),
    city: String(formData.get('city') ?? ''),
    postalCode: String(formData.get('postalCode') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    email: String(formData.get('email') ?? ''),
  });

  await withTenantContext(user.tenantId, async () => {
    const [existing] = await db()
      .select({ id: companyProfiles.id })
      .from(companyProfiles)
      .where(and(eq(companyProfiles.tenantId, user.tenantId), isNull(companyProfiles.voidedAt)))
      .limit(1);

    const values = {
      legalName: parsed.legalName.trim(),
      tradingName: nullable(parsed.tradingName),
      registrationNumber: nullable(parsed.registrationNumber),
      country: parsed.country.trim(),
      baseCurrency: parsed.baseCurrency.trim().toUpperCase(),
      timezone: parsed.timezone.trim(),
      addressLine1: nullable(parsed.addressLine1),
      addressLine2: nullable(parsed.addressLine2),
      city: nullable(parsed.city),
      postalCode: nullable(parsed.postalCode),
      phone: nullable(parsed.phone),
      email: nullable(parsed.email),
      updatedAt: new Date(),
    };

    if (existing) {
      await db().update(companyProfiles).set(values).where(eq(companyProfiles.id, existing.id));
    } else {
      await db().insert(companyProfiles).values({ tenantId: user.tenantId, ...values });
    }

    await db().update(tenants).set({ name: parsed.legalName.trim(), updatedAt: new Date() }).where(eq(tenants.id, user.tenantId));
  });

  revalidatePath('/settings');
}

export async function saveTaxProfile(formData: FormData): Promise<void> {
  const user = await requireTenantContext();
  const parsed = taxProfileSchema.parse({
    tin: String(formData.get('tin') ?? ''),
    vatNumber: String(formData.get('vatNumber') ?? ''),
    svatNumber: String(formData.get('svatNumber') ?? ''),
    taxOffice: String(formData.get('taxOffice') ?? ''),
    defaultTaxRate: String(formData.get('defaultTaxRate') ?? '0'),
    taxBasis: String(formData.get('taxBasis') ?? 'standard'),
    invoicePrefix: String(formData.get('invoicePrefix') ?? 'INV'),
    billPrefix: String(formData.get('billPrefix') ?? 'BILL'),
  });

  await withTenantContext(user.tenantId, async () => {
    const [existing] = await db()
      .select({ id: taxProfiles.id })
      .from(taxProfiles)
      .where(and(eq(taxProfiles.tenantId, user.tenantId), isNull(taxProfiles.voidedAt)))
      .limit(1);

    const values = {
      tin: nullable(parsed.tin),
      vatNumber: nullable(parsed.vatNumber),
      svatNumber: nullable(parsed.svatNumber),
      taxOffice: nullable(parsed.taxOffice),
      defaultTaxRate: parsed.defaultTaxRate.trim() || '0',
      taxBasis: parsed.taxBasis.trim() || 'standard',
      invoicePrefix: parsed.invoicePrefix.trim().toUpperCase(),
      billPrefix: parsed.billPrefix.trim().toUpperCase(),
      updatedAt: new Date(),
    };

    if (existing) {
      await db().update(taxProfiles).set(values).where(eq(taxProfiles.id, existing.id));
    } else {
      await db().insert(taxProfiles).values({ tenantId: user.tenantId, ...values });
    }
  });

  revalidatePath('/settings');
}

export async function createFinancialYear(formData: FormData): Promise<void> {
  const user = await requireTenantContext();
  const parsed = financialYearSchema.parse({
    label: String(formData.get('label') ?? ''),
    startDate: String(formData.get('startDate') ?? ''),
    endDate: String(formData.get('endDate') ?? ''),
    status: String(formData.get('status') ?? 'open'),
  });

  await withTenantContext(user.tenantId, async () => {
    await db().insert(financialYears).values({ tenantId: user.tenantId, ...parsed });
  });
  revalidatePath('/settings');
}

export async function createBrand(formData: FormData): Promise<void> {
  const user = await requireTenantContext();
  const parsed = brandSchema.parse({
    name: String(formData.get('name') ?? ''),
    code: String(formData.get('code') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  });

  await withTenantContext(user.tenantId, async () => {
    await db().insert(brands).values({
      tenantId: user.tenantId,
      name: parsed.name.trim(),
      code: nullable(parsed.code),
      notes: nullable(parsed.notes),
    });
  });
  revalidatePath('/settings');
}

export async function saveBrandForm(_state: CompanyActionState = emptyActionState, formData: FormData): Promise<CompanyActionState> {
  const user = await requireTenantContext();
  const id = formString(formData, 'id').trim();
  const parsed = brandSchema.safeParse({
    name: formString(formData, 'name'),
    code: formString(formData, 'code'),
    notes: formString(formData, 'notes'),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the brand details.' };
  }

  const name = parsed.data.name.trim();
  const code = nullable(parsed.data.code)?.toUpperCase() ?? null;
  const notes = nullable(parsed.data.notes);

  try {
    await withTenantContext(user.tenantId, async () => {
      const existingRows = await db()
        .select({ id: brands.id, name: brands.name, code: brands.code })
        .from(brands)
        .where(and(eq(brands.tenantId, user.tenantId), isNull(brands.voidedAt)));

      const editing = Boolean(id);
      if (editing && !existingRows.some((brand) => brand.id === id)) {
        throw new Error('Brand was not found.');
      }

      const sameName = existingRows.some((brand) => brand.id !== id && brand.name.trim().toLowerCase() === name.toLowerCase());
      if (sameName) throw new Error('DUPLICATE_NAME');

      const sameCode = code
        ? existingRows.some((brand) => brand.id !== id && brand.code?.trim().toLowerCase() === code.toLowerCase())
        : false;
      if (sameCode) throw new Error('DUPLICATE_CODE');

      if (editing) {
        await db().update(brands).set({ name, code, notes, updatedAt: new Date() }).where(eq(brands.id, id));
      } else {
        await db().insert(brands).values({ tenantId: user.tenantId, name, code, notes });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'DUPLICATE_NAME') return duplicateText('Brand name');
    if (error instanceof Error && error.message === 'DUPLICATE_CODE') return duplicateText('Brand code');
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save brand.' };
  }

  revalidatePath('/company/brands');
  revalidatePath('/');
  return { ok: true, message: id ? 'Brand updated.' : 'Brand added.' };
}

export async function createLocation(formData: FormData): Promise<void> {
  const user = await requireTenantContext();
  const parsed = locationSchema.parse({
    name: String(formData.get('name') ?? ''),
    code: String(formData.get('code') ?? ''),
    brandId: String(formData.get('brandId') ?? ''),
    locationType: String(formData.get('locationType') ?? 'branch'),
    address: String(formData.get('address') ?? ''),
  });

  await withTenantContext(user.tenantId, async () => {
    await db().insert(locations).values({
      tenantId: user.tenantId,
      brandId: parsed.brandId || null,
      name: parsed.name.trim(),
      code: nullable(parsed.code),
      locationType: parsed.locationType.trim() || 'branch',
      address: nullable(parsed.address),
    });
  });
  revalidatePath('/settings');
}

export async function saveLocationForm(_state: CompanyActionState = emptyActionState, formData: FormData): Promise<CompanyActionState> {
  const user = await requireTenantContext();
  const id = formString(formData, 'id').trim();
  const parsed = locationSchema.safeParse({
    name: formString(formData, 'name'),
    code: formString(formData, 'code'),
    brandId: formString(formData, 'brandId'),
    locationType: formString(formData, 'locationType') || 'branch',
    address: formString(formData, 'address'),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the location details.' };
  }

  const name = parsed.data.name.trim();
  const code = nullable(parsed.data.code)?.toUpperCase() ?? null;
  const brandId = parsed.data.brandId || null;
  const locationType = parsed.data.locationType.trim() || 'branch';
  const address = nullable(parsed.data.address);

  try {
    await withTenantContext(user.tenantId, async () => {
      const [brand] = brandId
        ? await db()
            .select({ id: brands.id })
            .from(brands)
            .where(and(eq(brands.tenantId, user.tenantId), eq(brands.id, brandId), isNull(brands.voidedAt)))
            .limit(1)
        : [];
      if (brandId && !brand) throw new Error('Selected brand was not found.');

      const existingRows = await db()
        .select({ id: locations.id, name: locations.name, code: locations.code })
        .from(locations)
        .where(and(eq(locations.tenantId, user.tenantId), isNull(locations.voidedAt)));

      const editing = Boolean(id);
      if (editing && !existingRows.some((location) => location.id === id)) {
        throw new Error('Location was not found.');
      }

      const sameName = existingRows.some((location) => location.id !== id && location.name.trim().toLowerCase() === name.toLowerCase());
      if (sameName) throw new Error('DUPLICATE_NAME');

      const sameCode = code
        ? existingRows.some((location) => location.id !== id && location.code?.trim().toLowerCase() === code.toLowerCase())
        : false;
      if (sameCode) throw new Error('DUPLICATE_CODE');

      const values = { brandId, name, code, locationType, address, updatedAt: new Date() };
      if (editing) {
        await db().update(locations).set(values).where(eq(locations.id, id));
      } else {
        await db().insert(locations).values({ tenantId: user.tenantId, ...values });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'DUPLICATE_NAME') return duplicateText('Location name');
    if (error instanceof Error && error.message === 'DUPLICATE_CODE') return duplicateText('Location code');
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save location.' };
  }

  revalidatePath('/company/locations');
  revalidatePath('/');
  return { ok: true, message: id ? 'Location updated.' : 'Location added.' };
}

export async function createCompany(formData: FormData): Promise<void> {
  const user = await requireTenantContext();
  const name = String(formData.get('name') ?? '');
  const parsed = createCompanySchema.parse({
    name,
    slug: slugify(String(formData.get('slug') ?? '') || name),
    country: String(formData.get('country') ?? 'Sri Lanka'),
    baseCurrency: String(formData.get('baseCurrency') ?? 'LKR'),
  });

  const [slugExists] = await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, parsed.slug)).limit(1);
  if (slugExists) throw new Error('Company slug already exists.');

  await db().transaction(async (tx) => {
    const [createdTenant] = await tx
      .insert(tenants)
      .values({
        name: parsed.name.trim(),
        slug: parsed.slug,
        plan: 'starter',
      })
      .returning({ id: tenants.id });

    if (!createdTenant) throw new Error('Could not create company.');

    await tx.insert(tenantMemberships).values({
      tenantId: createdTenant.id,
      userId: user.id,
      role: 'owner',
      status: 'active',
    });

    await tx.insert(companyProfiles).values({
      tenantId: createdTenant.id,
      legalName: parsed.name.trim(),
      country: parsed.country.trim(),
      baseCurrency: parsed.baseCurrency.trim().toUpperCase(),
      timezone: 'Asia/Colombo',
    });

    await tx.insert(taxProfiles).values({ tenantId: createdTenant.id });

    await tx.insert(accounts).values(
      DEFAULT_CHART_OF_ACCOUNTS.map((account) => ({
        tenantId: createdTenant.id,
        code: account.code,
        name: account.name,
        type: account.type,
        normalSide: account.normalSide,
      })),
    );

    await tx.insert(auditLog).values({
      tenantId: createdTenant.id,
      userId: user.id,
      action: 'CREATE',
      tableName: 'tenants',
      recordId: createdTenant.id,
      newValues: { name: parsed.name, slug: parsed.slug },
      notes: 'Created additional company and seeded chart of accounts.',
    });
  });

  revalidatePath('/settings');
}

export async function switchActiveCompany(formData: FormData): Promise<void> {
  const user = await requireTenantContext();
  const tenantId = String(formData.get('tenantId') ?? '');
  if (!tenantId) return;

  const [membership] = await db()
    .select({ id: tenantMemberships.id })
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.userId, user.id),
        eq(tenantMemberships.tenantId, tenantId),
        eq(tenantMemberships.status, 'active'),
        isNull(tenantMemberships.voidedAt),
      ),
    )
    .limit(1);

  if (!membership) throw new Error('You do not have access to this company.');

  await db().update(users).set({ tenantId, updatedAt: new Date() }).where(eq(users.id, user.id));
  redirect('/login?switched=1');
}
