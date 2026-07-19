'use server';

/**
 * ERP Health Check (staging only) — drives production engines and asserts mapping.
 *
 * Paths exercised:
 *  createQuickProduct, createCommercialDocument (purchase/invoice/return/GRN/PO/POS),
 *  allocateDocumentPayment, recordEntry (Simple Entry), inventory/sales settings gates.
 */

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  brands,
  businessDocuments,
  db,
  eq,
  and,
  isNull,
  desc,
  inArray,
  healthCheckRuns,
  inventoryMovements,
  inventoryProducts,
  inventorySettings,
  inventoryStockLevels,
  journalEntries,
  journalLines,
  locations,
  parties,
  posRegisters,
  salesSettings,
  settlementAllocations,
  sql,
  tenants,
  transactions,
  withTenantContext,
} from '@bookone/db';
import { createCommercialDocument, getCommercialDocument } from '@/app/actions/commercial-docs';
import { allocateDocumentPayment } from '@/app/actions/documents';
import { createQuickProduct } from '@/app/actions/inventory';
import { getPurchaseSettings } from '@/app/actions/purchase-settings';
import { getSalesSettings } from '@/app/actions/sales-settings';
import { getInventorySettings } from '@/app/actions/inventory-settings';
import { recordEntry } from '@/app/actions/record-entry';
import { completePosSale, openPosShift } from '@/app/actions/pos-session';

export type HealthStepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface HealthStepResult {
  id: string;
  title: string;
  detail: string;
  status: HealthStepStatus;
  ms?: number;
  error?: string;
  meta?: Record<string, string | number | boolean | null>;
}

