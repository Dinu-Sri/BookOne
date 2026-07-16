'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@bookone/auth';
import {
  auditLog,
  businessDocuments,
  db,
  parties,
  transactions,
  eq,
  and,
  isNull,
  or,
  asc,
  desc,
  sql,
  withTenantContext,
} from '@bookone/db';

const partyInputSchema = z.object({
  name: z.string().min(1).max(255),
  displayName: z.string().max(255).optional(),
  legalName: z.string().max(255).optional(),
  partyType: z.enum(['individual', 'company', 'government', 'other']).default('company'),
  isCustomer: z.boolean().default(false),
  isVendor: z.boolean().default(false),
  code: z.string().max(40).optional(),
  phone: z.string().max(30).optional(),
  phoneMobile: z.string().max(30).optional(),
  phoneLandline: z.string().max(30).optional(),
  email: z.string().email().or(z.literal('')).optional(),
  website: z.string().max(255).optional(),
  address: z.string().max(500).optional(),
  addressLine1: z.string().max(255).optional(),
  addressLine2: z.string().max(255).optional(),
  city: z.string().max(120).optional(),
  district: z.string().max(120).optional(),
  province: z.string().max(120).optional(),
  postalCode: z.string().max(40).optional(),
  country: z.string().max(100).optional(),
  taxId: z.string().max(100).optional(),
  tin: z.string().max(50).optional(),
  vatNumber: z.string().max(50).optional(),
  svatNumber: z.string().max(50).optional(),
  brn: z.string().max(50).optional(),
  nic: z.string().max(30).optional(),
  taxStatus: z.enum(['registered', 'unregistered', 'exempt', 'unknown']).default('unknown'),
  contactPerson: z.string().max(255).optional(),
  contactPhone: z.string().max(30).optional(),
  contactEmail: z.string().email().or(z.literal('')).optional(),
  creditLimit: z.number().min(0).optional().nullable(),
  paymentTermsDays: z.number().int().min(0).optional().nullable(),
  preferredCurrency: z.string().max(5).optional(),
  bankName: z.string().max(120).optional(),
  bankBranch: z.string().max(120).optional(),
  bankAccountName: z.string().max(255).optional(),
  bankAccountNo: z.string().max(80).optional(),
  bankSwift: z.string().max(30).optional(),
  status: z.enum(['active', 'inactive', 'blocked']).default('active'),
  notes: z.string().max(2000).optional(),
  /** Legacy ensureParty API */
  kind: z.enum(['customer', 'vendor', 'both']).optional(),
});

export type PartyInput = z.infer<typeof partyInputSchema>;

