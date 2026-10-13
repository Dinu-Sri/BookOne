import { describe, expect, it } from 'vitest';
import { decryptArchivePayload, encryptArchivePayload, sha256Hex } from '../../db/src/archive/crypto';
import {
  ARCHIVE_FORMAT,
  ARCHIVE_SCHEMA_VERSION,
  isArchiveObjectKey,
  isOperationallyEmpty,
  TRADING_COUNT_KEYS,
} from '../../db/src/archive/format';
import {
  ARCHIVE_DATA_TABLE_NAMES,
  ARCHIVE_EXCLUDED_TABLES,
} from '../../db/src/archive/format';
import { allows, type ResolveInput } from '../src/permissions/resolve';
import { templateByKey } from '../src/permissions/templates';

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

describe('archive crypto', () => {
  it('round-trips gzip JSON with the owner password', () => {
    const payload = JSON.stringify({ format: ARCHIVE_FORMAT, hello: 'Garden Banquet' });
    const file = encryptArchivePayload(payload, 'correct horse');
    expect(file.subarray(0, 5).toString()).toBe('B1AR1');
    expect(decryptArchivePayload(file, 'correct horse')).toBe(payload);
  });

  it('rejects the wrong password', () => {
    const file = encryptArchivePayload('{"ok":true}', 'one-password');
    expect(() => decryptArchivePayload(file, 'other-password')).toThrow();
  });

  it('hashes content stably', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex(Buffer.from('abc')));
  });
});

describe('empty tenant helper', () => {
  it('is empty only when every trading table is zero', () => {
    const zeros = Object.fromEntries(TRADING_COUNT_KEYS.map((k) => [k, 0]));
    expect(isOperationallyEmpty(zeros)).toBe(true);
    expect(isOperationallyEmpty({ ...zeros, parties: 1 })).toBe(false);
    expect(isOperationallyEmpty({ ...zeros, business_documents: 2 })).toBe(false);
  });
});

describe('archive table whitelist', () => {
  it('does not dump users, ops, platform audit, or invite tokens', () => {
    for (const blocked of ARCHIVE_EXCLUDED_TABLES) {
      expect(ARCHIVE_DATA_TABLE_NAMES as readonly string[]).not.toContain(blocked);
    }
    expect(ARCHIVE_DATA_TABLE_NAMES).toContain('business_documents');
    expect(ARCHIVE_DATA_TABLE_NAMES).toContain('journal_lines');
    expect(ARCHIVE_DATA_TABLE_NAMES).toContain('inventory_products');
  });

  it('keeps prepared archives out of the files pack prefix', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    expect(isArchiveObjectKey(tenantId, `tenants/${tenantId}/_archive/latest.json`)).toBe(true);
    expect(isArchiveObjectKey(tenantId, `tenants/${tenantId}/receipts/x`)).toBe(false);
  });

  it('starts at schema version 1', () => {
    expect(ARCHIVE_SCHEMA_VERSION).toBe(1);
  });
});

describe('company.backup permission', () => {
  it('lets the owner export and denies Viewer and Admin', () => {
    expect(allows(input({ primaryTemplateKey: 'owner' }), 'company.backup.write', 'write')).toBe(true);
    expect(allows(input({ primaryTemplateKey: 'owner' }), 'company.backup.read', 'read')).toBe(true);
    expect(allows(input({ primaryTemplateKey: 'viewer' }), 'company.backup.write', 'write')).toBe(false);
    expect(allows(input({ primaryTemplateKey: 'admin' }), 'company.backup.write', 'write')).toBe(false);
    expect(allows(input({ primaryTemplateKey: 'admin' }), 'company.backup.read', 'read')).toBe(false);
  });
});
