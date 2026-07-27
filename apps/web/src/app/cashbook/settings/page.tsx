import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import {
  canAccessFullErp,
  needsOnboarding,
  parseEntityKind,
  usesPersonalShell,
} from '@/lib/entity-kind';
import { CashbookSettingsClient } from '@/components/cashbook/cashbook-settings-client';

export default async function CashbookSettingsPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login?from=/cashbook/settings');
  }

  const entityKind = parseEntityKind(tenant.entityKind);
  if (needsOnboarding(entityKind)) redirect('/onboarding');
  if (!usesPersonalShell(entityKind)) redirect('/');

  const showFullErp = canAccessFullErp(entityKind, tenant.capabilityTier);

  return (
    <CashbookSettingsClient
      showFullErpLink={showFullErp}
      entityKind={entityKind}
      tenantName={tenant.name}
    />
  );
}
