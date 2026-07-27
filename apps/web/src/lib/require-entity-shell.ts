import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import {
  canAccessFullErp,
  homePathForEntity,
  needsOnboarding,
  parseEntityKind,
  usesPersonalShell,
  type EntityKind,
} from '@/lib/entity-kind';

export type ShellTenant = Awaited<ReturnType<typeof getTenantInfo>>;

/**
 * Load tenant and redirect pending users to onboarding.
 * Optionally require cashbook shell or full ERP.
 */
export async function requireEntityTenant(opts?: {
  /** If true, personal/sole lite users are bounced to cashbook. */
  requireFullErp?: boolean;
  /** If true, company users are bounced off cashbook routes. */
  requirePersonalShell?: boolean;
  loginFrom?: string;
}): Promise<ShellTenant & { entityKind: EntityKind }> {
  let tenant: ShellTenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect(opts?.loginFrom ? `/login?from=${encodeURIComponent(opts.loginFrom)}` : '/login');
  }

  const entityKind = parseEntityKind(tenant.entityKind);
  if (needsOnboarding(entityKind)) {
    redirect('/onboarding');
  }

  if (opts?.requireFullErp && !canAccessFullErp(entityKind, tenant.capabilityTier)) {
    redirect(homePathForEntity(entityKind, tenant.capabilityTier));
  }

  if (opts?.requirePersonalShell && !usesPersonalShell(entityKind)) {
    redirect('/');
  }

  return { ...tenant, entityKind };
}
