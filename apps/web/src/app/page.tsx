import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Bell,
  BookOpenCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Gauge,
  Landmark,
  LayoutDashboard,
  LineChart,
  Plus,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import Link from 'next/link';
import { Badge, BrandLockup, Button, Card, CardBody, CardHeader, MetricCard, PageHeading, Progress, SelectLike } from '@/components/ui/bookone-ui';
import { alerts, balances, entryTypes, journalPreview, metrics, transactions } from '@/lib/demo-data';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Simple Entry', icon: ReceiptText },
  { label: 'Transactions', icon: ClipboardList },
  { label: 'Journal', icon: BookOpenCheck },
  { label: 'Reports', icon: LineChart },
  { label: 'Accounts', icon: Landmark },
  { label: 'Reconciliation', icon: ShieldCheck },
  { label: 'Settings', icon: Settings },
];

function Sidebar() {
  return (
    <aside className="sidebar">
      <BrandLockup />
      <div className="sidebar-section">
        <p className="sidebar-label">Accounting workspace</p>
        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map((item) => (
            <a className={`nav-item ${item.active ? 'active' : ''}`} href="#" key={item.label}>
              <item.icon size={17} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
      </div>
      <div className="sidebar-section">
        <Card padded>
          <Badge tone="success">Engine ready</Badge>
          <p className="card-subtitle" style={{ marginTop: 10 }}>
            Recognition, settlement, journal balancing, and audit trail will be handled under the hood.
          </p>
        </Card>
      </div>
    </aside>
  );
}

function Topbar() {
  return (
    <header className="topbar">
      <div className="cluster">
        <SelectLike>
          <span className="cluster"><Building2 size={16} /> Clossyan Holdings</span>
        </SelectLike>
        <div className="search-field">
          <Search size={16} />
          <input className="input" placeholder="Search transactions, accounts, parties" />
        </div>
      </div>
      <div className="topbar-actions">
        <SelectLike>
          <span className="cluster"><CalendarDays size={16} /> Jun 2026</span>
        </SelectLike>
        <Button variant="secondary" className="icon" aria-label="Notifications"><Bell size={16} /></Button>
        <Button variant="primary"><Plus size={16} /> New Entry</Button>
      </div>
    </header>
  );
}

function SimpleEntryPanel() {
  return (
    <Card>
      <CardHeader
        title="Simple entry"
        subtitle="Capture what happened in business language. The engine maps it to accounting entries."
        action={<Badge tone="info"><Sparkles size={13} /> Assisted</Badge>}
      />
      <CardBody>
        <div className="entry-options">
          {entryTypes.map((entry, index) => (
            <button className={`entry-option ${index === 1 ? 'active' : ''}`} type="button" key={entry.title}>
              {index === 0 ? <ArrowDownLeft size={18} /> : null}
              {index === 1 ? <ArrowUpRight size={18} /> : null}
              {index === 2 ? <ArrowRightLeft size={18} /> : null}
              {index === 3 ? <FileText size={18} /> : null}
              <strong>{entry.title}</strong>
              <span>{entry.text}</span>
            </button>
          ))}
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field">
            <label>Who</label>
            <input className="input" defaultValue="Meta Platforms" />
          </div>
          <div className="field">
            <label>How much</label>
            <input className="input" defaultValue="LKR 24,500.00" />
          </div>
          <div className="field">
            <label>What for</label>
            <input className="input" defaultValue="Facebook ads campaign" />
          </div>
          <div className="field">
            <label>Paid from</label>
            <SelectLike>Commercial Bank</SelectLike>
          </div>
        </div>

        <div className="cluster" style={{ justifyContent: 'space-between', marginTop: 16 }}>
          <Badge tone="success"><CheckCircle2 size={13} /> Ready to post</Badge>
          <Button variant="primary">Record money out <ChevronRight size={16} /></Button>
        </div>
      </CardBody>
    </Card>
  );
}

function InferencePanel() {
  return (
    <Card>
      <CardHeader
        title="Engine inference"
        subtitle="Preview before posting. Users see confidence and plain language; accountants can inspect the journal."
        action={<Badge tone="success">92% confidence</Badge>}
      />
      <CardBody>
        <div className="journal-lines">
          <div className="journal-line">
            <div>
              <strong>Mapped transaction</strong>
              <span>Money Out → Expense</span>
            </div>
            <Badge tone="neutral">Expense</Badge>
          </div>
          <div className="journal-line">
            <div>
              <strong>Suggested category</strong>
              <span>Marketing and advertising</span>
            </div>
            <Badge tone="info">Rule + AI</Badge>
          </div>
          <div className="journal-line">
            <div>
              <strong>Settlement behavior</strong>
              <span>Immediate payment from bank account</span>
            </div>
            <Badge tone="success">Settled</Badge>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="cluster" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="metric-label">Inference confidence</span>
            <span className="metric-label">92%</span>
          </div>
          <Progress value={92} />
        </div>
      </CardBody>
    </Card>
  );
}

function JournalPreview() {
  return (
    <Card>
      <CardHeader title="Journal preview" subtitle="Balanced double-entry output generated from the simple entry." action={<Badge tone="success">Balanced</Badge>} />
      <CardBody>
        <div className="journal-lines">
          {journalPreview.map((line) => (
            <div className="journal-line" key={line.account}>
              <div>
                <strong>{line.account}</strong>
                <span>{line.side}</span>
              </div>
              <strong>{line.amount}</strong>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function RecentTransactions() {
  return (
    <Card>
      <CardHeader title="Recent transactions" subtitle="Recognition, settlement, and journal status in one operational view." action={<Button variant="secondary">View all</Button>} />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Party</th>
              <th>Description</th>
              <th>Type</th>
              <th>Status</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={`${transaction.date}-${transaction.party}`}>
                <td>{transaction.date}</td>
                <td><strong>{transaction.party}</strong></td>
                <td>{transaction.description}</td>
                <td>{transaction.type}</td>
                <td><Badge tone={transaction.status === 'Unpaid' || transaction.status === 'Partial' ? 'warning' : 'success'}>{transaction.status}</Badge></td>
                <td className={transaction.amount.startsWith('+') ? 'amount-positive' : 'amount-negative'}>{transaction.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RightRail() {
  return (
    <div className="grid">
      <Card>
        <CardHeader title="Cash and bank" subtitle="Operational balances available for posting and reconciliation." action={<WalletCards size={18} color="var(--brand)" />} />
        <CardBody>
          <div className="balance-list">
            {balances.map((balance) => (
              <div className="balance-row" key={balance.account}>
                <div>
                  <strong>{balance.account}</strong>
                  <span>{balance.note}</span>
                </div>
                <strong>{balance.amount}</strong>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <JournalPreview />

      <Card>
        <CardHeader title="Alerts and tasks" subtitle="Items that need operator or accountant attention." action={<Gauge size={18} color="var(--brand)" />} />
        <CardBody>
          <div className="alert-list">
            {alerts.map((alert) => (
              <div className="alert-row" key={alert.title}>
                <div>
                  <strong>{alert.title}</strong>
                  <span>{alert.detail}</span>
                </div>
                <Badge tone={alert.tone}>{alert.tone}</Badge>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export default function Home() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Topbar />
        <div className="workspace">
          <PageHeading
            eyebrow="Accounting engine"
            title="Simple entries, professional books"
            lead="BookOne lets operators record business events in a few fields while the accounting engine infers categories, settlement behavior, and balanced journals behind the scenes."
            actions={<Link className="button secondary" href="/design-system">Open design system</Link>}
          />

          <div className="grid metrics" style={{ marginBottom: 16 }}>
            {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
          </div>

          <div className="grid board">
            <div className="grid">
              <SimpleEntryPanel />
              <InferencePanel />
              <RecentTransactions />
            </div>
            <RightRail />
          </div>
        </div>
      </main>
    </div>
  );
}
