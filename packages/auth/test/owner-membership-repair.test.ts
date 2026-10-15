import { describe, expect, it } from 'vitest';
import { shouldRepairOwnerJob } from '../src/permissions/owner-repair';

describe('shouldRepairOwnerJob (BUG-0052)', () => {
  it('fills a missing Owner job on an existing Owner membership', () => {
    expect(shouldRepairOwnerJob({ role: 'owner', primaryRoleId: null })).toBe(true);
  });

  it('does not promote a legacy Viewer with a null job', () => {
    expect(shouldRepairOwnerJob({ role: 'viewer', primaryRoleId: null })).toBe(false);
  });

  it('does not promote Admin or custom memberships', () => {
    expect(shouldRepairOwnerJob({ role: 'admin', primaryRoleId: null })).toBe(false);
    expect(shouldRepairOwnerJob({ role: 'sales', primaryRoleId: null })).toBe(false);
  });

  it('leaves an Owner who already has a job unchanged', () => {
    expect(shouldRepairOwnerJob({ role: 'owner', primaryRoleId: 'job-1' })).toBe(false);
  });
});
