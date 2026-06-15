import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileCheck2,
  Loader2,
  Plus,
  ReceiptText,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { Badge, BrandLockup, Button, Card, CardBody, CardHeader, MetricCard, PageHeading, Progress, SelectLike } from '@/components/ui/bookone-ui';
import { colorTokens, metrics, transactions, typeScale } from '@/lib/demo-data';

export default function DesignSystemPage() {
  return (
    <main className="workspace" style={{ maxWidth: 1280, margin: '0 auto' }}>
      <PageHeading
        eyebrow="Design system"
        title="BookOne interface foundations"
        lead="A reference page for brand assets, typography, color, controls, data displays, and accounting-specific states used across the BookOne SaaS accounting workspace."
        actions={
          <Link className="button secondary" href="/">
            <ArrowLeft size={16} /> Back to board
          </Link>
        }
      />

      <div className="grid" style={{ gap: 18 }}>
        <Card>
          <CardHeader title="Brand assets" subtitle="Use the horizontal logo where there is space; use the favicon mark in compact navigation or browser surfaces." />
          <CardBody>
            <div className="grid two">
              <Card padded>
                <p className="metric-label">Primary lockup</p>
                <div style={{ marginTop: 18 }}><BrandLockup /></div>
              </Card>
              <Card padded>
                <p className="metric-label">Compact mark</p>
                <div style={{ marginTop: 18 }}><BrandLockup compact /></div>
              </Card>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Typography" subtitle="Compact, professional, and optimized for repeated operational use." />
          <CardBody>
            <div className="type-sample">
              {typeScale.map((type) => (
                <div className="type-row" key={type.name}>
                  <span>{type.name}</span>
                  <p style={type.style}>{type.sample}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Color tokens" subtitle="Neutral-first SaaS palette with clear accounting and workflow state colors." />
          <CardBody>
            <div className="token-grid">
              {colorTokens.map((token) => (
                <div className="swatch" key={token.name}>
                  <div className="swatch-color" style={{ background: token.value }} />
                  <div className="swatch-meta">
                    <strong>{token.name}</strong>
                    <span>{token.varName}</span>
                    <span>{token.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <div className="grid two">
          <Card>
            <CardHeader title="Buttons and controls" subtitle="Use icons for recognizable actions and text buttons for clear commands." />
            <CardBody>
              <div className="grid">
                <div className="cluster">
                  <Button variant="primary"><Plus size={16} /> New Entry</Button>
                  <Button variant="secondary"><Upload size={16} /> Upload receipt</Button>
                  <Button variant="ghost"><Sparkles size={16} /> Infer category</Button>
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label>Search</label>
                    <div className="search-field" style={{ width: '100%' }}>
                      <Search size={16} />
                      <input className="input" placeholder="Search by party, account, invoice" />
                    </div>
                  </div>
                  <div className="field">
                    <label>Period</label>
                    <SelectLike>June 2026</SelectLike>
                  </div>
                </div>
                <div className="tabs">
                  <button className="tab active" type="button">Overview</button>
                  <button className="tab" type="button">Entries</button>
                  <button className="tab" type="button">Journal</button>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Badges and states" subtitle="States are short, scannable, and tied to accounting workflow meaning." />
            <CardBody>
              <div className="state-demo">
                <Badge tone="success"><CheckCircle2 size={13} /> Balanced</Badge>
                <Badge tone="warning"><Clock3 size={13} /> Pending</Badge>
                <Badge tone="danger"><AlertTriangle size={13} /> Variance</Badge>
                <Badge tone="info"><Sparkles size={13} /> Inferred</Badge>
              </div>
              <div style={{ marginTop: 20 }}>
                <div className="cluster" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="metric-label">AI category confidence</span>
                  <span className="metric-label">84%</span>
                </div>
                <Progress value={84} />
              </div>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Metric cards" subtitle="Use for period-level facts that operators need to scan before action." />
          <CardBody>
            <div className="grid metrics">
              {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Accounting table" subtitle="Tables carry high-density operational data with status badges and amount emphasis." />
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

        <div className="grid three">
          <Card>
            <CardHeader title="Empty state" subtitle="Useful before first import, account connection, or transaction entry." />
            <CardBody>
              <div className="empty-state">
                <ReceiptText size={28} color="var(--brand)" />
                <h3>No receipts uploaded</h3>
                <p>Upload receipts to let BookOne extract vendor, amount, date, and category hints.</p>
                <div style={{ marginTop: 14 }}><Button variant="primary"><Upload size={16} /> Upload receipt</Button></div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Loading state" subtitle="Use when inference, OCR, or reconciliation is processing." />
            <CardBody>
              <div className="empty-state">
                <Loader2 size={28} color="var(--brand)" />
                <h3>Reading bank statement</h3>
                <p>Matching deposits, payments, fees, and reference numbers against open entries.</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Review state" subtitle="Use for low-confidence engine decisions before posting." />
            <CardBody>
              <div className="empty-state">
                <CircleDot size={28} color="var(--warning)" />
                <h3>Review needed</h3>
                <p>BookOne inferred direct costs, but the description may indicate office supplies.</p>
                <div style={{ marginTop: 14 }}><Badge tone="warning">68% confidence</Badge></div>
              </div>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Accounting-specific pattern" subtitle="Simple user language paired with professional accounting output." action={<Badge tone="success"><FileCheck2 size={13} /> Audit safe</Badge>} />
          <CardBody>
            <div className="grid two">
              <div className="journal-line">
                <div>
                  <strong>User sees</strong>
                  <span>Money Out: Facebook ads campaign, LKR 24,500, paid from Commercial Bank</span>
                </div>
              </div>
              <div className="journal-line">
                <div>
                  <strong>Engine posts</strong>
                  <span>Dr Marketing Expense, Cr Bank - Commercial Account, balanced journal entry</span>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
