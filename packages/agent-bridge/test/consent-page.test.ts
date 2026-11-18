import { describe, expect, it } from 'vitest';
import {
  CONSENT_PERMISSION_ROWS,
  consentPageTitle,
  consentRestrictionCopy,
  renderConsentPage,
  safeOAuthDenialUrl,
} from '../src/consent-page';
import { findPublicClient, redirectUriAllowed } from '../src/oauth';

const fields = {
  client_id: 'bookone-codex',
  redirect_uri: 'http://127.0.0.1:9/callback/abc',
  state: 's1',
  code_challenge: 'x'.repeat(43),
  code_challenge_method: 'S256',
  resource: 'https://bookone.clossyan.com/api/agent-bridge/mcp',
  scope: 'read upload draft',
};

describe('AB-09 consent pages', () => {
  it('renders a branded Codex consent page with company, account, Allow and Cancel', () => {
    const html = renderConsentPage({
      kind: 'consent',
      clientName: 'Codex',
      companyName: 'Clossyan Demo',
      accountName: 'Owner',
      accountEmail: 'owner@example.com',
      flags: { enabled: true, draftOnly: false, postingDisabled: true },
      fields,
    });
    expect(consentPageTitle({ kind: 'consent', clientName: 'Codex' })).toBe('Connect Codex to BookOne');
    expect(html).toMatch(/Connect Codex to BookOne/);
    expect(html).toMatch(/Clossyan Demo/);
    expect(html).toMatch(/owner@example.com/);
    expect(html).toMatch(/Allow connection/);
    expect(html).toMatch(/aria-label="Allow Codex to connect to BookOne"/);
    expect(html).toMatch(/name="decision" value="deny"/);
    expect(html).toMatch(/read, upload and draft/);
    for (const row of CONSENT_PERMISSION_ROWS) {
      expect(html).toContain(row.title);
    }
    expect(html).toMatch(/Draft-only is off/);
    expect(html).toMatch(/AgentBridge posting is stopped/);
    expect(html).toMatch(/do not authorize financial posting/);
    expect(html).toMatch(/local completion page is served by the client/);
    expect(html).not.toMatch(/BEGIN PRIVATE|code_verifier|access_token/);
  });

  it('does not imply draft-only or posting-stop when those flags are off', () => {
    const copy = consentRestrictionCopy({ enabled: true, draftOnly: false, postingDisabled: false });
    expect(copy.join(' ')).toMatch(/Draft-only is off/);
    expect(copy.join(' ')).toMatch(/posting-stop is off/);
    expect(copy.join(' ')).not.toMatch(/Draft-only is on/);
    expect(copy.join(' ')).not.toMatch(/posting is stopped/);
  });

  it('keeps untrusted redirects on a local BookOne error page', () => {
    const html = renderConsentPage({
      kind: 'untrusted_redirect',
      message: 'redirect_uri is not allowed for this client. BookOne will not send you elsewhere.',
    });
    expect(html).toMatch(/will not send you elsewhere/i);
    expect(html).not.toMatch(/http-equiv="refresh"/);
    expect(safeOAuthDenialUrl('bookone-codex', 'https://evil.example/callback', { issuer: 'https://bookone.clossyan.com' })).toBeNull();
    const ok = safeOAuthDenialUrl('bookone-codex', 'http://127.0.0.1:9/callback/abc', {
      state: 's1',
      issuer: 'https://bookone.clossyan.com',
    });
    expect(ok).toContain('error=access_denied');
    expect(ok).toContain('state=s1');
    expect(ok).toContain('iss=https%3A%2F%2Fbookone.clossyan.com');
    const client = findPublicClient('bookone-codex')!;
    expect(redirectUriAllowed(client, 'https://evil.example/callback')).toBe(false);
  });

  it('styles sign-in, inbox-off, cancel and server-error with next steps', () => {
    expect(renderConsentPage({ kind: 'sign_in_required', message: 'Sign in to BookOne first.' })).toMatch(/Sign in to BookOne/);
    expect(renderConsentPage({ kind: 'inbox_disabled', message: 'Turn on Document Inbox' })).toMatch(/Company → AgentBridge/);
    expect(renderConsentPage({ kind: 'cancelled', message: 'No access was granted.' })).toMatch(/No access was granted/);
    expect(renderConsentPage({ kind: 'server_error', message: 'BookOne could not finish this request' })).toMatch(
      /fresh authorization/,
    );
  });
});
