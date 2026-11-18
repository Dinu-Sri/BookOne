import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CATALOG_VERSION, PERMISSION_KEYS, SCREEN_DEFS, screenKeyFromHref } from '../src/permissions/catalog';
import { JOB_TEMPLATES, templateByKey } from '../src/permissions/templates';

describe('AgentBridge permission catalog v2', () => {
  it('bumps the catalog and registers inbox plus approve/post keys', () => {
    expect(CATALOG_VERSION).toBe(2);
    expect(PERMISSION_KEYS).toContain('purchase.inbox.read');
    expect(PERMISSION_KEYS).toContain('purchase.inbox.write');
    expect(PERMISSION_KEYS).toContain('agent_bridge.approve');
    expect(PERMISSION_KEYS).toContain('agent_bridge.post');
    expect(SCREEN_DEFS.some((s) => s.href === '/purchase/inbox' && s.label === 'Document Inbox')).toBe(true);
    expect(screenKeyFromHref('/company/agent-bridge')).toBe('company.purchase_settings');
    expect(screenKeyFromHref('/purchase/inbox/connections')).toBe('company.purchase_settings');
  });

  it('grants purchasing write, accountant approve/post, viewer read-only inbox', () => {
    const purchasing = templateByKey('purchasing')!;
    const accountant = templateByKey('accountant')!;
    const viewer = templateByKey('viewer')!;
    const owner = templateByKey('owner')!;
    expect(purchasing.grants).toContain('purchase.inbox.write');
    expect(purchasing.grants).toContain('agent_bridge.approve');
    expect(purchasing.grants).toContain('agent_bridge.post');
    expect(accountant.grants).toContain('purchase.inbox.read');
    expect(accountant.grants).toContain('agent_bridge.approve');
    expect(accountant.grants).toContain('agent_bridge.post');
    expect(viewer.grants).toContain('purchase.inbox.read');
    expect(viewer.grants).not.toContain('purchase.inbox.write');
    expect(viewer.grants).not.toContain('agent_bridge.post');
    expect(owner.grants).toEqual([...PERMISSION_KEYS]);
    expect(JOB_TEMPLATES.length).toBeGreaterThan(5);
  });

  it('public bill create still session-authorizes; AgentBridge posting opts in after service checks', () => {
    const commercial = readFileSync(path.resolve(__dirname, '../../../apps/web/src/app/actions/commercial-docs.ts'), 'utf8');
    const runtime = readFileSync(path.resolve(__dirname, '../../../apps/web/src/lib/agent-bridge-runtime.ts'), 'utf8');
    expect(commercial).toMatch(/export async function createCommercialDocument\(/);
    expect(commercial).toMatch(/return createCommercialDocumentWithUser\(user, input\);/);
    expect(commercial).toMatch(/alreadyAuthorized/);
    expect(runtime).toMatch(/alreadyAuthorized: true/);
    expect(runtime).toMatch(/createCommercialDocumentWithUser/);
  });

  it('044 enables RLS and docker-web keeps quality plus CoreGuard', () => {
    const sql = readFileSync(path.resolve(__dirname, '../../../packages/db/migrations/044_agent_bridge.sql'), 'utf8');
    const claim = readFileSync(path.resolve(__dirname, '../../../packages/db/migrations/045_agent_bridge_claim.sql'), 'utf8');
    expect(claim).toMatch(/agent_bridge_operations_active_proposal_uq/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/agent_bridge_documents_isolation/);
    const yaml = readFileSync(path.resolve(__dirname, '../../../.github/workflows/docker-web.yml'), 'utf8');
    expect(yaml).toMatch(/needs: \[quality, coreguard\]/);
    expect(yaml).toMatch(/pnpm lint/);
  });
});
