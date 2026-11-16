import { describe, expect, it } from 'vitest';
import { defaultPolicy, type Actor } from '../src/contracts';
import { MemoryStore } from '../src/store';
import { AgentBridgeService, recordingPostingPort } from '../src/service';
import { fixtureExtractor } from '../src/extraction';
import { MemoryJobQueue } from '../src/jobs';

function actor(): Actor {
  return {
    userId: 'u1',
    tenantId: 't1',
    capabilities: ['read', 'upload', 'draft', 'approve', 'post'],
  };
}

describe('durable extraction jobs', () => {
  it('redelivers a job left running after a crash without posting', async () => {
    const store = new MemoryStore();
    await store.setFlags('t1', { enabled: true, draftOnly: false, postingDisabled: false });
    const posting = recordingPostingPort();
    const svc = new AgentBridgeService({
      store,
      extractor: fixtureExtractor,
      posting,
      policyFor: async () => defaultPolicy(),
    });
    const submitted = await svc.submitDocument(actor(), {
      filename: 'inv.pdf',
      mime: 'application/pdf',
      bytes: new TextEncoder().encode('fixture:supported-vat-service'),
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) throw new Error('submit failed');
    const queue = new MemoryJobQueue();
    const job = await queue.enqueue('t1', submitted.document!.id);
    await queue.claim(job.id);
    expect(queue.pending().some((j) => j.status === 'running')).toBe(true);
    const recovered = await queue.recoverRunning();
    expect(recovered).toHaveLength(1);
    await queue.runNext(svc, actor());
    const after = await svc.getProcessingStatus(actor(), submitted.document!.id);
    expect(['draft', 'needs_clarification']).toContain(after.document.status);
    expect(posting.posts).toHaveLength(0);
  });
});
