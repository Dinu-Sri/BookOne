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
