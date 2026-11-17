import type { AccessLevel } from './catalog';
import { templateByKey } from './templates';

/** Same grant mapping loadAccessForUser uses for uncustomized template jobs. */
export function grantsFromTemplateKey(templateKey: string | null): { key: string; level: AccessLevel }[] {
  const t = templateKey ? templateByKey(templateKey) : undefined;
  if (!t) return [];
  return t.grants.map((key) => ({
    key,
    level: (key.endsWith('.read') ? 'read' : 'write') as AccessLevel,
  }));
}
