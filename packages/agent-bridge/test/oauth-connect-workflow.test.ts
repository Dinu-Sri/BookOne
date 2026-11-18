import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { defaultPolicy, type Actor } from '../src/contracts';
import { MemoryStore } from '../src/store';
import { AgentBridgeService, recordingPostingPort, TOOL_NAMES } from '../src/service';
import { handleMcpJsonRpc } from '../src/mcp';
import {
  ensureOauthSigningPem,
  jwksFromSigningPem,
  mintRs256AccessToken,
  resolveActorFromAuthorization,
} from '../src/authz';
import {
  claudeConnectorSteps,
  codexSetupCommand,
  consentConnectionScopes,
  findPublicClient,
  publicConnectionDetails,
} from '../src/oauth';
import { oracleVatMinor } from '../src/oracles';
import { money } from '../src/money';

function unconfiguredExtractor() {
  return {
    id: 'provider:configurable-ocr',
    async extract() {
      throw Object.assign(new Error('Live OCR is not opted in.'), { code: 'PROVIDER_UNCONFIGURED' });
    },
  };
}

const dir = mkdtempSync(path.join(tmpdir(), 'ab-connect-wf-'));
const pemPath = path.join(dir, 'agent_bridge_oauth_signing.pem');

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function human(): Actor {
  return {
    userId: 'owner-1',
    tenantId: 'tenant-connect',
    capabilities: ['read', 'upload', 'draft', 'approve', 'post'],
  };
}

