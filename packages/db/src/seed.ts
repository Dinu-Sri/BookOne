import 'dotenv/config';
import { hash } from 'bcryptjs';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../src/schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema });

async function seed() {
  console.log('Seeding BookOne database...');

  const TENANT_ID = '00000000-0000-0000-0000-000000000001';
  const ADMIN_USER_ID = '00000000-0000-0000-0000-000000000002';

  // 1. Create tenant (skip if exists)
  const existingTenant = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, 'clossyan'))
    .limit(1);

  if (existingTenant.length === 0) {
    await db.insert(schema.tenants).values({
      id: TENANT_ID,
      name: 'Clossyan Holdings',
      slug: 'clossyan',
      plan: 'starter',
    });
    console.log('Tenant created.');
  } else {
    console.log('Tenant already exists.');
  }

  // 2. Create admin user (skip if exists)
  const existingUser = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, 'dinu.sri.m@gmail.com'))
    .limit(1);

  if (existingUser.length === 0) {
    const passwordHash = await hash('12345678', 12);
    await db.insert(schema.users).values({
      id: ADMIN_USER_ID,
      tenantId: TENANT_ID,
      email: 'dinu.sri.m@gmail.com',
      name: 'Dinu Sri',
      passwordHash,
      role: 'super_admin',
    });
    console.log('Super admin user created.');
  } else {
    await db
      .update(schema.users)
      .set({ role: 'super_admin', updatedAt: sql`NOW()` })
      .where(eq(schema.users.email, 'dinu.sri.m@gmail.com'));
    console.log('Super admin user already exists; role refreshed.');
  }

  // 3. Seed chart of accounts (skip if already seeded)
  const existingAccounts = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.accounts)
    .where(eq(schema.accounts.tenantId, TENANT_ID));

  if (Number(existingAccounts[0]?.count ?? 0) > 0) {
    console.log(`Chart of accounts already has ${existingAccounts[0]!.count} rows.`);
  } else {
    const chartRows = [
      { code: '1000', name: 'Cash on Hand', type: 'asset', normalSide: 'debit' },
      { code: '1100', name: 'Commercial Bank', type: 'asset', normalSide: 'debit' },
      { code: '1200', name: 'Card Clearing', type: 'asset', normalSide: 'debit' },
      { code: '1300', name: 'Accounts Receivable', type: 'asset', normalSide: 'debit' },
      { code: '2100', name: 'Accounts Payable', type: 'liability', normalSide: 'credit' },
      { code: '2150', name: 'Goods Received Not Invoiced', type: 'liability', normalSide: 'credit' },
      { code: '2200', name: 'Output VAT', type: 'liability', normalSide: 'credit' },
      { code: '2300', name: 'Input VAT', type: 'asset', normalSide: 'debit' },
      { code: '3000', name: 'Owner Equity', type: 'equity', normalSide: 'credit' },
      { code: '3100', name: 'Owner Drawings', type: 'equity', normalSide: 'debit' },
      { code: '4000', name: 'Sales Revenue', type: 'revenue', normalSide: 'credit' },
      { code: '4100', name: 'Sales Returns', type: 'revenue', normalSide: 'debit' },
      { code: '5000', name: 'Cost of Goods Sold', type: 'expense', normalSide: 'debit' },
      { code: '5100', name: 'Inventory', type: 'asset', normalSide: 'debit' },
      { code: '6000', name: 'Marketing Expense', type: 'expense', normalSide: 'debit' },
      { code: '6100', name: 'Rent Expense', type: 'expense', normalSide: 'debit' },
      { code: '6200', name: 'Utilities Expense', type: 'expense', normalSide: 'debit' },
      { code: '6300', name: 'Salaries Expense', type: 'expense', normalSide: 'debit' },
      { code: '6400', name: 'Travel Expense', type: 'expense', normalSide: 'debit' },
      { code: '6500', name: 'Office Supplies Expense', type: 'expense', normalSide: 'debit' },
      { code: '6600', name: 'Bank Charges', type: 'expense', normalSide: 'debit' },
      { code: '6700', name: 'Insurance Expense', type: 'expense', normalSide: 'debit' },
      { code: '6800', name: 'General Expense', type: 'expense', normalSide: 'debit' },
    ];

    await db.insert(schema.accounts).values(
      chartRows.map((row) => ({
        tenantId: TENANT_ID,
        code: row.code,
        name: row.name,
        type: row.type,
        normalSide: row.normalSide,
      })),
    );
    console.log(`${chartRows.length} chart of accounts rows added.`);
  }

  console.log('Seed complete.');
  await client.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
