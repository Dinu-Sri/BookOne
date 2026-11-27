/** One short, plain sentence per menu item, shown when the pointer rests on its icon. */
export const NAV_HINTS: Record<string, string> = {
  // Suites
  Accounting: 'Your books: money in and out, reports and bank checks.',
  Parties: 'The people and businesses you deal with.',
  Sales: 'Quotes, orders, invoices and payments from customers.',
  Purchase: 'Orders, bills and payments to suppliers.',
  Inventory: 'Your products and how much stock you have.',
  Company: 'Your business details and settings.',
  'Control Room': 'Platform admin: all companies and modules.',
  // Accounting
  'Simple Entry': 'Record money in or out in a few steps.',
  Dashboard: 'Your business at a glance.',
  Transactions: 'Every money entry, to find, check or reverse.',
  Journal: 'The double-entry lines behind every entry.',
  Activity: 'Who changed what, and when.',
  Reports: 'Profit, financial position and cash flow statements.',
  Accounts: 'Your chart of accounts: where money is filed.',
  Advances: 'Money paid or received before the invoice.',
  Reconciliation: 'Check your bank statement against your books.',
  Cashbook: 'Your personal money in and out.',
  // Parties
  Customers: 'People and businesses that buy from you.',
  Vendors: 'People and businesses you buy from.',
  // Sales
  Quotations: 'Price offers before a sale.',
  'Sales Orders': 'What customers ordered, before invoicing.',
  'Sales Invoices': 'Bills you send to customers.',
  'Receive Payments': 'Record money customers paid you.',
  'AR Aging': 'Who owes you, and for how long.',
  'Sales Returns': 'Goods customers sent back.',
  POS: 'The shop counter till.',
  'POS History': 'Past till sales and shifts.',
  Discounts: 'Discount rules for your prices.',
  // Purchase
  'Purchase Orders': 'Orders you send to suppliers.',
  'Goods Received': 'Stock that arrived from suppliers.',
  Purchases: 'Supplier bills you need to pay.',
  'Document Inbox': 'Supplier bills read by your AI assistant.',
  'Cash Purchases': 'Things bought and paid on the spot.',
  'Import Purchases': 'Goods brought in from abroad.',
  'Purchase Returns': 'Goods you sent back to suppliers.',
  'Pay Vendors': 'Record money you paid suppliers.',
  'AP Aging': 'Who you owe, and for how long.',
  Suppliers: 'Your suppliers list.',
  // Inventory
  Products: 'Everything you sell or stock.',
  Categories: 'Groups that organise your products.',
  'Stock Levels': 'How much of each product you have.',
  'Low Stock': 'Products running low.',
  'Stock Ledger': 'Every stock movement in and out.',
  'Stock Transfers': 'Move stock between shops or stores.',
  'Stock Adjustments': 'Fix counts: damage, loss or recount.',
  'Rental calendar': 'When rental items are booked.',
  'Dispatch / returns': 'Rental items going out and coming back.',
  'On rent': 'Rental items out with customers now.',
  // Company
  'Company Details': 'Name, tax, brands, locations, team and more.',
  'Sales Settings': 'How invoices, numbers and VAT work.',
  'Print designs': 'How your invoices and receipts look on paper.',
  'Purchase Settings': 'How bills and supplier payments work.',
  AgentBridge: 'Connect an AI assistant to help with work.',
  'Commerce API': 'Connect your website shop to BookOne.',
  'Inventory Settings': 'How stock is counted and valued.',
  'Rental Settings': 'Rules for renting items out.',
  Backup: 'Download or restore a copy of your company.',
  Jobs: 'What each role is allowed to do.',
  // Control room
  Overview: 'Health of the whole platform.',
  Companies: 'Every company on the platform.',
};

export function navHint(label: string): string | null {
  return NAV_HINTS[label] ?? null;
}
