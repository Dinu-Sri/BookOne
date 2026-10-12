import { isPlatformAdminEmail } from '@bookone/auth';

export function isPlatformAdmin(tenant: {
  platformRole?: string | null;
  userRole?: string | null;
  userEmail?: string | null;
}): boolean {
  if (tenant.platformRole === 'super_admin' || tenant.userRole === 'super_admin') return true;
  return isPlatformAdminEmail(tenant.userEmail);
}
