import { DEFAULT_CONNECTION_SCOPES, type Capability } from './contracts';
import {
  claudeConnectorSteps,
  codexSetupCommand,
  findPublicClient,
  publicConnectionDetails,
  type PublicConnectionDetails,
} from './oauth';

export const CONNECTION_PROMPT_CLIENTS = ['codex', 'claude'] as const;
export type ConnectionPromptClient = (typeof CONNECTION_PROMPT_CLIENTS)[number];

export const CODEX_PUBLIC_CLIENT_ID = 'bookone-codex';
export const CLAUDE_PUBLIC_CLIENT_ID = 'bookone-claude';
export const INITIAL_CONNECTION_SCOPES: readonly Capability[] = [...DEFAULT_CONNECTION_SCOPES];

export type PublicOriginCheck =
  | { ok: true; origin: string }
  | { ok: false; reason: string };

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|::1|0\.0\.0\.0)$/i;
const PRIVATE_IPV4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/;

/** Trusted public HTTPS origin for copyable prompts. Do not trust an arbitrary Host header. */
export function validatePublicHttpsOrigin(origin: string): PublicOriginCheck {
  const raw = String(origin ?? '').trim().replace(/\/$/, '');
  if (!raw) {
    return {
      ok: false,
      reason:
        'Public origin is missing. Set AGENT_BRIDGE_PUBLIC_URL or AUTH_URL to this host HTTPS origin.',
    };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      ok: false,
      reason: 'Public origin is not a valid URL. Set AGENT_BRIDGE_PUBLIC_URL to this host HTTPS origin.',
    };
  }
  if (url.protocol !== 'https:') {
    return {
      ok: false,
      reason: 'Public origin must be HTTPS. Set AGENT_BRIDGE_PUBLIC_URL to this host HTTPS origin.',
    };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'Public origin must not include credentials.' };
  }
  const host = url.hostname;
  if (LOOPBACK_HOST.test(host) || PRIVATE_IPV4.test(host) || host.endsWith('.local')) {
    return {
      ok: false,
      reason: 'Public origin must be a public hostname, not a local or private address.',
    };
  }
  return { ok: true, origin: `${url.protocol}//${url.host}` };
}

export type ConnectionPromptContract = {
  client: ConnectionPromptClient;
  clientId: string;
  title: string;
  surface: string;
  mcpUrl: string;
  issuer: string;
  scopes: readonly Capability[];
  prompt: string;
};

export type ConnectionPromptBundle = {
  origin: string;
  details: PublicConnectionDetails;
  prompts: [ConnectionPromptContract, ConnectionPromptContract];
};

function sharedSafetySteps(args: {
  mcpUrl: string;
  issuer: string;
  clientId: string;
  scopes: string;
  fallback: string;
}): string[] {
  return [
    `This is BookOne AgentBridge. Canonical MCP URL: ${args.mcpUrl}. Issuer: ${args.issuer}. Public client ID: ${args.clientId} (public client, no secret). Initial scopes: ${args.scopes}. Do not request post, administration, broad account access, or approve-all.`,
    'Inspect your supported MCP setup route. If a matching BookOne entry already uses this MCP URL and client ID, reuse it. Warn before replacing a different endpoint. Do not add a duplicate, rewrite config destructively, or print credential files.',
    'Use official client capabilities. You cannot override the client security policy. Stop before any permission-expanding action that needs a human. Show the exact requested access (read, upload, draft) and guide the user through normal BookOne sign-in and Allow.',
    'After authentication, initialize MCP, list tools, and call the advertised get_capabilities and get_policy_context tools. Verify the selected company and effective access from the authenticated server response. Never say connected because configuration was saved or signing is ready.',
    'Make no invoice, supplier, account, stock, settings, grant, or financial changes during setup. Do not upload a document or call a write tool merely to test connectivity. Invoice attachments in this chat are not stored in BookOne; a supported byte upload or upload-session handoff is needed later.',
    'Read BookOne policies and supported workflow limits before later work. Ask for missing or ambiguous accounting facts instead of inventing mappings.',
    `If you cannot change this client's settings yourself: give the user these exact public values and wait. ${args.fallback} Do not loop or invent a successful installation.`,
  ];
}

