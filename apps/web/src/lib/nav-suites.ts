import {
  Archive,
  BookOpen,
  BookOpenCheck,
  Building2,
  CalendarDays,
  Calculator,
  CheckCircle2,
  ClipboardList,
  FileText,
  Globe2,
  History,
  Landmark,
  LayoutDashboard,
  LineChart,
  Package,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  label: string;
  icon: LucideIcon;
  href?: string;
};

export type NavSuite = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  superAdminOnly?: boolean;
};

export const CASHBOOK_NAV_ITEM: NavItem = {
  label: 'Cashbook',
  icon: BookOpen,
  href: '/cashbook',
};

export const DOCS_HREF = '/docs';

export function isDocumentationItem(item: Pick<NavItem, 'label' | 'href'>): boolean {
  return item.label === 'Documentation' || item.href === DOCS_HREF;
}

/** Canonical workspace suites. Filter with `filterVisibleSuites` before render. */
export const NAV_SUITES: NavSuite[] = [
  {
    id: 'accounting',
    label: 'Accounting',
    icon: Landmark,
    items: [
      { label: 'Simple Entry', icon: ReceiptText, href: '/' },
      { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
      { label: 'Transactions', icon: ClipboardList, href: '/transactions' },
      { label: 'Journal', icon: BookOpenCheck, href: '/journal' },
      { label: 'Activity', icon: History, href: '/journal/audit' },
      { label: 'Reports', icon: LineChart, href: '/reports' },
      { label: 'Accounts', icon: Landmark, href: '/accounts' },
      { label: 'Advances', icon: ReceiptText, href: '/advances' },
      { label: 'Reconciliation', icon: ShieldCheck, href: '/reconciliation' },
      { label: 'Documentation', icon: BookOpen, href: DOCS_HREF },
    ],
  },
  {
    id: 'parties',
    label: 'Parties',
    icon: Users,
    items: [
      { label: 'Customers', icon: Users, href: '/parties/customers' },
      { label: 'Vendors', icon: Building2, href: '/parties/vendors' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    icon: ShoppingCart,
    items: [
      { label: 'Quotations', icon: FileText, href: '/sales/quotations' },
      { label: 'Sales Orders', icon: ClipboardList, href: '/sales/orders' },
      { label: 'Sales Invoices', icon: ReceiptText, href: '/sales/invoices' },
      { label: 'Receive Payments', icon: Landmark, href: '/sales/payments' },
      { label: 'AR Aging', icon: CalendarDays, href: '/sales/aging' },
      { label: 'Sales Returns', icon: BookOpenCheck, href: '/sales/returns' },
      { label: 'POS', icon: ShoppingCart, href: '/pos' },
      { label: 'POS History', icon: ReceiptText, href: '/sales/pos' },
      { label: 'Discounts', icon: Calculator, href: '/sales/discounts' },
    ],
  },
  {
    id: 'purchase',
    label: 'Purchase',
    icon: Package,
    items: [
      { label: 'Purchase Orders', icon: ClipboardList, href: '/purchase/orders' },
      { label: 'Goods Received', icon: Package, href: '/purchase/receipts' },
      { label: 'Purchases', icon: ReceiptText, href: '/purchase/purchases' },
      { label: 'Document Inbox', icon: FileText, href: '/purchase/inbox' },
      { label: 'Cash Purchases', icon: ShoppingCart, href: '/purchase/expenses' },
      { label: 'Import Purchases', icon: Globe2, href: '/purchase/import' },
      { label: 'Purchase Returns', icon: BookOpenCheck, href: '/purchase/returns' },
      { label: 'Pay Vendors', icon: Landmark, href: '/purchase/payments' },
      { label: 'AP Aging', icon: CalendarDays, href: '/purchase/aging' },
      { label: 'Suppliers', icon: Building2, href: '/purchase/suppliers' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: Package,
    items: [
      { label: 'Products', icon: Package, href: '/inventory/products' },
      { label: 'Categories', icon: Tags, href: '/inventory/categories' },
      { label: 'Stock Levels', icon: Landmark, href: '/inventory/levels' },
      { label: 'Low Stock', icon: SlidersHorizontal, href: '/inventory/levels?low=1' },
      { label: 'Stock Ledger', icon: BookOpenCheck, href: '/inventory/ledger' },
      { label: 'Stock Transfers', icon: ClipboardList, href: '/inventory/transfers' },
      { label: 'Stock Adjustments', icon: SlidersHorizontal, href: '/inventory/adjustments' },
      { label: 'Rental calendar', icon: CalendarDays, href: '/inventory/calendar' },
      { label: 'Dispatch / returns', icon: ClipboardList, href: '/inventory/on-rent' },
      { label: 'On rent', icon: CalendarDays, href: '/inventory/levels?fleet=on_rent' },
    ],
  },
  {
    id: 'company',
    label: 'Company',
    icon: Building2,
    items: [
      { label: 'Company Details', icon: Building2, href: '/company/details' },
      { label: 'Tax Info', icon: FileText, href: '/company/tax' },
      { label: 'Sales Settings', icon: ReceiptText, href: '/company/sales' },
      { label: 'Document styles', icon: FileText, href: '/company/document-styles' },
      { label: 'Purchase Settings', icon: ShoppingCart, href: '/company/purchase' },
      { label: 'AgentBridge', icon: FileText, href: '/company/agent-bridge' },
      { label: 'Commerce Integrations', icon: ShoppingCart, href: '/company/commerce' },
      { label: 'Inventory Settings', icon: Package, href: '/company/inventory' },
      { label: 'Rental Settings', icon: CalendarDays, href: '/company/rental' },
      { label: 'Brands', icon: Package, href: '/company/brands' },
      { label: 'Locations', icon: Landmark, href: '/company/locations' },
      { label: 'Domain Verification', icon: Globe2, href: '/company/domains' },
      { label: 'Backup', icon: Archive, href: '/company/backup' },
      { label: 'Team', icon: Users, href: '/company/team' },
      { label: 'Jobs', icon: ShieldCheck, href: '/company/team/jobs' },
      { label: 'Groups', icon: Users, href: '/company/team/groups' },
    ],
  },
  {
    id: 'control-room',
    label: 'Control Room',
    icon: SlidersHorizontal,
    superAdminOnly: true,
    items: [
      { label: 'Overview', icon: LayoutDashboard, href: '/control-room' },
      { label: 'Companies', icon: Building2, href: '/control-room/companies' },
      { label: 'Modules', icon: SlidersHorizontal, href: '/control-room/modules' },
      { label: 'Access', icon: ShieldCheck, href: '/control-room/access' },
      { label: 'ERP Health Check', icon: CheckCircle2, href: '/control-room/health-check' },
    ],
  },
];


