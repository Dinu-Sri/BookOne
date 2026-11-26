import { withTenantContext } from '@bookone/db';
import {
  CommerceError,
  CommerceService,
  PostgresCommerceStore,
  parseToken,
  rateLimit,
  type CommerceActor,
  type OperatorActor,
  type PostedDocument,
  type PostingPort,
} from '@bookone/commerce';
import { requireTenantContext, type SessionUser } from '@bookone/auth';
import { jobCanWrite } from '@/lib/access';
import { getTenantInfo } from '@/app/actions/workspace';
import { commerceTaxDecision, type CommerceTaxDecision } from '@/lib/commerce-tax';

function pepper(): string {
  return process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET ?? 'test-secret-for-ci-only';
}

async function postingPort(): Promise<PostingPort> {
  const { createCommercialDocumentWithUser } = await import('@/app/actions/commercial-docs');
  return {
    handlesStoreTax: true,
    async postSalesInvoice(input) {
      const user = actorUser(input.actor);
      const decision = await taxDecisionFor(input);
      if (decision.kind === 'review') {
        throw new CommerceError({ code: 'VALIDATION', message: decision.reason, httpStatus: 422 });
      }
      const result = await createCommercialDocumentWithUser(
        user,
        {
          documentType: 'sales_invoice',
          partyName: input.order.customer.name,
          issueDate: input.issueDate,
          notes: `Commerce ${input.order.externalId}`,
          locationId: input.locationId,
          saleChannel: 'local',
          invoiceKind: decision.kind,
          headerDiscount: input.headerDiscount ?? 0,
          freightAmount: input.freightAmount ?? 0,
          paymentAccountCode: input.paymentAccountCode,
          intent: 'post',
          idempotencyKey: input.idempotencyKey.slice(0, 80),
          lines: input.lines.map((line) => ({
            productId: line.productId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountAmount: line.discountAmount ?? 0,
            sku: line.sku,
          })),
        },
        // Commerce never sells below zero, whatever the company policy (QA-1126-16).
        { alreadyAuthorized: true, forceBlockNegative: true },
      );
      if (!result.ok || !result.id) {
        throw new CommerceError({
          code: 'VALIDATION',
          message: result.error ?? 'BookOne could not post this sales invoice.',
          httpStatus: 422,
        });
      }
      return {
        documentId: result.id,
        documentNumber: await lookupDocumentNumber(result.id, result.id),
        settled: Boolean(input.paymentAccountCode),
      } satisfies PostedDocument;
    },
    async postSalesReturn(input) {
      const user = actorUser(input.actor);
      // QA-1126-18: a linked return must name the original invoice's customer.
      const source = await sourceInvoiceParty(input.actor.tenantId, input.sourceDocumentId);
      if (!source) {
        throw new CommerceError({ code: 'VALIDATION', message: 'The original invoice was not found.', httpStatus: 422 });
      }
      const result = await createCommercialDocumentWithUser(
        user,
        {
          documentType: 'sales_return',
          partyName: source.partyName,
          partyId: source.partyId,
          issueDate: input.issueDate,
          sourceDocumentId: input.sourceDocumentId,
          notes: input.restock ? 'Commerce restock refund' : 'Commerce money-only refund',
          intent: 'post',
          idempotencyKey: input.idempotencyKey.slice(0, 80),
          lines: input.lines.map((line) => ({
            productId: line.productId,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          })),
        },
        { alreadyAuthorized: true },
      );
      if (!result.ok || !result.id) {
        throw new CommerceError({
          code: 'VALIDATION',
          message: result.error ?? 'BookOne could not post this refund.',
          httpStatus: 422,
        });
      }
      return {
        documentId: result.id,
        documentNumber: await lookupDocumentNumber(result.id, result.id),
      };
    },
  };
}

async function sourceInvoiceParty(
  tenantId: string,
  documentId: string,
): Promise<{ partyId: string; partyName: string } | null> {
  const { and, businessDocuments, db, eq, parties } = await import('@bookone/db');
  return withTenantContext(tenantId, async () => {
    const [row] = await db()
      .select({ partyId: parties.id, partyName: parties.name })
      .from(businessDocuments)
      .innerJoin(parties, eq(parties.id, businessDocuments.partyId))
      .where(and(eq(businessDocuments.tenantId, tenantId), eq(businessDocuments.id, documentId)))
      .limit(1);
    return row ?? null;
  });
}

