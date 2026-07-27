import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { homePathForEntity, needsOnboarding, parseEntityKind } from '@/lib/entity-kind';
import { OnboardingClient } from '@/components/onboarding/onboarding-client';

/**
 * Server gate: only pending tenants see the registration tiles.
 * Already onboarded users go to their shell home (no re-pick flash).
 */
export default async function OnboardingPage() {
  let tenant;
  try {
    tenant = await getTenantInfo();
  } catch {
    redirect('/login?from=/onboarding');
  }

  const entityKind = parseEntityKind(tenant.entityKind);
  if (!needsOnboarding(entityKind)) {
    redirect(homePathForEntity(entityKind, tenant.capabilityTier));
  }

  return <OnboardingClient />;
}
