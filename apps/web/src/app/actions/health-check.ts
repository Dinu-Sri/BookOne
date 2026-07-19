'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@bookone/auth';
import {
  accounts,
  businessDocuments,
  db,
  eq,
  and,
  isNull,
  desc,
  healthCheckRuns,
  inventoryProducts,
  inventoryStockLevels,
  journalEntries,
  journalLines,
  sql,
  tenants,
  withTenantContext,
} from '@bookone/db';
import { createCommercialDocument, getCommercialDocument } from '@/app/actions/commercial-docs';
import { allocateDocumentPayment } from '@/app/actions/documents';
import { createQuickProduct } from '@/app/actions/inventory';
import { getPurchaseSettings } from '@/app/actions/purchase-settings';

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

function isSuperAdmin(user: { role: string; email: string }) {
  return user.role === 'super_admin' || user.email === 'dinu.sri.m@gmail.com';
}

/** Simple seeded RNG so runs vary but can be replayed with the same seed. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function money(rng: () => number, min: number, max: number) {
  const v = min + rng() * (max - min);
  return Math.round(v * 100) / 100;
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
  if (!isSuperAdmin(user)) {
    throw new Error('Only super admin can use ERP Health Check.');
  }
  return user;
}

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

/** Super-admin only: mark this company as staging (allows health checks). */
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