export function buildCodexConnectionPrompt(details: PublicConnectionDetails): ConnectionPromptContract {
  const client = findPublicClient(CODEX_PUBLIC_CLIENT_ID);
  if (!client) throw new Error('Codex public client is not registered.');
  const scopes = details.scopes.length ? details.scopes : [...INITIAL_CONNECTION_SCOPES];
  const scopeList = scopes.join(', ');
  const add = codexSetupCommand(details.mcpUrl);
  const login = `codex mcp login bookone --scopes ${scopes.join(',')}`;
  const fallback = `MCP URL ${details.mcpUrl}; client ID ${CODEX_PUBLIC_CLIENT_ID}; no secret; scopes ${scopeList}. Then run: ${add} and ${login}.`;
  const steps = sharedSafetySteps({
    mcpUrl: details.mcpUrl,
    issuer: details.issuer,
    clientId: CODEX_PUBLIC_CLIENT_ID,
    scopes: scopeList,
    fallback,
  });
  const prompt = [
    'Connect this BookOne company to Codex (desktop, CLI, or IDE that shares the official Codex MCP config).',
    '',
    steps[0],
    '',
    'Do this:',
    `1. ${steps[1]} Treat a saved entry, pending login, successful OAuth, and usable MCP tools as separate states.`,
    `2. If no matching entry exists, use the official Codex CLI: ${add} Then: ${login} Do not include ephemeral authorization links, state, PKCE values, or callback ports.`,
    `3. ${steps[2]}`,
    `4. ${steps[3]}`,
    `5. ${steps[4]}`,
    `6. ${steps[5]}`,
    `7. ${steps[6]}`,
  ].join('\n');
  return {
    client: 'codex',
    clientId: CODEX_PUBLIC_CLIENT_ID,
    title: 'Connect with Codex',
    surface: 'Codex desktop, CLI, and IDE (shared official MCP config)',
    mcpUrl: details.mcpUrl,
    issuer: details.issuer,
    scopes,
    prompt,
  };
}

export function buildClaudeConnectionPrompt(details: PublicConnectionDetails): ConnectionPromptContract {
  const client = findPublicClient(CLAUDE_PUBLIC_CLIENT_ID);
  if (!client) throw new Error('Claude public client is not registered.');
  const scopes = details.scopes.length ? details.scopes : [...INITIAL_CONNECTION_SCOPES];
  const scopeList = scopes.join(', ');
  const connector = claudeConnectorSteps(details.mcpUrl);
  const fallback = `MCP URL ${details.mcpUrl}; client ID ${CLAUDE_PUBLIC_CLIENT_ID}; no secret; authentication Sign in when needed; OAuth client “Use your own OAuth client”.`;
  const steps = sharedSafetySteps({
    mcpUrl: details.mcpUrl,
    issuer: details.issuer,
    clientId: CLAUDE_PUBLIC_CLIENT_ID,
    scopes: scopeList,
    fallback,
  });
  const prompt = [
    'Connect this BookOne company to Claude (claude.ai or Claude desktop custom connector).',
    '',
    steps[0],
    '',
    'A Claude conversation cannot add a connector to its own host. Direct the user to connector settings instead of claiming automatic setup.',
    '',
    'Do this:',
    `1. ${steps[1]}`,
    `2. Ask the user to open Customize → Connectors → Add custom connector → Web. Name: BookOne AgentBridge. ${connector.slice(1).join(' ')}`,
    `3. ${steps[2]}`,
    `4. ${steps[3]}`,
    `5. ${steps[4]}`,
    `6. ${steps[5]}`,
    `7. ${steps[6]}`,
    '',
    'If the user is in Claude Code (separate surface, not live-verified here): they may run `claude mcp add --transport http bookone ' +
      details.mcpUrl +
      '` from a terminal, then `/mcp` in the session to sign in. Use client ID bookone-claude and no secret. Do not use Codex CLI flags.',
  ].join('\n');
  return {
    client: 'claude',
    clientId: CLAUDE_PUBLIC_CLIENT_ID,
    title: 'Connect with Claude',
    surface: 'Claude web and desktop custom connector',
    mcpUrl: details.mcpUrl,
    issuer: details.issuer,
    scopes,
    prompt,
  };
}

