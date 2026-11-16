import { describe, expect, it } from 'vitest';
import { AgentBridgeService, recordingPostingPort } from '../src/service';
import { MemoryStore } from '../src/store';
import { defaultPolicy, type Actor } from '../src/contracts';
import { fixtureExtractor, liveExtractorFromEnv } from '../src/extraction';
import { signConnectionToken, verifyConnectionToken, verifyOAuthAccessToken } from '../src/authz';
import { dispatchTool } from '../src/mcp';

const actor: Actor = {
  tenantId: 'synthetic-company',
  userId: 'synthetic-owner',
  capabilities: ['read', 'upload', 'draft', 'approve', 'post'],
};

async function setup(kind = 'supported-vat-service') {
  const store = new MemoryStore();
  await store.setFlags(actor.tenantId, { enabled: true, draftOnly: false, postingDisabled: false });
  const posting = recordingPostingPort();
  const service = new AgentBridgeService({
    store,
    posting,
    extractor: fixtureExtractor,
    policyFor: async () => defaultPolicy(),
  });
  const r = await service.submitDocument(actor, {
    filename: 'synthetic.pdf',
    mime: 'application/pdf',
    bytes: new TextEncoder().encode('fixture:' + kind),
  });
  if (!r.ok) throw Error('fixture refused');
  const p = await service.proposePurchaseBill(actor, r.document!.id);
  return { store, posting, service, proposalId: (p as { id: string }).id };
}

describe('independent acceptance expectations AB-02', () => {
  it('unsupported paid invoice cannot be approved and posted while blocking issues remain', async () => {
    const { service, posting, proposalId } = await setup('unsupported-paid');
    const a = await service.grantApproval(actor, proposalId);
    await service.commitApprovedProposal(actor, {
      proposalId,
      approvalId: (a as { id?: string }).id ?? 'missing',
      idempotencyKey: 'paid-refusal',
    });
    expect(posting.posts).toHaveLength(0);
  });

  it('different keys concurrent on same approved proposal cause at most one posting call', async () => {
    const { service, posting, proposalId } = await setup();
    const a = await service.grantApproval(actor, proposalId);
    await Promise.all(
      ['one', 'two'].map((idempotencyKey) =>
        service.commitApprovedProposal(actor, {
          proposalId,
          approvalId: (a as { id: string }).id,
          idempotencyKey,
        }),
      ),
    );
    expect(posting.posts).toHaveLength(1);
  });

  it('tokens without finite expiry are rejected even when their signature is valid', () => {
    const t = signConnectionToken(
      {
        tenantId: actor.tenantId,
        userId: actor.userId,
        scopes: ['post'],
        connectionId: 'synthetic',
        clientId: 'synthetic',
      } as never,
      'isolated-test-secret',
    );
    expect(() => verifyConnectionToken(t, 'isolated-test-secret')).toThrow();
  });

  it('connected agent cannot grant a human-only approval even with carried approve capability', async () => {
    const { service, proposalId } = await setup();
    const r = await dispatchTool(service, { ...actor, connectionId: 'synthetic-client' }, 'grant_approval', {
      proposalId,
    });
    expect(r).toMatchObject({ ok: false });
  });

  it('configured live OCR must do more than throw an unconditional blocked stub', async () => {
    const extractor = liveExtractorFromEnv({
      AGENT_BRIDGE_OCR_ENDPOINT: 'http://127.0.0.1:1',
      AGENT_BRIDGE_OCR_KEY: 'synthetic-never-used',
    });
    await expect(extractor.extract({ contentHash: 'synthetic' })).rejects.not.toThrow('remote smoke is BLOCKED');
  });

  it('local HMAC fixture is not accepted as production OAuth', async () => {
    const hmac = signConnectionToken(
      {
        iss: 'bookone.agent-bridge.local',
        aud: 'bookone.agent-bridge',
        tenantId: actor.tenantId,
        userId: actor.userId,
        clientId: 'synthetic',
        connectionId: 'synthetic',
        scopes: ['read'],
        iat: Date.now(),
        exp: Date.now() + 60_000,
      },
      'isolated-test-secret',
    );
    await expect(verifyOAuthAccessToken(hmac, { AGENT_BRIDGE_OAUTH_ISSUER: 'https://idp.example' })).rejects.toThrow(
      /not production OAuth/,
    );
  });
});
