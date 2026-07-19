'use server';

/**
 * ERP Health Check — staging-only suite that drives the *real* commercial engine:
 * createQuickProduct → createCommercialDocument → allocateDocumentPayment
 * and asserts stock, subledger balances, and journal account mapping.
 */

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

/** Qty on hand for a product (all locations). */
async function productQty(tenantId: string, productId: string): Promise<number> {
  const [row] = await db()
    .select({
      q: sql<string>`coalesce(sum(cast(${inventoryStockLevels.qtyOnHand} as numeric)), 0)`,
    })
    .from(inventoryStockLevels)
    .where(
      and(eq(inventoryStockLevels.tenantId, tenantId), eq(inventoryStockLevels.productId, productId)),
    );
  return Number(row?.q ?? 0);
}

/** Journal lines for a commercial document’s posted transaction (engine mapping). */
async function journalCodesForDoc(
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
      ),
    );
  return rows.map((r) => ({
    code: r.code,
    side: r.side,
    amount: Number(r.amount),
  }));
}

function assertHasAccount(
  lines: { code: string; side: string; amount: number }[],
  code: string,
  side: 'debit' | 'credit',
  label: string,
) {
  const hit = lines.find((l) => l.code === code && l.side === side && l.amount > 0.005);
  if (!hit) {
    const dump = lines.map((l) => `${l.side[0].toUpperCase()} ${l.code} ${l.amount}`).join(', ');
    throw new Error(`${label}: expected ${side} ${code}. Journal was: [${dump || 'empty'}]`);
  }
}

