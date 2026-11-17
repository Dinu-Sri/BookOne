import { NextResponse } from 'next/server';
import { protectedResourceMetadata } from '@bookone/agent-bridge';

export const runtime = 'nodejs';

function originFrom(req: Request): string {
  const env = process.env.AGENT_BRIDGE_PUBLIC_URL || process.env.AUTH_URL;
  if (env) return env.replace(/\/$/, '');
  return new URL(req.url).origin;
}

export async function GET(req: Request) {
  const origin = originFrom(req);
  const issuer = (process.env.AGENT_BRIDGE_OAUTH_ISSUER || origin).replace(/\/$/, '');
  return NextResponse.json(protectedResourceMetadata(origin, [issuer]), {
    headers: { 'cache-control': 'no-store' },
  });
}
