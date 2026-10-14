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
  ARCHIVE_RESTORE_INSERT_ORDER,
} from '../../db/src/archive/format';
import {
  invoiceTotalsFromTables,
  journalsAreBalanced,
  parseArchiveEnvelope,
  remapArchiveTables,
  stockOnHandFromTables,
  trialBalanceHashFromTables,
  validateDataEnvelope,
} from '../../db/src/archive/remap';
import {
  applyArchiveObjects,
  assertFilesPackMatchesDataRestore,
  filesManifestChecksum,
  parsePackedObjects,
  validateFilesEnvelope,
  type ArchiveObjectStore,
} from '../../db/src/archive/files';
import { rewriteTenantPrefix } from '../../db/src/archive/format';
import { ARCHIVE_TRANSFORMERS, transformArchiveToCurrent } from '../../db/src/archive/transform';
import { keepNavItem } from '../../../apps/web/src/lib/nav-visibility';
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

describe('archive restore remap', () => {
  const sourceTenant = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const targetTenant = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const restorer = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const ownerUser = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const extraUser = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const ownerMembership = '11111111-1111-1111-1111-111111111111';
  const extraMembership = '22222222-2222-2222-2222-222222222222';
  const txnId = '33333333-3333-3333-3333-333333333333';
  const entryId = '44444444-4444-4444-4444-444444444444';
  const cashId = '55555555-5555-5555-5555-555555555555';
  const debitId = '77777777-7777-7777-7777-777777777777';
  const creditId = '88888888-8888-8888-8888-888888888888';

  it('remaps tenant and owner, skips extra memberships, and rewrites storage keys', () => {
    const { tables } = remapArchiveTables({
      sourceTenantId: sourceTenant,
      targetTenantId: targetTenant,
      restorerUserId: restorer,
      tables: {
        tenant_memberships: [
          { id: ownerMembership, tenantId: sourceTenant, userId: ownerUser, role: 'owner', voidedAt: null },
          { id: extraMembership, tenantId: sourceTenant, userId: extraUser, role: 'viewer', voidedAt: null },
        ],
        tenant_membership_roles: [
          { id: '99999999-9999-9999-9999-999999999999', tenantId: sourceTenant, membershipId: extraMembership },
        ],
        transactions: [
          {
            id: txnId,
            tenantId: sourceTenant,
            userId: extraUser,
            receiptRef: `tenants/${sourceTenant}/receipts/${extraUser}/scan.png`,
          },
        ],
      },
    });
    expect(tables.tenant_memberships).toHaveLength(1);
    expect(tables.tenant_memberships[0]?.userId).toBe(restorer);
    expect(tables.tenant_memberships[0]?.tenantId).toBe(targetTenant);
    expect(tables.tenant_membership_roles).toHaveLength(0);
    expect(tables.transactions[0]?.tenantId).toBe(targetTenant);
    expect(tables.transactions[0]?.userId).toBe(restorer);
    expect(String(tables.transactions[0]?.receiptRef)).toBe(
      `tenants/${targetTenant}/receipts/${extraUser}/scan.png`,
    );
    expect(String(tables.transactions[0]?.receiptRef)).not.toContain(sourceTenant);
  });

  it('accepts balanced journals and rejects unbalanced ones', () => {
    const balanced = {
      journal_entries: [{ id: entryId }],
      journal_lines: [
        { id: debitId, journalEntryId: entryId, side: 'debit', amount: '100.00' },
        { id: creditId, journalEntryId: entryId, side: 'credit', amount: '100.00' },
      ],
    };
    expect(journalsAreBalanced(balanced).ok).toBe(true);
    expect(
      journalsAreBalanced({
        ...balanced,
        journal_lines: [{ id: debitId, journalEntryId: entryId, side: 'debit', amount: '100.00' }],
      }).ok,
    ).toBe(false);
  });

  it('insert order is every dump table except tenants', () => {
    const dump = new Set<string>(ARCHIVE_DATA_TABLE_NAMES);
    const insert = new Set<string>(ARCHIVE_RESTORE_INSERT_ORDER);
    expect(insert.has('tenants')).toBe(false);
    expect(dump.has('tenants')).toBe(true);
    expect(insert.size).toBe(dump.size - 1);
    for (const name of insert) expect(dump.has(name)).toBe(true);
  });

  it('rejects a files pack and a tampered checksum', () => {
    const tables = { accounts: [{ id: cashId, code: '1000' }] };
    const envelope = {
      format: ARCHIVE_FORMAT,
      kind: 'data' as const,
      manifest: {
        format: ARCHIVE_FORMAT,
        exportId: sourceTenant,
        schemaVersion: ARCHIVE_SCHEMA_VERSION,
        appVersion: '2.4.0',
        appCommit: 'dev',
        exportedAt: new Date().toISOString(),
        sourceTenantId: sourceTenant,
        sourceName: 'Garden',
        sourceSlug: 'garden',
        kind: 'data' as const,
        dataSha256: sha256Hex(JSON.stringify(tables)),
        filesSha256: 'abc',
        fileCount: 0,
        rowCounts: { accounts: 1 },
        integrity: { trialBalanceHash: '' },
      },
      tables,
      objects: [],
    };
    expect(() => validateDataEnvelope(envelope)).not.toThrow();
    expect(() => validateDataEnvelope({ ...envelope, kind: 'files' })).toThrow(/data file/i);
    expect(() =>
      validateDataEnvelope({
        ...envelope,
        manifest: { ...envelope.manifest, dataSha256: '0'.repeat(64) },
      }),
    ).toThrow(/damaged/i);
    expect(parseArchiveEnvelope(JSON.stringify(envelope)).kind).toBe('data');
  });
});

