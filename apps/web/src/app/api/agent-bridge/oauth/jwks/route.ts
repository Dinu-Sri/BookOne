import { NextResponse } from 'next/server';
import { jwksFromSigningPem, oauthKid, oauthSigningPem, OAUTH_SETUP_CHECKLIST } from '@bookone/agent-bridge';

export const runtime = 'nodejs';

export async function GET() {
  const raw = process.env.AGENT_BRIDGE_OAUTH_JWKS_JSON?.trim();
  if (raw) {
    try {
      return NextResponse.json(JSON.parse(raw));
    } catch {
      return NextResponse.json({ keys: [], error: 'AGENT_BRIDGE_OAUTH_JWKS_JSON is not valid JSON.' }, { status: 500 });
    }
  }
  const pem = oauthSigningPem(process.env);
  if (pem) {
    try {
      return NextResponse.json(jwksFromSigningPem(pem, oauthKid(process.env)));
    } catch (error) {
      return NextResponse.json(
        { keys: [], error: error instanceof Error ? error.message : 'OAuth signing key is invalid.' },
        { status: 500 },
      );
    }
  }
  return NextResponse.json(
    {
      keys: [],
      error: OAUTH_SETUP_CHECKLIST,
    },
    { status: 200 },
  );
}