function assertJournalBalanced(lines: { side: string; amount: number }[], label: string) {
  const dr = Math.round(lines.filter((l) => l.side === 'debit').reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const cr = Math.round(lines.filter((l) => l.side === 'credit').reduce((s, l) => s + l.amount, 0) * 100) / 100;
  if (Math.abs(dr - cr) > 0.02) {
    throw new Error(`${label}: journal unbalanced Dr ${dr} vs Cr ${cr}`);
  }
}

async function checkTenantJournalsBalanced(tenantId: string) {
  const [totals] = await db()
    .select({
      debit: sql<string>`coalesce(sum(case when ${journalLines.side} = 'debit' then ${journalLines.amount}::numeric else 0 end), 0)`,
      credit: sql<string>`coalesce(sum(case when ${journalLines.side} = 'credit' then ${journalLines.amount}::numeric else 0 end), 0)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
    .where(and(eq(journalLines.tenantId, tenantId), isNull(journalEntries.voidedAt)));

  const debit = Number(totals?.debit ?? 0);
  const credit = Number(totals?.credit ?? 0);
  return {
    ok: Math.abs(debit - credit) < 0.02,
    debit,
    credit,
  };
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

/**
 * Full / core suite against real engine paths.
 *
 * Engine mapping verified:
 * - purchase  → buildVendorBillPosting  (Dr 5100 / Cr 2100)
 * - pay AP    → allocateDocumentPayment (Dr 2100 / Cr 1000)
 * - invoice   → buildSalesInvoicePosting (Dr 1300 / Cr 4000 + Dr 5000 / Cr 5100)
 * - receive   → allocateDocumentPayment (Dr 1000 / Cr 1300)
 * - return    → buildSalesReturnPosting + apply to source balanceDue
 * - GRN       → qty only (or GRNI if setting on); bill from GRN no double stock
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

    // Quantities designed so stock never goes negative under block policy either
    const unitCost = money(rng, 40, 180);
    const sellPrice = money(rng, unitCost + 20, unitCost + 200);
    const buyQty = int(rng, 8, 20);
    // Full suite returns 1 unit — need sellQty >= 2 so AR remains after return apply
    const sellQty =
      suite === 'full'
        ? Math.max(2, int(rng, 2, Math.max(2, Math.floor(buyQty / 2))))
        : int(rng, 1, Math.max(1, Math.floor(buyQty / 2)));
    const productName = `HC Widget ${seed.toString(36).toUpperCase()}`;
    let grnQty = 0;

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
        steps[idx] = { id, title, detail: msg, status: 'failed', ms, error: msg };
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

    // ── 0. Preflight ─────────────────────────────────────────────
    await step('preflight', '0. Staging preflight (settings + CoA)', async () => {
      const purchaseCfg = await getPurchaseSettings();
      if (purchaseCfg.requireBillApproval) {
        throw new Error(
          'Purchase settings require bill approval — health check needs bills to post immediately. Turn off “Require approval” in Company → Purchase Settings, then re-run.',
        );
      }

      const needCodes = ['1000', '1300', '2100', '4000', '5000', '5100'];
      await withTenantContext(user.tenantId, async () => {
        for (const code of needCodes) {
          const [a] = await db()
            .select({ id: accounts.id })
            .from(accounts)
            .where(
              and(eq(accounts.tenantId, user.tenantId), eq(accounts.code, code), isNull(accounts.voidedAt)),
            )
            .limit(1);
          if (!a) throw new Error(`Chart of accounts missing code ${code}`);
        }
      });

      return {
        detail: `Staging · bill approval off · CoA OK · seed ${seed} · buy ${buyQty} sell ${sellQty} @ cost ${unitCost} / sell ${sellPrice}`,
        meta: {
          seed,
          suite,
          buyQty,
          sellQty,
          unitCost,
          sellPrice,
          postGrni: purchaseCfg.postGrniOnReceipt ? 1 : 0,
        },
      };
    });

    // ── 1. Product (inventory master) ────────────────────────────
    await step('product', '1. Create physical product (inventory master)', async () => {
      const res = await createQuickProduct({
        name: productName,
        productType: 'physical',
        unitCost,
        sellPrice,
      });
      if (!res.ok || !res.product) throw new Error(res.error ?? 'Product create failed');
      if (res.product.productType !== 'physical' && res.product.productType !== 'stocked') {
        throw new Error(`Expected physical product, got ${res.product.productType}`);
      }
      created.productId = res.product.id;
      created.productSku = res.product.sku;

      const qty = await withTenantContext(user.tenantId, () =>
        productQty(user.tenantId, res.product!.id),
      );
      if (Math.abs(qty) > 0.001) {
        throw new Error(`New product should start at qty 0, got ${qty}`);
      }

      return {
        detail: `SKU ${res.product.sku} · cost LKR ${unitCost} · sell LKR ${sellPrice} · qty 0`,
        meta: { productId: res.product.id, unitCost, sellPrice },
      };
    });

    // ── 2. Purchase → buildVendorBillPosting ─────────────────────
    await step('purchase', '2. Purchase bill (engine: Dr 5100 / Cr 2100 + stock)', async () => {
      if (!created.productId) throw new Error('No product');
      const qtyBefore = await withTenantContext(user.tenantId, () =>
        productQty(user.tenantId, created.productId!),
      );

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
      if (!doc) throw new Error('Purchase not readable after create');
      if (!doc.transactionId) {
        throw new Error(
          'Purchase has no transactionId — GL did not post (approval? period lock?). Engine not connected.',
        );
      }
      if (doc.balanceDue <= 0.005) {
        throw new Error('Purchase should open AP balanceDue > 0');
      }

      const j = await withTenantContext(user.tenantId, () =>
        journalCodesForDoc(user.tenantId, doc.transactionId),
      );
      assertJournalBalanced(j, 'Purchase journal');
      assertHasAccount(j, '5100', 'debit', 'Purchase inventory');
      assertHasAccount(j, '2100', 'credit', 'Purchase AP');

      const qtyAfter = await withTenantContext(user.tenantId, () =>
        productQty(user.tenantId, created.productId!),
      );
      const delta = Math.round((qtyAfter - qtyBefore) * 10000) / 10000;
      if (Math.abs(delta - buyQty) > 0.001) {
        throw new Error(`Stock should +${buyQty} on purchase, delta was ${delta}`);
      }

      return {
        detail: `Posted ${doc.documentNumber} · Dr5100/Cr2100 · stock +${buyQty} · AP LKR ${doc.balanceDue.toFixed(2)}`,
        meta: { purchaseId: res.id, buyQty, balanceDue: doc.balanceDue, transactionId: doc.transactionId },
      };
    });

    // ── 3. Pay vendor → allocateDocumentPayment AP ───────────────
    await step('pay_vendor', '3. Pay vendor (engine: Dr 2100 / Cr 1000)', async () => {
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
      if (after.status !== 'paid' && after.balanceDue > 0.01) {
        throw new Error(`Bill status should be paid, got ${after.status}`);
      }

      return {
        detail: `Paid LKR ${amount.toFixed(2)} Cash · AP cleared · status ${after.status}`,
        meta: { amount },
      };
    });

    // ── 4. Sales invoice → buildSalesInvoicePosting ──────────────
    await step('sale', '4. Sales invoice (engine: Dr 1300 / Cr 4000 + COGS)', async () => {
      if (!created.productId) throw new Error('No product');
      const qtyBefore = await withTenantContext(user.tenantId, () =>
        productQty(user.tenantId, created.productId!),
      );

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
            unitCost, // engine also reads product.unitCost for COGS
            discountAmount: 0,
          },
        ],
      });
      if (!res.ok || !res.id) throw new Error(res.error ?? 'Sales invoice failed');
      created.invoiceId = res.id;

      const doc = await getCommercialDocument(res.id);
      if (!doc) throw new Error('Invoice not readable');
      if (!doc.transactionId) throw new Error('Invoice has no transactionId — sales GL not posted');
      if (doc.balanceDue <= 0.005) throw new Error('Credit invoice should open AR balanceDue > 0');

      const j = await withTenantContext(user.tenantId, () =>
        journalCodesForDoc(user.tenantId, doc.transactionId),
      );
      assertJournalBalanced(j, 'Sales invoice journal');
      assertHasAccount(j, '1300', 'debit', 'Sales AR');
      assertHasAccount(j, '4000', 'credit', 'Sales revenue');
      // Physical COGS
      assertHasAccount(j, '5000', 'debit', 'Sales COGS');
      assertHasAccount(j, '5100', 'credit', 'Sales inventory out');

      const qtyAfter = await withTenantContext(user.tenantId, () =>
        productQty(user.tenantId, created.productId!),
      );
      const delta = Math.round((qtyAfter - qtyBefore) * 10000) / 10000;
      if (Math.abs(delta + sellQty) > 0.001) {
        throw new Error(`Stock should −${sellQty} on sale, delta was ${delta}`);
      }

      const expectedTotal = Math.round(sellQty * sellPrice * 100) / 100;
      if (Math.abs(doc.total - expectedTotal) > 0.02) {
        throw new Error(`Invoice total ${doc.total} ≠ expected ${expectedTotal}`);
      }

      return {
        detail: `Posted ${doc.documentNumber} · AR+Rev+COGS · stock −${sellQty} · AR LKR ${doc.balanceDue.toFixed(2)}`,
        meta: {
          invoiceId: res.id,
          sellQty,
          total: doc.total,
          transactionId: doc.transactionId,
        },
      };
    });

    // ── 5. Return WHILE invoice still open (tests P1 apply to source) ──
    if (suite === 'full') {
      await step('return', '5. Sales return (engine: return GL + apply source AR)', async () => {
        if (!created.productId || !created.invoiceId) throw new Error('Missing product/invoice');
        const retQty = 1;
        const qtyBefore = await withTenantContext(user.tenantId, () =>
          productQty(user.tenantId, created.productId!),
        );
        const invBefore = await getCommercialDocument(created.invoiceId);
        if (!invBefore) throw new Error('Invoice missing');
        if (invBefore.balanceDue <= 0.005) {
          throw new Error(
            'Invoice already paid — return must run before full payment to test source apply',
          );
        }

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

        const retDoc = await getCommercialDocument(res.id);
        if (!retDoc?.transactionId) throw new Error('Return has no transactionId');

        const j = await withTenantContext(user.tenantId, () =>
          journalCodesForDoc(user.tenantId, retDoc.transactionId),
        );
        assertJournalBalanced(j, 'Sales return journal');
        assertHasAccount(j, '4100', 'debit', 'Sales returns account');
        assertHasAccount(j, '1300', 'credit', 'Return AR credit');
        assertHasAccount(j, '5100', 'debit', 'Return restock inventory');
        assertHasAccount(j, '5000', 'credit', 'Return COGS reverse');

        const qtyAfter = await withTenantContext(user.tenantId, () =>
          productQty(user.tenantId, created.productId!),
        );
        if (Math.abs(qtyAfter - qtyBefore - retQty) > 0.001) {
          throw new Error(`Return should restock +${retQty}, qty ${qtyBefore} → ${qtyAfter}`);
        }

        // P1: source invoice balance reduced
        const invAfter = await getCommercialDocument(created.invoiceId);
        if (!invAfter) throw new Error('Invoice missing after return');
        const applied = Math.round((invBefore.balanceDue - invAfter.balanceDue) * 100) / 100;
        const expectApply = Math.round(retQty * sellPrice * 100) / 100;
        if (Math.abs(applied - expectApply) > 0.05) {
          throw new Error(
            `Source invoice should reduce by ~${expectApply} (got ${applied}). Before ${invBefore.balanceDue} after ${invAfter.balanceDue}`,
          );
        }

        return {
          detail: `Return posted · restock +${retQty} · source AR −LKR ${applied.toFixed(2)} (P1 apply)`,
          meta: { returnId: res.id, retQty, applied },
        };
      });
    }

    // ── 6. Receive remaining AR ──────────────────────────────────
    await step(
      'receive',
      suite === 'full'
        ? '6. Receive remaining AR (engine: Dr 1000 / Cr 1300)'
        : '5. Receive customer payment (engine: Dr 1000 / Cr 1300)',
      async () => {
        if (!created.invoiceId) throw new Error('No invoice');
        const doc = await getCommercialDocument(created.invoiceId);
        if (!doc) throw new Error('Invoice not found');
        const amount = doc.balanceDue;
        if (amount <= 0.005) {
          // Full suite could fully clear via return if sellQty==1 — we force sellQty>=2
          return {
            detail: 'Invoice already fully settled (no remaining AR) — OK',
            meta: { amount: 0 },
          };
        }

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
          detail: `Received LKR ${amount.toFixed(2)} Cash · AR cleared · status ${after.status}`,
          meta: { amount },
        };
      },
    );

    // ── 7. GRN path ──────────────────────────────────────────────
    if (suite === 'full') {
      await step('grn_path', '7. PO → GRN → bill (stock only on GRN, engine AP on bill)', async () => {
        if (!created.productId) throw new Error('No product');
        grnQty = int(rng, 2, 6);
        const purchaseCfg = await getPurchaseSettings();

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
        const poDoc = await getCommercialDocument(po.id);
        if (poDoc?.transactionId) {
          throw new Error('PO must not post GL (transactionId should be null)');
        }

        const qtyBeforeGrn = await withTenantContext(user.tenantId, () =>
          productQty(user.tenantId, created.productId!),
        );

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

        const qtyAfterGrn = await withTenantContext(user.tenantId, () =>
          productQty(user.tenantId, created.productId!),
        );
        if (Math.abs(qtyAfterGrn - qtyBeforeGrn - grnQty) > 0.001) {
          throw new Error(
            `GRN should stock +${grnQty}, qty ${qtyBeforeGrn} → ${qtyAfterGrn}`,
          );
        }

        const grnDoc = await getCommercialDocument(grn.id);
        if (purchaseCfg.postGrniOnReceipt) {
          if (!grnDoc?.transactionId) {
            throw new Error('GRNI setting on but GRN has no transactionId');
          }
          const gj = await withTenantContext(user.tenantId, () =>
            journalCodesForDoc(user.tenantId, grnDoc.transactionId),
          );
          assertJournalBalanced(gj, 'GRN/GRNI journal');
          assertHasAccount(gj, '5100', 'debit', 'GRNI inventory');
          assertHasAccount(gj, '2150', 'credit', 'GRNI liability');
        }

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

        const qtyAfterBill = await withTenantContext(user.tenantId, () =>
          productQty(user.tenantId, created.productId!),
        );
        if (Math.abs(qtyAfterBill - qtyAfterGrn) > 0.001) {
          throw new Error(
            `Bill from GRN must NOT change stock (was ${qtyAfterGrn}, now ${qtyAfterBill}) — double stock bug`,
          );
        }

        const billDoc = await getCommercialDocument(bill.id);
        if (!billDoc?.transactionId) throw new Error('GRN bill has no transactionId');
        const bj = await withTenantContext(user.tenantId, () =>
          journalCodesForDoc(user.tenantId, billDoc.transactionId),
        );
        assertJournalBalanced(bj, 'Bill-from-GRN journal');
        assertHasAccount(bj, '2100', 'credit', 'Bill AP');
        if (purchaseCfg.postGrniOnReceipt) {
          assertHasAccount(bj, '2150', 'debit', 'Bill clear GRNI');
        } else {
          // Without GRNI, inventory was not capitalised on GRN — bill debits 5100
          assertHasAccount(bj, '5100', 'debit', 'Bill inventory (no prior GRNI)');
        }

        return {
          detail: `PO (no GL) → GRN stock +${grnQty}${purchaseCfg.postGrniOnReceipt ? ' + GRNI' : ''} → bill AP, stock unchanged`,
          meta: {
            grnQty,
            poId: po.id,
            grnId: grn.id,
            billId: bill.id,
            grni: purchaseCfg.postGrniOnReceipt ? 1 : 0,
          },
        };
      });
    }

    // ── Final: stock formula + tenant TB ─────────────────────────
    await step(
      'balance',
      suite === 'full' ? '8. Stock formula + books balanced' : '6. Stock formula + books balanced',
      async () => {
        if (!created.productId) throw new Error('No product');

        const retQty = suite === 'full' ? 1 : 0;
        const expectedQty = buyQty - sellQty + retQty + grnQty;
        const actualQty = await withTenantContext(user.tenantId, () =>
          productQty(user.tenantId, created.productId!),
        );
        if (Math.abs(actualQty - expectedQty) > 0.02) {
          throw new Error(
            `Stock mismatch: expected ${expectedQty} (buy ${buyQty} − sell ${sellQty} + ret ${retQty} + grn ${grnQty}), got ${actualQty}`,
          );
        }

        const bal = await withTenantContext(user.tenantId, () =>
          checkTenantJournalsBalanced(user.tenantId),
        );
        if (!bal.ok) {
          throw new Error(
            `Tenant journals not balanced: debit ${bal.debit.toFixed(2)} vs credit ${bal.credit.toFixed(2)}`,
          );
        }

        // Spot-check key docs still paid / posted
        if (created.purchaseId) {
          const p = await getCommercialDocument(created.purchaseId);
          if (!p?.transactionId) throw new Error('Purchase lost transactionId');
        }
        if (created.invoiceId) {
          const inv = await getCommercialDocument(created.invoiceId);
          if (!inv?.transactionId) throw new Error('Invoice lost transactionId');
          if (inv.balanceDue > 0.01) {
            throw new Error(`Invoice still has open AR ${inv.balanceDue}`);
          }
        }

        return {
          detail: `Stock OK (${actualQty}) · tenant TB Dr ${bal.debit.toFixed(2)} = Cr ${bal.credit.toFixed(2)}`,
          meta: { expectedQty, actualQty, debit: bal.debit, credit: bal.credit },
        };
      },
    );

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
