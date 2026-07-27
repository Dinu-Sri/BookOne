import { redirect } from 'next/navigation';
import { getLifecycleOptions } from '@/app/actions/entity-lifecycle';
import { CashbookSettingsClient } from '@/components/cashbook/cashbook-settings-client';
import { needsOnboarding, usesPersonalShell } from '@/lib/entity-kind';

export default async function CashbookSettingsPage() {
  let options;
  try {
    options = await getLifecycleOptions();
  } catch {
    redirect('/login?from=/cashbook/settings');
  }

  if (needsOnboarding(options.entityKind)) redirect('/onboarding');
  if (!usesPersonalShell(options.entityKind)) redirect('/');

  return (
    <CashbookSettingsClient
      showFullErpLink={options.showFullErp}
      entityKind={options.entityKind}
      capabilityTier={options.capabilityTier}
      tenantName={options.tenantName}
      canUpgradeToSole={options.canUpgradeToSole}
      canUpgradeToFull={options.canUpgradeToFull}
      canDowngradeToLite={options.canDowngradeToLite}
      canIncorporate={options.canIncorporate}
    />
  );
}
