import type { ArchiveEnvelope } from './remap';
import { ARCHIVE_SCHEMA_VERSION } from './format';

export type ArchiveTransformer = {
  from: number;
  to: number;
  transform: (envelope: ArchiveEnvelope) => ArchiveEnvelope;
};

/**
 * One step per published schemaVersion bump that changes archive shape.
 * Additive SQL columns with defaults need no entry. Breaking changes ship a
 * transformer in the same PR as the migration. Keep ~12 months / last 20 versions.
 */
export const ARCHIVE_TRANSFORMERS: ArchiveTransformer[] = [];

export function transformArchiveToCurrent(envelope: ArchiveEnvelope): ArchiveEnvelope {
  const start = envelope.manifest.schemaVersion;
  if (typeof start !== 'number' || start < 1) {
    throw new Error('That backup file is not a BookOne archive.');
  }
  if (start > ARCHIVE_SCHEMA_VERSION) {
    throw new Error('This backup needs a newer BookOne.');
  }
  if (start === ARCHIVE_SCHEMA_VERSION) return envelope;

  let current = envelope;
  for (let v = start; v < ARCHIVE_SCHEMA_VERSION; v++) {
    const step = ARCHIVE_TRANSFORMERS.find((t) => t.from === v && t.to === v + 1);
    if (!step) {
      throw new Error('This backup needs BookOne from an older schema window that is no longer loaded.');
    }
    const next = step.transform(current);
    current = {
      ...next,
      manifest: { ...next.manifest, schemaVersion: step.to },
    };
  }
  return current;
}