async function checkJournalsBalanced(tenantId: string): Promise<{
  ok: boolean;
  debit: number;
  credit: number;
  unbalancedEntries: number;
}> {
  const [totals] = await db()
    .select({
      debit: sql<string>`coalesce(sum(case when ${journalLines.side} = 'debit' then ${journalLines.amount}::numeric else 0 end), 0)`,
      credit: sql<string>`coalesce(sum(case when ${journalLines.side} = 'credit' then ${journalLines.amount}::numeric else 0 end), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
    .where(
      and(
        eq(journalLines.tenantId, tenantId),
        isNull(journalEntries.voidedAt),
      ),
    );

  const [unbal] = await db()
    .select({
      c: sql<string>`count(*)`,
    })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.tenantId, tenantId),
        isNull(journalEntries.voidedAt),
        eq(journalEntries.isBalanced, '0'),
      ),
    );

  const debit = Number(totals?.debit ?? 0);
  const credit = Number(totals?.credit ?? 0);
  const unbalancedEntries = Number(unbal?.c ?? 0);
  const ok = Math.abs(debit - credit) < 0.02 && unbalancedEntries === 0;
  return { ok, debit, credit, unbalancedEntries };
}

/**
 * Run the full ERP health-check suite on a staging tenant.
 * Creates real documents (tagged in run.createdJson) then verifies balances.
 */
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
          'This company is marked production. Switch to Staging environment first (super admin only), then run the suite.',
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
    let failed = false;

    async function step(
      id: string,
      title: string,
      fn: () => Promise<{ detail: string; meta?: HealthStepResult['meta'] }>,
    ) {
      if (failed) {
        steps.push({ id, title, detail: 'Skipped after previous failure', status: 'skipped' });
        return;
      }
      const t0 = Date.now();
      steps.push({ id, title, detail: 'Running…', status: 'running' });
      await db()
        .update(healthCheckRuns)
        .set({ stepsJson: JSON.stringify(steps), updatedAt: new Date() })
        .where(eq(healthCheckRuns.id, runId));

      try {
        const result = await fn();
        const ms = Date.now() - t0;
        const idx = steps.findIndex((s) => s.id === id);
        steps[idx] = {
          id,
          title,
          detail: result.detail,
          status: 'passed',
          ms,
          meta: result.meta,
        };
      } catch (e) {
        failed = true;
        const ms = Date.now() - t0;
        const msg = e instanceof Error ? e.message : 'Step failed';
        const idx = steps.findIndex((s) => s.id === id);
        steps[idx] = {
          id,
          title,
          detail: msg,
          status: 'failed',
          ms,
          error: msg,
        };
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

    // --- Story numbers (varied per seed) ---
    const unitCost = money(rng, 40, 180);
    const sellPrice = money(rng, unitCost + 20, unitCost + 200);
    const buyQty = int(rng, 5, 20);
    const sellQty = int(rng, 1, Math.max(1, Math.floor(buyQty / 2)));
    const productName = `HC Widget ${seed.toString(36).toUpperCase()}`;

    await step('preflight', '0. Staging preflight (settings)', async () => {
      const purchaseCfg = await getPurchaseSettings();
      if (purchaseCfg.requireBillApproval) {
        throw new Error(
          'Purchase settings require bill approval — health check needs bills to post immediately. Turn off “Require approval” in Company → Purchase Settings, then re-run.',
        );
      }
      return {
        detail: `Environment staging · bill approval off · seed ${seed}`,
        meta: { seed, suite },
      };
    });

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
      return {
        detail: `SKU ${res.product.sku} · cost LKR ${unitCost} · sell LKR ${sellPrice}`,
        meta: { productId: res.product.id, unitCost, sellPrice },
      };
    });

    await step('purchase', '2. Purchase bill (stock + AP)', async () => {
      if (!created.productId) throw new Error('No product');
      const res = await createCommercialDocument({
        documentType: 'purchase',
        partyName: `HC Vendor ${seed}`,
        issueDate,
        dueDate: issueDate,
        notes: `health-check run ${runId}`,
        supplierInvoiceNumber: `HC-PUR-${seed}`,
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
      created.purchaseId = res.id;
      const doc = await getCommercialDocument(res.id);
      return {
        detail: `Bought ${buyQty} @ ${unitCost} · total LKR ${doc?.total ?? '?'} · balance LKR ${doc?.balanceDue ?? '?'}`,
        meta: { purchaseId: res.id, buyQty, total: doc?.total ?? 0 },
      };
    });

    await step('pay_vendor', '3. Pay vendor (clear AP)', async () => {
      if (!created.purchaseId) throw new Error('No purchase');
      const doc = await getCommercialDocument(created.purchaseId);
      if (!doc) throw new Error('Purchase not found');
      const amount = doc.balanceDue;
      if (amount <= 0.005) throw new Error('Purchase has no balance to pay');
      const pay = await allocateDocumentPayment({
        documentId: created.purchaseId,
        paymentDate: issueDate,
        paymentAccountCode: '1000',
        amount,
      });
      if (!pay.ok) throw new Error(pay.error ?? 'Pay vendor failed');
      const after = await getCommercialDocument(created.purchaseId);
      if (!after || after.balanceDue > 0.01) {
        throw new Error(`Expected paid bill, balance still ${after?.balanceDue}`);
      }
      return {
        detail: `Paid LKR ${amount.toFixed(2)} from Cash · bill now paid`,
        meta: { amount },
      };
    });

    await step('sale', '4. Sales invoice (AR + COGS + stock out)', async () => {
      if (!created.productId) throw new Error('No product');
      const res = await createCommercialDocument({
        documentType: 'sales_invoice',
        partyName: `HC Customer ${seed}`,
        issueDate,
        dueDate: issueDate,
        notes: `health-check run ${runId}`,
        invoiceKind: 'commercial',
        saleChannel: 'local',
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
      if (!res.ok || !res.id) throw new Error(res.error ?? 'Sales invoice failed');
      created.invoiceId = res.id;
      const doc = await getCommercialDocument(res.id);
      return {
        detail: `Sold ${sellQty} @ ${sellPrice} · total LKR ${doc?.total ?? '?'} · open AR LKR ${doc?.balanceDue ?? '?'}`,
        meta: { invoiceId: res.id, sellQty, total: doc?.total ?? 0 },
      };
    });

    await step('receive', '5. Receive customer payment (clear AR)', async () => {
      if (!created.invoiceId) throw new Error('No invoice');
      const doc = await getCommercialDocument(created.invoiceId);
      if (!doc) throw new Error('Invoice not found');
      const amount = doc.balanceDue;
      if (amount <= 0.005) throw new Error('Invoice has no balance');
      const pay = await allocateDocumentPayment({
        documentId: created.invoiceId,
        paymentDate: issueDate,
        paymentAccountCode: '1000',
        amount,
      });
      if (!pay.ok) throw new Error(pay.error ?? 'Receive payment failed');
      const after = await getCommercialDocument(created.invoiceId);
      if (!after || after.balanceDue > 0.01) {
        throw new Error(`Expected paid invoice, balance still ${after?.balanceDue}`);
      }
      return {
        detail: `Received LKR ${amount.toFixed(2)} to Cash · invoice paid`,
        meta: { amount },
      };
    });

    if (suite === 'full') {
      await step('return', '6. Sales return (restock)', async () => {
        if (!created.productId || !created.invoiceId) throw new Error('Missing product/invoice');
        const retQty = 1;
        const res = await createCommercialDocument({
          documentType: 'sales_return',
          partyName: `HC Customer ${seed}`,
          issueDate,
          notes: `health-check return run ${runId}`,
          sourceDocumentId: created.invoiceId,
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
        if (!res.ok || !res.id) throw new Error(res.error ?? 'Sales return failed');
        created.returnId = res.id;
        return {
          detail: `Returned ${retQty} unit · restocked · source invoice adjusted if open balance`,
          meta: { returnId: res.id, retQty },
        };
      });

      await step('grn_path', '7. PO → GRN → bill (no double stock)', async () => {
        if (!created.productId) throw new Error('No product');
        const grnQty = int(rng, 2, 6);
        const po = await createCommercialDocument({
          documentType: 'purchase_order',
          partyName: `HC GRN Vendor ${seed}`,
          issueDate,
          notes: `health-check PO ${runId}`,
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
        created.poId = po.id;

        const grn = await createCommercialDocument({
          documentType: 'goods_receipt',
          partyName: `HC GRN Vendor ${seed}`,
          issueDate,
          sourceDocumentId: po.id,
          notes: `health-check GRN ${runId}`,
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
        created.grnId = grn.id;

        const bill = await createCommercialDocument({
          documentType: 'purchase',
          partyName: `HC GRN Vendor ${seed}`,
          issueDate,
          sourceDocumentId: grn.id,
          notes: `health-check bill-from-GRN ${runId}`,
          supplierInvoiceNumber: `HC-GRN-${seed}`,
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
        if (!bill.ok || !bill.id) throw new Error(bill.error ?? 'Bill from GRN failed');
        created.grnBillId = bill.id;

        return {
          detail: `PO → GRN (${grnQty}) → bill · stock only on GRN (bill should not double qty)`,
          meta: { grnQty, poId: po.id, grnId: grn.id, billId: bill.id },
        };
      });
    }

    await step('balance', suite === 'full' ? '8. Books balanced (journals)' : '6. Books balanced (journals)', async () => {
      const bal = await withTenantContext(user.tenantId, () => checkJournalsBalanced(user.tenantId));
      if (!bal.ok) {
        throw new Error(
          `Journals not balanced: debit ${bal.debit.toFixed(2)} vs credit ${bal.credit.toFixed(2)} (unbalanced entries: ${bal.unbalancedEntries})`,
        );
      }

      let stockNote = '';
      if (created.productId) {
        const [lvl] = await withTenantContext(user.tenantId, async () => {
          return db()
            .select({
              q: sql<string>`coalesce(sum(cast(${inventoryStockLevels.qtyOnHand} as numeric)), 0)`,
            })
            .from(inventoryStockLevels)
            .where(
              and(
                eq(inventoryStockLevels.tenantId, user.tenantId),
                eq(inventoryStockLevels.productId, created.productId!),
              ),
            );
        });
        stockNote = ` · product qty on hand ${Number(lvl?.q ?? 0).toFixed(2)}`;
      }

      // Spot-check CoA exists
      const [cash] = await withTenantContext(user.tenantId, async () => {
        return db()
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.tenantId, user.tenantId), eq(accounts.code, '1000'), isNull(accounts.voidedAt)))
          .limit(1);
      });
      if (!cash) throw new Error('Cash account 1000 missing');

      return {
        detail: `All journals balance (Dr ${bal.debit.toFixed(2)} = Cr ${bal.credit.toFixed(2)})${stockNote}`,
        meta: { debit: bal.debit, credit: bal.credit },
      };
    });

    const passed = steps.filter((s) => s.status === 'passed').length;
    const total = steps.filter((s) => s.status !== 'skipped').length;
    const status = failed ? 'failed' : 'passed';
    const summary = failed
      ? `${passed}/${total} steps passed — see failed step`
      : `All ${passed} steps passed (seed ${seed})`;

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

    return { ok: !failed, runId, run, error: failed ? run.errorMessage ?? undefined : undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Health check failed.' };
  }
}

/**
 * Soft-void product + commercial docs created by a health-check run (staging only).
 * Does not delete journal history (audit trail remains); marks docs/products voided.
 */
export async function wipeHealthCheckRun(
  runId: string,
): Promise<{ ok: boolean; error?: string; wiped?: number }> {
  try {
    const user = await assertCanManageHealthCheck();
    const environment = await getTenantEnvironment(user.tenantId);
    if (environment !== 'staging') {
      return { ok: false, error: 'Wipe only allowed on staging companies.' };
    }

    const wiped = await withTenantContext(user.tenantId, async () => {
      const [run] = await db()
        .select()
        .from(healthCheckRuns)
        .where(and(eq(healthCheckRuns.id, runId), eq(healthCheckRuns.tenantId, user.tenantId)))
        .limit(1);
      if (!run) throw new Error('Run not found.');
      const created = parseCreated(run.createdJson);
      let count = 0;
      const now = new Date();

      const docIds = [
        created.purchaseId,
        created.invoiceId,
        created.returnId,
        created.poId,
        created.grnId,
        created.grnBillId,
      ].filter(Boolean) as string[];

      for (const id of docIds) {
        const res = await db()
          .update(businessDocuments)
          .set({ voidedAt: now, status: 'void', updatedAt: now })
          .where(
            and(
              eq(businessDocuments.id, id),
              eq(businessDocuments.tenantId, user.tenantId),
              isNull(businessDocuments.voidedAt),
            ),
          )
          .returning({ id: businessDocuments.id });
        count += res.length;
      }

      if (created.productId) {
        const res = await db()
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
        count += res.length;
      }

      await db()
        .update(healthCheckRuns)
        .set({
          summary: `${run.summary ?? ''} · wiped ${count} records`.trim(),
          updatedAt: now,
        })
        .where(eq(healthCheckRuns.id, runId));

      return count;
    });

    revalidatePath('/control-room/health-check');
    revalidatePath('/inventory/products');
    revalidatePath('/sales/invoices');
    revalidatePath('/purchase/purchases');
    return { ok: true, wiped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Wipe failed.' };
  }
}
