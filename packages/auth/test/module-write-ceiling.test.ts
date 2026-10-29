import { describe, expect, it } from 'vitest';
import { canWriteModule } from '../src/permissions/ceiling';
import { templateByKey } from '../src/permissions/templates';
import { allows, type ResolveInput } from '../src/permissions/resolve';

const modulesOn = {
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
    modules: modulesOn,
    ...over,
  };
}

describe('inventory product-write ceiling', () => {
  it('sole lite cannot write inventory even when the module flag is on', () => {
    expect(canWriteModule('sole_prop', 'lite', modulesOn, 'inventory')).toBe(false);
  });

  it('sole full can write inventory when the module is on', () => {
    expect(canWriteModule('sole_prop', 'full', modulesOn, 'inventory')).toBe(true);
  });

  it('company with inventory off cannot write inventory', () => {
    expect(canWriteModule('company', 'full', { ...modulesOn, inventory: false }, 'inventory')).toBe(false);
  });

  it('viewer job cannot write inventory products', () => {
    expect(allows(input({ primaryTemplateKey: 'viewer' }), 'inventory.products.write', 'write')).toBe(false);
  });

  it('owner job can write inventory products when the module is on', () => {
    expect(allows(input({ primaryTemplateKey: 'owner' }), 'inventory.products.write', 'write')).toBe(true);
  });
});

describe('rental module contract', () => {
  it('starter company owner cannot write inventory products or rental dispatch', () => {
    const owner = input({
      primaryTemplateKey: 'owner',
      modules: { sales: true, purchase: true, inventory: false, pos: false, rental: false },
    });
    expect(allows(owner, 'inventory.products.write', 'write')).toBe(false);
    expect(allows(owner, 'rental.dispatch.write', 'write')).toBe(false);
    expect(allows(owner, 'rental.calendar.write', 'write')).toBe(false);
    expect(allows(owner, 'inventory.products.read', 'read')).toBe(true);
    expect(allows(owner, 'rental.dispatch.read', 'read')).toBe(true);
  });

  it('company with inventory and rental on lets owner write catalogue and dispatch', () => {
    const owner = input({ primaryTemplateKey: 'owner' });
    expect(allows(owner, 'inventory.products.write', 'write')).toBe(true);
    expect(allows(owner, 'rental.dispatch.write', 'write')).toBe(true);
    expect(allows(owner, 'rental.calendar.write', 'write')).toBe(true);
  });

  it('rental catalogue create is inventory.products.write; dispatch is rental.dispatch.write', () => {
    const warehouse = input({ primaryTemplateKey: 'warehouse' });
    expect(allows(warehouse, 'inventory.products.write', 'write')).toBe(true);
    expect(allows(warehouse, 'rental.dispatch.write', 'write')).toBe(true);
    expect(allows(warehouse, 'rental.calendar.write', 'write')).toBe(false);
  });
});

describe('financial audit journal-read gate', () => {
  it('owner accountant and viewer can read journal; cashier cannot', () => {
    expect(allows(input({ primaryTemplateKey: 'owner' }), 'accounting.journal.read', 'read')).toBe(true);
    expect(allows(input({ primaryTemplateKey: 'accountant' }), 'accounting.journal.read', 'read')).toBe(
      true,
    );
    expect(allows(input({ primaryTemplateKey: 'viewer' }), 'accounting.journal.read', 'read')).toBe(true);
    expect(allows(input({ primaryTemplateKey: 'cashier' }), 'accounting.journal.read', 'read')).toBe(false);
    expect(allows(input({ primaryTemplateKey: 'viewer' }), 'team.people.read', 'read')).toBe(false);
  });
});
