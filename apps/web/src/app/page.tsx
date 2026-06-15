import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  FileText,
  Landmark,
  Link2,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button, Card, CardBody, CardHeader, PageHeading, Progress, SelectLike } from '@/components/ui/bookone-ui';
import { balances, journalPreview, transactions } from '@/lib/demo-data';

const entryModes = [
  { title: 'Money In', description: 'Customer payment, new sale, owner contribution', icon: ArrowDownLeft },
  { title: 'Money Out', description: 'Expense, supplier payment, owner drawing', icon: ArrowUpRight, active: true },
  { title: 'Move Money', description: 'Transfer between cash, bank, card, wallet', icon: ArrowRightLeft },
  { title: 'Invoice/Bill', description: 'Record now and settle payment later', icon: FileText },
];

const suggestions = ['Marketing', 'Paid from bank', 'Immediate settlement', 'Attach receipt'];

function EntryModeStep() {
  return (
    <Card className="flow-step">
      <div className="flow-number">1</div>
      <div className="flow-content">
        <div className="flow-title-row">
          <div>
            <h2>What happened?</h2>
            <p>Choose the business event. BookOne will translate it into accounting terms.</p>
          </div>
          <Badge tone="info"><Sparkles size={13} /> Assisted</Badge>
        </div>
        <div className="mode-grid">
          {entryModes.map((mode) => (
            <button className={`mode-card ${mode.active ? 'active' : ''}`} type="button" key={mode.title}>
              <mode.icon size={18} />
              <strong>{mode.title}</strong>
              <span>{mode.description}</span>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

function DetailsStep() {
  return (
    <Card className="flow-step">
      <div className="flow-number">2</div>
      <div className="flow-content">
        <div className="flow-title-row">
          <div>
            <h2>Enter the few details the business owner knows</h2>
            <p>No transaction type, journal account, or settlement status is required from the user.</p>
          </div>
          <Badge tone="success">Draft saved</Badge>
        </div>

        <div className="quick-entry-grid">
          <div className="field">
            <label>Who was it with?</label>
            <input className="input large" defaultValue="Meta Platforms" />
          </div>
          <div className="field">
            <label>How much?</label>
            <input className="input large" defaultValue="LKR 24,500.00" />
          </div>
          <div className="field wide">
            <label>What was it for?</label>
            <input className="input large" defaultValue="Facebook ads campaign for June promotions" />
          </div>
          <div className="field">
            <label>Paid from</label>
            <SelectLike><span className="cluster"><Landmark size={16} /> Commercial Bank</span></SelectLike>
          </div>
          <div className="field">
            <label>Date</label>
            <SelectLike><span className="cluster"><CalendarDays size={16} /> Today, 15 Jun 2026</span></SelectLike>
          </div>
          <div className="field wide">
            <label>Receipt</label>
            <div className="receipt-drop">
              <div className="cluster">
                <ReceiptText size={18} color="var(--brand)" />
                <div>
                  <strong>Drop a receipt or take a photo</strong>
                  <span>OCR can fill party, amount, date, and category hints later.</span>
                </div>
              </div>
              <div className="cluster">
                <Button variant="secondary"><Camera size={16} /> Photo</Button>
                <Button variant="secondary"><Upload size={16} /> Upload</Button>
              </div>
            </div>
          </div>
        </div>

        <div className="suggestion-list">
          {suggestions.map((suggestion) => <Badge tone="neutral" key={suggestion}>{suggestion}</Badge>)}
        </div>
      </div>
    </Card>
  );
}

function ReviewStep() {
  return (
    <Card className="flow-step">
      <div className="flow-number">3</div>
      <div className="flow-content">
        <div className="flow-title-row">
          <div>
            <h2>Review and record</h2>
            <p>The operator confirms the business event; BookOne handles the professional posting.</p>
          </div>
          <Badge tone="success"><CheckCircle2 size={13} /> Ready</Badge>
        </div>
        <div className="action-bar">
          <div>
            <strong style={{ display: 'block', fontSize: 14 }}>Record Money Out as Marketing Expense</strong>
            <span style={{ display: 'block', marginTop: 4, color: 'var(--ink-muted)', fontSize: 13 }}>
              Creates transaction, journal entry, audit record, and settled payment link.
            </span>
          </div>
          <Button variant="primary">Record entry <ChevronRight size={16} /></Button>
        </div>
      </div>
    </Card>
  );
}

function EngineReviewRail() {
  return (
    <aside className="review-rail">
      <Card>
        <CardHeader title="Engine preview" subtitle="What BookOne will create from this simple entry." action={<Badge tone="success">92% confidence</Badge>} />
        <CardBody>
          <div className="review-summary">
            <div className="review-row">
              <div>
                <span>Business event</span>
                <strong>Money Out</strong>
              </div>
              <Badge tone="neutral">User input</Badge>
            </div>
            <div className="review-row">
              <div>
                <span>Accounting type</span>
                <strong>Expense</strong>
              </div>
              <Badge tone="info">Inferred</Badge>
            </div>
            <div className="review-row">
              <div>
                <span>Category</span>
                <strong>Marketing and advertising</strong>
              </div>
              <Badge tone="success">High confidence</Badge>
            </div>
            <div className="review-row">
              <div>
                <span>Settlement</span>
                <strong>Paid immediately from Commercial Bank</strong>
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

      <Card>
        <CardHeader title="Journal output" subtitle="Visible to accountants; generated automatically for the operator." action={<Badge tone="success">Balanced</Badge>} />
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

      <Card>
        <CardHeader title="Safety checks" subtitle="Rules that protect books before posting." action={<ShieldCheck size={18} color="var(--success)" />} />
        <CardBody>
          <div className="safety-list">
            <div className="safety-item"><CheckCircle2 size={16} color="var(--success)" /> Debit and credit totals match.</div>
            <div className="safety-item"><CheckCircle2 size={16} color="var(--success)" /> Open period is editable.</div>
            <div className="safety-item"><CheckCircle2 size={16} color="var(--success)" /> Tenant context will scope all data.</div>
            <div className="safety-item"><Link2 size={16} color="var(--brand)" /> Audit trail will store the original simple entry.</div>
          </div>
        </CardBody>
      </Card>
    </aside>
  );
}

function ContextPanels() {
  return (
    <div className="context-grid">
      <Card>
        <CardHeader title="Recent simple entries" subtitle="A queue designed for fast review, not accountant-first data entry." action={<Link className="button secondary" href="/design-system">Design system</Link>} />
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
              {transactions.slice(0, 4).map((transaction) => (
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

      <Card>
        <CardHeader title="Cash context" subtitle="Balances the operator may need while choosing payment account." />
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
    </div>
  );
}

export default function Home() {
  return (
    <BookOneShell active="Simple Entry">
      <div className="workspace">
        <PageHeading
          eyebrow="Simple entry"
          title="Record what happened"
          lead="The first screen is built for non-accountants: pick the business event, fill the few facts you know, then let BookOne infer the accounting treatment before posting."
          actions={<Link className="button secondary" href="/design-system">Open design system</Link>}
        />

        <div className="simple-entry-layout">
          <div className="entry-flow">
            <EntryModeStep />
            <DetailsStep />
            <ReviewStep />
          </div>
          <EngineReviewRail />
        </div>

        <ContextPanels />
      </div>
    </BookOneShell>
  );
}
