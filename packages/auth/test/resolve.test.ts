import { describe, expect, it } from 'vitest';
import { templateByKey } from '../src/permissions/templates';
import { allows, type ResolveInput } from '../src/permissions/resolve';

const modules = {
  sales: true,
  purchase: true,
  inventory: true,
  pos: true,
  rental: true,
};

function input(over: Partial<ResolveInput> = {}): ResolveInput {
  const templateKey = over.primaryTemplateKey ?? 'viewer';
  const tmpl = templateByKey(templateKey);
  const grants =
    over.grants ??
    (tmpl?.grants ?? []).map((key) => ({
      key,
      level: (key.endsWith('.write') ? 'write' : 'read') as 'read' | 'write',
    }));
  return {
    platformRole: 'user',
    rbacEnforced: true,
    primaryTemplateKey: templateKey,
    extraTemplateKey: null,
    grants,
    overrides: [],
    entityKind: 'company',
    capabilityTier: 'full',
    modules,
    ...over,
  };
}

describe('Viewer job', () => {
  it('can read sales invoices and customers', () => {
    const viewer = input({ primaryTemplateKey: 'viewer' });
    expect(allows(viewer, 'sales.invoices.read', 'read')).toBe(true);
    expect(allows(viewer, 'parties.customers.read', 'read')).toBe(true);
  });

  it('cannot write invoices or customers', () => {
    const viewer = input({ primaryTemplateKey: 'viewer' });
    expect(allows(viewer, 'sales.invoices.write', 'write')).toBe(false);
    expect(allows(viewer, 'parties.customers.write', 'write')).toBe(false);
    expect(allows(viewer, 'parties.vendors.write', 'write')).toBe(false);
  });

  it('cannot write even when extra Sales grants or allow-overrides are present', () => {
    const sales = templateByKey('sales');
    const grants = (sales?.grants ?? []).map((key) => ({
      key,
      level: (key.endsWith('.write') ? 'write' : 'read') as 'read' | 'write',
    }));
    const viewer = input({
      primaryTemplateKey: 'viewer',
      extraTemplateKey: 'sales',
      grants,
      overrides: [{ key: 'sales.invoices.write', effect: 'allow' }],
    });
    expect(allows(viewer, 'sales.invoices.write', 'write')).toBe(false);
    expect(allows(viewer, 'parties.customers.write', 'write')).toBe(false);
    expect(allows(viewer, 'sales.invoices.read', 'read')).toBe(true);
  });

  it('cannot write when only jobSlug is viewer', () => {
    const viewer = input({ primaryTemplateKey: 'sales', jobSlug: 'viewer' });
    expect(allows(viewer, 'sales.invoices.write', 'write')).toBe(false);
  });
});

describe('fallback full access', () => {
  it('does not grant writes to Viewer when rbac is off', () => {
    const viewer = input({ primaryTemplateKey: 'viewer', rbacEnforced: false });
    expect(allows(viewer, 'sales.invoices.write', 'write')).toBe(false);
    expect(allows(viewer, 'parties.customers.write', 'write')).toBe(false);
  });

  it('does not treat empty or member as owner', () => {
    const empty = input({ primaryTemplateKey: null, legacyRole: 'member', rbacEnforced: false, grants: [] });
    expect(allows(empty, 'sales.invoices.write', 'write')).toBe(false);
    const member = input({ primaryTemplateKey: 'member', rbacEnforced: false, grants: [] });
    expect(allows(member, 'sales.invoices.write', 'write')).toBe(false);
  });

  it('owner still has writes when rbac is off', () => {
    const owner = input({ primaryTemplateKey: 'owner', rbacEnforced: false });
    expect(allows(owner, 'sales.invoices.write', 'write')).toBe(true);
    expect(allows(owner, 'parties.customers.write', 'write')).toBe(true);
  });
});

describe('Sales job', () => {
  it('can write customers and invoices', () => {
    const sales = input({ primaryTemplateKey: 'sales' });
    expect(allows(sales, 'sales.invoices.write', 'write')).toBe(true);
    expect(allows(sales, 'parties.customers.write', 'write')).toBe(true);
    expect(allows(sales, 'parties.vendors.write', 'write')).toBe(false);
  });
});
