import { redirect } from 'next/navigation';
import {
  allocateDocumentPaymentFromForm,
  createDocumentFromForm,
  getDocumentFormOptions,
  listDocuments,
} from '@/app/actions/documents';
import { getPeriodOptions, getTenantInfo } from '@/app/actions/workspace';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button, Card, PageHeading } from '@/components/ui/bookone-ui';
import { FileText, ReceiptText } from 'lucide-react';

interface SearchParams { period?: string }

function formatLKR(value: number) {
  return `LKR ${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  let tenant;
  let documents;
  let options;
  let periodOptions;
  try {
    [tenant, documents, options, periodOptions] = await Promise.all([
      getTenantInfo(),
      listDocuments(params?.period),
      getDocumentFormOptions(),
      getPeriodOptions(params?.period),
    ]);
  } catch {
    redirect('/login');
  }

  const defaultRevenue = options.revenueAccounts[0]?.code ?? '4000';
  const defaultExpense = options.expenseAccounts.find((account) => account.code === '6800')?.code ?? options.expenseAccounts[0]?.code ?? '6800';
  const defaultPayment = options.paymentAccounts.find((account) => account.code === '1100')?.code ?? options.paymentAccounts[0]?.code ?? '1100';

  return (
    <BookOneShell active="Invoices/Bills" tenant={tenant} period={periodOptions}>
      <div className="workspace">
        <PageHeading
          eyebrow="AR / AP"
          title="Invoices & Bills"
          lead="Create real receivable and payable documents, post their journals, and allocate payments against open balances."
        />

        <div className="grid metrics">
          <Card className="metric-card">
            <p className="metric-label">Open receivables</p>
            <p className="metric-value">{formatLKR(documents.openReceivables)}</p>
            <p className="metric-note">Customer invoices not fully paid</p>
          </Card>
          <Card className="metric-card">
            <p className="metric-label">Open payables</p>
            <p className="metric-value">{formatLKR(documents.openPayables)}</p>
            <p className="metric-note">Vendor bills still owed</p>
          </Card>
          <Card className="metric-card">
            <p className="metric-label">Overdue</p>
            <p className="metric-value">{documents.overdueCount}</p>
            <p className="metric-note">Open documents past due date</p>
          </Card>
          <Card className="metric-card">
            <p className="metric-label">Documents</p>
            <p className="metric-value">{documents.documents.length}</p>
            <p className="metric-note">In the selected period</p>
          </Card>
        </div>

        <div className="grid two" style={{ marginTop: 16 }}>
          <Card>
            <div className="card-header">
              <div>
                <p className="eyebrow">New document</p>
                <h2 className="card-title" style={{ marginTop: 4 }}>Invoice or bill</h2>
              </div>
              <Badge tone="info"><FileText size={12} /> Posts journal</Badge>
            </div>
            <div className="card-body">
              <form action={createDocumentFromForm} className="form-grid">
                <div className="field">
                  <label>Type</label>
                  <select className="input" name="documentType" defaultValue="customer_invoice">
                    <option value="customer_invoice">Customer invoice</option>
                    <option value="vendor_bill">Vendor bill</option>
                  </select>
                </div>
                <div className="field">
                  <label>Party</label>
                  <input className="input" name="partyName" placeholder="Customer or vendor name" required />
                </div>
                <div className="field">
                  <label>Issue date</label>
                  <input className="input" name="issueDate" type="date" defaultValue={todayString()} required />
                </div>
                <div className="field">
                  <label>Due date</label>
                  <input className="input" name="dueDate" type="date" />
                </div>
                <div className="field field-full">
                  <label>Description</label>
                  <input className="input" name="description" placeholder="Consulting fee, stock purchase, rent..." required />
                </div>
                <div className="field">
                  <label>Quantity</label>
                  <input className="input" name="quantity" inputMode="decimal" defaultValue="1" required />
                </div>
                <div className="field">
                  <label>Unit price</label>
                  <input className="input" name="unitPrice" inputMode="decimal" placeholder="25,000.00" required />
                </div>
                <div className="field field-full">
                  <label>Revenue account for invoices / expense account for bills</label>
                  <select className="input" name="accountCode" defaultValue={defaultRevenue || defaultExpense}>
                    <optgroup label="Revenue">
                      {options.revenueAccounts.map((account) => (
                        <option key={account.code} value={account.code}>{account.code} - {account.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Expenses">
                      {options.expenseAccounts.map((account) => (
                        <option key={account.code} value={account.code}>{account.code} - {account.name}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div className="field field-full">
                  <Button variant="primary" type="submit">Create document</Button>
                </div>
              </form>
            </div>
          </Card>

          <Card>
            <div className="card-header">
              <div>
                <p className="eyebrow">Payment allocation</p>
                <h2 className="card-title" style={{ marginTop: 4 }}>Match payment to document</h2>
              </div>
              <Badge tone="success"><ReceiptText size={12} /> Settles AR/AP</Badge>
            </div>
            <div className="card-body">
              <form action={allocateDocumentPaymentFromForm} className="form-grid">
                <div className="field field-full">
                  <label>Open document</label>
                  <select className="input" name="documentId" required>
                    {documents.documents.filter((doc) => doc.balanceDue > 0).length === 0 ? (
                      <option value="">No open documents</option>
                    ) : null}
                    {documents.documents.filter((doc) => doc.balanceDue > 0).map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.documentNumber} - {doc.partyName} - due {formatLKR(doc.balanceDue)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Payment date</label>
                  <input className="input" name="paymentDate" type="date" defaultValue={todayString()} required />
                </div>
                <div className="field">
                  <label>Amount</label>
                  <input className="input" name="amount" inputMode="decimal" placeholder="10,000.00" required />
                </div>
                <div className="field field-full">
                  <label>Bank / cash account</label>
                  <select className="input" name="paymentAccountCode" defaultValue={defaultPayment}>
                    {options.paymentAccounts.map((account) => (
                      <option key={account.code} value={account.code}>{account.code} - {account.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field field-full">
                  <Button variant="primary" type="submit">Allocate payment</Button>
                </div>
              </form>
            </div>
          </Card>
        </div>

        <Card style={{ marginTop: 16 }}>
          <div className="card-header">
            <div>
              <p className="eyebrow">Register</p>
              <h2 className="card-title" style={{ marginTop: 4 }}>Documents</h2>
            </div>
          </div>
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Type</th>
                    <th>Party</th>
                    <th>Issue</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Paid</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.documents.length === 0 ? (
                    <tr><td colSpan={9} style={{ color: 'var(--ink-soft)' }}>No invoices or bills yet.</td></tr>
                  ) : documents.documents.map((doc) => (
                    <tr key={doc.id}>
                      <td>{doc.documentNumber}</td>
                      <td>{doc.documentType === 'customer_invoice' ? 'Invoice' : 'Bill'}</td>
                      <td>{doc.partyName}</td>
                      <td>{doc.issueDate}</td>
                      <td>{doc.dueDate ?? '-'}</td>
                      <td>
                        <Badge tone={doc.status === 'paid' ? 'success' : doc.status === 'partial' ? 'warning' : 'info'}>
                          {doc.status}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>{formatLKR(doc.total)}</td>
                      <td style={{ textAlign: 'right' }}>{formatLKR(doc.paidAmount)}</td>
                      <td style={{ textAlign: 'right' }} className={doc.balanceDue > 0 ? 'amount-negative' : 'amount-positive'}>
                        {formatLKR(doc.balanceDue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>
    </BookOneShell>
  );
}