export interface PartyRow {
  id: string;
  name: string;
  displayName: string | null;
  legalName: string | null;
  kind: string;
  isCustomer: boolean;
  isVendor: boolean;
  partyType: string;
  code: string | null;
  phone: string | null;
  phoneMobile: string | null;
  phoneLandline: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  district: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  taxId: string | null;
  tin: string | null;
  vatNumber: string | null;
  svatNumber: string | null;
  brn: string | null;
  nic: string | null;
  taxStatus: string;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  creditLimit: number | null;
  paymentTermsDays: number | null;
  preferredCurrency: string;
  bankName: string | null;
  bankBranch: string | null;
  bankAccountName: string | null;
  bankAccountNo: string | null;
  bankSwift: string | null;
  status: string;
  notes: string | null;
  openBalance: number;
  openReceivable: number;
  openPayable: number;
  documentCount: number;
  canDelete: boolean;
  deleteReasons: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PartyListFilter {
  kind?: 'customer' | 'vendor' | 'all';
  q?: string;
  status?: 'active' | 'inactive' | 'blocked' | 'all';
  dualOnly?: 'all' | 'dual' | 'single';
  taxStatus?: 'all' | 'registered' | 'unregistered' | 'exempt' | 'unknown';
  hasBalance?: 'all' | 'yes' | 'no';
  sort?: 'name' | 'code' | 'balance' | 'created' | 'updated';
  dir?: 'asc' | 'desc';
  /** Accounting period (YYYY-MM or all) — reserved for balance scoping */
  period?: string;
}

function cleanNullable(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function kindFromFlags(isCustomer: boolean, isVendor: boolean): 'customer' | 'vendor' | 'both' {
  if (isCustomer && isVendor) return 'both';
  if (isVendor) return 'vendor';
  return 'customer';
}

function flagsFromKind(kind?: string): { isCustomer: boolean; isVendor: boolean } {
  if (kind === 'both') return { isCustomer: true, isVendor: true };
  if (kind === 'vendor') return { isCustomer: false, isVendor: true };
  return { isCustomer: true, isVendor: false };
}

function mapPartyRow(
  row: Record<string, unknown>,
  extras?: Partial<Pick<PartyRow, 'openBalance' | 'openReceivable' | 'openPayable' | 'documentCount' | 'canDelete' | 'deleteReasons'>>,
): PartyRow {
  const isCustomer = row.isCustomer === '1' || row.isCustomer === true || row.kind === 'customer' || row.kind === 'both';
  const isVendor = row.isVendor === '1' || row.isVendor === true || row.kind === 'vendor' || row.kind === 'both';
  return {
    id: String(row.id),
    name: String(row.name),
    displayName: (row.displayName as string | null) ?? null,
    legalName: (row.legalName as string | null) ?? null,
    kind: String(row.kind ?? kindFromFlags(isCustomer, isVendor)),
    isCustomer,
    isVendor,
    partyType: String(row.partyType ?? 'company'),
    code: (row.code as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    phoneMobile: (row.phoneMobile as string | null) ?? (row.phone as string | null) ?? null,
    phoneLandline: (row.phoneLandline as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    website: (row.website as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    addressLine1: (row.addressLine1 as string | null) ?? (row.address as string | null) ?? null,
    addressLine2: (row.addressLine2 as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    district: (row.district as string | null) ?? null,
    province: (row.province as string | null) ?? null,
    postalCode: (row.postalCode as string | null) ?? null,
    country: (row.country as string | null) ?? 'Sri Lanka',
    taxId: (row.taxId as string | null) ?? null,
    tin: (row.tin as string | null) ?? (row.taxId as string | null) ?? null,
    vatNumber: (row.vatNumber as string | null) ?? null,
    svatNumber: (row.svatNumber as string | null) ?? null,
    brn: (row.brn as string | null) ?? null,
    nic: (row.nic as string | null) ?? null,
    taxStatus: String(row.taxStatus ?? 'unknown'),
    contactPerson: (row.contactPerson as string | null) ?? null,
    contactPhone: (row.contactPhone as string | null) ?? null,
    contactEmail: (row.contactEmail as string | null) ?? null,
    creditLimit: row.creditLimit != null ? Number(row.creditLimit) : null,
    paymentTermsDays: row.paymentTermsDays != null ? Number(row.paymentTermsDays) : null,
    preferredCurrency: String(row.preferredCurrency ?? 'LKR'),
    bankName: (row.bankName as string | null) ?? null,
    bankBranch: (row.bankBranch as string | null) ?? null,
    bankAccountName: (row.bankAccountName as string | null) ?? null,
    bankAccountNo: (row.bankAccountNo as string | null) ?? null,
    bankSwift: (row.bankSwift as string | null) ?? null,
    status: String(row.status ?? 'active'),
    notes: (row.notes as string | null) ?? null,
    openBalance: extras?.openBalance ?? 0,
    openReceivable: extras?.openReceivable ?? 0,
    openPayable: extras?.openPayable ?? 0,
    documentCount: extras?.documentCount ?? 0,
    canDelete: extras?.canDelete ?? false,
    deleteReasons: extras?.deleteReasons ?? [],
    createdAt: row.createdAt ? new Date(row.createdAt as Date).toISOString() : undefined,
    updatedAt: row.updatedAt ? new Date(row.updatedAt as Date).toISOString() : undefined,
  };
}

const partySelect = {
  id: parties.id,
  name: parties.name,
  displayName: parties.displayName,
  legalName: parties.legalName,
  kind: parties.kind,
  isCustomer: parties.isCustomer,
  isVendor: parties.isVendor,
  partyType: parties.partyType,
  code: parties.code,
  phone: parties.phone,
  phoneMobile: parties.phoneMobile,
  phoneLandline: parties.phoneLandline,
  email: parties.email,
  website: parties.website,
  address: parties.address,
  addressLine1: parties.addressLine1,
  addressLine2: parties.addressLine2,
  city: parties.city,
  district: parties.district,
  province: parties.province,
  postalCode: parties.postalCode,
  country: parties.country,
  taxId: parties.taxId,
  tin: parties.tin,
  vatNumber: parties.vatNumber,
  svatNumber: parties.svatNumber,
  brn: parties.brn,
  nic: parties.nic,
  taxStatus: parties.taxStatus,
  contactPerson: parties.contactPerson,
  contactPhone: parties.contactPhone,
  contactEmail: parties.contactEmail,
  creditLimit: parties.creditLimit,
  paymentTermsDays: parties.paymentTermsDays,
  preferredCurrency: parties.preferredCurrency,
  bankName: parties.bankName,
  bankBranch: parties.bankBranch,
  bankAccountName: parties.bankAccountName,
  bankAccountNo: parties.bankAccountNo,
  bankSwift: parties.bankSwift,
  status: parties.status,
  notes: parties.notes,
  createdAt: parties.createdAt,
  updatedAt: parties.updatedAt,
};

function salesDocFilter() {
  return or(
    eq(businessDocuments.documentType, 'sales_invoice'),
    eq(businessDocuments.documentType, 'customer_invoice'),
    eq(businessDocuments.documentType, 'pos_sale'),
    eq(businessDocuments.documentType, 'sales_return'),
    eq(businessDocuments.documentType, 'quotation'),
    eq(businessDocuments.documentType, 'sales_order'),
  )!;
}

function purchaseDocFilter() {
  return or(
    eq(businessDocuments.documentType, 'vendor_bill'),
    eq(businessDocuments.documentType, 'purchase'),
    eq(businessDocuments.documentType, 'import_purchase'),
    eq(businessDocuments.documentType, 'purchase_return'),
    eq(businessDocuments.documentType, 'purchase_order'),
  )!;
}

function revalidateParties() {
  revalidatePath('/parties');
  revalidatePath('/parties/customers');
  revalidatePath('/parties/vendors');
  revalidatePath('/sales/invoices');
  revalidatePath('/purchase/purchases');
  revalidatePath('/documents');
}

async function nextPartyCode(tenantId: string, isCustomer: boolean, isVendor: boolean) {
  const prefix = isCustomer && isVendor ? 'PTR' : isVendor ? 'VEN' : 'CUS';
  const [{ total }] = await db()
    .select({ total: sql<number>`count(*)` })
    .from(parties)
    .where(and(eq(parties.tenantId, tenantId), sql`${parties.code} like ${prefix + '-%'}`));
  return `${prefix}-${String(Number(total ?? 0) + 1).padStart(4, '0')}`;
}

async function assertPartyDeletable(tenantId: string, partyId: string, partyName: string) {
  const reasons: string[] = [];

  const [docAgg] = await db()
    .select({
      total: sql<number>`count(*)`,
      sample: sql<string>`min(${businessDocuments.documentNumber})`,
    })
    .from(businessDocuments)
    .where(
      and(
        eq(businessDocuments.tenantId, tenantId),
        eq(businessDocuments.partyId, partyId),
        isNull(businessDocuments.voidedAt),
      ),
    );

  if (Number(docAgg?.total ?? 0) > 0) {
    reasons.push(
      `Linked to ${docAgg.total} commercial document(s)` +
        (docAgg.sample ? ` (e.g. ${docAgg.sample})` : '') +
        '.',
    );
  }

  const [txAgg] = await db()
    .select({ total: sql<number>`count(*)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.tenantId, tenantId),
        sql`lower(${transactions.party}) = lower(${partyName})`,
        isNull(transactions.voidedAt),
      ),
    );

  if (Number(txAgg?.total ?? 0) > 0) {
    reasons.push(`Referenced on ${txAgg.total} simple-entry / journal transaction(s) by name.`);
  }

  return { ok: reasons.length === 0, reasons };
}

async function roleUsageCounts(tenantId: string, partyId: string) {
  const [sales] = await db()
    .select({ total: sql<number>`count(*)` })
    .from(businessDocuments)
    .where(
      and(
        eq(businessDocuments.tenantId, tenantId),
        eq(businessDocuments.partyId, partyId),
        isNull(businessDocuments.voidedAt),
        salesDocFilter(),
      ),
    );
  const [purchase] = await db()
    .select({ total: sql<number>`count(*)` })
    .from(businessDocuments)
    .where(
      and(
        eq(businessDocuments.tenantId, tenantId),
        eq(businessDocuments.partyId, partyId),
        isNull(businessDocuments.voidedAt),
        purchaseDocFilter(),
      ),
    );
  return { salesDocs: Number(sales?.total ?? 0), purchaseDocs: Number(purchase?.total ?? 0) };
}

function parseFormBooleans(formData: FormData) {
  const isCustomer =
    formData.get('isCustomer') === 'on' ||
    formData.get('isCustomer') === '1' ||
    formData.get('isCustomer') === 'true';
  const isVendor =
    formData.get('isVendor') === 'on' ||
    formData.get('isVendor') === '1' ||
    formData.get('isVendor') === 'true';
  return { isCustomer, isVendor };
}

function formToInput(formData: FormData, defaults?: { isCustomer?: boolean; isVendor?: boolean }): PartyInput {
  const flags = parseFormBooleans(formData);
  let isCustomer = flags.isCustomer || Boolean(defaults?.isCustomer);
  let isVendor = flags.isVendor || Boolean(defaults?.isVendor);

  // Hidden defaults from page when checkboxes not checked but role fixed
  if (formData.get('forceCustomer') === '1') isCustomer = true;
  if (formData.get('forceVendor') === '1') isVendor = true;

  const creditRaw = String(formData.get('creditLimit') ?? '').replace(/[^0-9.-]/g, '');
  const termsRaw = String(formData.get('paymentTermsDays') ?? '').replace(/[^0-9]/g, '');

  return {
    name: String(formData.get('name') ?? formData.get('legalName') ?? '').trim(),
    displayName: String(formData.get('displayName') ?? ''),
    legalName: String(formData.get('legalName') ?? formData.get('name') ?? ''),
    partyType: (String(formData.get('partyType') ?? 'company') as PartyInput['partyType']) || 'company',
    isCustomer,
    isVendor,
    code: String(formData.get('code') ?? ''),
    phone: String(formData.get('phoneMobile') ?? formData.get('phone') ?? ''),
    phoneMobile: String(formData.get('phoneMobile') ?? formData.get('phone') ?? ''),
    phoneLandline: String(formData.get('phoneLandline') ?? ''),
    email: String(formData.get('email') ?? ''),
    website: String(formData.get('website') ?? ''),
    address: String(formData.get('addressLine1') ?? formData.get('address') ?? ''),
    addressLine1: String(formData.get('addressLine1') ?? formData.get('address') ?? ''),
    addressLine2: String(formData.get('addressLine2') ?? ''),
    city: String(formData.get('city') ?? ''),
    district: String(formData.get('district') ?? ''),
    province: String(formData.get('province') ?? ''),
    postalCode: String(formData.get('postalCode') ?? ''),
    country: String(formData.get('country') ?? 'Sri Lanka'),
    taxId: String(formData.get('tin') ?? formData.get('taxId') ?? ''),
    tin: String(formData.get('tin') ?? formData.get('taxId') ?? ''),
    vatNumber: String(formData.get('vatNumber') ?? ''),
    svatNumber: String(formData.get('svatNumber') ?? ''),
    brn: String(formData.get('brn') ?? ''),
    nic: String(formData.get('nic') ?? ''),
    taxStatus: (String(formData.get('taxStatus') ?? 'unknown') as PartyInput['taxStatus']) || 'unknown',
    contactPerson: String(formData.get('contactPerson') ?? ''),
    contactPhone: String(formData.get('contactPhone') ?? ''),
    contactEmail: String(formData.get('contactEmail') ?? ''),
    creditLimit: creditRaw ? Number(creditRaw) : null,
    paymentTermsDays: termsRaw ? Number(termsRaw) : null,
    preferredCurrency: String(formData.get('preferredCurrency') ?? 'LKR'),
    bankName: String(formData.get('bankName') ?? ''),
    bankBranch: String(formData.get('bankBranch') ?? ''),
    bankAccountName: String(formData.get('bankAccountName') ?? ''),
    bankAccountNo: String(formData.get('bankAccountNo') ?? ''),
    bankSwift: String(formData.get('bankSwift') ?? ''),
    status: (String(formData.get('status') ?? 'active') as PartyInput['status']) || 'active',
    notes: String(formData.get('notes') ?? ''),
  };
}

function toDbValues(tenantId: string, parsed: PartyInput, code: string | null) {
  const isCustomer = parsed.isCustomer || parsed.kind === 'customer' || parsed.kind === 'both';
  const isVendor = parsed.isVendor || parsed.kind === 'vendor' || parsed.kind === 'both';
  const kind = kindFromFlags(isCustomer, isVendor);
  const name = parsed.name.trim();
  const mobile = cleanNullable(parsed.phoneMobile ?? parsed.phone);
  const line1 = cleanNullable(parsed.addressLine1 ?? parsed.address);
  const tin = cleanNullable(parsed.tin ?? parsed.taxId);

  return {
    tenantId,
    name,
    kind,
    isCustomer: isCustomer ? '1' : '0',
    isVendor: isVendor ? '1' : '0',
    code,
    phone: mobile,
    phoneMobile: mobile,
    phoneLandline: cleanNullable(parsed.phoneLandline),
    email: cleanNullable(parsed.email),
    website: cleanNullable(parsed.website),
    address: line1,
    addressLine1: line1,
    addressLine2: cleanNullable(parsed.addressLine2),
    city: cleanNullable(parsed.city),
    district: cleanNullable(parsed.district),
    province: cleanNullable(parsed.province),
    postalCode: cleanNullable(parsed.postalCode),
    country: cleanNullable(parsed.country) ?? 'Sri Lanka',
    taxId: tin,
    tin,
    vatNumber: cleanNullable(parsed.vatNumber),
    svatNumber: cleanNullable(parsed.svatNumber),
    brn: cleanNullable(parsed.brn),
    nic: cleanNullable(parsed.nic),
    taxStatus: parsed.taxStatus ?? 'unknown',
    displayName: cleanNullable(parsed.displayName) ?? name,
    legalName: cleanNullable(parsed.legalName) ?? name,
    partyType: parsed.partyType ?? 'company',
    contactPerson: cleanNullable(parsed.contactPerson),
    contactPhone: cleanNullable(parsed.contactPhone),
    contactEmail: cleanNullable(parsed.contactEmail),
    creditLimit: parsed.creditLimit != null ? parsed.creditLimit.toFixed(2) : null,
    paymentTermsDays: parsed.paymentTermsDays ?? null,
    preferredCurrency: parsed.preferredCurrency || 'LKR',
    bankName: cleanNullable(parsed.bankName),
    bankBranch: cleanNullable(parsed.bankBranch),
    bankAccountName: cleanNullable(parsed.bankAccountName),
    bankAccountNo: cleanNullable(parsed.bankAccountNo),
    bankSwift: cleanNullable(parsed.bankSwift),
    status: parsed.status ?? 'active',
    notes: cleanNullable(parsed.notes),
    updatedAt: new Date(),
  };
}

export async function listParties(filter?: PartyListFilter): Promise<PartyRow[]> {
  const user = await requireTenantContext();
  const kind = filter?.kind ?? 'all';
  const status = filter?.status ?? 'active';
  const q = filter?.q?.trim() ?? '';
  const sort = filter?.sort ?? 'name';
  const dir = filter?.dir ?? 'asc';
  const dualOnly = filter?.dualOnly ?? 'all';
  const taxStatus = filter?.taxStatus ?? 'all';
  const hasBalance = filter?.hasBalance ?? 'all';

  return withTenantContext(user.tenantId, async () => {
    const conditions = [eq(parties.tenantId, user.tenantId), isNull(parties.voidedAt)];

    if (kind === 'customer') {
      conditions.push(
        or(eq(parties.isCustomer, '1'), eq(parties.kind, 'customer'), eq(parties.kind, 'both'))!,
      );
    } else if (kind === 'vendor') {
      conditions.push(
        or(eq(parties.isVendor, '1'), eq(parties.kind, 'vendor'), eq(parties.kind, 'both'))!,
      );
    }

    if (status !== 'all') {
      conditions.push(eq(parties.status, status));
    }

    if (dualOnly === 'dual') {
      conditions.push(
        or(
          and(eq(parties.isCustomer, '1'), eq(parties.isVendor, '1')),
          eq(parties.kind, 'both'),
        )!,
      );
    } else if (dualOnly === 'single') {
      conditions.push(sql`not (${parties.kind} = 'both' or (${parties.isCustomer} = '1' and ${parties.isVendor} = '1'))`);
    }

    if (taxStatus !== 'all') {
      conditions.push(eq(parties.taxStatus, taxStatus));
    }

    if (q) {
      const like = `%${q.toLowerCase()}%`;
      conditions.push(
        sql`(
          lower(${parties.name}) like ${like}
          or lower(coalesce(${parties.code}, '')) like ${like}
          or lower(coalesce(${parties.phoneMobile}, coalesce(${parties.phone}, ''))) like ${like}
          or lower(coalesce(${parties.email}, '')) like ${like}
          or lower(coalesce(${parties.tin}, coalesce(${parties.taxId}, ''))) like ${like}
          or lower(coalesce(${parties.city}, '')) like ${like}
          or lower(coalesce(${parties.displayName}, '')) like ${like}
        )`,
      );
    }

    const orderExpr =
      sort === 'code'
        ? parties.code
        : sort === 'created'
          ? parties.createdAt
          : sort === 'updated'
            ? parties.updatedAt
            : parties.name;

    const rows = await db()
      .select(partySelect)
      .from(parties)
      .where(and(...conditions))
      .orderBy(dir === 'desc' ? desc(orderExpr) : asc(orderExpr));

    const balanceRows = await db()
      .select({
        partyId: businessDocuments.partyId,
        ar: sql<string>`coalesce(sum(case when ${businessDocuments.documentType} in ('sales_invoice','customer_invoice','pos_sale','sales_return') then ${businessDocuments.balanceDue}::numeric else 0 end), 0)`,
        ap: sql<string>`coalesce(sum(case when ${businessDocuments.documentType} in ('vendor_bill','purchase','import_purchase','purchase_return','purchase_order') then ${businessDocuments.balanceDue}::numeric else 0 end), 0)`,
        docs: sql<number>`count(*)`,
      })
      .from(businessDocuments)
      .where(and(eq(businessDocuments.tenantId, user.tenantId), isNull(businessDocuments.voidedAt)))
      .groupBy(businessDocuments.partyId);

    const balMap = new Map(
      balanceRows.map((b) => [
        b.partyId,
        { ar: Number(b.ar), ap: Number(b.ap), docs: Number(b.docs ?? 0) },
      ]),
    );

    let result = rows.map((row) => {
      const bal = balMap.get(row.id) ?? { ar: 0, ap: 0, docs: 0 };
      const openBalance = kind === 'vendor' ? bal.ap : kind === 'customer' ? bal.ar : bal.ar + bal.ap;
      return mapPartyRow(row as unknown as Record<string, unknown>, {
        openBalance,
        openReceivable: bal.ar,
        openPayable: bal.ap,
        documentCount: bal.docs,
        canDelete: bal.docs === 0,
        deleteReasons: bal.docs > 0 ? [`Linked to ${bal.docs} document(s).`] : [],
      });
    });

    if (hasBalance === 'yes') {
      result = result.filter((r) => r.openBalance > 0.005);
    } else if (hasBalance === 'no') {
      result = result.filter((r) => r.openBalance <= 0.005);
    }

    if (sort === 'balance') {
      result.sort((a, b) =>
        dir === 'desc' ? b.openBalance - a.openBalance : a.openBalance - b.openBalance,
      );
    }

    return result;
  });
}

export async function listPartyOptions(role: 'customer' | 'vendor'): Promise<
  { id: string; name: string; code: string | null; creditLimit: number | null; openBalance: number; status: string }[]
> {
  const rows = await listParties({ kind: role, status: 'active', sort: 'name', dir: 'asc' });
  return rows
    .filter((r) => r.status === 'active')
    .map((r) => ({
      id: r.id,
      name: r.displayName || r.name,
      code: r.code,
      creditLimit: r.creditLimit,
      openBalance: role === 'customer' ? r.openReceivable : r.openPayable,
      status: r.status,
    }));
}

export async function getParty(id: string): Promise<PartyRow | null> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const [row] = await db()
      .select(partySelect)
      .from(parties)
      .where(and(eq(parties.tenantId, user.tenantId), eq(parties.id, id), isNull(parties.voidedAt)))
      .limit(1);
    if (!row) return null;

    const [bal] = await db()
      .select({
        ar: sql<string>`coalesce(sum(case when ${businessDocuments.documentType} in ('sales_invoice','customer_invoice','pos_sale','sales_return') then ${businessDocuments.balanceDue}::numeric else 0 end), 0)`,
        ap: sql<string>`coalesce(sum(case when ${businessDocuments.documentType} in ('vendor_bill','purchase','import_purchase','purchase_return','purchase_order') then ${businessDocuments.balanceDue}::numeric else 0 end), 0)`,
        docs: sql<number>`count(*)`,
      })
      .from(businessDocuments)
      .where(
        and(
          eq(businessDocuments.tenantId, user.tenantId),
          eq(businessDocuments.partyId, id),
          isNull(businessDocuments.voidedAt),
        ),
      );

    const deletable = await assertPartyDeletable(user.tenantId, id, row.name);
    return mapPartyRow(row as unknown as Record<string, unknown>, {
      openReceivable: Number(bal?.ar ?? 0),
      openPayable: Number(bal?.ap ?? 0),
      openBalance: Number(bal?.ar ?? 0) + Number(bal?.ap ?? 0),
      documentCount: Number(bal?.docs ?? 0),
      canDelete: deletable.ok,
      deleteReasons: deletable.reasons,
    });
  });
}

/** Used by sales/purchase free-text create — merges dual roles on match. */
export async function ensureParty(input: {
  name: string;
  kind?: 'customer' | 'vendor' | 'both';
  isCustomer?: boolean;
  isVendor?: boolean;
  phone?: string;
  email?: string;
  address?: string;
  taxId?: string;
}): Promise<PartyRow> {
  const flags = input.kind
    ? flagsFromKind(input.kind)
    : { isCustomer: Boolean(input.isCustomer ?? true), isVendor: Boolean(input.isVendor) };
  if (!flags.isCustomer && !flags.isVendor) flags.isCustomer = true;

  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () => {
    const name = input.name.trim();
    const [existing] = await db()
      .select(partySelect)
      .from(parties)
      .where(
        and(
          eq(parties.tenantId, user.tenantId),
          sql`lower(${parties.name}) = lower(${name})`,
          isNull(parties.voidedAt),
        ),
      )
      .limit(1);

    if (existing) {
      const nextCustomer =
        existing.isCustomer === '1' || existing.kind === 'customer' || existing.kind === 'both' || flags.isCustomer;
      const nextVendor =
        existing.isVendor === '1' || existing.kind === 'vendor' || existing.kind === 'both' || flags.isVendor;
      const kind = kindFromFlags(nextCustomer, nextVendor);
      if (
        nextCustomer !== (existing.isCustomer === '1' || existing.kind === 'customer' || existing.kind === 'both') ||
        nextVendor !== (existing.isVendor === '1' || existing.kind === 'vendor' || existing.kind === 'both')
      ) {
        await db()
          .update(parties)
          .set({
            isCustomer: nextCustomer ? '1' : '0',
            isVendor: nextVendor ? '1' : '0',
            kind,
            updatedAt: new Date(),
          })
          .where(eq(parties.id, existing.id));
        await db().insert(auditLog).values({
          tenantId: user.tenantId,
          userId: user.id,
          action: 'UPDATE',
          tableName: 'parties',
          recordId: existing.id,
          newValues: { kind, isCustomer: nextCustomer, isVendor: nextVendor },
          notes: 'Merged dual roles via ensureParty.',
        });
      }
      return mapPartyRow(
        {
          ...existing,
          kind,
          isCustomer: nextCustomer ? '1' : '0',
          isVendor: nextVendor ? '1' : '0',
        } as unknown as Record<string, unknown>,
        { openBalance: 0, canDelete: false, deleteReasons: [] },
      );
    }

    const code = await nextPartyCode(user.tenantId, flags.isCustomer, flags.isVendor);
    const values = toDbValues(
      user.tenantId,
      {
        name,
        isCustomer: flags.isCustomer,
        isVendor: flags.isVendor,
        phoneMobile: input.phone,
        email: input.email,
        addressLine1: input.address,
        tin: input.taxId,
        taxStatus: 'unregistered',
        partyType: 'company',
        status: 'active',
      },
      code,
    );

    const [created] = await db().insert(parties).values(values).returning(partySelect);
    await db().insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'CREATE',
      tableName: 'parties',
      recordId: created.id,
      newValues: { name: created.name, kind: created.kind },
      notes: 'Created party via ensureParty.',
    });
    return mapPartyRow(created as unknown as Record<string, unknown>, {
      openBalance: 0,
      canDelete: true,
      deleteReasons: [],
    });
  });
}

export async function createPartyFromForm(formData: FormData): Promise<void> {
  const defaults = {
    isCustomer: formData.get('forceCustomer') === '1',
    isVendor: formData.get('forceVendor') === '1',
  };
  const raw = formToInput(formData, defaults);
  if (!raw.isCustomer && !raw.isVendor) {
    if (defaults.isVendor) raw.isVendor = true;
    else raw.isCustomer = true;
  }
  const parsed = partyInputSchema.parse(raw);
  if (!parsed.isCustomer && !parsed.isVendor) {
    throw new Error('Select at least one role: customer and/or vendor.');
  }

  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    // Duplicate TIN
    const tin = cleanNullable(parsed.tin ?? parsed.taxId);
    if (tin) {
      const [dupTin] = await db()
        .select({ id: parties.id, name: parties.name })
        .from(parties)
        .where(
          and(
            eq(parties.tenantId, user.tenantId),
            sql`lower(coalesce(${parties.tin}, ${parties.taxId})) = lower(${tin})`,
            isNull(parties.voidedAt),
          ),
        )
        .limit(1);
      if (dupTin) throw new Error(`TIN already used by ${dupTin.name}. Open that party instead.`);
    }

    const [dupName] = await db()
      .select({ id: parties.id })
      .from(parties)
      .where(
        and(
          eq(parties.tenantId, user.tenantId),
          sql`lower(${parties.name}) = lower(${parsed.name.trim()})`,
          isNull(parties.voidedAt),
        ),
      )
      .limit(1);
    if (dupName) {
      // Upgrade existing instead of error
      await ensureParty({
        name: parsed.name,
        isCustomer: parsed.isCustomer,
        isVendor: parsed.isVendor,
        phone: parsed.phoneMobile,
        email: parsed.email,
        address: parsed.addressLine1,
        taxId: parsed.tin,
      });
      // Also fill richer fields
      await db()
        .update(parties)
        .set(toDbValues(user.tenantId, parsed, cleanNullable(parsed.code)))
        .where(eq(parties.id, dupName.id));
    } else {
      const code = cleanNullable(parsed.code) ?? (await nextPartyCode(user.tenantId, parsed.isCustomer, parsed.isVendor));
      const [created] = await db()
        .insert(parties)
        .values(toDbValues(user.tenantId, parsed, code))
        .returning({ id: parties.id });
      await db().insert(auditLog).values({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'CREATE',
        tableName: 'parties',
        recordId: created.id,
        newValues: { name: parsed.name, isCustomer: parsed.isCustomer, isVendor: parsed.isVendor },
        notes: 'Created party from form.',
      });
    }
  });

  revalidateParties();
  const { redirect } = await import('next/navigation');
  redirect(parsed.isVendor && !parsed.isCustomer ? '/parties/vendors' : '/parties/customers');
}

export async function updatePartyFromForm(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('Missing party id.');
  const raw = formToInput(formData);
  const parsed = partyInputSchema.parse(raw);
  if (!parsed.isCustomer && !parsed.isVendor) {
    throw new Error('Select at least one role: customer and/or vendor.');
  }

  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    const [existing] = await db()
      .select(partySelect)
      .from(parties)
      .where(and(eq(parties.tenantId, user.tenantId), eq(parties.id, id), isNull(parties.voidedAt)))
      .limit(1);
    if (!existing) throw new Error('Party not found.');

    const usage = await roleUsageCounts(user.tenantId, id);
    const wasCustomer =
      existing.isCustomer === '1' || existing.kind === 'customer' || existing.kind === 'both';
    const wasVendor = existing.isVendor === '1' || existing.kind === 'vendor' || existing.kind === 'both';

    if (wasCustomer && !parsed.isCustomer && usage.salesDocs > 0) {
      throw new Error(`Cannot remove customer role: ${usage.salesDocs} sales document(s) exist.`);
    }
    if (wasVendor && !parsed.isVendor && usage.purchaseDocs > 0) {
      throw new Error(`Cannot remove vendor role: ${usage.purchaseDocs} purchase document(s) exist.`);
    }

    const tin = cleanNullable(parsed.tin ?? parsed.taxId);
    if (tin) {
      const [dupTin] = await db()
        .select({ id: parties.id, name: parties.name })
        .from(parties)
        .where(
          and(
            eq(parties.tenantId, user.tenantId),
            sql`lower(coalesce(${parties.tin}, ${parties.taxId})) = lower(${tin})`,
            sql`${parties.id} <> ${id}`,
            isNull(parties.voidedAt),
          ),
        )
        .limit(1);
      if (dupTin) throw new Error(`TIN already used by ${dupTin.name}.`);
    }

    const code = cleanNullable(parsed.code) ?? existing.code;
    await db()
      .update(parties)
      .set(toDbValues(user.tenantId, parsed, code))
      .where(eq(parties.id, id));

    await db().insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'UPDATE',
      tableName: 'parties',
      recordId: id,
      oldValues: { name: existing.name, kind: existing.kind, status: existing.status },
      newValues: {
        name: parsed.name,
        kind: kindFromFlags(parsed.isCustomer, parsed.isVendor),
        status: parsed.status,
      },
      notes: 'Updated party.',
    });
  });

  revalidateParties();
  const { redirect } = await import('next/navigation');
  redirect(parsed.isVendor && !parsed.isCustomer ? '/parties/vendors' : '/parties/customers');
}

export async function archivePartyFromForm(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    await db()
      .update(parties)
      .set({ status: 'inactive', updatedAt: new Date() })
      .where(and(eq(parties.tenantId, user.tenantId), eq(parties.id, id), isNull(parties.voidedAt)));
    await db().insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'UPDATE',
      tableName: 'parties',
      recordId: id,
      newValues: { status: 'inactive' },
      notes: 'Archived party.',
    });
  });
  revalidateParties();
}

export async function restorePartyFromForm(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    await db()
      .update(parties)
      .set({ status: 'active', updatedAt: new Date() })
      .where(and(eq(parties.tenantId, user.tenantId), eq(parties.id, id), isNull(parties.voidedAt)));
    await db().insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'UPDATE',
      tableName: 'parties',
      recordId: id,
      newValues: { status: 'active' },
      notes: 'Restored party.',
    });
  });
  revalidateParties();
}

export async function deletePartyFromForm(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const user = await requireTenantContext();
  await withTenantContext(user.tenantId, async () => {
    const [existing] = await db()
      .select({ id: parties.id, name: parties.name })
      .from(parties)
      .where(and(eq(parties.tenantId, user.tenantId), eq(parties.id, id), isNull(parties.voidedAt)))
      .limit(1);
    if (!existing) throw new Error('Party not found.');

    const check = await assertPartyDeletable(user.tenantId, id, existing.name);
    if (!check.ok) {
      throw new Error(`Cannot delete: ${check.reasons.join(' ')} Archive instead.`);
    }

    await db()
      .update(parties)
      .set({ voidedAt: new Date(), status: 'inactive', updatedAt: new Date() })
      .where(eq(parties.id, id));

    await db().insert(auditLog).values({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'DELETE',
      tableName: 'parties',
      recordId: id,
      oldValues: { name: existing.name },
      notes: 'Soft-voided party (no linked documents).',
    });
  });
  revalidateParties();
}