describe('AgentBridge login, consent, discovery and invoice workflow', () => {
  it('redirects unauthenticated authorize requests through login from=', () => {
    const authorize = readFileSync(
      path.resolve(__dirname, '../../../apps/web/src/app/api/agent-bridge/oauth/authorize/route.ts'),
      'utf8',
    );
    const login = readFileSync(path.resolve(__dirname, '../../../apps/web/src/app/login/page.tsx'), 'utf8');
    expect(authorize).toMatch(/\/login\?from=\$\{next\}/);
    expect(authorize).toMatch(/requireTenantContext/);
    expect(authorize).toMatch(/renderConsentPage/);
    expect(authorize).toMatch(/consentConnectionScopes/);
    expect(authorize).toMatch(/decision === 'deny'/);
    expect(login).toMatch(/searchParams\.get\('from'\) \|\| searchParams\.get\('next'\)/);
  });

  it('consent grants only read/upload/draft for pre-registered clients', () => {
    expect(consentConnectionScopes()).toEqual(['read', 'upload', 'draft']);
    expect(consentConnectionScopes()).not.toContain('post');
    expect(consentConnectionScopes()).not.toContain('approve');
    expect(findPublicClient('bookone-codex')?.clientName).toBe('Codex');
    expect(findPublicClient('bookone-claude')?.clientName).toBe('Claude');
  });

  it('publishes copy-paste connection details without secrets', () => {
    const details = publicConnectionDetails('https://bookone.clossyan.com', true);
    expect(details).toMatchObject({
      publicUrl: 'https://bookone.clossyan.com',
      issuer: 'https://bookone.clossyan.com',
      jwksUrl: 'https://bookone.clossyan.com/api/agent-bridge/oauth/jwks',
      mcpUrl: 'https://bookone.clossyan.com/api/agent-bridge/mcp',
      signingReady: true,
    });
    expect(details.clients.map((c) => c.clientId)).toEqual(['bookone-codex', 'bookone-claude']);
    const packed = JSON.stringify(details);
    expect(packed).not.toMatch(/BEGIN (?:RSA )?PRIVATE KEY/);
    expect(packed).not.toMatch(/"d":|"p":|"q":|"dp":|"dq":|"qi":/);
    expect(codexSetupCommand(details.mcpUrl)).toContain('--oauth-client-id bookone-codex');
    expect(claudeConnectorSteps(details.mcpUrl).join(' ')).toContain('bookone-claude');
  });

  it('mints a persistent RS256 token, lists tools, and posts one unpaid service invoice', async () => {
    const pem = ensureOauthSigningPem({ AGENT_BRIDGE_OAUTH_SIGNING_PEM_FILE: pemPath });
    expect(pem).toBeTruthy();
    const kid = 'bookone-staging-agentbridge-01';
    const jwks = jwksFromSigningPem(pem!, kid);
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({ kty: 'RSA', use: 'sig', alg: 'RS256', kid });
    expect(JSON.stringify(jwks)).not.toMatch(/BEGIN PRIVATE|PRIVATE KEY/);

    const server = createServer((req, res) => {
      if (req.url === '/api/agent-bridge/oauth/jwks') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(jwks));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('JWKS server did not bind');
      const issuer = `http://127.0.0.1:${address.port}`;
      const token = mintRs256AccessToken({
        privateKeyPem: pem!,
        kid,
        issuer,
        tenantId: 'tenant-connect',
        userId: 'owner-1',
        clientId: 'bookone-codex',
        connectionId: 'conn-connect',
        scopes: consentConnectionScopes(),
      });
      const actor = await resolveActorFromAuthorization(`Bearer ${token}`, 'hmac-unused', {
        AGENT_BRIDGE_OAUTH_ISSUER: issuer,
        AGENT_BRIDGE_OAUTH_JWKS_URL: `${issuer}/api/agent-bridge/oauth/jwks`,
      });
      expect(actor).toMatchObject({
        userId: 'owner-1',
        tenantId: 'tenant-connect',
        clientId: 'bookone-codex',
        connectionId: 'conn-connect',
      });
      expect(actor.capabilities).toEqual(['read', 'upload', 'draft']);
      expect(actor.capabilities).not.toContain('post');

      const store = new MemoryStore();
      await store.setFlags('tenant-connect', { enabled: true, draftOnly: false, postingDisabled: false });
      const posting = recordingPostingPort();
      const service = new AgentBridgeService({
        store,
        extractor: unconfiguredExtractor(),
        posting,
        policyFor: async () => defaultPolicy(),
        publicBaseUrl: 'https://bookone.clossyan.com',
      });
      const agent = { ...actor, capabilities: consentConnectionScopes() };
      const tools = await handleMcpJsonRpc({
        body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        service,
        actor: agent,
      });
      const names = ((tools.result as { tools: { name: string }[] }).tools).map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining([...TOOL_NAMES]));
      const caps = await handleMcpJsonRpc({
        body: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_capabilities', arguments: {} } },
        service,
        actor: agent,
      });
      const capability = (caps.result as { structuredContent: { tools: string[]; defaultConnectionScopes: string[] } })
        .structuredContent;
      expect(capability.tools).toEqual(expect.arrayContaining(['get_capabilities', 'submit_document', 'get_preview']));
      expect(capability.defaultConnectionScopes).toEqual(['read', 'upload', 'draft']);

      const bytes = Buffer.from('fixture:supported-vat-service-bytes').toString('base64');
      const submitted = await handleMcpJsonRpc({
        body: {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'submit_document',
            arguments: { filename: 'inv.pdf', mime: 'application/pdf', contentBase64: bytes },
          },
        },
        service,
        actor: agent,
      });
      const doc = (submitted.result as { structuredContent: { ok: boolean; document: { id: string; contentHash: string } } })
        .structuredContent;
      expect(doc.ok).toBe(true);
      const facts = await service.submitExtractedFacts(agent, {
        documentId: doc.document.id,
        contentHash: doc.document.contentHash,
        expectedRevision: 0,
        supplierName: 'ABC Supplies',
        supplierInvoiceNumber: 'INV-1001',
        issueDate: '2026-03-01',
        currency: 'LKR',
        paidStatus: 'unpaid',
        documentKind: 'service_expense',
        netMinor: 100000,
        taxMinor: 18000,
        grossMinor: 118000,
        expenseAccountCode: '6800',
        categoryLabel: 'Office expenses',
        lineDescription: 'Monthly accounting support',
        origin: 'agent-facts',
      });
      expect(facts.ok).toBe(true);
      if (!facts.ok) throw new Error('facts failed');
      const validated = await service.validateProposal(agent, facts.proposal.id);
      expect(validated.ok).toBe(true);
      const preview = await service.getPreview(agent, facts.proposal.id);
      expect('net' in preview && preview.net.minor).toBe(100000);
      expect('vat' in preview && preview.vat.minor).toBe(oracleVatMinor(100000, true, 18));
      expect('gross' in preview && preview.gross.minor).toBe(118000);
      const denied = await handleMcpJsonRpc({
        body: {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'grant_approval', arguments: { proposalId: facts.proposal.id } },
        },
        service,
        actor: agent,
      });
      expect(
        (denied.result as { structuredContent: { ok: boolean; code?: string } }).structuredContent,
      ).toMatchObject({ ok: false, code: 'HUMAN_APPROVAL_REQUIRED' });
      const approval = await service.grantApproval(human(), facts.proposal.id);
      expect('id' in approval).toBe(true);
      const receipt = await service.commitApprovedProposal(human(), {
        proposalId: facts.proposal.id,
        approvalId: (approval as { id: string }).id,
        idempotencyKey: 'ab-connect-vat-1',
      });
      expect(receipt).toMatchObject({ status: 'posted' });
      expect(posting.posts).toHaveLength(1);
      expect(posting.posts[0]?.facts.net).toEqual(money(100000));
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
