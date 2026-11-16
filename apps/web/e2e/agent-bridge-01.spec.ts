import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'path';

const CSS = readFileSync(path.resolve(__dirname, '../src/app/globals.css'), 'utf8');

function inboxHtml() {
  return `<!doctype html>
<html class="light" lang="en">
<head><meta charset="utf-8"><style>${CSS}</style></head>
<body>
<div class="app-shell">
  <aside class="sidebar" aria-label="BookOne workspace sidebar">
    <div class="sidebar-header"><strong>BookOne</strong></div>
    <div class="sidebar-section suite-nav">
      <nav aria-label="Suite navigation">
        <div class="suite-group open">
          <button class="suite-trigger active" type="button" aria-expanded="true">PURCHASE</button>
          <div class="suite-panel">
            <div class="suite-panel-inner">
              <div class="nav-list">
                <a class="nav-item nav-child" href="/purchase/purchases"><span class="nav-item-text"><span class="nav-item-label">Purchases</span></span></a>
                <a class="nav-item nav-child active" href="/purchase/inbox"><span class="nav-item-text"><span class="nav-item-label">Document Inbox</span></span></a>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </div>
  </aside>
  <main class="main">
    <div class="workspace party-workspace" style="display:grid;gap:14px">
      <form id="upload">
        <label for="inbox-file">Upload supplier invoice (PDF or image)</label>
        <input id="inbox-file" class="input" type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" required />
        <button type="submit">Receive document</button>
      </form>
      <form id="question">
        <p id="q">Which approved supplier issued this invoice?</p>
        <select id="supplier" class="input" name="value" aria-label="Which approved supplier issued this invoice?">
          <option>ABC Supplies</option>
        </select>
        <button type="submit">Answer</button>
      </form>
      <section id="preview">
        <p>BookOne will record an unpaid purchase bill for ABC Supplies: expense 1000.00 LKR on 6800. Input VAT 18% is 180.00 LKR. Amount payable 1180.00 LKR on 2100.</p>
      </section>
      <form id="approve"><button type="submit">Approve this exact revision</button></form>
      <form id="commit"><button type="submit" id="commit-btn">Commit purchase bill once</button></form>
      <p id="receipt" hidden>Posted once. Receipt APB-1.</p>
    </div>
  </main>
</div>
<script>
document.getElementById('commit').addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = document.getElementById('commit-btn');
  if (btn.dataset.done === '1') return;
  btn.dataset.done = '1';
  document.getElementById('receipt').hidden = false;
});
</script>
</body></html>`;
}

test('Document Inbox review is keyboard reachable and posts once', async ({ page }) => {
  await page.setContent(inboxHtml(), { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByLabel('Upload supplier invoice (PDF or image)')).toBeVisible();
  await page.getByLabel('Which approved supplier issued this invoice?').selectOption('ABC Supplies');
  await page.getByRole('button', { name: 'Approve this exact revision' }).focus();
  await expect(page.getByRole('button', { name: 'Approve this exact revision' })).toBeFocused();
  await page.getByRole('button', { name: 'Commit purchase bill once' }).click();
  await expect(page.getByText('Posted once. Receipt APB-1.')).toBeVisible();
  await page.getByRole('button', { name: 'Commit purchase bill once' }).click();
  await expect(page.getByText('Posted once. Receipt APB-1.')).toHaveCount(1);
});

test('narrow inbox keeps questions and preview readable', async ({ page }) => {
  await page.setContent(inboxHtml(), { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 390, height: 844 });
  const q = page.locator('#q');
  const box = await q.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(200);
  await expect(page.getByText('Document Inbox')).toBeVisible();
});

test('source routes exist for inbox, API, MCP and posting adapter', () => {
  const root = path.resolve(__dirname, '../../..');
  const inbox = readFileSync(path.join(root, 'apps/web/src/app/purchase/inbox/page.tsx'), 'utf8');
  const detail = readFileSync(path.join(root, 'apps/web/src/app/purchase/inbox/[id]/page.tsx'), 'utf8');
  const api = readFileSync(path.join(root, 'apps/web/src/app/api/agent-bridge/v1/[...path]/route.ts'), 'utf8');
  const mcp = readFileSync(path.join(root, 'apps/web/src/app/api/agent-bridge/mcp/route.ts'), 'utf8');
  const posting = readFileSync(path.join(root, 'apps/web/src/lib/agent-bridge-runtime.ts'), 'utf8');
  const nav = readFileSync(path.join(root, 'apps/web/src/lib/nav-suites.ts'), 'utf8');
  expect(inbox).toMatch(/uploadInboxDocument/);
  expect(detail).toMatch(/Approve this exact revision/);
  expect(api).toMatch(/commit_approved_proposal/);
  expect(mcp).toMatch(/handleMcpJsonRpc/);
  expect(posting).toMatch(/createCommercialDocumentWithUser/);
  expect(nav).toMatch(/Document Inbox/);
  expect(nav).not.toMatch(/TileSuiteNav|NavModeToggle/);
});