describe('archive files pack', () => {
  const sourceTenant = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const targetTenant = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const extraUser = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const exportId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

  function memoryStore(seed?: Record<string, Buffer>): ArchiveObjectStore & { map: Map<string, Buffer> } {
    const map = new Map<string, Buffer>(Object.entries(seed ?? {}));
    return {
      map,
      async exists(key) {
        return map.has(key);
      },
      async put(key, body) {
        map.set(key, body);
      },
    };
  }

  it('rewrites only the tenant prefix on storage keys', () => {
    const key = `tenants/${sourceTenant}/receipts/${extraUser}/scan.png`;
    expect(rewriteTenantPrefix(key, sourceTenant, targetTenant)).toBe(
      `tenants/${targetTenant}/receipts/${extraUser}/scan.png`,
    );
  });

  it('validates a files envelope, rejects a data file, and applies blobs once', async () => {
    const body = Buffer.from('png-bytes');
    const objects = [
      {
        key: `tenants/${sourceTenant}/receipts/${extraUser}/scan.png`,
        contentType: 'image/png',
        sha256: sha256Hex(body),
        size: body.length,
        bodyBase64: body.toString('base64'),
      },
    ];
    const envelope = {
      format: ARCHIVE_FORMAT,
      kind: 'files' as const,
      manifest: {
        format: ARCHIVE_FORMAT,
        exportId,
        schemaVersion: ARCHIVE_SCHEMA_VERSION,
        appVersion: '2.5.0',
        appCommit: 'dev',
        exportedAt: new Date().toISOString(),
        sourceTenantId: sourceTenant,
        sourceName: 'Garden',
        sourceSlug: 'garden',
        kind: 'files' as const,
        dataSha256: 'abc',
        filesSha256: filesManifestChecksum(objects),
        fileCount: 1,
        rowCounts: {},
        integrity: { trialBalanceHash: '' },
      },
      tables: {},
      objects,
    };
    expect(() => validateFilesEnvelope(envelope)).not.toThrow();
    expect(() => validateFilesEnvelope({ ...envelope, kind: 'data' })).toThrow(/attachments pack/i);
    expect(parsePackedObjects(envelope.objects)).toHaveLength(1);

    const store = memoryStore();
    const first = await applyArchiveObjects({
      targetTenantId: targetTenant,
      sourceTenantId: sourceTenant,
      objects,
      store,
    });
    expect(first.applied).toBe(1);
    expect(store.map.has(`tenants/${targetTenant}/receipts/${extraUser}/scan.png`)).toBe(true);

    const second = await applyArchiveObjects({
      targetTenantId: targetTenant,
      sourceTenantId: sourceTenant,
      objects,
      store,
    });
    expect(second.applied).toBe(0);
    expect(second.skippedExisting).toBe(1);
  });

  it('pairs files pack to the restored exportId', () => {
    expect(() =>
      assertFilesPackMatchesDataRestore({
        packExportId: exportId,
        packFilesSha256: 'aaa',
        lastRestore: null,
        filesAlreadyApplied: false,
      }),
    ).toThrow(/data file first/i);
    expect(() =>
      assertFilesPackMatchesDataRestore({
        packExportId: exportId,
        packFilesSha256: 'aaa',
        lastRestore: { exportId: sourceTenant, filesSha256: 'aaa' },
        filesAlreadyApplied: false,
      }),
    ).toThrow(/does not match/i);
    expect(() =>
      assertFilesPackMatchesDataRestore({
        packExportId: exportId,
        packFilesSha256: 'bbb',
        lastRestore: { exportId, filesSha256: 'aaa' },
        filesAlreadyApplied: false,
      }),
    ).toThrow(/does not match/i);
    expect(() =>
      assertFilesPackMatchesDataRestore({
        packExportId: exportId,
        packFilesSha256: 'aaa',
        lastRestore: { exportId, filesSha256: 'aaa' },
        filesAlreadyApplied: true,
      }),
    ).toThrow(/already applied/i);
    expect(() =>
      assertFilesPackMatchesDataRestore({
        packExportId: exportId,
        packFilesSha256: 'aaa',
        lastRestore: { exportId, filesSha256: 'aaa' },
        filesAlreadyApplied: false,
      }),
    ).not.toThrow();
  });
});

