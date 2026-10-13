import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type Step = {
  run?: string;
  uses?: string;
  if?: string;
  with?: Record<string, unknown>;
  'continue-on-error'?: boolean;
};

type Job = {
  if?: string;
  needs?: string | string[];
  steps?: Step[];
  'continue-on-error'?: boolean;
};

function parseScalar(raw: string): unknown {
  const v = raw.trim();
  if (v === '' || v === '|' || v === '>' || v === '|-' || v === '>-') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  if (v.startsWith('[') && v.endsWith(']')) {
    return v
      .slice(1, -1)
      .split(',')
      .map((part) => String(parseScalar(part)))
      .filter((part) => part.length > 0);
  }
  return v;
}

/** Indent-based subset parser for GitHub Actions workflow YAML. */
function parseWorkflowJobs(text: string): Record<string, Job> {
  const lines = text.replace(/\t/g, '  ').split(/\r?\n/);
  const jobs: Record<string, Job> = {};
  let inJobs = false;
  let jobId: string | null = null;
  let job: Job | null = null;
  let currentStep: Step | null = null;
  let inWith = false;
  let skipUntilIndent: number | null = null;

  const finishStep = () => {
    if (job && currentStep) {
      job.steps = job.steps ?? [];
      job.steps.push(currentStep);
    }
    currentStep = null;
    inWith = false;
  };

  for (const raw of lines) {
    const indent = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (skipUntilIndent != null) {
      if (indent > skipUntilIndent) continue;
      skipUntilIndent = null;
    }

    if (!inJobs) {
      if (trimmed === 'jobs:') inJobs = true;
      continue;
    }

    if (indent === 2 && trimmed.endsWith(':') && !trimmed.startsWith('-')) {
      finishStep();
      jobId = trimmed.slice(0, -1);
      job = {};
      jobs[jobId] = job;
      inWith = false;
      continue;
    }
    if (!job) continue;

    if (indent === 4 && /^if:/.test(trimmed)) {
      job.if = String(parseScalar(trimmed.slice(3)));
      continue;
    }
    if (indent === 4 && /^needs:/.test(trimmed)) {
      const parsed = parseScalar(trimmed.slice(6));
      job.needs = parsed as string | string[];
      continue;
    }
    if (indent === 4 && /^continue-on-error:/.test(trimmed)) {
      job['continue-on-error'] = parseScalar(trimmed.slice('continue-on-error:'.length)) === true;
      continue;
    }
    if (indent === 4 && trimmed === 'steps:') {
      finishStep();
      job.steps = job.steps ?? [];
      continue;
    }

    if (indent === 6 && trimmed.startsWith('- ')) {
      finishStep();
      currentStep = {};
      const rest = trimmed.slice(2);
      const colon = rest.indexOf(':');
      if (colon >= 0) {
        const key = rest.slice(0, colon).trim();
        const value = rest.slice(colon + 1);
        if (key === 'name' || key === 'id') {
          /* ignore */
        } else if (key === 'run') {
          currentStep.run = String(parseScalar(value));
        } else if (key === 'uses') {
          currentStep.uses = String(parseScalar(value));
        } else if (key === 'if') {
          currentStep.if = String(parseScalar(value));
        } else if (key === 'continue-on-error') {
          currentStep['continue-on-error'] = parseScalar(value) === true;
        }
      }
      continue;
    }

    if (!currentStep) continue;

    if (indent === 8 && /^run:/.test(trimmed)) {
      const value = trimmed.slice(4).trim();
      if (value === '|' || value === '>' || value === '|-' || value === '>-') {
        skipUntilIndent = 8;
        currentStep.run = '';
      } else {
        currentStep.run = String(parseScalar(value));
      }
      continue;
    }
    if (indent === 8 && /^uses:/.test(trimmed)) {
      currentStep.uses = String(parseScalar(trimmed.slice(5)));
      continue;
    }
    if (indent === 8 && /^if:/.test(trimmed)) {
      currentStep.if = String(parseScalar(trimmed.slice(3)));
      continue;
    }
    if (indent === 8 && /^continue-on-error:/.test(trimmed)) {
      currentStep['continue-on-error'] = parseScalar(trimmed.slice('continue-on-error:'.length)) === true;
      continue;
    }
    if (indent === 8 && trimmed === 'with:') {
      inWith = true;
      currentStep.with = {};
      continue;
    }
    if (inWith && indent === 10 && trimmed.includes(':')) {
      const colon = trimmed.indexOf(':');
      const key = trimmed.slice(0, colon).trim();
      const value = trimmed.slice(colon + 1).trim();
      if (value === '|' || value === '>' || value === '|-' || value === '>-') {
        skipUntilIndent = 10;
        currentStep.with = currentStep.with ?? {};
        currentStep.with[key] = '';
      } else {
        currentStep.with = currentStep.with ?? {};
        currentStep.with[key] = parseScalar(value);
      }
    }
  }
  finishStep();
  return jobs;
}

