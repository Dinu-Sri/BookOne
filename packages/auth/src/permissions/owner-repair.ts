/** Legacy Owner rows may lack a job id. Viewer/Admin/custom memberships must never be promoted (BUG-0052). */
export function shouldRepairOwnerJob(membership: {
  role?: string | null;
  primaryRoleId?: string | null;
}): boolean {
  if (membership.primaryRoleId) return false;
  return (membership.role || '').toLowerCase() === 'owner';
}
