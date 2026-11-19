import { isRootClass, type AccountRootClass } from './account-classification';
import { duplicateActiveNameIssue, duplicateCodeIssue, normalizeAccountCode, normalizeAccountName, parentIssues, validateAccountCode, validateAccountName, type ExistingAccountLite } from './account-lifecycle';

export type CoaCsvRow = {
  line: number;
  code: string;
  name: string;
  type: string;
  subtype: string;
  parentCode: string;
  description: string;
  isGroup: string;
};

export type CoaCsvIssue = { line: number; field: string; message: string };

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function formulaSafeCell(value: string): string {
  const raw = String(value ?? '');
  if (FORMULA_PREFIX.test(raw) || raw.startsWith("'=")) return `'${raw}`;
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

export function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    if (ch === '\r') continue;
    cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

const HEADER = ['code', 'name', 'type', 'subtype', 'parent_code', 'description', 'is_group'] as const;

export function parseCoaCsv(text: string): { rows: CoaCsvRow[]; issues: CoaCsvIssue[] } {
  const records = parseCsvRecords(text);
  const issues: CoaCsvIssue[] = [];
  if (records.length === 0) return { rows: [], issues: [{ line: 1, field: 'file', message: 'CSV is empty.' }] };
  const header = records[0]!.map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  if (idx('code') < 0 || idx('name') < 0 || idx('type') < 0) {
    issues.push({ line: 1, field: 'header', message: 'CSV needs code, name and type columns.' });
    return { rows: [], issues };
  }
  const rows: CoaCsvRow[] = [];
  for (let i = 1; i < records.length; i += 1) {
    const rec = records[i]!;
    const line = i + 1;
    const at = (name: string) => (idx(name) >= 0 ? (rec[idx(name)] ?? '').trim() : '');
    rows.push({
      line,
      code: normalizeAccountCode(at('code')),
      name: normalizeAccountName(at('name')),
      type: at('type').toLowerCase(),
      subtype: at('subtype').toLowerCase(),
      parentCode: normalizeAccountCode(at('parent_code')),
      description: at('description'),
      isGroup: at('is_group') === '1' || at('is_group').toLowerCase() === 'true' ? '1' : '0',
    });
  }
  return { rows, issues };
}

export type CoaImportPlan = {
  creates: CoaCsvRow[];
  skipped: CoaCsvRow[];
  issues: CoaCsvIssue[];
};

export function dryRunCoaImport(rows: CoaCsvRow[], existing: ExistingAccountLite[]): CoaImportPlan {
  const issues: CoaCsvIssue[] = [];
  const creates: CoaCsvRow[] = [];
  const skipped: CoaCsvRow[] = [];
  const seen = existing.map((row) => ({ ...row }));
  const inFile = new Map<string, CoaCsvRow>();
  for (const row of rows) {
    const codeErr = validateAccountCode(row.code);
    if (codeErr) issues.push({ line: row.line, field: 'code', message: codeErr });
    const nameErr = validateAccountName(row.name);
    if (nameErr) issues.push({ line: row.line, field: 'name', message: nameErr });
    if (!isRootClass(row.type)) {
      issues.push({ line: row.line, field: 'type', message: 'Type must be asset, liability, equity, revenue or expense.' });
      continue;
    }
    if (inFile.has(row.code.toLowerCase())) {
      issues.push({ line: row.line, field: 'code', message: `Duplicate code ${row.code} in this file.` });
      continue;
    }
    const dupCode = duplicateCodeIssue(row.code, seen);
    if (dupCode) {
      skipped.push(row);
      continue;
    }
    const dupName = duplicateActiveNameIssue(row.name, seen);
    if (dupName) issues.push({ line: row.line, field: 'name', message: dupName.message });
    const parent = parentIssues({
      parentCode: row.parentCode || null,
      type: row.type as AccountRootClass,
      code: row.code,
      existing: [...seen, ...[...inFile.values()].map((r) => ({ code: r.code, name: r.name, type: r.type, isGroup: r.isGroup === '1' }))],
    });
    for (const issue of parent) issues.push({ line: row.line, field: issue.field, message: issue.message });
    inFile.set(row.code.toLowerCase(), row);
    seen.push({ code: row.code, name: row.name, type: row.type, isActive: true });
    creates.push(row);
  }
  return { creates, skipped, issues };
}

export function exportCoaCsv(
  accounts: Array<{
    code: string;
    name: string;
    type: string;
    subtype?: string | null;
    parentCode?: string | null;
    description?: string | null;
    isGroup?: string | boolean | null;
  }>,
): string {
  const lines = [HEADER.join(',')];
  for (const row of accounts) {
    const isGroup = row.isGroup === true || row.isGroup === '1' ? '1' : '0';
    lines.push(
      [
        formulaSafeCell(row.code),
        formulaSafeCell(row.name),
        formulaSafeCell(row.type),
        formulaSafeCell(row.subtype ?? ''),
        formulaSafeCell(row.parentCode ?? ''),
        formulaSafeCell(row.description ?? ''),
        formulaSafeCell(isGroup),
      ].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}