export interface HealthRunRow {
  id: string;
  status: string;
  suite: string;
  seed: number;
  steps: HealthStepResult[];
  created: Record<string, string>;
  summary: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface HealthCheckPageData {
  isSuperAdmin: boolean;
  environment: 'production' | 'staging';
  canRun: boolean;
  recentRuns: HealthRunRow[];
}

// ─── utils ───────────────────────────────────────────────────────────────────

function isSuperAdmin(user: { role: string; email: string }) {
  return user.role === 'super_admin' || user.email === 'dinu.sri.m@gmail.com';
}

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function money(rng: () => number, min: number, max: number) {
  return Math.round((min + rng() * (max - min)) * 100) / 100;
}

function int(rng: () => number, min: number, max: number) {
  return Math.floor(min + rng() * (max - min + 1));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function parseSteps(raw: string | null | undefined): HealthStepResult[] {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parseCreated(raw: string | null | undefined): Record<string, string> {
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function parseTxList(created: Record<string, string>): string[] {
  const raw = created.transactionIds;
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
}

function parseDocList(created: Record<string, string>): string[] {
  const raw = created.docIds;
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
}

async function getTenantEnvironment(tenantId: string): Promise<'production' | 'staging'> {
  const [t] = await db()
    .select({ environment: tenants.environment })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return t?.environment === 'staging' ? 'staging' : 'production';
}

async function assertCanManageHealthCheck() {
  const user = await requireTenantContext();
  if (!isSuperAdmin(user)) throw new Error('Only super admin can use ERP Health Check.');
  return user;
}

async function productQty(
  tenantId: string,
  productId: string,
  locationId?: string | null,
): Promise<number> {
  const [row] = await db()
    .select({
      q: sql<string>`coalesce(sum(cast(${inventoryStockLevels.qtyOnHand} as numeric)), 0)`,
    })
    .from(inventoryStockLevels)
    .where(
      and(
        eq(inventoryStockLevels.tenantId, tenantId),
        eq(inventoryStockLevels.productId, productId),
        locationId
          ? eq(inventoryStockLevels.locationId, locationId)
          : sql`true`,
      ),
    );
  return Number(row?.q ?? 0);
}

async function journalCodesForTx(
  tenantId: string,
  transactionId: string | null | undefined,
): Promise<{ code: string; side: string; amount: number }[]> {
  if (!transactionId) return [];
  const rows = await db()
    .select({
      code: accounts.code,
      side: journalLines.side,
      amount: journalLines.amount,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .where(
      and(
        eq(journalLines.tenantId, tenantId),
        eq(journalEntries.transactionId, transactionId),
        isNull(journalEntries.voidedAt),
        isNull(journalLines.voidedAt),
      ),
    );
  return rows.map((r) => ({ code: r.code, side: r.side, amount: Number(r.amount) }));
}

function assertHasAccount(
  lines: { code: string; side: string; amount: number }[],
  code: string,
  side: 'debit' | 'credit',
  label: string,
) {
  const hit = lines.find((l) => l.code === code && l.side === side && l.amount > 0.005);
  if (!hit) {
    const dump = lines.map((l) => `${l.side[0]?.toUpperCase()} ${l.code} ${l.amount}`).join(', ');
    throw new Error(`${label}: expected ${side} ${code}. Journal: [${dump || 'empty'}]`);
  }
}

function assertJournalBalanced(lines: { side: string; amount: number }[], label: string) {
  const dr =
    Math.round(lines.filter((l) => l.side === 'debit').reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const cr =
    Math.round(lines.filter((l) => l.side === 'credit').reduce((s, l) => s + l.amount, 0) * 100) /
    100;
  if (Math.abs(dr - cr) > 0.02) {
    throw new Error(`${label}: unbalanced Dr ${dr} vs Cr ${cr}`);
  }
}

/** Only journals belonging to this health-check run’s transactions. */
async function checkRunJournalsBalanced(tenantId: string, transactionIds: string[]) {
  if (transactionIds.length === 0) return { ok: true, debit: 0, credit: 0, count: 0 };
  const [totals] = await db()
    .select({
      debit: sql<string>`coalesce(sum(case when ${journalLines.side} = 'debit' then ${journalLines.amount}::numeric else 0 end), 0)`,
      credit: sql<string>`coalesce(sum(case when ${journalLines.side} = 'credit' then ${journalLines.amount}::numeric else 0 end), 0)`,
      count: sql<string>`count(*)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
    .where(
      and(
        eq(journalLines.tenantId, tenantId),
        isNull(journalEntries.voidedAt),
        isNull(journalLines.voidedAt),
        inArray(journalEntries.transactionId, transactionIds),
      ),
    );
  const debit = Number(totals?.debit ?? 0);
  const credit = Number(totals?.credit ?? 0);
  return {
    ok: Math.abs(debit - credit) < 0.02,
    debit,
    credit,
    count: Number(totals?.count ?? 0),
  };
}

async function lastPaymentTxForInvoiceTx(
  tenantId: string,
  invoiceTransactionId: string,
): Promise<string | null> {
  const [row] = await db()
    .select({ id: settlementAllocations.paymentTransactionId })
    .from(settlementAllocations)
    .where(
      and(
        eq(settlementAllocations.tenantId, tenantId),
        eq(settlementAllocations.invoiceTransactionId, invoiceTransactionId),
        isNull(settlementAllocations.voidedAt),
      ),
    )
    .orderBy(desc(settlementAllocations.createdAt))
    .limit(1);
  return row?.id ?? null;
}

async function applyStockDelta(
  tenantId: string,
  productId: string,
  locationId: string | null,
  delta: number,
) {
  const [level] = await db()
    .select()
    .from(inventoryStockLevels)
    .where(
      and(
        eq(inventoryStockLevels.tenantId, tenantId),
        eq(inventoryStockLevels.productId, productId),
        locationId
          ? eq(inventoryStockLevels.locationId, locationId)
          : sql`${inventoryStockLevels.locationId} is null`,
      ),
    )
    .limit(1);
  const next = Number(level?.qtyOnHand ?? 0) + delta;
  if (level) {
    await db()
      .update(inventoryStockLevels)
      .set({ qtyOnHand: next.toFixed(4), updatedAt: new Date() })
      .where(eq(inventoryStockLevels.id, level.id));
  } else {
    await db().insert(inventoryStockLevels).values({
      tenantId,
      productId,
      locationId,
      qtyOnHand: next.toFixed(4),
    });
  }
}

// ─── page API ────────────────────────────────────────────────────────────────

export async function getHealthCheckPageData(): Promise<HealthCheckPageData> {
  const user = await assertCanManageHealthCheck();
  const environment = await getTenantEnvironment(user.tenantId);
  const runs = await withTenantContext(user.tenantId, async () => {
    return db()
      .select()
      .from(healthCheckRuns)
      .where(eq(healthCheckRuns.tenantId, user.tenantId))
      .orderBy(desc(healthCheckRuns.startedAt))
      .limit(15);
  });

  return {
    isSuperAdmin: true,
    environment,
    canRun: environment === 'staging',
    recentRuns: runs.map((r) => ({
      id: r.id,
      status: r.status,
      suite: r.suite,
      seed: r.seed,
      steps: parseSteps(r.stepsJson),
      created: parseCreated(r.createdJson),
      summary: r.summary,
      errorMessage: r.errorMessage,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    })),
  };
}

export async function setTenantEnvironment(
  env: 'production' | 'staging',
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await assertCanManageHealthCheck();
    await db()
      .update(tenants)
      .set({ environment: env, updatedAt: new Date() })
      .where(eq(tenants.id, user.tenantId));
    revalidatePath('/control-room/health-check');
    revalidatePath('/control-room/modules');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not update environment.' };
  }
}

// ─── suite ───────────────────────────────────────────────────────────────────

export async function runHealthCheckSuite(input?: {
  suite?: 'full' | 'core';
  seed?: number;
}): Promise<{ ok: boolean; runId?: string; error?: string; run?: HealthRunRow }> {
  try {
    const user = await assertCanManageHealthCheck();
    const environment = await getTenantEnvironment(user.tenantId);
    if (environment !== 'staging') {
      return {
        ok: false,
        error:
          'This company is marked production. Switch to Staging first, then run the suite.',
      };
    }

    const suite = input?.suite === 'core' ? 'core' : 'full';
    const seed = input?.seed ?? (Date.now() % 1_000_000_000);
    const rng = makeRng(seed);
    const issueDate = today();

    const [runRow] = await db()
      .insert(healthCheckRuns)
      .values({
        tenantId: user.tenantId,
        userId: user.id,
        status: 'running',
        suite,
        seed,
        stepsJson: '[]',
        createdJson: '{}',
        summary: 'Running…',
      })
      .returning();

    const runId = runRow.id;
    const steps: HealthStepResult[] = [];
    const created: Record<string, string> = {};
    const txIds: string[] = [];
    const docIds: string[] = [];
    let failed = false;

    const trackTx = (id: string | null | undefined) => {
      if (id && !txIds.includes(id)) {
        txIds.push(id);
        created.transactionIds = JSON.stringify(txIds);
      }
    };
    const trackDoc = (id: string | null | undefined, key?: string) => {
      if (!id) return;
      if (!docIds.includes(id)) {
        docIds.push(id);
        created.docIds = JSON.stringify(docIds);
      }
      if (key) created[key] = id;
    };

    const unitCost = money(rng, 40, 180);
    const sellPrice = money(rng, unitCost + 20, unitCost + 200);
    const buyQty = int(rng, 10, 24);
    const sellQty =
      suite === 'full'
        ? Math.max(2, int(rng, 2, Math.max(2, Math.floor(buyQty / 3))))
        : int(rng, 1, Math.max(1, Math.floor(buyQty / 3)));
    const productName = `HC Widget ${seed.toString(36).toUpperCase()}`;
    let grnQty = 0;
    let posQty = 0;
    let locationId: string | null = null;
    let brandId: string | null = null;

    // Settings snapshots to restore
    let salesSnap: {
      id?: string;
      vatRegistered: string;
      enforceCreditLimit: string;
      vatRatePercent: string;
    } | null = null;
    let invSnap: { id?: string; negativeStockPolicy: string } | null = null;

    async function step(
      id: string,
      title: string,
      fn: () => Promise<{ detail: string; meta?: HealthStepResult['meta'] }>,
      opts?: { optional?: boolean },
    ) {
      if (failed && !opts?.optional) {
        steps.push({ id, title, detail: 'Skipped after previous failure', status: 'skipped' });
        return;
      }
      if (failed && opts?.optional) {
        steps.push({ id, title, detail: 'Skipped after previous failure', status: 'skipped' });
        return;
      }
      const t0 = Date.now();
      steps.push({ id, title, detail: 'Running…', status: 'running' });
      await db()
        .update(healthCheckRuns)
        .set({
          stepsJson: JSON.stringify(steps),
          createdJson: JSON.stringify(created),
          updatedAt: new Date(),
        })
        .where(eq(healthCheckRuns.id, runId));

      try {
        const result = await fn();
        const idx = steps.findIndex((s) => s.id === id);
        steps[idx] = {
          id,
          title,
          detail: result.detail,
          status: 'passed',
          ms: Date.now() - t0,
          meta: result.meta,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Step failed';
        // Optional steps record failure but don't abort suite
        if (opts?.optional) {
          const idx = steps.findIndex((s) => s.id === id);
          steps[idx] = {
            id,
            title,
            detail: `Optional: ${msg}`,
            status: 'failed',
            ms: Date.now() - t0,
            error: msg,
          };
        } else {
          failed = true;
          const idx = steps.findIndex((s) => s.id === id);
          steps[idx] = {
            id,
            title,
            detail: msg,
            status: 'failed',
            ms: Date.now() - t0,
            error: msg,
          };
        }
      }

      await db()
        .update(healthCheckRuns)
        .set({
          stepsJson: JSON.stringify(steps),
          createdJson: JSON.stringify(created),
          updatedAt: new Date(),
        })
        .where(eq(healthCheckRuns.id, runId));
    }

    // ── 0 preflight ──────────────────────────────────────────────
    await step('preflight', '0. Staging preflight (settings + CoA + dimensions)', async () => {
      const purchaseCfg = await getPurchaseSettings();
      if (purchaseCfg.requireBillApproval) {
        throw new Error(
          'Turn off Purchase “Require approval” so bills post immediately, then re-run.',
        );
      }

      await withTenantContext(user.tenantId, async () => {
        for (const code of ['1000', '1300', '2100', '4000', '4100', '5000', '5100', '6100']) {
          const [a] = await db()
            .select({ id: accounts.id })
            .from(accounts)
            .where(
              and(eq(accounts.tenantId, user.tenantId), eq(accounts.code, code), isNull(accounts.voidedAt)),
            )
            .limit(1);
          if (!a) throw new Error(`Missing account ${code} in chart of accounts`);
        }

        const [loc] = await db()
          .select({ id: locations.id })
          .from(locations)
          .where(and(eq(locations.tenantId, user.tenantId), isNull(locations.voidedAt)))
          .limit(1);
        locationId = loc?.id ?? null;
        if (locationId) created.locationId = locationId;

        const [br] = await db()
          .select({ id: brands.id })
          .from(brands)
          .where(and(eq(brands.tenantId, user.tenantId), isNull(brands.voidedAt)))
          .limit(1);
        brandId = br?.id ?? null;
        if (brandId) created.brandId = brandId;

        const [ss] = await db()
          .select()
          .from(salesSettings)
          .where(eq(salesSettings.tenantId, user.tenantId))
          .limit(1);
        if (ss) {
          salesSnap = {
            id: ss.id,
            vatRegistered: ss.vatRegistered,
            enforceCreditLimit: ss.enforceCreditLimit,
            vatRatePercent: String(ss.vatRatePercent),
          };
        }

        const [is] = await db()
          .select()
          .from(inventorySettings)
          .where(eq(inventorySettings.tenantId, user.tenantId))
          .limit(1);
        if (is) {
          invSnap = { id: is.id, negativeStockPolicy: is.negativeStockPolicy };
        }
      });

      return {
        detail: `Staging · CoA OK · location ${locationId ? 'yes' : 'none'} · brand ${brandId ? 'yes' : 'none'} · seed ${seed}`,
        meta: {
          seed,
          suite,
          buyQty,
          sellQty,
          unitCost,
          sellPrice,
          locationId: locationId ?? '',
        },
      };
    });

    // ── 1 product ────────────────────────────────────────────────
    await step('product', '1. Create physical product', async () => {
      const res = await createQuickProduct({
        name: productName,
        productType: 'physical',
        unitCost,
        sellPrice,
      });
      if (!res.ok || !res.product) throw new Error(res.error ?? 'Product create failed');
      created.productId = res.product.id;
      created.productSku = res.product.sku;
      const qty = await withTenantContext(user.tenantId, () =>
        productQty(user.tenantId, res.product!.id),
      );
      if (Math.abs(qty) > 0.001) throw new Error(`New product qty should be 0, got ${qty}`);
      return {
        detail: `SKU ${res.product.sku} · cost ${unitCost} · sell ${sellPrice}`,
        meta: { productId: res.product.id },
      };
    });

    // ── 2 purchase ───────────────────────────────────────────────
    await step('purchase', '2. Purchase bill → Dr 5100 / Cr 2100 + stock', async () => {
      if (!created.productId) throw new Error('No product');
      const qtyBefore = await withTenantContext(user.tenantId, () =>
        productQty(user.tenantId, created.productId!),
      );
      const res = await createCommercialDocument({
        documentType: 'purchase',
        partyName: `HC Vendor ${seed}`,
        issueDate,
        dueDate: issueDate,
        notes: `health-check ${runId}`,
        supplierInvoiceNumber: `HC-PUR-${seed}`,
        locationId: locationId,
        lines: [
          {
            productId: created.productId,
            description: productName,
            quantity: buyQty,
            unitPrice: unitCost,
            unitCost,
            discountAmount: 0,
          },
        ],
      });
      if (!res.ok || !res.id) throw new Error(res.error ?? 'Purchase failed');
      trackDoc(res.id, 'purchaseId');
      const doc = await getCommercialDocument(res.id);
      if (!doc?.transactionId) throw new Error('Purchase GL not posted (no transactionId)');
      trackTx(doc.transactionId);
      const j = await withTenantContext(user.tenantId, () =>
        journalCodesForTx(user.tenantId, doc.transactionId),
      );
      assertJournalBalanced(j, 'Purchase');
      assertHasAccount(j, '5100', 'debit', 'Purchase inv');
      assertHasAccount(j, '2100', 'credit', 'Purchase AP');
      const qtyAfter = await withTenantContext(user.tenantId, () =>
        productQty(user.tenantId, created.productId!),
      );
      if (Math.abs(qtyAfter - qtyBefore - buyQty) > 0.001) {
        throw new Error(`Stock +${buyQty} expected, delta ${qtyAfter - qtyBefore}`);
      }
      return {
        detail: `${doc.documentNumber} · AP ${doc.balanceDue.toFixed(2)} · stock +${buyQty}`,
        meta: { balanceDue: doc.balanceDue },
      };
    });

    // ── 3 pay vendor + payment journal ───────────────────────────
    await step('pay_vendor', '3. Pay vendor → Dr 2100 / Cr 1000 (payment journal)', async () => {
      if (!created.purchaseId) throw new Error('No purchase');
      const doc = await getCommercialDocument(created.purchaseId);
      if (!doc?.transactionId) throw new Error('Purchase missing');
      const amount = doc.balanceDue;
      const pay = await allocateDocumentPayment({
        documentId: created.purchaseId,
        paymentDate: issueDate,
        paymentAccountCode: '1000',
        amount,
      });
      if (!pay.ok) throw new Error(pay.error ?? 'Pay failed');
      const payTx = await withTenantContext(user.tenantId, () =>
        lastPaymentTxForInvoiceTx(user.tenantId, doc.transactionId!),
      );
      if (!payTx) throw new Error('No settlement payment transaction found');
      trackTx(payTx);
      created.payVendorTxId = payTx;
      const j = await withTenantContext(user.tenantId, () =>
        journalCodesForTx(user.tenantId, payTx),
      );
      assertJournalBalanced(j, 'Pay vendor');
      assertHasAccount(j, '2100', 'debit', 'Pay AP clear');
      assertHasAccount(j, '1000', 'credit', 'Pay cash out');
      const after = await getCommercialDocument(created.purchaseId);
      if (!after || after.balanceDue > 0.01) throw new Error(`Bill still open ${after?.balanceDue}`);
      return { detail: `Paid ${amount.toFixed(2)} · payment journal OK`, meta: { amount } };
    });

    // ── 4 sale ───────────────────────────────────────────────────
    await step('sale', '4. Sales invoice → AR + revenue + COGS', async () => {
      if (!created.productId) throw new Error('No product');
      const qtyBefore = await withTenantContext(user.tenantId, () =>
        productQty(user.tenantId, created.productId!),
      );
      const res = await createCommercialDocument({
        documentType: 'sales_invoice',
        partyName: `HC Customer ${seed}`,
        issueDate,
        dueDate: issueDate,
        notes: `health-check ${runId}`,
        invoiceKind: 'commercial',
        saleChannel: 'local',
        locationId: locationId,
        lines: [
          {
            productId: created.productId,
            description: productName,
            quantity: sellQty,
            unitPrice: sellPrice,
            unitCost,
            discountAmount: 0,
          },
        ],
      });
      if (!res.ok || !res.id) throw new Error(res.error ?? 'Invoice failed');
      trackDoc(res.id, 'invoiceId');
      const doc = await getCommercialDocument(res.id);
      if (!doc?.transactionId) throw new Error('Invoice GL not posted');
      trackTx(doc.transactionId);
      const j = await withTenantContext(user.tenantId, () =>
        journalCodesForTx(user.tenantId, doc.transactionId),
      );
      assertJournalBalanced(j, 'Invoice');
      assertHasAccount(j, '1300', 'debit', 'AR');
      assertHasAccount(j, '4000', 'credit', 'Revenue');
      assertHasAccount(j, '5000', 'debit', 'COGS');
      assertHasAccount(j, '5100', 'credit', 'Inv out');
      const qtyAfter = await withTenantContext(user.tenantId, () =>
        productQty(user.tenantId, created.productId!),
      );
      if (Math.abs(qtyAfter - qtyBefore + sellQty) > 0.001) {
        throw new Error(`Stock −${sellQty} expected, delta ${qtyAfter - qtyBefore}`);
      }
      return {
        detail: `${doc.documentNumber} · AR ${doc.balanceDue.toFixed(2)} · stock −${sellQty}`,
        meta: { total: doc.total },
      };
    });

    // ── 5 return (full) while AR open ────────────────────────────
    if (suite === 'full') {
      await step('return', '5. Sales return → apply source AR + restock', async () => {
        if (!created.productId || !created.invoiceId) throw new Error('Missing ids');
        const retQty = 1;
        const invBefore = await getCommercialDocument(created.invoiceId);
        if (!invBefore || invBefore.balanceDue <= 0.005) {
          throw new Error('Invoice must still be open for return apply test');
        }
        const qtyBefore = await withTenantContext(user.tenantId, () =>
          productQty(user.tenantId, created.productId!),
        );
        const res = await createCommercialDocument({
          documentType: 'sales_return',
          partyName: `HC Customer ${seed}`,
          issueDate,
          notes: `health-check return ${runId}`,
          sourceDocumentId: created.invoiceId,
          locationId: locationId,
          lines: [
            {
              productId: created.productId,
              description: productName,
              quantity: retQty,
              unitPrice: sellPrice,
              unitCost,
              discountAmount: 0,
            },
          ],
        });
        if (!res.ok || !res.id) throw new Error(res.error ?? 'Return failed');
        trackDoc(res.id, 'returnId');
        const retDoc = await getCommercialDocument(res.id);
        if (!retDoc?.transactionId) throw new Error('Return GL not posted');
        trackTx(retDoc.transactionId);
        const j = await withTenantContext(user.tenantId, () =>
          journalCodesForTx(user.tenantId, retDoc.transactionId),
        );
        assertJournalBalanced(j, 'Return');
        assertHasAccount(j, '4100', 'debit', 'Sales returns');
        assertHasAccount(j, '1300', 'credit', 'Return AR');
        assertHasAccount(j, '5100', 'debit', 'Restock');
        assertHasAccount(j, '5000', 'credit', 'COGS reverse');
        const qtyAfter = await withTenantContext(user.tenantId, () =>
          productQty(user.tenantId, created.productId!),
        );
        if (Math.abs(qtyAfter - qtyBefore - retQty) > 0.001) {
          throw new Error(`Restock +${retQty} failed`);
        }
        const invAfter = await getCommercialDocument(created.invoiceId);
        const applied = Math.round((invBefore.balanceDue - (invAfter?.balanceDue ?? 0)) * 100) / 100;
        const expectApply = Math.round(retQty * sellPrice * 100) / 100;
        if (Math.abs(applied - expectApply) > 0.05) {
          throw new Error(`Source AR apply expected ~${expectApply}, got ${applied}`);
        }
        return {
          detail: `Return OK · AR −${applied.toFixed(2)} · stock +${retQty}`,
          meta: { applied },
        };
      });
    }

    // ── 6 receive remaining + payment journal ────────────────────
    await step(
      'receive',
      suite === 'full'
        ? '6. Receive remaining AR → Dr 1000 / Cr 1300'
        : '5. Receive payment → Dr 1000 / Cr 1300',
      async () => {
        if (!created.invoiceId) throw new Error('No invoice');
        const doc = await getCommercialDocument(created.invoiceId);
        if (!doc?.transactionId) throw new Error('Invoice missing');
        const amount = doc.balanceDue;
        if (amount <= 0.005) {
          return { detail: 'Already settled — OK', meta: { amount: 0 } };
        }
        const pay = await allocateDocumentPayment({
          documentId: created.invoiceId,
          paymentDate: issueDate,
          paymentAccountCode: '1000',
          amount,
        });
        if (!pay.ok) throw new Error(pay.error ?? 'Receive failed');
        const payTx = await withTenantContext(user.tenantId, () =>
          lastPaymentTxForInvoiceTx(user.tenantId, doc.transactionId!),
        );
        if (!payTx) throw new Error('Receive payment tx not found');
        trackTx(payTx);
        created.receiveTxId = payTx;
        const j = await withTenantContext(user.tenantId, () =>
          journalCodesForTx(user.tenantId, payTx),
        );
        assertJournalBalanced(j, 'Receive payment');
        assertHasAccount(j, '1000', 'debit', 'Cash in');
        assertHasAccount(j, '1300', 'credit', 'AR clear');
        const after = await getCommercialDocument(created.invoiceId);
        if (!after || after.balanceDue > 0.01) throw new Error(`AR still ${after?.balanceDue}`);
        return { detail: `Received ${amount.toFixed(2)} · payment journal OK`, meta: { amount } };
      },
    );

    // ── 7 GRN (full) ─────────────────────────────────────────────
    if (suite === 'full') {
      await step('grn_path', '7. PO → GRN → bill (no double stock)', async () => {
        if (!created.productId) throw new Error('No product');
        grnQty = int(rng, 2, 5);
        const purchaseCfg = await getPurchaseSettings();
        const po = await createCommercialDocument({
          documentType: 'purchase_order',
          partyName: `HC GRN Vendor ${seed}`,
          issueDate,
          notes: `health-check PO ${runId}`,
          locationId: locationId,
          lines: [
            {
              productId: created.productId,
              description: `${productName} GRN`,
              quantity: grnQty,
              unitPrice: unitCost,
              unitCost,
              discountAmount: 0,
            },
          ],
        });
        if (!po.ok || !po.id) throw new Error(po.error ?? 'PO failed');
        trackDoc(po.id, 'poId');
        const poDoc = await getCommercialDocument(po.id);
        if (poDoc?.transactionId) throw new Error('PO must not post GL');

        const qtyBefore = await withTenantContext(user.tenantId, () =>
          productQty(user.tenantId, created.productId!),
        );
        const grn = await createCommercialDocument({
          documentType: 'goods_receipt',
          partyName: `HC GRN Vendor ${seed}`,
          issueDate,
          sourceDocumentId: po.id,
          notes: `health-check GRN ${runId}`,
          locationId: locationId,
          lines: [
            {
              productId: created.productId,
              description: `${productName} GRN`,
              quantity: grnQty,
              unitPrice: unitCost,
              unitCost,
              discountAmount: 0,
            },
          ],
        });
        if (!grn.ok || !grn.id) throw new Error(grn.error ?? 'GRN failed');
        trackDoc(grn.id, 'grnId');
        const grnDoc = await getCommercialDocument(grn.id);
        if (grnDoc?.transactionId) trackTx(grnDoc.transactionId);
        const qtyAfterGrn = await withTenantContext(user.tenantId, () =>
          productQty(user.tenantId, created.productId!),
        );
        if (Math.abs(qtyAfterGrn - qtyBefore - grnQty) > 0.001) {
          throw new Error(`GRN stock +${grnQty} failed`);
        }
        if (purchaseCfg.postGrniOnReceipt && grnDoc?.transactionId) {
          const gj = await withTenantContext(user.tenantId, () =>
            journalCodesForTx(user.tenantId, grnDoc.transactionId),
          );
          assertHasAccount(gj, '2150', 'credit', 'GRNI');
        }

        const bill = await createCommercialDocument({
          documentType: 'purchase',
          partyName: `HC GRN Vendor ${seed}`,
          issueDate,
          sourceDocumentId: grn.id,
          notes: `health-check bill-GRN ${runId}`,
          supplierInvoiceNumber: `HC-GRN-${seed}`,
          locationId: locationId,
          lines: [
            {
              productId: created.productId,
              description: `${productName} GRN`,
              quantity: grnQty,
              unitPrice: unitCost,
              unitCost,
              discountAmount: 0,
            },
          ],
        });
        if (!bill.ok || !bill.id) throw new Error(bill.error ?? 'Bill failed');
        trackDoc(bill.id, 'grnBillId');
        const billDoc = await getCommercialDocument(bill.id);
        if (!billDoc?.transactionId) throw new Error('GRN bill not posted');
        trackTx(billDoc.transactionId);
        const qtyAfterBill = await withTenantContext(user.tenantId, () =>
          productQty(user.tenantId, created.productId!),
        );
        if (Math.abs(qtyAfterBill - qtyAfterGrn) > 0.001) {
          throw new Error(`Double stock on bill: ${qtyAfterGrn} → ${qtyAfterBill}`);
        }
        const bj = await withTenantContext(user.tenantId, () =>
          journalCodesForTx(user.tenantId, billDoc.transactionId),
        );
        assertJournalBalanced(bj, 'GRN bill');
        assertHasAccount(bj, '2100', 'credit', 'GRN bill AP');
        return {
          detail: `GRN +${grnQty} · bill no stock change · GRNI=${purchaseCfg.postGrniOnReceipt ? 'on' : 'off'}`,
          meta: { grnQty },
        };
      });
    }

    // ── full: VAT tax invoice ────────────────────────────────────
    if (suite === 'full') {
      await step('tax_vat', '8. Tax invoice → Output VAT 2200', async () => {
        if (!created.productId) throw new Error('No product');
        await withTenantContext(user.tenantId, async () => {
          const [ss] = await db()
            .select()
            .from(salesSettings)
            .where(eq(salesSettings.tenantId, user.tenantId))
            .limit(1);
          if (ss) {
            await db()
              .update(salesSettings)
              .set({
                vatRegistered: '1',
                vatRatePercent: '18.00',
                updatedAt: new Date(),
              })
              .where(eq(salesSettings.id, ss.id));
          } else {
            await db().insert(salesSettings).values({
              tenantId: user.tenantId,
              vatRegistered: '1',
              vatRatePercent: '18.00',
            });
          }
        });

        const taxQty = 1;
        const res = await createCommercialDocument({
          documentType: 'sales_invoice',
          partyName: `HC Tax Customer ${seed}`,
          issueDate,
          notes: `health-check tax ${runId}`,
          invoiceKind: 'tax_invoice',
          saleChannel: 'local',
          locationId: locationId,
          lines: [
            {
              productId: created.productId,
              description: `${productName} tax`,
              quantity: taxQty,
              unitPrice: sellPrice,
              unitCost,
              discountAmount: 0,
            },
          ],
        });
        if (!res.ok || !res.id) throw new Error(res.error ?? 'Tax invoice failed');
        trackDoc(res.id, 'taxInvoiceId');
        created._taxQty = String(taxQty);
        const doc = await getCommercialDocument(res.id);
        if (!doc?.transactionId) throw new Error('Tax invoice not posted');
        trackTx(doc.transactionId);
        const j = await withTenantContext(user.tenantId, () =>
          journalCodesForTx(user.tenantId, doc.transactionId),
        );
        assertJournalBalanced(j, 'Tax invoice');
        assertHasAccount(j, '2200', 'credit', 'Output VAT');
        assertHasAccount(j, '1300', 'debit', 'Tax AR incl VAT');
        const expectVat = Math.round(sellPrice * 0.18 * 100) / 100;
        const vatLine = j.find((l) => l.code === '2200' && l.side === 'credit');
        if (!vatLine || Math.abs(vatLine.amount - expectVat) > 0.05) {
          throw new Error(`VAT amount expected ~${expectVat}, got ${vatLine?.amount}`);
        }
        // Pay it so AR clean
        if (doc.balanceDue > 0.005) {
          const pay = await allocateDocumentPayment({
            documentId: res.id,
            paymentDate: issueDate,
            paymentAccountCode: '1000',
            amount: doc.balanceDue,
          });
          if (pay.ok) {
            const ptx = await withTenantContext(user.tenantId, () =>
              lastPaymentTxForInvoiceTx(user.tenantId, doc.transactionId!),
            );
            trackTx(ptx);
          }
        }
        return {
          detail: `Tax invoice VAT ${expectVat.toFixed(2)} on 2200 · posted`,
          meta: { vat: expectVat },
        };
      });
    }

    const taxQtyOut = Number(created._taxQty ?? 0);

    // ── full: Simple Entry ───────────────────────────────────────
    if (suite === 'full') {
      await step('simple_entry', '9. Simple Entry money out (inferTransaction engine)', async () => {
        const amt = money(rng, 100, 400);
        const se = await recordEntry({
          direction: 'money_out',
          party: `HC SE Landlord ${seed}`,
          description: 'Health check rent expense',
          amount: amt,
          currency: 'LKR',
          paymentMethod: 'Cash',
          paymentAccount: { kind: 'code', value: '1000' },
          date: issueDate,
          categoryOverride: '6100',
          forceDuplicate: true,
          ...(brandId ? { brandId } : {}),
          ...(locationId ? { locationId } : {}),
        });
        if (!se.success || !se.transactionId) {
          throw new Error(se.error ?? 'Simple Entry failed');
        }
        trackTx(se.transactionId);
        created.simpleEntryTxId = se.transactionId;
        const j = await withTenantContext(user.tenantId, () =>
          journalCodesForTx(user.tenantId, se.transactionId),
        );
        assertJournalBalanced(j, 'Simple Entry');
        assertHasAccount(j, '6100', 'debit', 'SE expense');
        assertHasAccount(j, '1000', 'credit', 'SE cash');
        return {
          detail: `SE money out ${amt.toFixed(2)} · Dr 6100 / Cr 1000`,
          meta: { amount: amt, transactionId: se.transactionId },
        };
      });
    }

    // ── full: credit limit block ─────────────────────────────────
    if (suite === 'full') {
      await step('credit_limit', '10. Credit limit enforcement (must block)', async () => {
        if (!created.productId) throw new Error('No product');
        await withTenantContext(user.tenantId, async () => {
          const [ss] = await db()
            .select()
            .from(salesSettings)
            .where(eq(salesSettings.tenantId, user.tenantId))
            .limit(1);
          if (ss) {
            await db()
              .update(salesSettings)
              .set({ enforceCreditLimit: '1', updatedAt: new Date() })
              .where(eq(salesSettings.id, ss.id));
          } else {
            await db().insert(salesSettings).values({
              tenantId: user.tenantId,
              enforceCreditLimit: '1',
            });
          }
          // Unique party with tiny limit
          const name = `HC Limited Buyer ${seed}`;
          const [p] = await db()
            .insert(parties)
            .values({
              tenantId: user.tenantId,
              name,
              kind: 'customer',
              isCustomer: '1',
              isVendor: '0',
              status: 'active',
              creditLimit: '50.00',
              code: `HC-L-${seed}`.slice(0, 40),
            })
            .returning({ id: parties.id });
          if (p) created.limitedPartyId = p.id;
        });

        const res = await createCommercialDocument({
          documentType: 'sales_invoice',
          partyName: `HC Limited Buyer ${seed}`,
          issueDate,
          notes: `health-check credit-limit ${runId}`,
          invoiceKind: 'commercial',
          saleChannel: 'local',
          lines: [
            {
              productId: created.productId,
              description: productName,
              quantity: 1,
              unitPrice: 5000,
              unitCost,
              discountAmount: 0,
            },
          ],
        });
        if (res.ok) {
          // Should have blocked — if it posted, clean it and fail
          if (res.id) {
            trackDoc(res.id, 'creditLimitLeakId');
            const d = await getCommercialDocument(res.id);
            trackTx(d?.transactionId);
          }
          throw new Error('Credit limit should have blocked this invoice (limit 50, sale 5000)');
        }
        if (!/credit limit/i.test(res.error ?? '')) {
          throw new Error(`Expected credit limit error, got: ${res.error}`);
        }
        return {
          detail: `Blocked correctly: ${res.error}`,
          meta: {},
        };
      });
    }

    // ── full: negative stock block ───────────────────────────────
    if (suite === 'full') {
      await step('neg_stock', '11. Negative stock block (must reject oversell)', async () => {
        if (!created.productId) throw new Error('No product');
        await withTenantContext(user.tenantId, async () => {
          const [is] = await db()
            .select()
            .from(inventorySettings)
            .where(eq(inventorySettings.tenantId, user.tenantId))
            .limit(1);
          if (is) {
            await db()
              .update(inventorySettings)
              .set({ negativeStockPolicy: 'block', updatedAt: new Date() })
              .where(eq(inventorySettings.id, is.id));
          } else {
            await db().insert(inventorySettings).values({
              tenantId: user.tenantId,
              negativeStockPolicy: 'block',
            });
          }
        });

        const onHand = await withTenantContext(user.tenantId, () =>
          productQty(user.tenantId, created.productId!),
        );
        const oversell = Math.floor(onHand) + 50;
        const res = await createCommercialDocument({
          documentType: 'sales_invoice',
          partyName: `HC Oversell ${seed}`,
          issueDate,
          notes: `health-check neg-stock ${runId}`,
          invoiceKind: 'commercial',
          saleChannel: 'local',
          locationId: locationId,
          lines: [
            {
              productId: created.productId,
              description: productName,
              quantity: oversell,
              unitPrice: sellPrice,
              unitCost,
              discountAmount: 0,
            },
          ],
        });
        if (res.ok) {
          if (res.id) {
            trackDoc(res.id, 'negStockLeakId');
            const d = await getCommercialDocument(res.id);
            trackTx(d?.transactionId);
          }
          throw new Error(`Oversell of ${oversell} should fail when negative stock is blocked`);
        }
        if (!/insufficient stock|negative/i.test(res.error ?? '')) {
          throw new Error(`Expected insufficient stock error, got: ${res.error}`);
        }
        // restore allow for remaining steps
        await withTenantContext(user.tenantId, async () => {
          const [is] = await db()
            .select()
            .from(inventorySettings)
            .where(eq(inventorySettings.tenantId, user.tenantId))
            .limit(1);
          if (is) {
            await db()
              .update(inventorySettings)
              .set({
                negativeStockPolicy: invSnap?.negativeStockPolicy ?? 'allow',
                updatedAt: new Date(),
              })
              .where(eq(inventorySettings.id, is.id));
          }
        });
        return {
          detail: `Blocked oversell ${oversell} (on hand ${onHand.toFixed(2)})`,
          meta: { onHand, oversell },
        };
      });
    }

    // ── full: POS ────────────────────────────────────────────────
    if (suite === 'full') {
      await step('pos', '12. POS cash sale (register path)', async () => {
        if (!created.productId) throw new Error('No product');
        const regs = await withTenantContext(user.tenantId, async () => {
          return db()
            .select()
            .from(posRegisters)
            .where(
              and(
                eq(posRegisters.tenantId, user.tenantId),
                isNull(posRegisters.voidedAt),
                eq(posRegisters.isActive, '1'),
              ),
            )
            .limit(1);
        });
        let reg = regs[0];
        if (!reg) {
          // ensure one
          const [createdReg] = await withTenantContext(user.tenantId, async () => {
            return db()
              .insert(posRegisters)
              .values({
                tenantId: user.tenantId,
                code: 'HC-REG',
                name: 'Health Check Register',
                printMode: 'browser',
                isActive: '1',
                defaultPaymentAccountCode: '1000',
              })
              .returning();
          });
          reg = createdReg;
        }
        const shift = await openPosShift({ registerId: reg.id, openingFloat: 0 });
        if (!shift.ok || !shift.shiftId) throw new Error(shift.error ?? 'Open shift failed');
        created.posShiftId = shift.shiftId;
        created.posRegisterId = reg.id;

        const qtyBefore = await withTenantContext(user.tenantId, () =>
          productQty(user.tenantId, created.productId!),
        );
        if (qtyBefore < 1) throw new Error('Need at least 1 unit stock for POS sale');

        const sale = await completePosSale({
          registerId: reg.id,
          shiftId: shift.shiftId,
          partyName: `HC POS Walk-in ${seed}`,
          invoiceKind: 'commercial',
          tender: 'cash',
          lines: [
            {
              productId: created.productId,
              description: productName,
              quantity: 1,
              unitPrice: sellPrice,
            },
          ],
          notes: `health-check POS ${runId}`,
        });
        if (!sale.ok || !sale.id) throw new Error(sale.error ?? 'POS sale failed');
        trackDoc(sale.id, 'posSaleId');
        posQty = 1;
        const doc = await getCommercialDocument(sale.id);
        if (!doc?.transactionId) throw new Error('POS sale not posted');
        trackTx(doc.transactionId);
        const j = await withTenantContext(user.tenantId, () =>
          journalCodesForTx(user.tenantId, doc.transactionId),
        );
        assertJournalBalanced(j, 'POS');
        // Cash POS debits cash not AR
        assertHasAccount(j, '1000', 'debit', 'POS cash');
        assertHasAccount(j, '4000', 'credit', 'POS revenue');
        const qtyAfter = await withTenantContext(user.tenantId, () =>
          productQty(user.tenantId, created.productId!),
        );
        if (Math.abs(qtyAfter - qtyBefore + 1) > 0.001) {
          throw new Error(`POS stock −1 failed (${qtyBefore} → ${qtyAfter})`);
        }
        return {
          detail: `POS ${doc.documentNumber} · cash sale · stock −1`,
          meta: { posSaleId: sale.id },
        };
      });
    }

    // ── final balance ────────────────────────────────────────────
    await step('balance', 'Final. Run-scoped TB + stock formula', async () => {
      if (!created.productId) throw new Error('No product');
      const retQty = suite === 'full' ? 1 : 0;
      const expectedQty = buyQty - sellQty + retQty + grnQty - taxQtyOut - posQty;
      const actualQty = await withTenantContext(user.tenantId, () =>
        productQty(user.tenantId, created.productId!),
      );
      if (Math.abs(actualQty - expectedQty) > 0.05) {
        throw new Error(
          `Stock expected ${expectedQty} (buy${buyQty}-sell${sellQty}+ret${retQty}+grn${grnQty}-tax${taxQtyOut}-pos${posQty}), got ${actualQty}`,
        );
      }

      const runBal = await withTenantContext(user.tenantId, () =>
        checkRunJournalsBalanced(user.tenantId, txIds),
      );
      if (!runBal.ok) {
        throw new Error(
          `Run journals unbalanced: Dr ${runBal.debit.toFixed(2)} vs Cr ${runBal.credit.toFixed(2)} (${txIds.length} txs)`,
        );
      }
      if (runBal.count < 2) {
        throw new Error('Run produced too few journal lines — engine may not have posted');
      }

      return {
        detail: `Stock ${actualQty} OK · run TB Dr=${runBal.debit.toFixed(2)} Cr=${runBal.credit.toFixed(2)} · ${txIds.length} txs`,
        meta: {
          expectedQty,
          actualQty,
          debit: runBal.debit,
          credit: runBal.credit,
          txCount: txIds.length,
        },
      };
    });

    // Restore settings
    await withTenantContext(user.tenantId, async () => {
      if (salesSnap?.id) {
        await db()
          .update(salesSettings)
          .set({
            vatRegistered: salesSnap.vatRegistered,
            enforceCreditLimit: salesSnap.enforceCreditLimit,
            vatRatePercent: salesSnap.vatRatePercent,
            updatedAt: new Date(),
          })
          .where(eq(salesSettings.id, salesSnap.id));
      }
      if (invSnap?.id) {
        await db()
          .update(inventorySettings)
          .set({
            negativeStockPolicy: invSnap.negativeStockPolicy,
            updatedAt: new Date(),
          })
          .where(eq(inventorySettings.id, invSnap.id));
      }
    }).catch(() => undefined);

    created.transactionIds = JSON.stringify(txIds);
    created.docIds = JSON.stringify(docIds);

    const hardFails = steps.filter((s) => s.status === 'failed' && !s.detail.startsWith('Optional:'));
    // optional steps that failed still count as failed status on step but we treat suite
    // All current steps are hard except we didn't use optional flag much
    const passed = steps.filter((s) => s.status === 'passed').length;
    const total = steps.filter((s) => s.status !== 'skipped').length;
    const status = failed || hardFails.length > 0 ? 'failed' : 'passed';
    const summary =
      status === 'passed'
        ? `All ${passed} steps passed (seed ${seed}, ${txIds.length} txs)`
        : `${passed}/${total} passed — see failed step`;

    await db()
      .update(healthCheckRuns)
      .set({
        status,
        stepsJson: JSON.stringify(steps),
        createdJson: JSON.stringify(created),
        summary,
        errorMessage: failed ? steps.find((s) => s.status === 'failed')?.error ?? 'Failed' : null,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(healthCheckRuns.id, runId));

    revalidatePath('/control-room/health-check');
    revalidatePath('/inventory/products');
    revalidatePath('/sales/invoices');
    revalidatePath('/purchase/purchases');
    revalidatePath('/journal');
    revalidatePath('/pos');

    const run: HealthRunRow = {
      id: runId,
      status,
      suite,
      seed,
      steps,
      created,
      summary,
      errorMessage: failed ? steps.find((s) => s.status === 'failed')?.error ?? null : null,
      startedAt: runRow.startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
    };

    return { ok: status === 'passed', runId, run, error: run.errorMessage ?? undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Health check failed.' };
  }
}

// ─── solid wipe ──────────────────────────────────────────────────────────────

/**
 * Full cleanup for a health-check run:
 * 1) Reverse stock movements for created docs
 * 2) Void journals + lines for run transactions
 * 3) Void settlements, transactions, documents, product
 */
export async function wipeHealthCheckRun(
  runId: string,
): Promise<{ ok: boolean; error?: string; wiped?: number; detail?: string }> {
  try {
    const user = await assertCanManageHealthCheck();
    const environment = await getTenantEnvironment(user.tenantId);
    if (environment !== 'staging') {
      return { ok: false, error: 'Wipe only allowed on staging companies.' };
    }

    const result = await withTenantContext(user.tenantId, async () => {
      const [run] = await db()
        .select()
        .from(healthCheckRuns)
        .where(and(eq(healthCheckRuns.id, runId), eq(healthCheckRuns.tenantId, user.tenantId)))
        .limit(1);
      if (!run) throw new Error('Run not found.');
      const created = parseCreated(run.createdJson);
      const docs = parseDocList(created);
      // also merge known flat keys
      for (const k of [
        'purchaseId',
        'invoiceId',
        'returnId',
        'poId',
        'grnId',
        'grnBillId',
        'taxInvoiceId',
        'posSaleId',
        'creditLimitLeakId',
        'negStockLeakId',
      ]) {
        if (created[k] && !docs.includes(created[k]!)) docs.push(created[k]!);
      }
      let txs = parseTxList(created);
      for (const k of ['payVendorTxId', 'receiveTxId', 'simpleEntryTxId']) {
        if (created[k] && !txs.includes(created[k]!)) txs.push(created[k]!);
      }

      // Pull any transactionIds from docs
      if (docs.length > 0) {
        const drows = await db()
          .select({
            id: businessDocuments.id,
            transactionId: businessDocuments.transactionId,
          })
          .from(businessDocuments)
          .where(
            and(eq(businessDocuments.tenantId, user.tenantId), inArray(businessDocuments.id, docs)),
          );
        for (const d of drows) {
          if (d.transactionId && !txs.includes(d.transactionId)) txs.push(d.transactionId);
        }
      }

      // Also pull payment txs linked to those invoice txs
      if (txs.length > 0) {
        const pays = await db()
          .select({
            paymentTransactionId: settlementAllocations.paymentTransactionId,
          })
          .from(settlementAllocations)
          .where(
            and(
              eq(settlementAllocations.tenantId, user.tenantId),
              inArray(settlementAllocations.invoiceTransactionId, txs),
            ),
          );
        for (const p of pays) {
          if (!txs.includes(p.paymentTransactionId)) txs.push(p.paymentTransactionId);
        }
      }

      const now = new Date();
      let count = 0;
      let stockReversals = 0;

      // 1. Reverse stock from movements
      if (docs.length > 0) {
        const movs = await db()
          .select()
          .from(inventoryMovements)
          .where(
            and(
              eq(inventoryMovements.tenantId, user.tenantId),
              eq(inventoryMovements.referenceType, 'business_document'),
              inArray(inventoryMovements.referenceId, docs),
            ),
          );
        for (const m of movs) {
          const qty = Number(m.quantity);
          // reverse the delta
          if (qty > 0 && m.toLocationId !== undefined) {
            await applyStockDelta(user.tenantId, m.productId, m.toLocationId ?? null, -qty);
            stockReversals++;
          } else if (qty < 0) {
            await applyStockDelta(user.tenantId, m.productId, m.fromLocationId ?? null, -qty);
            stockReversals++;
          } else if (qty > 0) {
            await applyStockDelta(user.tenantId, m.productId, null, -qty);
            stockReversals++;
          }
        }
      }

      // 2. Void journals for run transactions
      if (txs.length > 0) {
        const journals = await db()
          .select({ id: journalEntries.id })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.tenantId, user.tenantId),
              inArray(journalEntries.transactionId, txs),
              isNull(journalEntries.voidedAt),
            ),
          );
        const jIds = journals.map((j) => j.id);
        if (jIds.length > 0) {
          await db()
            .update(journalLines)
            .set({ voidedAt: now, updatedAt: now })
            .where(
              and(
                eq(journalLines.tenantId, user.tenantId),
                inArray(journalLines.journalEntryId, jIds),
                isNull(journalLines.voidedAt),
              ),
            );
          const jr = await db()
            .update(journalEntries)
            .set({ voidedAt: now, updatedAt: now })
            .where(
              and(
                eq(journalEntries.tenantId, user.tenantId),
                inArray(journalEntries.id, jIds),
                isNull(journalEntries.voidedAt),
              ),
            )
            .returning({ id: journalEntries.id });
          count += jr.length;
        }

        // void settlements linked to run payments or invoices
        await db()
          .update(settlementAllocations)
          .set({ voidedAt: now, updatedAt: now })
          .where(
            and(
              eq(settlementAllocations.tenantId, user.tenantId),
              inArray(settlementAllocations.paymentTransactionId, txs),
              isNull(settlementAllocations.voidedAt),
            ),
          );
        await db()
          .update(settlementAllocations)
          .set({ voidedAt: now, updatedAt: now })
          .where(
            and(
              eq(settlementAllocations.tenantId, user.tenantId),
              inArray(settlementAllocations.invoiceTransactionId, txs),
              isNull(settlementAllocations.voidedAt),
            ),
          );

        const tr = await db()
          .update(transactions)
          .set({ voidedAt: now, updatedAt: now })
          .where(
            and(
              eq(transactions.tenantId, user.tenantId),
              inArray(transactions.id, txs),
              isNull(transactions.voidedAt),
            ),
          )
          .returning({ id: transactions.id });
        count += tr.length;
      }

      // 3. Void documents
      if (docs.length > 0) {
        const dr = await db()
          .update(businessDocuments)
          .set({ voidedAt: now, status: 'void', updatedAt: now })
          .where(
            and(
              eq(businessDocuments.tenantId, user.tenantId),
              inArray(businessDocuments.id, docs),
              isNull(businessDocuments.voidedAt),
            ),
          )
          .returning({ id: businessDocuments.id });
        count += dr.length;
      }

      // 4. Void product + zero levels
      if (created.productId) {
        const pr = await db()
          .update(inventoryProducts)
          .set({ voidedAt: now, isActive: '0', updatedAt: now })
          .where(
            and(
              eq(inventoryProducts.id, created.productId),
              eq(inventoryProducts.tenantId, user.tenantId),
              isNull(inventoryProducts.voidedAt),
            ),
          )
          .returning({ id: inventoryProducts.id });
        count += pr.length;
        await db()
          .update(inventoryStockLevels)
          .set({ qtyOnHand: '0', updatedAt: now })
          .where(
            and(
              eq(inventoryStockLevels.tenantId, user.tenantId),
              eq(inventoryStockLevels.productId, created.productId),
            ),
          );
      }

      // limited party from credit test
      if (created.limitedPartyId) {
        await db()
          .update(parties)
          .set({ voidedAt: now, status: 'inactive', updatedAt: now })
          .where(
            and(
              eq(parties.id, created.limitedPartyId),
              eq(parties.tenantId, user.tenantId),
              isNull(parties.voidedAt),
            ),
          );
      }

      const detail = `voided docs/txs/journals · stock reversals ${stockReversals} · records ~${count}`;
      await db()
        .update(healthCheckRuns)
        .set({
          status: run.status === 'passed' ? 'passed' : run.status,
          summary: `${run.summary ?? ''} · WIPED (${detail})`.trim(),
          updatedAt: now,
        })
        .where(eq(healthCheckRuns.id, runId));

      return { count, stockReversals, detail, txCount: txs.length, docCount: docs.length };
    });

    revalidatePath('/control-room/health-check');
    revalidatePath('/inventory/products');
    revalidatePath('/sales/invoices');
    revalidatePath('/purchase/purchases');
    revalidatePath('/journal');
    revalidatePath('/transactions');
    return {
      ok: true,
      wiped: result.count,
      detail: `${result.detail} · txs ${result.txCount} · docs ${result.docCount}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Wipe failed.' };
  }
}
