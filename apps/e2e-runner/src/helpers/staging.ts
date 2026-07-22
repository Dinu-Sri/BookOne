/**
 * E2E environment helpers (no host/staging gates).
 *
 * /e2e and CLI always run against whatever E2E_BASE_URL + credentials the
 * operator provides. Optional admin credentials only enrich Control Room tests.
 */

export function getE2eBaseUrl(): string {
  return process.env.E2E_BASE_URL || 'http://localhost:3100';
}

export function getE2eHostname(): string {
  try {
    return new URL(getE2eBaseUrl()).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** Always true — full catalog runs on any target instance. */
export function isStagingBaseUrl(): boolean {
  return true;
}

/** Always true — no E2E_ALLOW_FULL / host allowlist required. */
export function isFullSuiteAllowed(): boolean {
  return true;
}

export function fullSuiteSkipReason(): string {
  return '';
}

export function requireFullSuiteAllowed(_label = 'Full E2E suite'): void {
  // no-op
}

/** Optional super-admin credentials for Control Room / health-check. */
export function hasAdminCredentials(): boolean {
  return Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD);
}

/** Platform suites always run; admin login is used when env is set. */
export function isPlatformSuiteAllowed(): boolean {
  return true;
}

export function platformSuiteSkipReason(): string {
  return '';
}