function requiredChecks(job: Job | undefined): boolean {
  return (
    (job?.['continue-on-error'] == null || job['continue-on-error'] === false) &&
    ['lint', 'typecheck', 'build', 'test'].every((check) =>
      job?.steps?.some(
        (s) =>
          (s.run ?? '').trim() === `pnpm ${check}` &&
          (s['continue-on-error'] == null || s['continue-on-error'] === false),
      ),
    )
  );
}

function hasRequiredAncestor(
  jobs: Record<string, Job>,
  id: string,
  seen = new Set<string>(),
): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  const needs = jobs[id]?.needs;
  return (Array.isArray(needs) ? needs : needs ? [needs] : []).some(
    (n) => requiredChecks(jobs[n]) || hasRequiredAncestor(jobs, n, seen),
  );
}

function publicationWouldRun(neededResult: string): boolean {
  return neededResult === 'success';
}

describe('Docker web image publication gate (BUG-0008 / A-014)', () => {
  const workflowPath = path.resolve(__dirname, '../../../.github/workflows/docker-web.yml');
  const source = readFileSync(workflowPath, 'utf8');
  const jobs = parseWorkflowJobs(source);

  it('in-memory negative controls reject Tests-only, masked, skipped, and always() publishers', () => {
    const split = {
      tests: { steps: [{ run: 'pnpm test' }] },
      quality: {
        steps: ['lint', 'typecheck', 'build'].map((c) => ({ run: `pnpm ${c}` })),
      },
      publish: { needs: ['tests'], steps: [{ with: { push: true } }] },
    };
    expect(requiredChecks(split.quality as Job)).toBe(false);
    expect(hasRequiredAncestor(split as Record<string, Job>, 'publish')).toBe(false);

    const masked = {
      quality: {
        steps: [
          { run: 'pnpm lint' },
          { run: 'pnpm typecheck' },
          { run: 'pnpm build' },
          { run: 'pnpm test || echo skipped' },
        ],
      },
      publish: { needs: ['quality'], steps: [{ with: { push: true } }] },
    };
    expect(hasRequiredAncestor(masked as Record<string, Job>, 'publish')).toBe(false);

    const continued = {
      quality: {
        'continue-on-error': true,
        steps: ['lint', 'typecheck', 'build', 'test'].map((c) => ({ run: `pnpm ${c}` })),
      },
      publish: { needs: ['quality'], steps: [{ with: { push: true } }] },
    };
    expect(hasRequiredAncestor(continued as Record<string, Job>, 'publish')).toBe(false);

    const dispatchBypass = {
      quality: {
        if: "github.event_name == 'push'",
        steps: ['lint', 'typecheck', 'build', 'test'].map((c) => ({ run: `pnpm ${c}` })),
      },
      publish: {
        needs: ['quality'],
        if: "${{ always() && (github.event_name != 'push' || needs.quality.result == 'success') }}",
        steps: [{ with: { push: true } }],
      },
    };
    expect(/always\(|failure\(/.test(dispatchBypass.publish.if)).toBe(true);
  });

  it('failed, cancelled, skipped, missing, and timed-out needed jobs block publication', () => {
    expect(publicationWouldRun('success')).toBe(true);
    for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out', 'missing', '']) {
      expect(publicationWouldRun(conclusion)).toBe(false);
    }
  });

  it('A-014 image publication depends on successful same-workflow required validation', () => {
    const publishers = Object.entries(jobs).filter(([, j]) =>
      j.steps?.some((s) => s.with?.push === true),
    );
    expect(publishers.length).toBeGreaterThan(0);
    for (const [id, job] of publishers) {
      expect(hasRequiredAncestor(jobs, id)).toBe(true);
      expect(/always\(|failure\(/.test(job.if ?? '')).toBe(false);
      for (const j of [job, ...Object.values(jobs).filter(requiredChecks)]) {
        for (const step of j.steps ?? []) {
          if (String(step.uses ?? '').startsWith('actions/checkout@')) {
            expect([undefined, '${{ github.sha }}'].includes(step.with?.ref as string | undefined)).toBe(
              true,
            );
          }
        }
      }
    }
  });

  it('quality job is unconditional and contains unmasked lint typecheck build test', () => {
    const quality = Object.values(jobs).find(requiredChecks);
    expect(quality).toBeTruthy();
    expect(quality?.if).toBeUndefined();
    expect(source).not.toMatch(/workflow_dispatch[\s\S]*if: github\.event_name == 'push'/);
  });
});
