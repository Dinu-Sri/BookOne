import { z } from 'zod';

const accountRefSchema = z.object({
  kind: z.enum(['code', 'subType']),
  value: z.string().min(1, 'Account value is required'),
});

export const baseEntrySchema = z.object({
  party: z.string().min(1, 'Party name is required').max(255),
  description: z.string().min(1, 'Description is required').max(1000),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().max(5).default('LKR'),
  paymentMethod: z.enum(['Cash', 'Bank', 'Card', 'Online', 'Credit']),
  paymentAccount: accountRefSchema,
  brandId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  receiptRef: z.string().max(500).optional(),
});

export const moneyInSchema = baseEntrySchema.extend({
  direction: z.literal('money_in'),
  moneyInType: z.enum(['customer_payment', 'new_sale', 'owner_contribution']),
  invoiceRef: z.string().max(100).optional(),
  categoryOverride: z.string().max(20).optional(),
});

export const moneyOutSchema = baseEntrySchema.extend({
  direction: z.literal('money_out'),
  categoryOverride: z.string().max(20).optional(),
});

export const moveMoneySchema = baseEntrySchema.extend({
  direction: z.literal('move_money'),
  fromAccount: accountRefSchema,
  toAccount: accountRefSchema,
  categoryOverride: z.string().max(20).optional(),
});

export const invoiceBillSchema = baseEntrySchema.extend({
  direction: z.literal('invoice_bill'),
  invoiceType: z.enum(['customer_invoice', 'vendor_bill']),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  categoryOverride: z.string().max(20).optional(),
});

export const entrySchema = z.discriminatedUnion('direction', [
  moneyInSchema,
  moneyOutSchema,
  moveMoneySchema,
  invoiceBillSchema,
]);

export type EntryInput = z.infer<typeof entrySchema>;
