/**
 * Emails listed in PLATFORM_ADMIN_EMAIL (comma/space separated) are
 * platform super-admins: Control Room is visible for those accounts.
 */
export function platformAdminEmails(): string[] {
  const raw = process.env.PLATFORM_ADMIN_EMAIL ?? process.env.PLATFORM_ADMIN_EMAILS ?? '';
  return raw
    .split(/[,;\s]+/)
    .map((value) => value.toLowerCase().trim())
    .filter(Boolean);
}

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return platformAdminEmails().includes(email.toLowerCase().trim());
}
