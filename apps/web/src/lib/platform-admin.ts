export function isPlatformAdmin(tenant: { platformRole?: string | null; userRole?: string | null }): boolean {
  return tenant.platformRole === 'super_admin' || tenant.userRole === 'super_admin';
}
