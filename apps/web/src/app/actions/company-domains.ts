'use server';

import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireTenantContext } from '@bookone/auth';
import { and, asc, companyDomains, db, eq, isNull, withTenantContext } from '@bookone/db';

const domainSchema = z.object({
  domain: z.string().min(3).max(255).regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i),
});

export interface CompanyDomainRow {
  id: string;
  domain: string;
  verificationToken: string;
  status: string;
  verifiedAt: Date | null;
}

function normalizeDomain(value: string): string {
  return value.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

function expectedTxt(token: string): string {
  return `bookone-domain-verification=${token}`;
}

export async function listCompanyDomains(): Promise<CompanyDomainRow[]> {
  const user = await requireTenantContext();
  return withTenantContext(user.tenantId, async () =>
    db()
      .select({
        id: companyDomains.id,
        domain: companyDomains.domain,
        verificationToken: companyDomains.verificationToken,
        status: companyDomains.status,
        verifiedAt: companyDomains.verifiedAt,
      })
      .from(companyDomains)
      .where(and(eq(companyDomains.tenantId, user.tenantId), isNull(companyDomains.voidedAt)))
      .orderBy(asc(companyDomains.domain)),
  );
}

export async function createCompanyDomain(formData: FormData): Promise<void> {
  const user = await requireTenantContext();
  const parsed = domainSchema.parse({ domain: normalizeDomain(String(formData.get('domain') ?? '')) });
  const token = randomBytes(24).toString('hex');

  await withTenantContext(user.tenantId, async () => {
    await db().insert(companyDomains).values({
      tenantId: user.tenantId,
      domain: parsed.domain,
      verificationToken: token,
      status: 'pending',
    });
  });

  revalidatePath('/company/domains');
}

export async function verifyCompanyDomain(formData: FormData): Promise<void> {
  const user = await requireTenantContext();
  const id = String(formData.get('domainId') ?? '');
  if (!id) return;

  await withTenantContext(user.tenantId, async () => {
    const [domain] = await db()
      .select({
        id: companyDomains.id,
        domain: companyDomains.domain,
        verificationToken: companyDomains.verificationToken,
      })
      .from(companyDomains)
      .where(and(eq(companyDomains.tenantId, user.tenantId), eq(companyDomains.id, id), isNull(companyDomains.voidedAt)))
      .limit(1);

    if (!domain) throw new Error('Domain not found.');

    const records = await resolveTxt(`_bookone.${domain.domain}`);
    const flatRecords = records.map((record) => record.join(''));
    if (!flatRecords.includes(expectedTxt(domain.verificationToken))) {
      throw new Error('DNS TXT record was not found yet.');
    }

    await db()
      .update(companyDomains)
      .set({ status: 'verified', verifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(companyDomains.id, domain.id));
  });

  revalidatePath('/company/domains');
}
