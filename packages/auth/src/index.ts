export { auth } from './auth';
export { migrateLegacyCredentials } from './legacy-login';
export { createCredentialLogin } from './create-login';
export { signOut } from './sign-out';
export { getSession, requireTenantContext, withTenantAuth, getAuthIdentity, INVITE_COOKIE } from './session';
export type { Session, SessionUser, AuthIdentity } from './session';
export {
  CATALOG_VERSION,
  PERMISSION_KEYS,
  PRIVILEGED_KEYS,
  SCREEN_DEFS,
  navHrefToPermissionPrefix,
  screenKeyFromHref,
  isPrivilegedKey,
  type PermissionKey,
  type AccessLevel,
} from './permissions/catalog';
export { JOB_TEMPLATES, templateByKey, type JobTemplateKey } from './permissions/templates';
export { getRequestAccess, loadAccessForUser, type LoadedAccess } from './permissions/load';
export { allows, resolveLevel } from './permissions/resolve';
export {
  inDimensionScope,
  isUnrestrictedScope,
  scopeIgnoresJob,
  unrestrictedDimensionScope,
  type DimensionScope,
} from './permissions/scope';
export { seedJobsForTenant, ensureOwnerMembership } from './permissions/seed-jobs';
