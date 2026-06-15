export const metrics = [
  { label: 'Net position', value: 'LKR 1.84M', note: '+12.4% vs previous period', tone: 'success' as const },
  { label: 'Cash available', value: 'LKR 642K', note: 'Bank and cash accounts reconciled', tone: 'neutral' as const },
  { label: 'Receivables', value: 'LKR 386K', note: '18 open customer balances', tone: 'warning' as const },
  { label: 'Payables', value: 'LKR 214K', note: '7 supplier payments due', tone: 'info' as const },
];

export const entryTypes = [
  { title: 'Money In', text: 'Sale, customer payment, owner contribution' },
  { title: 'Money Out', text: 'Expense, supplier payment, owner drawing' },
  { title: 'Move Money', text: 'Transfer between cash, bank, card, wallet' },
  { title: 'Invoice/Bill', text: 'Record now, settle payment later' },
];

export const transactions = [
  { date: '15 Jun', party: 'Nations Trust Bank', description: 'Customer settlement from May invoices', type: 'Receive', status: 'Allocated', amount: '+LKR 148,000' },
  { date: '14 Jun', party: 'Dialog Business', description: 'Fiber internet and office phones', type: 'Expense', status: 'Posted', amount: '-LKR 18,400' },
  { date: '14 Jun', party: 'Serendib Supplies', description: 'Inventory goods for resale', type: 'Purchase', status: 'Partial', amount: '-LKR 92,750' },
  { date: '13 Jun', party: 'BluePeak Studio', description: 'Consulting service invoice', type: 'Sale', status: 'Unpaid', amount: '+LKR 75,000' },
  { date: '12 Jun', party: 'Owner Account', description: 'Owner contribution to bank', type: 'Owner', status: 'Posted', amount: '+LKR 250,000' },
];

export const journalPreview = [
  { account: 'Marketing Expense', side: 'Debit', amount: 'LKR 24,500' },
  { account: 'Bank - Commercial Account', side: 'Credit', amount: 'LKR 24,500' },
];

export const balances = [
  { account: 'Commercial Bank', amount: 'LKR 482,300', note: 'Matched to statement' },
  { account: 'Cash on Hand', amount: 'LKR 42,800', note: 'Last counted today' },
  { account: 'Card Clearing', amount: 'LKR 116,900', note: '2 pending deposits' },
];

export const alerts = [
  { title: 'Period close checklist', detail: '3 confirmations remaining before June can lock', tone: 'warning' as const },
  { title: 'Journal engine health', detail: 'All generated entries balanced today', tone: 'success' as const },
  { title: 'Inference review', detail: '4 low-confidence categories need approval', tone: 'info' as const },
];

export const colorTokens = [
  { name: 'Brand', value: '#1677c9', varName: '--brand' },
  { name: 'Ink', value: '#132238', varName: '--ink' },
  { name: 'Canvas', value: '#f6f8fb', varName: '--bg' },
  { name: 'Success', value: '#15835f', varName: '--success' },
  { name: 'Warning', value: '#a76612', varName: '--warning' },
  { name: 'Danger', value: '#c94141', varName: '--danger' },
  { name: 'Info', value: '#5855b8', varName: '--info' },
  { name: 'Line', value: '#dde5ef', varName: '--line' },
];

export const typeScale = [
  { name: 'Page title', sample: 'Accounting engine board', style: { fontSize: 30, fontWeight: 850, lineHeight: 1.16 } },
  { name: 'Section title', sample: 'Simple entry preview', style: { fontSize: 15, fontWeight: 800 } },
  { name: 'Body', sample: 'The interface captures business reality while the engine posts professional journals.', style: { fontSize: 14, lineHeight: 1.55 } },
  { name: 'Small label', sample: 'RECONCILIATION STATUS', style: { fontSize: 11, fontWeight: 850, textTransform: 'uppercase' as const } },
];
