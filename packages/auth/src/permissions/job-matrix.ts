import { ACTION_PERMISSIONS, PRIVILEGED_KEYS, SCREEN_DEFS } from './catalog';

export type JobMatrixGrant = { key: string; level: 'read' | 'write' };

/** Persist screen `.read`/`.write` keys plus exact action catalog keys. */
export function persistedGrantsFromJobForm(getValue: (name: string) => string): JobMatrixGrant[] {
  const grants: JobMatrixGrant[] = [];
  for (const screen of SCREEN_DEFS) {
    if ((PRIVILEGED_KEYS as readonly string[]).some((k) => k.startsWith(screen.keyPrefix))) continue;
    const v = String(getValue(`perm_${screen.keyPrefix}`) ?? 'none');
    if (v === 'write' && screen.writeable) grants.push({ key: `${screen.keyPrefix}.write`, level: 'write' });
    else if (v === 'read' || v === 'write') grants.push({ key: `${screen.keyPrefix}.read`, level: 'read' });
  }
  for (const action of ACTION_PERMISSIONS) {
    const v = String(getValue(`perm_${action.key}`) ?? 'none');
    if (v === 'write') grants.push({ key: action.key, level: 'write' });
  }
  return grants;
}

export function actionPermissionLevel(grantSet: Set<string>, actionKey: string): 'write' | 'none' {
  if (grantSet.has(actionKey) || grantSet.has(`${actionKey}.write`)) return 'write';
  return 'none';
}

export function jobMatrixActionRows(grantSet: Set<string>) {
  return ACTION_PERMISSIONS.map((action) => ({
    keyPrefix: action.key,
    label: action.label,
    href: '/purchase/inbox',
    module: action.module,
    writeable: true as const,
    level: actionPermissionLevel(grantSet, action.key) as 'none' | 'read' | 'write',
    locked: false,
  }));
}
