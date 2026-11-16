import { newId, type AgentBridgeStore } from './store';
import type { Actor } from './contracts';
import type { AgentBridgeService } from './service';

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export type ExtractionJob = {
  id: string;
  tenantId: string;
  documentId: string;
  status: JobStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

/** In-process durable queue. Postgres adapter persists the same records. */
export class MemoryJobQueue {
  jobs: ExtractionJob[] = [];

  async enqueue(tenantId: string, documentId: string): Promise<ExtractionJob> {
    const job: ExtractionJob = {
      id: newId(),
      tenantId,
      documentId,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.jobs.push(job);
    return job;
  }

  pending(): ExtractionJob[] {
    return this.jobs.filter((j) => j.status === 'pending' || j.status === 'running');
  }

  /** Simulate a worker crash after claiming the job. */
  async claim(jobId: string): Promise<ExtractionJob> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job) throw new Error('Job not found.');
    job.status = 'running';
    job.attempts += 1;
    job.updatedAt = new Date().toISOString();
    return job;
  }

  async complete(jobId: string, error?: string) {
    const job = this.jobs.find((j) => j.id === jobId);
    if (!job) return;
    job.status = error ? 'failed' : 'done';
    job.lastError = error;
    job.updatedAt = new Date().toISOString();
  }

  /** Redeliver jobs left running after a crash. */
  async recoverRunning(): Promise<ExtractionJob[]> {
    const stuck = this.jobs.filter((j) => j.status === 'running');
    for (const job of stuck) {
      job.status = 'pending';
      job.updatedAt = new Date().toISOString();
    }
    return stuck;
  }

  async runNext(service: AgentBridgeService, actor: Actor): Promise<ExtractionJob | null> {
    const next = this.jobs.find((j) => j.status === 'pending' && j.tenantId === actor.tenantId);
    if (!next) return null;
    await this.claim(next.id);
    try {
      await service.processDocument(actor, next.documentId);
      await this.complete(next.id);
    } catch (e) {
      await this.complete(next.id, e instanceof Error ? e.message : String(e));
    }
    return next;
  }
}

export async function enqueueExtraction(store: AgentBridgeStore, queue: MemoryJobQueue, tenantId: string, documentId: string) {
  void store;
  return queue.enqueue(tenantId, documentId);
}
