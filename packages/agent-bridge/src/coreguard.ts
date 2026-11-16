/** Scoped AgentBridge CoreGuard registry (not all-module CG-01). */

export const COREGUARD_MODULE = 'agent-bridge';
export const COREGUARD_VERSION = 'ab-01.1';

export const COREGUARD_SUITES = [
  {
    id: 'unit-schema-state',
    layer: 'unit',
    command: 'pnpm --filter @bookone/agent-bridge test',
    required: true,
  },
  {
    id: 'service-oracles',
    layer: 'application-service',
    command: 'pnpm --filter @bookone/agent-bridge exec vitest run test/service.test.ts test/oracles.test.ts',
    required: true,
  },
  {
    id: 'api-mcp-auth',
    layer: 'api-mcp',
    command: 'pnpm --filter @bookone/agent-bridge exec vitest run test/mcp.test.ts test/authz.test.ts',
    required: true,
  },
  {
    id: 'jobs',
    layer: 'durable-jobs',
    command: 'pnpm --filter @bookone/agent-bridge exec vitest run test/jobs.test.ts',
    required: true,
  },
  {
    id: 'security',
    layer: 'security',
    command: 'pnpm --filter @bookone/agent-bridge exec vitest run test/security.test.ts',
    required: true,
  },
  {
    id: 'browser',
    layer: 'browser',
    command: 'pnpm --dir apps/web exec playwright test e2e/agent-bridge-01.spec.ts e2e/ui-nav-01.spec.ts',
    required: true,
  },
  {
    id: 'permissions-catalog',
    layer: 'auth',
    command: 'pnpm --filter @bookone/auth exec vitest run test/agent-bridge-permissions.test.ts test/release-gate-workflow.test.ts test/ui-nav-01.test.ts',
    required: true,
  },
  {
    id: 'independent-acceptance',
    layer: 'acceptance',
    command: 'pnpm --filter @bookone/agent-bridge exec vitest run test/ab02-acceptance.test.ts',
    required: true,
  },
  {
    id: 'live-ocr-provider',
    layer: 'provider',
    command: 'BLOCKED until AGENT_BRIDGE_OCR_ENDPOINT and AGENT_BRIDGE_OCR_KEY are authorized for remote smoke',
    required: false,
    blocked: true,
  },
  {
    id: 'production-idp',
    layer: 'identity',
    command: 'BLOCKED until a production OAuth/OIDC client is registered',
    required: false,
    blocked: true,
  },
  {
    id: 'external-mcp-client',
    layer: 'client',
    command: 'BLOCKED until an external MCP client credential exists',
    required: false,
    blocked: true,
  },
  {
    id: 'github-branch-protection',
    layer: 'repository',
    command: 'BLOCKED until the owner applies docs/AGENT_BRIDGE_BRANCH_PROTECTION.md in GitHub settings',
    required: false,
    blocked: true,
  },
] as const;

export function requiredCoreGuardSuites() {
  return COREGUARD_SUITES.filter((s) => s.required);
}

export function blockedCoreGuardSuites() {
  return COREGUARD_SUITES.filter((s) => 'blocked' in s && s.blocked);
}

export function coreGuardReport() {
  return {
    module: COREGUARD_MODULE,
    version: COREGUARD_VERSION,
    required: requiredCoreGuardSuites().map((s) => s.id),
    blocked: blockedCoreGuardSuites().map((s) => s.id),
    note: 'Scoped AgentBridge foundation. Existing quality job stays the publication ancestor. This registry does not certify all ERP modules.',
  };
}
