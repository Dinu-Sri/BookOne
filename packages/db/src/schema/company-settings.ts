import { pgTable, uuid, varchar, timestamp, text } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';

export const tenantMemberships = pgTable('tenant_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: varchar('role', { length: 50 }).notNull().default('owner'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const companyProfiles = pgTable('company_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  legalName: varchar('legal_name', { length: 255 }).notNull(),
  tradingName: varchar('trading_name', { length: 255 }),
  registrationNumber: varchar('registration_number', { length: 100 }),
  country: varchar('country', { length: 100 }).notNull().default('Sri Lanka'),
  baseCurrency: varchar('base_currency', { length: 5 }).notNull().default('LKR'),
  timezone: varchar('timezone', { length: 80 }).notNull().default('Asia/Colombo'),
  addressLine1: varchar('address_line_1', { length: 255 }),
  addressLine2: varchar('address_line_2', { length: 255 }),
  city: varchar('city', { length: 120 }),
  postalCode: varchar('postal_code', { length: 40 }),
  phone: varchar('phone', { length: 30 }),
  email: varchar('email', { length: 320 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const taxProfiles = pgTable('tax_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  tin: varchar('tin', { length: 100 }),
  vatNumber: varchar('vat_number', { length: 100 }),
  svatNumber: varchar('svat_number', { length: 100 }),
  taxOffice: varchar('tax_office', { length: 255 }),
  defaultTaxRate: varchar('default_tax_rate', { length: 20 }).notNull().default('0'),
  taxBasis: varchar('tax_basis', { length: 50 }).notNull().default('standard'),
  invoicePrefix: varchar('invoice_prefix', { length: 20 }).notNull().default('INV'),
  billPrefix: varchar('bill_prefix', { length: 20 }).notNull().default('BILL'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const financialYears = pgTable('financial_years', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  label: varchar('label', { length: 80 }).notNull(),
  startDate: varchar('start_date', { length: 10 }).notNull(),
  endDate: varchar('end_date', { length: 10 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 40 }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  brandId: uuid('brand_id').references(() => brands.id),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 40 }),
  locationType: varchar('location_type', { length: 50 }).notNull().default('branch'),
  address: varchar('address', { length: 500 }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});

export const companyDomains = pgTable('company_domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  domain: varchar('domain', { length: 255 }).notNull(),
  verificationToken: varchar('verification_token', { length: 120 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
});