export function buildConnectionPromptBundle(
  origin: string,
  signingReady: boolean,
): ConnectionPromptBundle {
  const check = validatePublicHttpsOrigin(origin);
  if (!check.ok) {
    throw new Error(check.reason);
  }
  const details = publicConnectionDetails(check.origin, signingReady);
  const prompts: [ConnectionPromptContract, ConnectionPromptContract] = [
    buildCodexConnectionPrompt(details),
    buildClaudeConnectionPrompt(details),
  ];
  return { origin: check.origin, details, prompts };
}

export type ReadinessLevel = 'ready' | 'setup_needed' | 'unavailable';

export type ReadinessItem = {
  id: 'server' | 'company' | 'clients';
  label: string;
  level: ReadinessLevel;
  detail: string;
};

export type CompanyAgentBridgeFlags = {
  enabled: boolean;
  draftOnly: boolean;
  postingDisabled: boolean;
};

export function serverConnectionReadiness(args: {
  signingReady: boolean;
  originCheck: PublicOriginCheck;
}): ReadinessItem {
  const label = 'Server connection readiness';
  if (!args.originCheck.ok) {
    return { id: 'server', label, level: 'unavailable', detail: args.originCheck.reason };
  }
  if (!args.signingReady) {
    return {
      id: 'server',
      label,
      level: 'setup_needed',
      detail:
        'Signing is not ready. Wait for the usual Portainer image update, then refresh this page. Public keys available is signing readiness only — a client is connected only after it authenticates.',
    };
  }
  return {
    id: 'server',
    label,
    level: 'ready',
    detail:
      'Signing is ready and the public HTTPS origin is set. Public keys available is signing readiness only. A client is connected only after it authenticates and you Allow it in BookOne.',
  };
}

export function companyAccessReadiness(flags: CompanyAgentBridgeFlags): ReadinessItem {
  const label = "This company's access";
  if (!flags.enabled) {
    return {
      id: 'company',
      label,
      level: 'setup_needed',
      detail:
        'Document Inbox is off. Turn it on below before a client can finish consent. Leave draft-only and posting-stop on until independent QA authorizes posting.',
    };
  }
  const extras: string[] = [];
  if (flags.draftOnly) extras.push('draft-only is on');
  if (flags.postingDisabled) extras.push('AgentBridge posting is stopped');
  return {
    id: 'company',
    label,
    level: 'ready',
    detail: extras.length
      ? `Document Inbox is on. ${extras.join('; ')}.`
      : 'Document Inbox is on. Draft-only and posting-stop are off. Posting still needs a human approval in BookOne.',
  };
}

export function connectedClientsReadiness(activeCount: number): ReadinessItem {
  const label = 'Connected clients';
  if (activeCount <= 0) {
    return {
      id: 'clients',
      label,
      level: 'setup_needed',
      detail:
        'No authenticated clients yet. Copy a connection prompt below. Copying a prompt does not itself connect anything.',
    };
  }
  return {
    id: 'clients',
    label,
    level: 'ready',
    detail: `${activeCount} authenticated client${activeCount === 1 ? '' : 's'}.`,
  };
}

export function effectiveFlagsExplanation(flags: CompanyAgentBridgeFlags): string {
  if (!flags.enabled) {
    return 'Document Inbox is off, so agents cannot finish consent or upload. Draft-only and posting-stop still apply if you turn Inbox on.';
  }
  if (flags.postingDisabled) {
    return flags.draftOnly
      ? 'Inbox is on. Agents may prepare drafts only. Server-side posting is stopped even after a human approval until you change that.'
      : 'Inbox is on. Server-side posting is stopped even after a human approval until you change that.';
  }
  if (flags.draftOnly) {
    return 'Inbox is on. Agents may prepare drafts. Posting still needs an explicit grant and a human approval in BookOne.';
  }
  return 'Inbox is on. Draft-only and posting-stop are off. Agents still cannot mint approvals. Posting needs an explicit grant and a human approval in BookOne.';
}

export function scopePlainLabel(scope: string): string {
  switch (scope) {
    case 'read':
      return 'Read documents and policy';
    case 'upload':
      return 'Upload original files';
    case 'draft':
      return 'Prepare draft bills';
    case 'post':
      return 'Post approved bills';
    case 'approve':
      return 'Approve proposals';
    default:
      return scope;
  }
}

export function clientPlainLabel(clientId: string): string {
  if (clientId === CODEX_PUBLIC_CLIENT_ID) return 'Codex';
  if (clientId === CLAUDE_PUBLIC_CLIENT_ID) return 'Claude';
  return clientId;
}
