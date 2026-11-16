import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Actor, Capability } from './contracts';

export const TOKEN_AUDIENCE = 'bookone.agent-bridge';
export const LOCAL_TOKEN_KIND = 'ab1';

export type ConnectionToken = {
  tenantId: string;
  userId: string;
  clientId: string;
  connectionId: string;
  scopes: Capability[];
  exp: number;
};

export function parseScopes(keys: string[]): Capability[] {
  const out = new Set<Capability>();
  for (const k of keys) {
    if (k === 'purchase.inbox.read' || k === 'agent_bridge.read') out.add('read');
    if (k === 'purchase.inbox.write' || k === 'agent_bridge.upload') {
      out.add('read');
      out.add('upload');
      out.add('draft');
    }
    if (k === 'agent_bridge.approve') out.add('approve');
    if (k === 'agent_bridge.post' || k === 'purchase.bills.write') out.add('post');
  }
  return [...out];
}

export function assertCapability(actor: Actor, need: Capability): void {
  if (!actor.capabilities.includes(need)) {
    const err = new Error(`Missing capability ${need}.`);
    (err as Error & { code: string }).code = 'PERMISSION_DENIED';
    throw err;
  }
}

export function signConnectionToken(payload: ConnectionToken, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${LOCAL_TOKEN_KIND}.${body}.${sig}`;
}

export function verifyConnectionToken(token: string, secret: string, now = Date.now()): ConnectionToken {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== LOCAL_TOKEN_KIND) {
    throw new Error('Unknown or malformed AgentBridge token.');
  }
  const [, body, sig] = parts;
  const expected = createHmac('sha256', secret).update(body!).digest('base64url');
  const a = Buffer.from(sig ?? '', 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Invalid AgentBridge token signature.');
  const payload = JSON.parse(Buffer.from(body!, 'base64url').toString('utf8')) as ConnectionToken;
  if (payload.exp <= now) throw new Error('AgentBridge token expired.');
  return payload;
}

export function actorFromToken(payload: ConnectionToken): Actor {
  return {
    userId: payload.userId,
    tenantId: payload.tenantId,
    capabilities: payload.scopes,
    connectionId: payload.connectionId,
    clientId: payload.clientId,
  };
}

export function mintLocalFixtureToken(args: {
  tenantId: string;
  userId: string;
  scopes: Capability[];
  secret: string;
  hours?: number;
}): string {
  return signConnectionToken(
    {
      tenantId: args.tenantId,
      userId: args.userId,
      clientId: 'local-fixture',
      connectionId: randomBytes(8).toString('hex'),
      scopes: args.scopes,
      exp: Date.now() + (args.hours ?? 8) * 3600_000,
    },
    args.secret,
  );
}
