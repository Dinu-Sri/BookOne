import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** JWKS for a BookOne-hosted authorization server. Empty until AGENT_BRIDGE_OAUTH_JWKS_JSON is set. */
export async function GET() {
  const raw = process.env.AGENT_BRIDGE_OAUTH_JWKS_JSON?.trim();
  if (!raw) {
    return NextResponse.json(
      {
        keys: [],
        error:
          'No BookOne JWKS is configured. Point MCP clients at AGENT_BRIDGE_OAUTH_ISSUER/.well-known/jwks.json or set AGENT_BRIDGE_OAUTH_JWKS_JSON.',
      },
      { status: 200 },
    );
  }
  try {
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ keys: [], error: 'AGENT_BRIDGE_OAUTH_JWKS_JSON is not valid JSON.' }, { status: 500 });
  }
}
