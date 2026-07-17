/**
 * Seed 12 quotations, 12 sales orders, 12 sales invoices (varied types/statuses).
 * Idempotent: skips if DEMO-QT-01 already exists for the tenant.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, isNull, sql } from 'drizzle-orm';
import * as schema from '../packages/db/src/schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema });

const CUSTOMERS = [
  { name: 'Lanka Retail PLC', code: 'CUS-LR', tin: '134567890' },
  { name: 'Colombo Builders', code: 'CUS-CB', tin: '198765432' },
  { name: 'Island Exports Ltd', code: 'CUS-IE', tin: '112233445' },
  { name: 'Galle Hardware', code: 'CUS-GH', tin: '156789012' },
  { name: 'Kandy Hospitality', code: 'CUS-KH', tin: '167890123' },
  { name: 'Metro Office Supplies', code: 'CUS-MO', tin: '178901234' },
];

type DocSeed = {
  type: 'quotation' | 'sales_order' | 'sales_invoice';
  number: string;
  partyIdx: number;
  daysAgo: number;
  status: string;
  saleChannel?: 'local' | 'export';
  invoiceKind?: 'commercial' | 'tax_invoice';
  paid?: boolean;
  lines: { desc: string; qty: number; price: number }[];
};

function buildSeeds(): DocSeed[] {
  const quotes: DocSeed[] = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    const statuses = ['draft', 'sent', 'sent', 'accepted', 'accepted', 'converted', 'draft', 'sent', 'accepted', 'converted', 'sent', 'draft'];
    return {
      type: 'quotation' as const,
      number: `DEMO-QT-${String(n).padStart(2, '0')}`,
      partyIdx: i % CUSTOMERS.length,
      daysAgo: 40 - i * 2,
      status: statuses[i],
      lines: [
        { desc: n % 2 === 0 ? 'Emulsion Paint 4L White' : 'Pro Brush Set 5pc', qty: 2 + (i % 4), price: n % 2 === 0 ? 4800 : 1450 },
        ...(n % 3 === 0 ? [{ desc: 'Color Consultation 1hr', qty: 1, price: 5000 }] : []),
      ],
    };
  });

  const orders: DocSeed[] = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    const statuses = [
      'confirmed',
      'confirmed',
      'confirmed',
      'fully_invoiced',
      'confirmed',
      'converted',
      'confirmed',
      'fully_invoiced',
      'confirmed',
      'confirmed',
      'converted',
      'confirmed',
    ];
    return {
      type: 'sales_order' as const,
      number: `DEMO-SO-${String(n).padStart(2, '0')}`,
      partyIdx: i % CUSTOMERS.length,
      daysAgo: 30 - i * 2,
      status: statuses[i],
      lines: [
        { desc: n % 2 === 0 ? 'Paint Roller Kit' : 'Masking Tape 50m', qty: 3 + (i % 5), price: n % 2 === 0 ? 1100 : 350 },
        { desc: 'On-site Paint Install', qty: 1, price: 15000 },
      ],
    };
  });

  const invoices: DocSeed[] = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    const kinds: Array<'commercial' | 'tax_invoice'> = [
      'commercial',
      'tax_invoice',
      'commercial',
      'tax_invoice',
      'commercial',
      'tax_invoice',
      'commercial',
      'tax_invoice',
      'commercial',
      'tax_invoice',
      'commercial',
      'tax_invoice',
    ];
    const channels: Array<'local' | 'export'> = [
      'local',
      'local',
      'export',
      'local',
      'local',
      'export',
      'local',
      'local',
      'export',
      'local',
      'local',
      'local',
    ];
    const paid = i % 3 === 0;
    const kind = kinds[i];
    const channel = channels[i];
    return {
      type: 'sales_invoice' as const,
      number: `DEMO-INV-${String(n).padStart(2, '0')}`,
      partyIdx: i % CUSTOMERS.length,
      daysAgo: 20 - i,
      status: paid ? 'paid' : 'open',
      saleChannel: channel,
      invoiceKind: kind,
      paid,
      lines: [
        { desc: 'Design Software License', qty: 1, price: 12500 },
        {
          desc: n % 2 === 0 ? 'Floor Plan Template Pack' : 'Paint Thinner 1L',
          qty: 2 + (i % 3),
          price: n % 2 === 0 ? 2900 : 780,
        },
      ],
    };
  });

  return [...quotes, ...orders, ...invoices];
}

async function main() {
  const [tenant] = await db.select().from(schema.tenants).limit(1);
  if (!tenant) {
    console.error('No tenant. Run seed first.');
    process.exit(1);
  }

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.tenantId, tenant.id))
    .limit(1);
  if (!user) {
    console.error('No user for tenant.');
    process.exit(1);
  }

  const [existing] = await db
    .select({ id: schema.businessDocuments.id })
    .from(schema.businessDocuments)
    .where(
      and(
        eq(schema.businessDocuments.tenantId, tenant.id),
        eq(schema.businessDocuments.documentNumber, 'DEMO-QT-01'),
        isNull(schema.businessDocuments.voidedAt),
      ),
    )
    .limit(1);

  if (existing) {
    console.log('Demo sales documents already present (DEMO-QT-01). Skipping.');
    await client.end();
    return;
  }

  console.log(`Seeding demo sales docs for ${tenant.name}…`);

  // Ensure demo customers
  const partyIds: string[] = [];
  for (const c of CUSTOMERS) {
    const [found] = await db
      .select()
      .from(schema.parties)
      .where(
        and(
          eq(schema.parties.tenantId, tenant.id),
          eq(schema.parties.code, c.code),
          isNull(schema.parties.voidedAt),
        ),
      )
      .limit(1);
    if (found) {
      partyIds.push(found.id);
      continue;
    }
    const [created] = await db
      .insert(schema.parties)
      .values({
        tenantId: tenant.id,
        name: c.name,
        displayName: c.name,
        legalName: c.name,
        kind: 'customer',
        isCustomer: '1',
        code: c.code,
        tin: c.tin,
        phone: '0112' + String(Math.floor(100000 + Math.random() * 899999)),
        addressLine1: 'No. 12 Demo Road',
        city: 'Colombo',
        country: 'Sri Lanka',
        status: 'active',
      })
      .returning({ id: schema.parties.id });
    partyIds.push(created.id);
  }

  const seeds = buildSeeds();
  let taxSerial = 1;
  const now = new Date();

  for (const seed of seeds) {
    const partyId = partyIds[seed.partyIdx];
    const issue = new Date(now);
    issue.setDate(issue.getDate() - seed.daysAgo);
    const issueDate = issue.toISOString().slice(0, 10);
    const due = new Date(issue);
    due.setDate(due.getDate() + 30);
    const dueDate = due.toISOString().slice(0, 10);

    const subtotal = seed.lines.reduce((s, l) => s + l.qty * l.price, 0);
    const isTax = seed.invoiceKind === 'tax_invoice';
    const channel = seed.saleChannel ?? 'local';
    const vatRate = isTax && channel === 'local' ? 18 : 0;
    const vat = Math.round(((subtotal * vatRate) / 100) * 100) / 100;
    const total = Math.round((subtotal + vat) * 100) / 100;
    const paidAmt = seed.paid ? total : 0;

    let taxInvoiceNumber: string | null = null;
    if (seed.type === 'sales_invoice' && isTax) {
      const yy = String(issue.getFullYear()).slice(-2);
      const mmm = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][
        issue.getMonth()
      ];
      taxInvoiceNumber = `${yy}${mmm}_01/${taxSerial++}`;
    }

    const [doc] = await db
      .insert(schema.businessDocuments)
      .values({
        tenantId: tenant.id,
        userId: user.id,
        partyId,
        documentType: seed.type,
        documentNumber: seed.number,
        issueDate,
        dueDate,
        status: seed.status,
        subtotal: subtotal.toFixed(2),
        taxTotal: vat.toFixed(2),
        total: total.toFixed(2),
        paidAmount: paidAmt.toFixed(2),
        balanceDue: (total - paidAmt).toFixed(2),
        currency: 'LKR',
        notes: `Demo ${seed.type} sample`,
        saleChannel: channel,
        invoiceKind: seed.invoiceKind ?? 'commercial',
        deliveryDate: seed.type === 'sales_invoice' ? issueDate : null,
        placeOfSupply: channel === 'local' ? 'Colombo' : 'FOB',
        paymentMode: seed.paid ? 'Cash' : 'Credit',
        taxInvoiceNumber,
        exportCountry: channel === 'export' ? 'United Arab Emirates' : null,
        exportRef: channel === 'export' ? `EXP-${seed.number}` : null,
        vatRate: vatRate.toFixed(2),
        amountInWords:
          seed.type === 'sales_invoice'
            ? `Rupees ${total.toLocaleString('en-US', { maximumFractionDigits: 0 })} only`
            : null,
        purchaserTin: CUSTOMERS[seed.partyIdx].tin,
        purchaserPhone: '0771234567',
        purchaserAddress: 'No. 12 Demo Road, Colombo',
        // Demo invoices show in list without full GL (no transaction) for safe re-seed
        postedAt: null,
      })
      .returning({ id: schema.businessDocuments.id });

    for (const [idx, line] of seed.lines.entries()) {
      const lineTotal = line.qty * line.price;
      await db.insert(schema.businessDocumentLines).values({
        tenantId: tenant.id,
        documentId: doc.id,
        lineRef: `L${idx + 1}`,
        description: line.desc,
        quantity: line.qty.toFixed(4),
        unitPrice: line.price.toFixed(2),
        unitCost: '0',
        discountPercent: '0',
        discountAmount: '0',
        lineTotal: lineTotal.toFixed(2),
      });
    }
  }

  console.log(`Inserted ${seeds.length} demo commercial documents (12 QT + 12 SO + 12 INV).`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
