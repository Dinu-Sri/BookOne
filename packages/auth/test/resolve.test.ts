import { describe, expect, it } from 'vitest';
import { canViewModule } from '../src/permissions/ceiling';
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

  it('admin still has financial writes when rbac is off', () => {
    const admin = input({ primaryTemplateKey: 'admin', rbacEnforced: false });
    expect(allows(admin, 'sales.invoices.write', 'write')).toBe(true);
    expect(allows(admin, 'parties.customers.write', 'write')).toBe(true);
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

describe('module-off historical reads (BUG-0043)', () => {
  const salesOff = { ...modules, sales: false };

  it('Owner can open existing invoices when Sales is off and cannot create or pay', () => {
    const owner = input({ primaryTemplateKey: 'owner', modules: salesOff });
    expect(canViewModule('company', owner.modules, 'sales')).toBe(false);
    expect(allows(owner, 'sales.invoices.read', 'read')).toBe(true);
    expect(allows(owner, 'sales.invoices.write', 'write')).toBe(false);
    expect(allows(owner, 'sales.payments.write', 'write')).toBe(false);
    expect(allows(owner, 'accounting.reports.read', 'read')).toBe(true);
  });

  it('Viewer can read historical invoices when Sales is off and cannot write', () => {
    const viewer = input({ primaryTemplateKey: 'viewer', modules: salesOff });
    expect(allows(viewer, 'sales.invoices.read', 'read')).toBe(true);
    expect(allows(viewer, 'sales.invoices.write', 'write')).toBe(false);
    expect(allows(viewer, 'sales.payments.write', 'write')).toBe(false);
  });

  it('Warehouse cannot read invoices when Sales is off', () => {
    const warehouse = input({ primaryTemplateKey: 'warehouse', modules: salesOff });
    expect(allows(warehouse, 'sales.invoices.read', 'read')).toBe(false);
    expect(allows(warehouse, 'sales.invoices.write', 'write')).toBe(false);
    expect(allows(warehouse, 'inventory.transfers.read', 'read')).toBe(true);
  });

  it('Sales job cannot create invoices when Sales is off and can still read them', () => {
    const sales = input({ primaryTemplateKey: 'sales', modules: salesOff });
    expect(allows(sales, 'sales.invoices.read', 'read')).toBe(true);
    expect(allows(sales, 'sales.invoices.write', 'write')).toBe(false);
    expect(allows(sales, 'sales.payments.write', 'write')).toBe(false);
  });

  it('Cashier cannot receive payment when Sales is off and can still read invoices', () => {
    const cashier = input({ primaryTemplateKey: 'cashier', modules: salesOff });
    expect(allows(cashier, 'sales.invoices.read', 'read')).toBe(true);
    expect(allows(cashier, 'sales.invoices.write', 'write')).toBe(false);
    expect(allows(cashier, 'sales.payments.write', 'write')).toBe(false);
  });

  it('explicit deny still blocks historical invoice read', () => {
    const owner = input({
      primaryTemplateKey: 'owner',
      modules: salesOff,
      overrides: [{ key: 'sales.invoices.read', effect: 'deny' }],
    });
    expect(allows(owner, 'sales.invoices.read', 'read')).toBe(false);
  });

  it('personal entity cannot read sales invoices', () => {
    const owner = input({
      primaryTemplateKey: 'owner',
      entityKind: 'personal',
      modules: { ...modules, sales: true },
    });
    expect(allows(owner, 'sales.invoices.read', 'read')).toBe(false);
    expect(allows(owner, 'sales.invoices.write', 'write')).toBe(false);
  });

  it('Owner can read purchase, inventory, POS and rental history when those modules are off', () => {
    const owner = input({
      primaryTemplateKey: 'owner',
      modules: { ...modules, purchase: false, inventory: false, pos: false, rental: false },
    });
    expect(allows(owner, 'purchase.bills.read', 'read')).toBe(true);
    expect(allows(owner, 'purchase.bills.write', 'write')).toBe(false);
    expect(allows(owner, 'inventory.transfers.read', 'read')).toBe(true);
    expect(allows(owner, 'inventory.transfers.write', 'write')).toBe(false);
    expect(allows(owner, 'pos.history.read', 'read')).toBe(true);
    expect(allows(owner, 'pos.terminal.write', 'write')).toBe(false);
    expect(allows(owner, 'rental.dispatch.read', 'read')).toBe(true);
    expect(allows(owner, 'rental.dispatch.write', 'write')).toBe(false);
  });
});
