import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export type UiViolation = {
  file: string;
  rule: string;
  line: number;
  detail: string;
};

export const APPROVED_CONTROL_FILES = [
  'apps/web/src/components/ui/date-field.tsx',
  'apps/web/src/components/ui/select-field.tsx',
  'apps/web/src/components/ui/text-field.tsx',
  'apps/web/src/components/ui/form-shell.tsx',
] as const;

export const FEATURE_ZERO_PREFIXES = [
  'apps/web/src/components/accounts/',
  'apps/web/src/components/advances/',
  'apps/web/src/app/accounts/',
  'apps/web/src/app/advances/',
] as const;

export const SHELL_REQUIRED_FILES = [
  'apps/web/src/components/accounts/coa-wizard.tsx',
  'apps/web/src/components/accounts/coa-opening.tsx',
  'apps/web/src/components/accounts/coa-import.tsx',
  'apps/web/src/components/accounts/coa-account-detail.tsx',
  'apps/web/src/components/advances/advances-panel.tsx',
] as const;

const DATE_TYPES = new Set(['date', 'time', 'datetime-local', 'month', 'week']);
const EXEMPT_INPUT_TYPES = new Set(['hidden', 'checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'image']);

function relFrom(root: string, file: string): string {
  return path.relative(root, file).replace(/\\/g, '/');
}

function walkFiles(dir: string, acc: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkFiles(full, acc);
    else if (name.endsWith('.tsx') || name.endsWith('.jsx')) acc.push(full);
  }
  return acc;
}

function jsxTagName(node: ts.JsxOpeningLikeElement): string | null {
  const tag = node.tagName;
  if (ts.isIdentifier(tag)) return tag.text;
  return null;
}

function jsxAttr(node: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name) && attr.name.text === name) return attr;
  }
  return undefined;
}

function stringFromExpr(expr: ts.Expression | undefined): string | null {
  if (!expr) return null;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  if (ts.isJsxExpression(expr as ts.Node)) return stringFromExpr((expr as ts.JsxExpression).expression ?? undefined);
  return null;
}

function classTokens(expr: ts.Expression | ts.JsxExpression | undefined): string[] {
  if (!expr) return [];
  const tokens: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      tokens.push(...node.text.split(/\s+/).filter(Boolean));
    } else if (ts.isTemplateExpression(node)) {
      tokens.push(...node.head.text.split(/\s+/).filter(Boolean));
      for (const span of node.templateSpans) tokens.push(...span.literal.text.split(/\s+/).filter(Boolean));
    }
    ts.forEachChild(node, visit);
  };
  visit(expr);
  return tokens;
}

function attrType(node: ts.JsxOpeningLikeElement): string | null {
  const attr = jsxAttr(node, 'type');
  if (!attr?.initializer) return null;
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
  if (ts.isJsxExpression(attr.initializer)) return stringFromExpr(attr.initializer.expression ?? undefined);
  return null;
}

function hasInputClass(node: ts.JsxOpeningLikeElement): boolean {
  const attr = jsxAttr(node, 'className');
  if (!attr?.initializer) return false;
  const expr = ts.isJsxExpression(attr.initializer) ? attr.initializer.expression ?? undefined : attr.initializer;
  return classTokens(expr).includes('input');
}

export function scanSource(fileRel: string, text: string): UiViolation[] {
  const source = ts.createSourceFile(fileRel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const approved = (APPROVED_CONTROL_FILES as readonly string[]).includes(fileRel);
  const hits: UiViolation[] = [];
  const add = (node: ts.Node, rule: string, detail: string) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source, false));
    hits.push({ file: fileRel, rule, line: line + 1, detail });
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTagName(node);
      if (tag === 'select' && !approved) {
        add(node, 'raw-select', 'Native select is not allowed outside approved shared controls.');
      }
      if (tag === 'input') {
        const type = (attrType(node) ?? 'text').toLowerCase();
        if (DATE_TYPES.has(type) && fileRel !== 'apps/web/src/components/ui/date-field.tsx') {
          add(node, 'raw-date', `Native ${type} control is not allowed outside DateField.`);
        } else if (!EXEMPT_INPUT_TYPES.has(type) && !DATE_TYPES.has(type) && !approved && !hasInputClass(node)) {
          add(node, 'unstyled-field', 'Visible text/amount inputs must use the shared .input control.');
        }
      }
      if (tag === 'textarea' && !approved && !hasInputClass(node)) {
        add(node, 'unstyled-textarea', 'Textareas must use the shared .input control.');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  if ((SHELL_REQUIRED_FILES as readonly string[]).includes(fileRel)) {
    const hasBack =
      text.includes('FormBackLink') ||
      text.includes('FormShell') ||
      text.includes('party-back-btn') ||
      hasIdentifier(source, 'FormBackLink') ||
      hasIdentifier(source, 'FormShell');
    if (!hasBack) {
      hits.push({
        file: fileRel,
        rule: 'form-shell',
        line: 1,
        detail: 'Create/detail/opening/import forms must use FormBackLink or party-back-btn.',
      });
    }
  }

  return hits;
}

function hasIdentifier(source: ts.SourceFile, name: string): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && node.text === name) found = true;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

export function scanTree(root: string, webSrc = path.join(root, 'apps/web/src')): UiViolation[] {
  const files = walkFiles(webSrc, []);
  const all: UiViolation[] = [];
  for (const file of files) {
    const rel = relFrom(root, file);
    const text = readFileSync(file, 'utf8');
    all.push(...scanSource(rel, text));
  }
  return all;
}

export function isFeatureFile(rel: string): boolean {
  return FEATURE_ZERO_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

export function countsByFile(hits: UiViolation[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const hit of hits) {
    out[hit.file] ??= {};
    out[hit.file][hit.rule] = (out[hit.file][hit.rule] ?? 0) + 1;
  }
  return out;
}
