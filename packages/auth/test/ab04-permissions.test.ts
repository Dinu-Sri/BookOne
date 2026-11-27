import { describe, expect, it } from 'vitest';
import {
  ACTION_PERMISSIONS,
  canonicalPermissionKey,
  isActionPermissionKey,
  permissionGrantAliases,
} from '../src/permissions/catalog';
import { grantsFromTemplateKey } from '../src/permissions/grants';
import { actionPermissionLevel, persistedGrantsFromJobForm } from '../src/permissions/job-matrix';
import { allows, type ResolveInput } from '../src/permissions/resolve';
import { templateByKey } from '../src/permissions/templates';

function role(key: 'owner' | 'accountant' | 'purchasing' | 'viewer' | 'sales' | 'admin'): ResolveInput {
  return {
    platformRole: 'user',
    rbacEnforced: true,
    primaryTemplateKey: key,
    extraTemplateKey: null,
    grants: grantsFromTemplateKey(key),
    overrides: [],
    entityKind: 'company',
    capabilityTier: null,
    modules: { purchase: true, sales: true, inventory: true, pos: true, rental: true },
    legacyRole: key,
    jobSlug: key,
  };
}

describe('AB-04 AgentBridge action keys through the actual resolver', () => {
  it.each(['owner', 'accountant', 'purchasing'] as const)(
    '%s template approval and post grants work through the real permission resolver',
    (key) => {
      const access = role(key);
      expect(access.grants.some((g) => g.key === 'agent_bridge.approve' && g.level === 'write')).toBe(true);
      expect(access.grants.some((g) => g.key === 'agent_bridge.post' && g.level === 'write')).toBe(true);
      expect(allows(access, 'agent_bridge.approve', 'write')).toBe(true);
      expect(allows(access, 'agent_bridge.post', 'write')).toBe(true);
      expect(allows(access, 'agent_bridge.approve.write', 'write')).toBe(true);
      expect(allows(access, 'agent_bridge.post.write', 'write')).toBe(true);
    },
  );

  it('Viewer stays denied even when capability grants are copied into its job', () => {
    const access = role('viewer');
    access.grants.push(
      { key: 'agent_bridge.approve', level: 'write' },
      { key: 'agent_bridge.post', level: 'write' },
    );
    expect(allows(access, 'agent_bridge.approve', 'write')).toBe(false);
    expect(allows(access, 'agent_bridge.post', 'write')).toBe(false);
  });

  it('Viewer default template has no approve/post write', () => {
    const access = role('viewer');
    expect(allows(access, 'agent_bridge.approve', 'write')).toBe(false);
    expect(allows(access, 'agent_bridge.post', 'write')).toBe(false);
    expect(templateByKey('viewer')!.grants).not.toContain('agent_bridge.post');
  });

  it('Sales job without those grants cannot approve or post', () => {
    const access = role('sales');
    expect(allows(access, 'agent_bridge.approve', 'write')).toBe(false);
    expect(allows(access, 'agent_bridge.post', 'write')).toBe(false);
  });

  it('deny override refuses even when the template granted write', () => {
    const access = role('purchasing');
    access.overrides = [{ key: 'agent_bridge.approve', effect: 'deny' }];
    expect(allows(access, 'agent_bridge.approve', 'write')).toBe(false);
    expect(allows(access, 'agent_bridge.post', 'write')).toBe(true);
  });

  it('deny override on the persisted .write alias also refuses', () => {
    const access = role('owner');
    access.overrides = [{ key: 'agent_bridge.post.write', effect: 'deny' }];
    expect(allows(access, 'agent_bridge.post', 'write')).toBe(false);
  });

  it('custom persisted .write suffix still authorizes the catalog action key', () => {
    const access = role('sales');
    access.grants = [
      { key: 'agent_bridge.approve.write', level: 'write' },
      { key: 'agent_bridge.post.write', level: 'write' },
    ];
    expect(allows(access, 'agent_bridge.approve', 'write')).toBe(true);
    expect(allows(access, 'agent_bridge.post', 'write')).toBe(true);
  });

  it('RBAC off keeps Owner/Admin write and Viewer/empty read-only', () => {
    expect(allows({ ...role('owner'), rbacEnforced: false }, 'agent_bridge.approve', 'write')).toBe(true);
    expect(allows({ ...role('admin'), rbacEnforced: false }, 'agent_bridge.post', 'write')).toBe(true);
    expect(allows({ ...role('viewer'), rbacEnforced: false }, 'agent_bridge.approve', 'write')).toBe(false);
    expect(
      allows(
        { ...role('viewer'), primaryTemplateKey: null, legacyRole: 'member', grants: [], rbacEnforced: false },
        'agent_bridge.post',
        'write',
      ),
    ).toBe(false);
  });

  it('purchase module ceiling denies AgentBridge write when purchase is off', () => {
    const access = { ...role('owner'), modules: { purchase: false, sales: true } };
    expect(allows(access, 'agent_bridge.approve', 'write')).toBe(false);
    expect(allows(access, 'purchase.bills.write', 'write')).toBe(false);
    expect(allows(access, 'accounting.accounts.write', 'write')).toBe(true);
  });

  it('does not grant unknown keys', () => {
    const access = role('owner');
    expect(isActionPermissionKey('agent_bridge.hack')).toBe(false);
    expect(permissionGrantAliases('agent_bridge.hack')).toEqual(['agent_bridge.hack']);
    expect(allows(access, 'agent_bridge.hack', 'write')).toBe(false);
    expect(canonicalPermissionKey('agent_bridge.approve.write')).toBe('agent_bridge.approve');
    expect(canonicalPermissionKey('purchase.bills.write')).toBe('purchase.bills.write');
  });

  it('job matrix persists exact action keys and reads the .write alias', () => {
    const grants = persistedGrantsFromJobForm((name) => {
      if (name === 'perm_purchase.inbox') return 'write';
      if (name === 'perm_agent_bridge.approve') return 'write';
      if (name === 'perm_agent_bridge.post') return 'write';
      return 'none';
    });
    expect(grants).toEqual(
      expect.arrayContaining([
        { key: 'purchase.inbox.write', level: 'write' },
        { key: 'agent_bridge.approve', level: 'write' },
        { key: 'agent_bridge.post', level: 'write' },
      ]),
    );
    expect(grants.some((g) => g.key === 'agent_bridge.approve.write')).toBe(false);
    const saved = new Set(grants.map((g) => g.key));
    expect(actionPermissionLevel(saved, 'agent_bridge.approve')).toBe('write');
    expect(actionPermissionLevel(new Set(['agent_bridge.post.write']), 'agent_bridge.post')).toBe('write');
    expect(actionPermissionLevel(new Set(), 'agent_bridge.approve')).toBe('none');
    expect(ACTION_PERMISSIONS.map((a) => a.key)).toEqual([
      'agent_bridge.approve',
      'agent_bridge.post',
      'agent_bridge.commerce_read',
      'agent_bridge.commerce_propose',
      // Print designs (v2.26.0): assistants read and save drafts; approve/use/delete stay human.
      'agent_bridge.design_read',
      'agent_bridge.design_write',
    ]);
  });
});
