import { SCREEN_DEFS } from '@bookone/auth';
import { getTenantInfo } from '@/app/actions/workspace';
import { getMyAccess } from '@/lib/access';
import {
  canWriteModule,
  parseEntityKind,
  type ModuleWriteKey,
} from '@/lib/entity-kind';

/**
 * Server-side write gate for inventory/POS (and other modules).
 * Ceiling (entity kind + module flags) plus at least one job write in that module.
 */
export async function assertModuleWrite(module: ModuleWriteKey): Promise<void> {
  const tenant = await getTenantInfo();
  const kind = parseEntityKind(tenant.entityKind);
  const ok = canWriteModule(kind, tenant.capabilityTier, tenant.modules, module);
  if (!ok) {
    throw new Error(
      module === 'inventory' || module === 'pos'
        ? 'This area is view-only on Sole lite. Upgrade to Sole full (or ask admin) to create or edit.'
        : 'You do not have write access to this module.',
    );
  }
  const access = await getMyAccess();
  if (!access?.rbacEnforced) return;
  const hit = SCREEN_DEFS.some((s) => s.module === module && access.allows(`${s.keyPrefix}.write`, 'write'));
  if (!hit) throw new Error('You do not have permission to change this.');
}
