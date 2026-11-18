import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { requireTenantContext } from '@bookone/auth';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { jobCanWrite } from '@/lib/access';
import { loadAgentBridgeFlags, listAgentBridgeConnections } from '@/lib/agent-bridge-runtime';
import { CompanyAgentBridge } from '@/components/agent-bridge/company-agent-bridge';
import {
  buildConnectionPromptBundle,
  CLAUDE_PUBLIC_CLIENT_ID,
  clientPlainLabel,
  CODEX_PUBLIC_CLIENT_ID,
  companyAccessReadiness,
  connectedClientsReadiness,
  effectiveFlagsExplanation,
  ensureOauthSigningPem,
  publicOrigin,
  scopePlainLabel,
  serverConnectionReadiness,
  validatePublicHttpsOrigin,
} from '@bookone/agent-bridge';

function formatStamp(iso: string | undefined) {
  if (!iso) return '—';
  return iso.slice(0, 16).replace('T', ' ');
}

export default async function CompanyAgentBridgePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; err?: string }>;
}) {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login?from=/company/agent-bridge');
  }
  const query = await searchParams;
  const settingsLevel = tenant.accessByLabel?.AgentBridge ?? tenant.accessByLabel?.['Purchase Settings'] ?? 'none';
  const inboxLevel = tenant.accessByLabel?.['Document Inbox'] ?? 'none';
  if (settingsLevel === 'none' && inboxLevel === 'none') {
    redirect(tenant.landingHref ?? '/?denied=1');
  }

  const user = await requireTenantContext();
  const flags = await loadAgentBridgeFlags(tenant.id);
  const canWriteSettings = settingsLevel === 'write';
  const canRevoke = jobCanWrite(tenant, 'Document Inbox');
  const listAll = settingsLevel !== 'none';
  const connections = await listAgentBridgeConnections(tenant.id, listAll ? undefined : user.id);
  const signingReady = Boolean(ensureOauthSigningPem(process.env));
  const origin = publicOrigin(process.env);
  const originCheck = validatePublicHttpsOrigin(origin);
  const checkedAt = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const activeCount = connections.filter((c) => !c.revokedAt).length;
  const readiness = [
    serverConnectionReadiness({ signingReady, originCheck }),
    companyAccessReadiness(flags),
    connectedClientsReadiness(activeCount),
  ];

  let prompts: Array<{
    client: 'codex' | 'claude';
    clientId: string;
    title: string;
    surface: string;
    prompt: string;
  }> = [];
  let promptError: string | null = null;
  let technical = {
    publicUrl: originCheck.ok ? originCheck.origin : origin || '—',
    issuer: originCheck.ok ? originCheck.origin : '—',
    mcpUrl: originCheck.ok ? `${originCheck.origin}/api/agent-bridge/mcp` : '—',
    jwksUrl: originCheck.ok ? `${originCheck.origin}/api/agent-bridge/oauth/jwks` : '—',
    authorizationUrl: originCheck.ok ? `${originCheck.origin}/api/agent-bridge/oauth/authorize` : '—',
    codexClientId: CODEX_PUBLIC_CLIENT_ID,
    claudeClientId: CLAUDE_PUBLIC_CLIENT_ID,
  };
  try {
    const bundle = buildConnectionPromptBundle(origin, signingReady);
    prompts = bundle.prompts.map((p) => ({
      client: p.client,
      clientId: p.clientId,
      title: p.title,
      surface: p.surface,
      prompt: p.prompt,
    }));
    technical = {
      publicUrl: bundle.details.publicUrl,
      issuer: bundle.details.issuer,
      mcpUrl: bundle.details.mcpUrl,
      jwksUrl: bundle.details.jwksUrl,
      authorizationUrl: bundle.details.authorizationUrl,
      codexClientId: CODEX_PUBLIC_CLIENT_ID,
      claudeClientId: CLAUDE_PUBLIC_CLIENT_ID,
    };
  } catch (err) {
    promptError = err instanceof Error ? err.message : 'Public connection details are not available.';
  }

  return (
    <BookOneShell active="AgentBridge" tenant={tenant}>
      <CompanyAgentBridge
        companyName={tenant.name}
        checkedAt={checkedAt}
        canWriteSettings={canWriteSettings}
        flags={flags}
        effectiveExplanation={effectiveFlagsExplanation(flags)}
        saved={query.saved === '1'}
        saveError={query.err ? decodeURIComponent(query.err) : null}
        promptError={promptError}
        readiness={readiness}
        prompts={prompts}
        connections={connections.map((c) => ({
          id: c.id,
          label: c.label || clientPlainLabel(c.clientId),
          companyName: tenant.name,
          scopes: c.scopes.map(scopePlainLabel).join('; '),
          status: c.revokedAt ? 'Revoked' : 'Active',
          lastUsed: formatStamp(c.lastUsedAt),
          created: formatStamp(c.createdAt),
          canRevoke: canRevoke && !c.revokedAt,
        }))}
        technical={technical}
      />
    </BookOneShell>
  );
}
