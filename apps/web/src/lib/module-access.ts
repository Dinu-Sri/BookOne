import { SCREEN_DEFS } from '@bookone/auth';
import { getTenantInfo } from '@/app/actions/workspace';
import { getMyAccess } from '@/lib/access';
import {
  canViewModule,
  canWriteModule,
  parseEntityKind,
  type ModuleWriteKey,
} from '@/lib/entity-kind';

export type ModuleWriteDenial = 'module_off' | 'tier' | 'job';

export type ModuleWriteProbe = {
  canWrite: boolean;
  reason: 'ok' | ModuleWriteDenial;
};

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

/** Non-throwing page gate. Unexpected auth failures still throw so login redirects stay intact. */
export async function probeModuleWrite(module: ModuleWriteKey): Promise<boolean> {
  const detail = await probeModuleWriteDetail(module);
  return detail.canWrite;
}

/** Distinguishes plan/module ceiling from job permission so Owner view-only is not treated as a missing grant. */
export async function probeModuleWriteDetail(module: ModuleWriteKey): Promise<ModuleWriteProbe> {
  const tenant = await getTenantInfo();
  const kind = parseEntityKind(tenant.entityKind);
  if (!canViewModule(kind, tenant.modules, module)) {
    return { canWrite: false, reason: 'module_off' };
  }
  if (!canWriteModule(kind, tenant.capabilityTier, tenant.modules, module)) {
    return { canWrite: false, reason: 'tier' };
  }
  const access = await getMyAccess();
  if (!access?.rbacEnforced) return { canWrite: true, reason: 'ok' };
  const hit = SCREEN_DEFS.some((s) => s.module === module && access.allows(`${s.keyPrefix}.write`, 'write'));
  if (!hit) return { canWrite: false, reason: 'job' };
  return { canWrite: true, reason: 'ok' };
}

export function moduleWriteDenialMessage(module: ModuleWriteKey, reason: ModuleWriteDenial): string {
  if (reason === 'module_off') {
    if (module === 'inventory') {
      return 'This catalogue is view-only because Inventory is off for this company. Creating products, including rental items, needs Inventory enabled. Rental booking also needs the Rental module. Plan and modules are set in Control Room; this is not a missing Owner job grant.';
    }
    if (module === 'rental') {
      return 'Rental dispatch and calendar writes need the Rental module enabled for this company. A rental product in the catalogue is not enough for booking, deposit, dispatch or return.';
    }
    return 'This area is view-only because the module is off for this company.';
  }
  if (reason === 'tier') {
    return 'This area is view-only on Sole lite. Upgrade to Sole full (or ask admin) to create or edit.';
  }
  return 'You do not have permission to create or edit here.';
}
