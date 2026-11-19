import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPERATION_REGISTRY } from '../src/contracts';
import { money } from '../src/money';
import { oracleVatMinor } from '../src/oracles';
import { blockedCoreGuardSuites } from '../src/coreguard';
import { AgentBridgeService, recordingPostingPort } from '../src/service';
import { MemoryStore, sha256 } from '../src/store';
import { defaultPolicy, type Actor } from '../src/contracts';

type IntakeFixture = {
  version: number;
  operationId: string;
  originalBytes: string;
  facts: {
    supplierName: string;
    supplierInvoiceNumber: string;
    issueDate: string;
    paidStatus: string;
    documentKind: string;
    netMinor: number;
    taxMinor: number;
    grossMinor: number;
    expenseAccountCode: string;
    inputVatAccountCode: string;
    payableAccountCode: string;
    categoryLabel: string;
    lineDescription: string;
  };
  journal: Array<{ accountCode: string; side: string; minor: number }>;
  liveClients: string;
};

const fixture = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../../docs/coreguard/fixtures/invoice-intake.v1.json'), 'utf8'),
) as IntakeFixture;

function actor(): Actor {
  return {
    userId: 'user-owner',
    tenantId: 'tenant-a',
    capabilities: ['read', 'upload', 'draft', 'approve', 'post'],
  };
}

describe('pilot AgentBridge invoice intake (unpaid domestic LKR service/expense)', () => {
  it('pins independent fixture totals and the supported operation', () => {
    expect(fixture.version).toBe(1);
    expect(fixture.operationId).toBe('purchase.bill.unpaid-service.v1');
    expect(OPERATION_REGISTRY.some((row) => row.id === fixture.operationId && row.supported)).toBe(true);
    expect(fixture.facts.paidStatus).toBe('unpaid');
    expect(fixture.facts.documentKind).toBe('service_expense');
    expect(fixture.facts.netMinor).toBe(100000);
    expect(fixture.facts.taxMinor).toBe(18000);
    expect(fixture.facts.grossMinor).toBe(118000);
    expect(oracleVatMinor(fixture.facts.netMinor, true, 18)).toBe(fixture.facts.taxMinor);
    expect(fixture.facts.netMinor + fixture.facts.taxMinor).toBe(fixture.facts.grossMinor);
    expect(fixture.journal).toEqual([
      { accountCode: '6800', side: 'debit', minor: 100000 },
      { accountCode: '2300', side: 'debit', minor: 18000 },
      { accountCode: '2100', side: 'credit', minor: 118000 },
    ]);
    expect(fixture.liveClients).toBe('blocked');
    expect(blockedCoreGuardSuites().map((row) => row.id)).toContain('codex-claude-live-clients');
  });

  it('stores original bytes, accepts facts, and posts the fixture journal on MemoryStore', async () => {
    const store = new MemoryStore();
    await store.setFlags('tenant-a', { enabled: true, draftOnly: false, postingDisabled: false });
    const posting = recordingPostingPort();
    const svc = new AgentBridgeService({
      store,
      extractor: {
        id: 'provider:configurable-ocr',
        async extract() {
          throw Object.assign(new Error('Live OCR is not opted in.'), { code: 'PROVIDER_UNCONFIGURED' });
        },
      },
      posting,
      policyFor: async () => defaultPolicy(),
      publicBaseUrl: 'https://bookone.example',
    });
    const bytes = new TextEncoder().encode(fixture.originalBytes);
    const submitted = await svc.submitDocument(actor(), {
      filename: 'abc.pdf',
      mime: 'application/pdf',
      bytes,
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) throw new Error('submit failed');
    expect(submitted.document?.contentHash).toBe(sha256(bytes));
    const facts = await svc.submitExtractedFacts(actor(), {
      documentId: submitted.document!.id,
      contentHash: submitted.document!.contentHash,
      expectedRevision: 0,
      supplierName: fixture.facts.supplierName,
      supplierInvoiceNumber: fixture.facts.supplierInvoiceNumber,
      issueDate: fixture.facts.issueDate,
      currency: 'LKR',
      paidStatus: 'unpaid',
      documentKind: 'service_expense',
      netMinor: fixture.facts.netMinor,
      taxMinor: fixture.facts.taxMinor,
      grossMinor: fixture.facts.grossMinor,
      expenseAccountCode: fixture.facts.expenseAccountCode,
      categoryLabel: fixture.facts.categoryLabel,
      lineDescription: fixture.facts.lineDescription,
      origin: 'agent-facts',
    });
    expect(facts.ok).toBe(true);
    if (!facts.ok) throw new Error('facts failed');
    const validated = await svc.validateProposal(actor(), facts.proposal.id);
    expect(validated.ok).toBe(true);
    const preview = await svc.getPreview(actor(), facts.proposal.id);
    expect('net' in preview && preview.net.minor).toBe(100000);
    expect('vat' in preview && preview.vat.minor).toBe(18000);
    expect('gross' in preview && preview.gross.minor).toBe(118000);
    expect('journal' in preview && preview.journal).toEqual(
      expect.arrayContaining(fixture.journal.map((line) => expect.objectContaining(line))),
    );
    const approval = await svc.grantApproval(actor(), facts.proposal.id);
    const receipt = await svc.commitApprovedProposal(actor(), {
      proposalId: facts.proposal.id,
      approvalId: (approval as { id: string }).id,
      idempotencyKey: 'pilot-invoice-intake-1',
    });
    expect(receipt).toMatchObject({ status: 'posted' });
    expect(posting.posts[0]?.facts.net).toEqual(money(100000));
  });
});
