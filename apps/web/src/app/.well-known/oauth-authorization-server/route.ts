import { NextResponse } from 'next/server';
import { authorizationServerMetadata } from '@bookone/agent-bridge';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const configured = process.env.AGENT_BRIDGE_OAUTH_ISSUER?.trim();
  const origin = (process.env.AGENT_BRIDGE_PUBLIC_URL || process.env.AUTH_URL || new URL(req.url).origin).replace(
    /\/$/,
    '',
  );
  const issuer = (configured || origin).replace(/\/$/, '');
  return NextResponse.json(authorizationServerMetadata(issuer), {
    headers: { 'cache-control': 'no-store' },
  });
}
