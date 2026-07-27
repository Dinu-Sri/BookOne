import { getTenantInfo } from '@/app/actions/workspace';
import {
  canWriteModule,
  parseEntityKind,
  type ModuleWriteKey,
} from '@/lib/entity-kind';

/**
 * Server-side write gate for inventory/POS (and other modules).
 * After sole full → lite downgrade, advanced modules stay viewable but this throws on write.
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
}
