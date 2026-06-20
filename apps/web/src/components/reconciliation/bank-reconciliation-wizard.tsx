'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, FileSpreadsheet, Upload } from 'lucide-react';
import type { TransactionRow } from '@/app/actions/workspace';
import { Badge, Button, Card } from '@/components/ui/bookone-ui';

interface BankRow {
  id: string;
  date: string;
  description: string;
  amount: number;
  matchedTransactionId: string | null;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseAmount(value: string): number {
  const cleaned = value.replace(/[^\d.-]/g, '');
  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toISOString().slice(0, 10);
}

function findColumn(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.some((name) => header.includes(name)));
}

function signedTransactionAmount(tx: TransactionRow): number {
  if (tx.direction === 'money_in') return tx.amount;
  if (tx.direction === 'money_out') return -tx.amount;
  return tx.amount;
}

function parseBankCsv(text: string, transactions: TransactionRow[]): BankRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const rawHeaders = splitCsvLine(lines[0] ?? '');
  const headers = rawHeaders.map((header) => header.toLowerCase().trim());
  const dateIndex = findColumn(headers, ['date', 'posted', 'transaction date']);
  const descriptionIndex = findColumn(headers, ['description', 'memo', 'details', 'narration', 'particulars']);
  const amountIndex = findColumn(headers, ['amount', 'value']);
  const debitIndex = findColumn(headers, ['debit', 'withdrawal', 'paid out']);
  const creditIndex = findColumn(headers, ['credit', 'deposit', 'paid in']);

  const usedMatches = new Set<string>();

  return lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    const date = normalizeDate(cells[dateIndex] ?? '');
    const description = cells[descriptionIndex] ?? cells[1] ?? 'Bank statement line';
    const amount =
      amountIndex >= 0
        ? parseAmount(cells[amountIndex] ?? '')
        : parseAmount(cells[creditIndex] ?? '') - parseAmount(cells[debitIndex] ?? '');

    const match = transactions.find((tx) => {
      if (usedMatches.has(tx.id)) return false;
      const sameDate = tx.date === date;
      const sameAmount = Math.abs(signedTransactionAmount(tx) - amount) < 0.01;
      return sameDate && sameAmount;
    });
    if (match) usedMatches.add(match.id);

    return {
      id: `${date}-${index}`,
      date,
      description,
      amount,
      matchedTransactionId: match?.id ?? null,
    };
  });
}

function formatLKR(value: number) {
  const sign = value < 0 ? '-' : '';
  return `${sign}LKR ${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function BankReconciliationWizard({ transactions }: { transactions: TransactionRow[] }) {
  const [rows, setRows] = useState<BankRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const matchedCount = useMemo(() => rows.filter((row) => row.matchedTransactionId).length, [rows]);
  const unmatchedCount = rows.length - matchedCount;

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseBankCsv(text, transactions);
      if (parsed.length === 0) {
        setRows([]);
        setError('No statement rows found. Use a CSV with headers like date, description, amount.');
        return;
      }
      setRows(parsed);
    } catch {
      setRows([]);
      setError('Could not read this CSV file.');
    }
  }

  return (
    <Card>
      <div className="card-header">
        <div>
          <p className="eyebrow">Bank reconciliation</p>
          <h2 className="card-title" style={{ marginTop: 4 }}>Match statement CSV</h2>
          <p className="card-subtitle">Upload a bank CSV to preview automatic matches for this period.</p>
        </div>
        <Badge tone={rows.length === 0 ? 'info' : unmatchedCount === 0 ? 'success' : 'warning'}>
          {rows.length === 0 ? 'Ready' : `${matchedCount}/${rows.length} matched`}
        </Badge>
      </div>
      <div className="card-body">
        <label className="statement-drop">
          <FileSpreadsheet size={20} color="var(--brand)" />
          <span>
            <strong>{fileName ?? 'Choose bank CSV'}</strong>
            <small>Date + amount columns are enough for a first pass.</small>
          </span>
          <Button variant="secondary">
            <Upload size={15} /> Upload
          </Button>
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.target.value = '';
            }}
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        {rows.length > 0 ? (
          <>
            <div className="recon-summary">
              <div className="balance-row">
                <div>
                  <strong>Matched</strong>
                  <span>Exact date and amount matches.</span>
                </div>
                <Badge tone="success"><CheckCircle2 size={12} /> {matchedCount}</Badge>
              </div>
              <div className="balance-row">
                <div>
                  <strong>Needs review</strong>
                  <span>Statement lines without an automatic match.</span>
                </div>
                <Badge tone={unmatchedCount === 0 ? 'success' : 'warning'}>
                  <CircleAlert size={12} /> {unmatchedCount}
                </Badge>
              </div>
            </div>

            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((row) => (
                    <tr key={row.id}>
                      <td>{row.date}</td>
                      <td style={{ color: 'var(--ink-muted)' }}>{row.description}</td>
                      <td>
                        <Badge tone={row.matchedTransactionId ? 'success' : 'warning'}>
                          {row.matchedTransactionId ? 'Matched' : 'Review'}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right' }} className={row.amount < 0 ? 'amount-negative' : 'amount-positive'}>
                        {formatLKR(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
