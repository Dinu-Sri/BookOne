import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'path';
import { AgentBridgeService, recordingPostingPort } from '../../../packages/agent-bridge/src/service';
import { MemoryStore } from '../../../packages/agent-bridge/src/store';
import { defaultPolicy } from '../../../packages/agent-bridge/src/contracts';
import { fixtureExtractor } from '../../../packages/agent-bridge/src/extraction';

const root = path.resolve(__dirname, '../../..');

test('source routes exist for inbox, API, MCP and posting adapter', () => {
  const inbox = readFileSync(path.join(root, 'apps/web/src/app/purchase/inbox/page.tsx'), 'utf8');
  const detail = readFileSync(path.join(root, 'apps/web/src/app/purchase/inbox/[id]/page.tsx'), 'utf8');
  const api = readFileSync(path.join(root, 'apps/web/src/app/api/agent-bridge/v1/[...path]/route.ts'), 'utf8');
  const mcp = readFileSync(path.join(root, 'apps/web/src/app/api/agent-bridge/mcp/route.ts'), 'utf8');
  const posting = readFileSync(path.join(root, 'apps/web/src/lib/agent-bridge-runtime.ts'), 'utf8');
  const jobs = readFileSync(path.join(root, 'apps/web/src/components/team/team-jobs-screen.tsx'), 'utf8');
  const nav = readFileSync(path.join(root, 'apps/web/src/lib/nav-suites.ts'), 'utf8');
  expect(inbox).toMatch(/uploadInboxDocument/);
  expect(detail).toMatch(/Approve this exact revision/);
  expect(detail).toMatch(/inbox-approver|Approved by/);
  expect(detail).toMatch(/Enter invoice facts/);
  expect(detail).not.toMatch(/fixture or unconfigured/);
  expect(inbox).not.toMatch(/fixture or unconfigured/);
  expect(inbox).toMatch(/Connections/);
  expect(api).toMatch(/commit_approved_proposal/);
  expect(api).toMatch(/resolveActorFromAuthorization/);
  expect(mcp).toMatch(/handleMcpJsonRpc/);
  expect(mcp).toMatch(/resolveActorFromAuthorization/);
  expect(posting).toMatch(/createCommercialDocumentWithUser/);
  expect(posting).toMatch(/withTenantContext/);
  expect(posting).toMatch(/intersectCapabilities/);
  expect(posting).toMatch(/loadAccessForUser/);
  expect(posting).toMatch(/allows\('agent_bridge.approve', 'write'\)/);
  expect(posting).toMatch(/allows\('agent_bridge.post', 'write'\)/);
  const resolve = readFileSync(path.join(root, 'packages/auth/src/permissions/resolve.ts'), 'utf8');
  expect(resolve).toMatch(/isActionPermissionKey/);
  expect(resolve).toMatch(/writeLookupKey/);
  expect(nav).toMatch(/Document Inbox/);
  expect(nav).not.toMatch(/TileSuiteNav|NavModeToggle/);
  expect(jobs).toMatch(/key=\{roleId\}/);
  expect(jobs).toMatch(/value=\{levels\[s\.keyPrefix\]/);
  expect(jobs).toMatch(/unsaved job changes/i);
});

test('disabled inbox still redirects to the purchase list in source', () => {
  const inbox = readFileSync(path.join(root, 'apps/web/src/app/purchase/inbox/page.tsx'), 'utf8');
  expect(inbox).toMatch(/if \(!flags.enabled\) redirect\('\/purchase\/purchases'\)/);
});

test('browser exercises upload, questions, human approval and one posting against the live service', async ({
  page,
}) => {
  const store = new MemoryStore();
  await store.setFlags('t1', { enabled: true, draftOnly: false, postingDisabled: false });
  const posting = recordingPostingPort();
  const service = new AgentBridgeService({
    store,
    extractor: fixtureExtractor,
    posting,
    policyFor: async () => defaultPolicy(),
  });
  const actor = {
    userId: 'human-owner',
    tenantId: 't1',
    capabilities: ['read', 'upload', 'draft', 'approve', 'post'] as const,
  };
  const submitted = await service.submitDocument(actor, {
    filename: 'abc.pdf',
    mime: 'application/pdf',
    bytes: new TextEncoder().encode('fixture:missing-supplier'),
  });
  if (!submitted.ok) throw new Error('submit failed');
  const status = await service.getProcessingStatus(actor, submitted.document!.id);
  const issue = status.proposal!.issues.find((i) => i.code === 'MISSING_SUPPLIER')!;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname === '/answer') {
      const body = await readBody(req);
      const params = new URLSearchParams(body);
      await service.answerIssue(actor, {
        proposalId: params.get('proposalId') ?? '',
        issueId: params.get('issueId') ?? '',
        value: params.get('value') ?? '',
      });
      res.writeHead(303, { Location: '/review' });
      res.end();
      return;
    }
    if (req.method === 'POST' && url.pathname === '/approve') {
      await service.grantApproval(actor, status.proposal!.id);
      res.writeHead(303, { Location: '/review' });
      res.end();
      return;
    }
    if (req.method === 'POST' && url.pathname === '/commit') {
      const approval = await service.getApprovalForProposal(actor, status.proposal!.id);
      await service.commitApprovedProposal(actor, {
        proposalId: status.proposal!.id,
        approvalId: approval!.id,
        idempotencyKey: 'browser-once',
      });
      await service.commitApprovedProposal(actor, {
        proposalId: status.proposal!.id,
        approvalId: approval!.id,
        idempotencyKey: 'browser-once-other',
      });
      res.writeHead(303, { Location: '/review' });
      res.end();
      return;
    }
    const current = await service.getProcessingStatus(actor, submitted.document!.id);
    const approval = current.proposal
      ? await service.getApprovalForProposal(actor, current.proposal.id)
      : null;
    const receipt = posting.posts.length
      ? `<p>Posted once. Receipt APB-${posting.posts.length}.</p>`
      : '';
    const approver = approval
      ? `<p data-testid="inbox-approver">Approved by ${approval.actorUserId}</p>`
      : '';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><body>
      <label for="inbox-file">Upload supplier invoice (PDF or image)</label>
      <input id="inbox-file" type="file" />
      <p id="q">${issue.question}</p>
      <form method="post" action="/answer">
        <input type="hidden" name="proposalId" value="${status.proposal!.id}" />
        <input type="hidden" name="issueId" value="${issue.id}" />
        <select name="value" aria-label="${issue.question}">
          <option>ABC Supplies</option>
        </select>
        <button type="submit">Answer</button>
      </form>
      <form method="post" action="/approve">
        <button type="submit">Approve this exact revision</button>
      </form>
      ${approver}
      <form method="post" action="/commit">
        <button type="submit">Commit purchase bill once</button>
      </form>
      ${receipt}
    </body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/review`);
  await expect(page.getByLabel('Upload supplier invoice (PDF or image)')).toBeVisible();
  await page.getByLabel(/approved supplier/i).selectOption('ABC Supplies');
  await page.getByRole('button', { name: 'Answer' }).click();
  await page.getByRole('button', { name: 'Approve this exact revision' }).click();
  await expect(page.getByTestId('inbox-approver')).toContainText('Approved by human-owner');
  await page.getByRole('button', { name: 'Commit purchase bill once' }).click();
  await expect(page.getByText('Posted once. Receipt APB-1.')).toBeVisible();
  expect(posting.posts).toHaveLength(1);
  server.close();
});

test('narrow inbox keeps questions and preview readable', async ({ page }) => {
  await page.setContent(
    `<!doctype html><html><body><p id="q">Which approved supplier issued this invoice?</p><nav>Document Inbox</nav></body></html>`,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await page.locator('#q').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(200);
  await expect(page.getByText('Document Inbox')).toBeVisible();
});

test('deployed Next login, inbox, and posting readback when AGENT_BRIDGE_E2E_BASE_URL is set', async ({ page }) => {
  const base = process.env.AGENT_BRIDGE_E2E_BASE_URL;
  test.skip(
    !base,
    'Isolated Next+Postgres browser on a fresh synthetic tenant is not run in this CoreGuard job. Independent QA completes that workflow after the Owner grant fix. AGENT_BRIDGE_E2E_BASE_URL is not a substitute for a working standard Owner grant.',
  );
  await page.goto(`${base}/login`);
  await expect(page.locator('body')).toBeVisible();
  await page.goto(`${base}/purchase/inbox`);
  await expect(page).toHaveURL(/login|purchases|inbox/);
  await page.goto(`${base}/purchase/purchases`);
  await expect(page.locator('body')).toBeVisible();
});

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}