async function taxDecisionFor(input: Parameters<PostingPort['postSalesInvoice']>[0]): Promise<CommerceTaxDecision> {
  const { db, eq, salesSettings } = await import('@bookone/db');
  const settings = await withTenantContext(input.actor.tenantId, async () => {
    const [row] = await db()
      .select({ vatRegistered: salesSettings.vatRegistered, vatRatePercent: salesSettings.vatRatePercent })
      .from(salesSettings)
      .where(eq(salesSettings.tenantId, input.actor.tenantId))
      .limit(1);
    return row ?? null;
  });
  const storeTax =
    Number(input.order.taxAmount ?? 0) +
    (input.order.lines ?? []).reduce((sum, line) => sum + Number(line.taxAmount ?? 0), 0);
  return commerceTaxDecision({
    vatRegistered: settings?.vatRegistered === '1',
    ratePercent: Number(settings?.vatRatePercent ?? 18),
    linesNet: input.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice - (line.discountAmount ?? 0), 0),
    headerDiscount: input.headerDiscount ?? 0,
    storeTax,
    lineCount: input.lines.length,
  });
}

async function lookupDocumentNumber(id: string, fallback: string): Promise<string> {
  try {
    const { businessDocuments, db, eq } = await import('@bookone/db');
    const [row] = await db()
      .select({ documentNumber: businessDocuments.documentNumber })
      .from(businessDocuments)
      .where(eq(businessDocuments.id, id))
      .limit(1);
    return row?.documentNumber || fallback;
  } catch {
    return fallback;
  }
}

function actorUser(actor: CommerceActor): SessionUser {
  return {
    id: actor.userId,
    email: 'commerce@bookone.local',
    name: 'Commerce',
    tenantId: actor.tenantId,
    homeTenantId: actor.tenantId,
    role: 'owner',
    platformRole: 'user',
    jobSlug: 'owner',
    jobId: null,
  };
}

export async function makeCommerceService(): Promise<CommerceService> {
  return new CommerceService(new PostgresCommerceStore(), pepper(), await postingPort());
}

export async function operatorFromSession(): Promise<OperatorActor> {
  const user = await requireTenantContext();
  const tenant = await getTenantInfo();
  return {
    tenantId: user.tenantId,
    userId: user.id,
    canWrite: jobCanWrite(tenant, 'Commerce Integrations'),
  };
}

export async function withCommerceService<T>(tenantId: string, fn: (service: CommerceService) => Promise<T>): Promise<T> {
  return withTenantContext(tenantId, async () => fn(await makeCommerceService()));
}

export const COMMERCE_TOKEN_INVALID_MESSAGE = 'The commerce token is invalid, revoked or expired.';

export async function authenticateCommerceRequest(authorization: string | null): Promise<CommerceActor> {
  const raw = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : authorization?.trim();
  const parsed = raw ? parseToken(raw) : null;
  if (!raw) {
    throw new CommerceError({ code: 'UNAUTHENTICATED', message: 'A commerce bearer token is required.', httpStatus: 401 });
  }
  if (!parsed) {
    // A token was sent but is malformed: say so (QA-1126-13).
    throw new CommerceError({ code: 'UNAUTHENTICATED', message: COMMERCE_TOKEN_INVALID_MESSAGE, httpStatus: 401 });
  }
  const store = new PostgresCommerceStore();
  const credential = await store.getCredentialByPrefix(parsed.prefix);
  if (!credential) {
    throw new CommerceError({ code: 'UNAUTHENTICATED', message: COMMERCE_TOKEN_INVALID_MESSAGE, httpStatus: 401 });
  }
  return withTenantContext(credential.tenantId, async () => {
    const service = await makeCommerceService();
    const actor = await service.authenticate(authorization);
    const limited = rateLimit(`${actor.tenantId}:${actor.credentialId}`);
    if (!limited.ok) {
      throw new CommerceError({
        code: 'RATE_LIMITED',
        message: 'Too many commerce requests. Retry after the window.',
        httpStatus: 429,
        retryAfter: limited.retryAfter,
      });
    }
    return { ...actor, rateLimitRemaining: limited.remaining };
  });
}
