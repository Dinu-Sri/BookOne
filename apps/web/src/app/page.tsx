import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { SimpleEntryScreen } from '@/components/simple-entry/simple-entry-screen';
import {
  canAccessFullErp,
  needsOnboarding,
  parseEntityKind,
  usesPersonalShell,
} from '@/lib/entity-kind';

/**
 * Server home: route by entity_kind so personal/sole-lite users never flash company UI.
 * Company and sole-full get Simple Entry (full ERP chrome).
 */
export default async function HomePage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login');
  }

  const entityKind = parseEntityKind(tenant.entityKind);
  if (needsOnboarding(entityKind)) {
    redirect('/onboarding');
  }

  // Personal always; sole lite -> cashbook only (no company Simple Entry flash).
  if (usesPersonalShell(entityKind) && !canAccessFullErp(entityKind, tenant.capabilityTier)) {
    redirect('/cashbook');
  }

  // Sole full may land on cashbook by product preference after onboarding,
  // but `/` is a valid advanced entry (settings "Open full BookOne").
  return <SimpleEntryScreen />;
}
