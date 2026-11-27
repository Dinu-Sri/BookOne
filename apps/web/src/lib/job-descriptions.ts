/** One plain sentence per built-in job, so owners can pick without opening the permission grid. */
const JOB_TEXT: Record<string, string> = {
  owner: 'Everything, including company settings, people and backups.',
  admin: 'Everything except closing or resetting the company and backups.',
  accountant: 'Records money, accounts and bank checks; reads reports, sales and purchases.',
  sales: 'Quotes, orders, invoices and customer payments.',
  purchasing: 'Supplier orders, bills, goods received and returns.',
  warehouse: 'Products, stock counts, transfers and goods received.',
  cashier: 'The shop till (POS), its shifts and taking customer payments.',
  viewer: 'Can look at most screens but cannot change anything.',
};

export function jobDescription(job: { slug?: string | null; templateKey?: string | null; name?: string }): string {
  const key = String(job.templateKey || job.slug || '').toLowerCase();
  return JOB_TEXT[key] ?? 'A custom job: open Jobs to see exactly what it allows.';
}
