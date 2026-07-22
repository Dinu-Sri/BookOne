import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Scenario } from '../runner/types';

const here = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = join(here, '../catalog/scenarios.json');

let cached: Scenario[] | null = null;

/** Load the full E2E scenario catalog (698 IDs). Cached per process. */
export function loadScenarios(): Scenario[] {
  if (cached) return cached;
  const raw = readFileSync(CATALOG_PATH, 'utf8');
  const data = JSON.parse(raw) as Scenario[];
  if (!Array.isArray(data)) {
    throw new Error(`Invalid scenarios catalog at ${CATALOG_PATH}`);
  }
  cached = data;
  return data;
}

export function loadScenariosBySection(sectionPrefix: string): Scenario[] {
  return loadScenarios().filter((s) => (s.section || '').startsWith(sectionPrefix));
}

export function loadScenariosByTag(tag: string): Scenario[] {
  const t = tag.startsWith('@') ? tag : `@${tag}`;
  return loadScenarios().filter((s) => (s.tags || []).includes(t));
}

export function loadScenariosByPriority(priority: string): Scenario[] {
  return loadScenarios().filter((s) => s.priority === priority);
}

export function getScenario(id: string): Scenario | undefined {
  return loadScenarios().find((s) => s.id === id);
}

/** Extract catalog IDs from free text (test titles, source files). */
export function extractScenarioIds(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(/\bS-\d{4}\b/g)) {
    ids.add(m[0]);
  }
  return [...ids].sort();
}

/** Priorities helper for remainder suites. */
export function loadScenariosBySectionAndPriorities(
  sectionPrefix: string,
  priorities: string[],
): Scenario[] {
  const allow = new Set(priorities);
  return loadScenariosBySection(sectionPrefix).filter((s) => allow.has(s.priority));
}

/**
 * Scenarios still missing from last coverage generate (if present).
 * Falls back to empty array when coverage file is absent.
 */
export function loadMissingScenariosFromCoverage(): Scenario[] {
  try {
    const covPath = join(here, '../catalog/coverage.generated.json');
    const cov = JSON.parse(readFileSync(covPath, 'utf8')) as { missing_ids?: string[] };
    const missing = new Set(cov.missing_ids || []);
    if (!missing.size) return [];
    return loadScenarios().filter((s) => missing.has(s.id));
  } catch {
    return [];
  }
}
