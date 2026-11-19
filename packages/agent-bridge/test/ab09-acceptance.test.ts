import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COREGUARD_VERSION } from '../src/coreguard';

const root = path.resolve(__dirname, '../../..');
function read(...parts: string[]) {
  return readFileSync(path.join(root, ...parts), 'utf8');
}

describe('AB-09 source contracts', () => {
  it('bumps CoreGuard to ab-09 and keeps protocol schema ab-06.1', () => {
    expect(COREGUARD_VERSION).toBe('ab-09');
    expect(read('packages/agent-bridge/src/contracts.ts')).toMatch(/SCHEMA_VERSION = 'ab-06.1'/);
    expect(read('packages/db/migrations/047_agent_bridge_oauth_lifecycle.sql')).toMatch(/token_issued_at/);
    expect(read('packages/db/migrations/048_agent_bridge_oauth_redeem_diag.sql')).toMatch(/last_oauth_reason/);
  });

  it('redeems codes atomically with binding checks before consume', () => {
    const token = read('apps/web/src/app/api/agent-bridge/oauth/token/route.ts');
    const runtime = read('apps/web/src/lib/agent-bridge-runtime.ts');
    expect(token).toMatch(/mintIsReady\(\)/);
    expect(token).toMatch(/redeemOauthCode/);
    expect(token).not.toMatch(/takeOauthCode/);
    expect(token).toMatch(/if \(!code \|\| !verifier \|\| !clientId \|\| !redirectUri\)/);
    expect(runtime).toMatch(/decideOauthCodeRedemption/);
    expect(runtime).toMatch(/\.for\('update'\)/);
    expect(runtime).toMatch(/isNull\(agentBridgeOauthCodes\.usedAt\)/);
    expect(runtime).toMatch(/markAgentBridgeTokenIssued/);
    expect(runtime).toMatch(/pendingGrantForReuse/);
    expect(runtime).toMatch(/resolveOauthRedemptionTenant/);
    expect(runtime).not.toMatch(/tenantHint\?\.trim\(\) \|\| tenantIdFromBoundToken/);
    expect(runtime).toMatch(/recordOauthRedeemDiagnostic/);
    expect(runtime).toMatch(/pinTenantGuc/);
    expect(token).toMatch(/X-BookOne-OAuth-Request-Id/);
    expect(token).toMatch(/newOauthRequestId/);
  });

  it('consent Allow records a grant, Cancel denies without a connection, untrusted redirect stays local', () => {
    const authorize = read('apps/web/src/app/api/agent-bridge/oauth/authorize/route.ts');
    expect(authorize).toMatch(/renderConsentPage/);
    expect(authorize).toMatch(/safeOAuthDenialUrl/);
    expect(authorize).toMatch(/decision === 'deny'/);
    expect(authorize).toMatch(/untrusted_redirect/);
    expect(authorize).toMatch(/recordAgentBridgeConnection/);
    expect(authorize).toMatch(/recordOauthRedeemDiagnostic/);
    expect(authorize).toMatch(/newOauthRequestId/);
    expect(authorize).toMatch(/authorizationCallbackUrl/);
    expect(authorize).toMatch(/\/login\?from=\$\{next\}/);
    expect(authorize).not.toMatch(/status: c\.revokedAt \? 'Revoked' : 'Active'/);
  });

  it('company AgentBridge labels lifecycle instead of treating consent as authenticated', () => {
    const page = read('apps/web/src/app/company/agent-bridge/page.tsx');
    expect(page).toMatch(/connectionLifecycle/);
    expect(page).toMatch(/summarizeConnectionLifecycle/);
    expect(page).toMatch(/formatStoredOauthDiagnostic/);
    expect(page).not.toMatch(/status: c\.revokedAt \? 'Revoked' : 'Active'/);
    expect(page).not.toMatch(/connections\.filter\(\(c\) => !c\.revokedAt\)\.length/);
  });

  it('keeps public client ids and exact redirect equality', () => {
    const oauth = read('packages/agent-bridge/src/oauth.ts');
    const redeem = read('packages/agent-bridge/src/oauth-redeem.ts');
    expect(oauth).toMatch(/bookone-codex/);
    expect(oauth).toMatch(/bookone-claude/);
    expect(redeem).toMatch(/stored === presented/);
    expect(redeem).toMatch(/127\.0\.0\.1 and localhost are different hosts/);
  });
});