describe('archive schema transformers and golden restore', () => {
  const sourceTenant = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const targetTenant = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const restorer = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const ownerUser = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const extraUser = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const cashId = '55555555-5555-5555-5555-555555555555';
  const revenueId = '66666666-6666-6666-6666-666666666666';
  const entryId = '44444444-4444-4444-4444-444444444444';
  const debitId = '77777777-7777-7777-7777-777777777777';
  const creditId = '88888888-8888-8888-8888-888888888888';
  const invoiceId = '99999999-9999-9999-9999-999999999999';
  const productId = '12121212-1212-1212-1212-121212121212';
  const levelId = '13131313-1313-1313-1313-131313131313';

  it('is a no-op at schema version 1 and refuses unknown windows', () => {
    expect(ARCHIVE_TRANSFORMERS).toEqual([]);
    const envelope = {
      format: ARCHIVE_FORMAT,
      kind: 'data' as const,
      manifest: {
        format: ARCHIVE_FORMAT,
        exportId: sourceTenant,
        schemaVersion: ARCHIVE_SCHEMA_VERSION,
        appVersion: '2.5.0',
        appCommit: 'dev',
        exportedAt: new Date().toISOString(),
        sourceTenantId: sourceTenant,
        sourceName: 'Garden',
        sourceSlug: 'garden',
        kind: 'data' as const,
        dataSha256: 'x',
        filesSha256: 'y',
        fileCount: 0,
        rowCounts: {},
        integrity: { trialBalanceHash: '' },
      },
      tables: {},
      objects: [],
    };
    expect(transformArchiveToCurrent(envelope)).toBe(envelope);
    expect(() =>
      transformArchiveToCurrent({
        ...envelope,
        manifest: { ...envelope.manifest, schemaVersion: ARCHIVE_SCHEMA_VERSION + 1 },
      }),
    ).toThrow(/newer BookOne/i);
    expect(() =>
      transformArchiveToCurrent({
        ...envelope,
        manifest: { ...envelope.manifest, schemaVersion: 0 },
      }),
    ).toThrow(/not a BookOne archive/i);
  });

  it('golden: trial balance, invoice totals, stock on hand, receipt key remapped', () => {
    const tables = {
      tenant_memberships: [
        { id: '11111111-1111-1111-1111-111111111111', tenantId: sourceTenant, userId: ownerUser, role: 'owner', voidedAt: null },
      ],
      accounts: [
        { id: cashId, tenantId: sourceTenant, code: '1000', voidedAt: null },
        { id: revenueId, tenantId: sourceTenant, code: '4000', voidedAt: null },
      ],
      journal_entries: [{ id: entryId, tenantId: sourceTenant }],
      journal_lines: [
        { id: debitId, tenantId: sourceTenant, journalEntryId: entryId, accountId: cashId, side: 'debit', amount: '250.00', voidedAt: null },
        { id: creditId, tenantId: sourceTenant, journalEntryId: entryId, accountId: revenueId, side: 'credit', amount: '250.00', voidedAt: null },
      ],
      business_documents: [
        {
          id: invoiceId,
          tenantId: sourceTenant,
          documentType: 'sales_invoice',
          total: '250.00',
          voidedAt: null,
        },
      ],
      inventory_stock_levels: [{ id: levelId, tenantId: sourceTenant, productId, qtyOnHand: '4.0000' }],
      transactions: [
        {
          id: '33333333-3333-3333-3333-333333333333',
          tenantId: sourceTenant,
          userId: extraUser,
          receiptRef: `tenants/${sourceTenant}/receipts/${extraUser}/scan.png`,
        },
      ],
    };
    expect(journalsAreBalanced(tables).ok).toBe(true);
    const tb = trialBalanceHashFromTables(tables);
    expect(tb).toBe(trialBalanceHashFromTables(tables));
    expect(invoiceTotalsFromTables(tables)).toEqual({ count: 1, total: 250 });
    expect(stockOnHandFromTables(tables)).toBe(4);

    const { tables: remapped } = remapArchiveTables({
      tables,
      sourceTenantId: sourceTenant,
      targetTenantId: targetTenant,
      restorerUserId: restorer,
    });
    expect(invoiceTotalsFromTables(remapped)).toEqual({ count: 1, total: 250 });
    expect(stockOnHandFromTables(remapped)).toBe(4);
    expect(trialBalanceHashFromTables(remapped)).toBe(tb);
    expect(String(remapped.transactions[0]?.receiptRef)).toBe(
      `tenants/${targetTenant}/receipts/${extraUser}/scan.png`,
    );
  });
});

describe('control room nav visibility', () => {
  const access = { Overview: 'none' as const, Dashboard: 'write' as const };

  it('keeps Control Room children for platform super_admin', () => {
    expect(
      keepNavItem({
        label: 'Overview',
        href: '/control-room',
        accessByLabel: access,
        suiteSuperAdminOnly: true,
        isSuperAdmin: true,
      }),
    ).toBe(true);
    expect(
      keepNavItem({
        label: 'Companies',
        href: '/control-room/companies',
        accessByLabel: access,
        suiteSuperAdminOnly: true,
        isSuperAdmin: true,
      }),
    ).toBe(true);
  });

  it('hides unknown labels for a company Admin job', () => {
    expect(
      keepNavItem({
        label: 'Overview',
        href: '/control-room',
        accessByLabel: access,
        suiteSuperAdminOnly: true,
        isSuperAdmin: false,
      }),
    ).toBe(false);
    expect(
      keepNavItem({
        label: 'Dashboard',
        href: '/dashboard',
        accessByLabel: access,
        isSuperAdmin: false,
      }),
    ).toBe(true);
  });
});
