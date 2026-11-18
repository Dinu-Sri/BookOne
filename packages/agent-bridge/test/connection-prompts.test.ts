import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildClaudeConnectionPrompt,
  buildCodexConnectionPrompt,
  buildConnectionPromptBundle,
  CLAUDE_PUBLIC_CLIENT_ID,
  clientPlainLabel,
  CODEX_PUBLIC_CLIENT_ID,
  companyAccessReadiness,
  connectedClientsReadiness,
  CONNECTION_PROMPT_CLIENTS,
  effectiveFlagsExplanation,
  INITIAL_CONNECTION_SCOPES,
  scopePlainLabel,
  serverConnectionReadiness,
  validatePublicHttpsOrigin,
} from '../src/connection-prompts';
import { publicConnectionDetails } from '../src/oauth';

const LIVE = 'https://bookone.clossyan.com';

function packed(value: unknown) {
  return JSON.stringify(value);
}

describe('AB-08 connection prompt contract', () => {
  it('validates a public HTTPS origin and rejects local or credentialed values', () => {
    expect(validatePublicHttpsOrigin(LIVE)).toEqual({ ok: true, origin: LIVE });
    expect(validatePublicHttpsOrigin(`${LIVE}/`)).toEqual({ ok: true, origin: LIVE });
    expect(validatePublicHttpsOrigin('')).toMatchObject({ ok: false });
    expect(validatePublicHttpsOrigin('http://bookone.clossyan.com')).toMatchObject({ ok: false });
    expect(validatePublicHttpsOrigin('https://localhost')).toMatchObject({ ok: false });
    expect(validatePublicHttpsOrigin('https://127.0.0.1')).toMatchObject({ ok: false });
    expect(validatePublicHttpsOrigin('https://192.168.1.10')).toMatchObject({ ok: false });
    expect(validatePublicHttpsOrigin('https://user:pass@bookone.clossyan.com')).toMatchObject({ ok: false });
  });

  it('builds exactly two prompts from the trusted public origin', () => {
    const bundle = buildConnectionPromptBundle(LIVE, true);
    expect(bundle.prompts).toHaveLength(2);
    expect(CONNECTION_PROMPT_CLIENTS).toEqual(['codex', 'claude']);
    expect(bundle.prompts.map((p) => p.client)).toEqual(['codex', 'claude']);
    expect(bundle.prompts.map((p) => p.clientId)).toEqual([CODEX_PUBLIC_CLIENT_ID, CLAUDE_PUBLIC_CLIENT_ID]);
    expect(bundle.details.mcpUrl).toBe(`${LIVE}/api/agent-bridge/mcp`);
    expect(bundle.details.issuer).toBe(LIVE);
    expect(bundle.prompts[0].scopes).toEqual([...INITIAL_CONNECTION_SCOPES]);
    expect(bundle.prompts[1].scopes).toEqual(['read', 'upload', 'draft']);
  });

  it('Codex prompt uses official CLI flags and does not invent secrets or company ids', () => {
    const details = publicConnectionDetails(LIVE, true);
    const prompt = buildCodexConnectionPrompt(details);
    expect(prompt.title).toBe('Connect with Codex');
    expect(prompt.prompt).toContain(`codex mcp add bookone --url ${details.mcpUrl} --oauth-client-id ${CODEX_PUBLIC_CLIENT_ID}`);
    expect(prompt.prompt).toContain('codex mcp login bookone --scopes read,upload,draft');
    expect(prompt.prompt).toMatch(/official Codex CLI:\ncodex mcp add /);
    expect(prompt.prompt).toMatch(/Then:\ncodex mcp login /);
    expect(prompt.prompt).toContain(details.mcpUrl);
    expect(prompt.prompt).toContain(details.issuer);
    expect(prompt.prompt).toMatch(/public client, no secret/i);
    expect(prompt.prompt).toMatch(/get_capabilities/);
    expect(prompt.prompt).toMatch(/get_policy_context/);
    expect(prompt.prompt).toMatch(/Copying|cannot change this client's settings|If you cannot change/i);
    expect(prompt.prompt).toMatch(/Do not request post/);
    expect(prompt.prompt).not.toMatch(/--scopes[^\n]*post/);
    expect(prompt.prompt).not.toContain('BEGIN PRIVATE');
    expect(prompt.prompt).not.toContain('client_secret');
    expect(prompt.prompt).not.toMatch(/tenant-[0-9a-f-]{8}/i);
    expect(prompt.prompt).not.toMatch(/Bearer [A-Za-z0-9._-]+/);
    expect(prompt.prompt).not.toContain('http://localhost');
    expect(prompt.prompt).not.toContain('example.com');
    expect(prompt.prompt).not.toContain('--callback-port');
    expect(prompt.prompt).not.toContain('code_challenge');
  });

  it('Claude prompt names the custom connector surface and a truthful no-self-config fallback', () => {
    const details = publicConnectionDetails(LIVE, true);
    const prompt = buildClaudeConnectionPrompt(details);
    expect(prompt.title).toBe('Connect with Claude');
    expect(prompt.prompt).toContain('Customize → Connectors');
    expect(prompt.prompt).toContain('Name: BookOne AgentBridge');
    expect(prompt.prompt.match(/Name: BookOne AgentBridge/g)?.length).toBe(1);
    expect(prompt.prompt).toContain(CLAUDE_PUBLIC_CLIENT_ID);
    expect(prompt.prompt).toContain(details.mcpUrl);
    expect(prompt.prompt).toMatch(/cannot add a connector to its own host/i);
    expect(prompt.prompt).toMatch(/Use your own OAuth client/i);
    expect(prompt.prompt).toMatch(/no secret/);
    expect(prompt.prompt).toMatch(/claude mcp add --transport http bookone /);
    expect(prompt.prompt).toMatch(/not live-verified/);
    expect(prompt.prompt).not.toContain('codex mcp add');
    expect(prompt.prompt).not.toContain('--oauth-client-id bookone-codex');
    expect(prompt.prompt).not.toContain('BEGIN PRIVATE');
    expect(prompt.prompt).not.toContain('client_secret=');
  });

  it('refuses to build prompts from a non-public origin', () => {
    expect(() => buildConnectionPromptBundle('http://127.0.0.1:3000', true)).toThrow(/HTTPS|public/i);
    expect(() => buildConnectionPromptBundle('', true)).toThrow(/missing/i);
  });

  it('does not pack private signing material into public details or prompts', () => {
    const bundle = buildConnectionPromptBundle(LIVE, true);
    const text = packed(bundle);
    expect(text).not.toMatch(/BEGIN (?:RSA )?PRIVATE KEY/);
    expect(text).not.toMatch(/"d":|"p":|"q":|"dp":|"dq":|"qi":/);
    expect(text).not.toMatch(/AGENT_BRIDGE_OAUTH_SIGNING_PEM/);
  });
});

describe('AB-08 readiness copy', () => {
  it('never labels the server ready without signing and a public origin', () => {
    const bad = validatePublicHttpsOrigin('http://localhost:3000');
    expect(serverConnectionReadiness({ signingReady: true, originCheck: bad }).level).toBe('unavailable');
    expect(
      serverConnectionReadiness({
        signingReady: false,
        originCheck: { ok: true, origin: LIVE },
      }).level,
    ).toBe('setup_needed');
    const ready = serverConnectionReadiness({
      signingReady: true,
      originCheck: { ok: true, origin: LIVE },
    });
    expect(ready.level).toBe('ready');
    expect(ready.detail).toMatch(/signing readiness only/i);
  });

  it('describes company flags without inventing an enabled inbox', () => {
    expect(companyAccessReadiness({ enabled: false, draftOnly: true, postingDisabled: true }).level).toBe(
      'setup_needed',
    );
    expect(companyAccessReadiness({ enabled: true, draftOnly: true, postingDisabled: true }).level).toBe('ready');
    expect(effectiveFlagsExplanation({ enabled: false, draftOnly: true, postingDisabled: true })).toMatch(/off/i);
    expect(connectedClientsReadiness(0).detail).toMatch(/does not itself connect/i);
    expect(connectedClientsReadiness(2).level).toBe('ready');
    expect(scopePlainLabel('read')).toMatch(/Read/i);
    expect(clientPlainLabel(CODEX_PUBLIC_CLIENT_ID)).toBe('Codex');
  });
});

describe('AB-08 company page source contracts', () => {
  const root = path.resolve(__dirname, '../../..');
  function read(...parts: string[]) {
    return readFileSync(path.join(root, ...parts), 'utf8');
  }

  it('adds Company AgentBridge, migrates settings, and keeps the legacy connections URL', () => {
    const nav = read('apps/web/src/lib/nav-suites.ts');
    const visibility = read('apps/web/src/lib/nav-visibility.ts');
    const workspace = read('apps/web/src/app/actions/workspace.ts');
    const page = read('apps/web/src/app/company/agent-bridge/page.tsx');
    const purchase = read('apps/web/src/app/company/purchase/page.tsx');
    const legacy = read('apps/web/src/app/purchase/inbox/connections/page.tsx');
    const actions = read('apps/web/src/app/actions/agent-bridge.ts');
    const client = read('apps/web/src/components/agent-bridge/company-agent-bridge.tsx');
    const promptsSrc = read('packages/agent-bridge/src/connection-prompts.ts');
    const catalog = read('packages/auth/src/permissions/catalog.ts');
    expect(nav).toMatch(/label: 'AgentBridge'/);
    expect(nav).toMatch(/href: '\/company\/agent-bridge'/);
    expect(visibility).toMatch(/item\.label !== 'Document Inbox'/);
    expect(visibility).not.toMatch(/item\.label !== 'AgentBridge'/);
    expect(workspace).toMatch(/accessByLabel\.AgentBridge/);
    expect(page).toMatch(/CompanyAgentBridge/);
    expect(page).toMatch(/ensureOauthSigningPem/);
    expect(page).toMatch(/buildConnectionPromptBundle/);
    expect(page).not.toMatch(/BEGIN PRIVATE|PRIVATE KEY/);
    expect(purchase).not.toMatch(/name="agentBridgeEnabled"/);
    expect(purchase).toMatch(/\/company\/agent-bridge/);
    expect(legacy).toMatch(/redirect\('\/company\/agent-bridge'\)/);
    expect(legacy).not.toMatch(/if \(!flags.enabled\) redirect/);
    expect(actions).toMatch(/revalidatePath\('\/company\/agent-bridge'\)/);
    expect(actions).toMatch(/company\.purchase_settings\.write/);
    expect(actions).toMatch(/purchase\.inbox\.write/);
    expect(client).not.toMatch(/from ['"]@bookone\/agent-bridge['"]/);
    expect(client).toMatch(/Copy connection prompt/);
    expect(client).toMatch(/\{card\.title\}/);
    expect(client).toMatch(/Save AgentBridge settings/);
    expect(promptsSrc).toMatch(/title: 'Connect with Codex'/);
    expect(promptsSrc).toMatch(/title: 'Connect with Claude'/);
    expect(client).toMatch(/Revoke access/);
    expect(catalog).toMatch(/'\/company\/agent-bridge': 'company\.purchase_settings'/);
  });

  it('keeps the AB-07 discovery and authorize alias so login does not 404', () => {
    const middleware = read('apps/web/src/middleware.ts');
    const authorizeAlias = read('apps/web/src/app/authorize/route.ts');
    const oauth = read('packages/agent-bridge/src/oauth.ts');
    expect(middleware).toMatch(/pathname === '\/authorize'/);
    expect(middleware).toMatch(/\/api\/agent-bridge\//);
    expect(authorizeAlias).toMatch(/api\/agent-bridge\/oauth\/authorize/);
    expect(oauth).toMatch(/isLoopbackCallbackPath/);
    expect(oauth).toMatch(/authorization_response_iss_parameter_supported: true/);
  });
});
