# Tenant portable archive (company backup)

> **Status:** Phases 1–5 shipped (v2.5.0).  
> **Last updated:** 2026-10-14  
> **Change records:** [CHG-20261012-tenant-backup-archive](changes/CHG-20261012-tenant-backup-archive.md) (spec), [CHG-20261013-tenant-archive-export](changes/CHG-20261013-tenant-archive-export.md) (export), [CHG-20261013-tenant-archive-restore](changes/CHG-20261013-tenant-archive-restore.md) (data restore), [CHG-20261014-tenant-archive-files](changes/CHG-20261014-tenant-archive-files.md) (files pack, transformers, reminder).  
> **Audience:** company **primary owner** (download + restore). Platform operators still run whole-stack DR separately.

This document is the contract. UI and code follow it. Do not restore into a company that has already traded. Do not put invoice/journal rows in the files pack.

---

## 1. Two backup jobs

| Job | Who | What | Recovers from |
|-----|-----|------|----------------|
| **Platform DR** | Operator | `pg_dump` / PITR + MinIO/R2 replica, off-site | VPS, disk, or bucket loss for **all** tenants |
| **Tenant archive** | Company owner | Two encrypted files they keep | Their company on a **new empty tenant**, including after BookOne is gone **if they have a recent copy** |

The owner archive does not replace platform DR. Most owners will not download regularly until scheduled export exists. Off-site Postgres + MinIO remains the real “main DB destroyed” path.

---

## 2. Product behaviour

**Export (owner, current company)**  
Download two paired files for **this** tenant only (RLS). No other tenants, no platform audit, no ops logs, no auth password hashes.

**Restore (owner, target company)**  
Allowed only when the target tenant is **operationally empty**. Data file is required. Files pack is the same `exportId` and may arrive later. Restore **replaces** signup seed (chart of accounts, default jobs) with the archive. No merge. No overwrite of a live company.

---

## 3. Empty tenant (restore gate)

Signup already writes install seed: tenant row, owner membership, default jobs, starter chart of accounts, settings shells. Those do **not** count as trading history.

The target is empty when **all** of these are zero (non-voided):

- `parties`
- `transactions`
- `journal_entries` / `journal_lines`
- `business_documents` / `business_document_lines`
- `inventory_products`, `inventory_stock_docs`, `inventory_movements`
- `settlement_allocations`
- payments / POS shifts (when those tables are present)
- `bank_statement_imports` and recon sessions
- `rental_events`

If any count is non-zero, refuse: “This company already has records. Create a new company and restore into that.”

After a passing data restore, the tenant is no longer empty. A second data restore is refused. A matching files pack may still be applied (see §6).

---

## 4. Two-file format

One export produces two downloads that share `exportId`, `schemaVersion`, and each other’s checksum.

| File | Extension | Contents |
|------|-----------|----------|
| **Data** | `{slug}-{date}.bookone-data` | `manifest.json` + logical snapshot of **all tenant DB rows** needed to rebuild the books |
| **Files** | `{slug}-{date}.bookone-files` | `manifest.json` + MinIO/S3 blobs for that tenant |

### Data file includes

Chart of accounts, company/tax/profile/settings, brands, locations, jobs/memberships **as data** (see §7 for login), parties, products, **sales/purchase document headers and lines**, journals and lines, stock docs/movements/cost layers, discounts, sequences, bank import **metadata and line rows**, recon cases, rental bookings/events, POS registers/shifts, document styles (including `logoImageKey` as a **pointer**), `receiptRef` / `imageKey` / `storageKey` **pointers**.

Invoice, bill, and order **records** live here. They are Postgres, not S3.

### Files pack includes

Objects under the tenant prefix, including:

- `tenants/{tenantId}/receipts/…`
- `tenants/{tenantId}/products/…`
- `tenants/{tenantId}/styles/…`
- `tenants/{tenantId}/rental-returns/…`
- bank-import objects referenced by `storage_key`

On restore, rewrite the prefix to the **new** tenant id and rewrite DB pointers with the UUID map from the data restore.

### Pairing

Both manifests carry:

```json
{
  "format": "bookone.tenant-archive",
  "exportId": "uuid",
  "schemaVersion": 1,
  "appCommit": "git sha at export",
  "exportedAt": "ISO-8601",
  "sourceTenantId": "uuid (informational; never reused as PK)",
  "sourceName": "Garden Banquet",
  "dataSha256": "…",
  "filesSha256": "…",
  "fileCount": 0,
  "rowCounts": {},
  "integrity": { "trialBalanceHash": "…" }
}
```

Restore of a files pack is rejected unless `exportId` matches the data already applied to that tenant and checksums match.

Encryption: both files password-protected by the owner at download. BookOne does not store that password.

**Container (phase 1):** magic `B1AR1` + 16-byte salt + 12-byte IV + AES-256-GCM ciphertext + 16-byte tag. Key is scrypt (N=16384, r=8, p=1) of the owner password. Inner payload is gzip JSON `{ format, kind, manifest, tables, objects }`. `dataSha256` hashes the tables object; `filesSha256` hashes `{key, sha256, size}` for packed objects. Prepared blobs live under `tenants/{tenantId}/_archive/` (excluded from the files pack) or in process memory for 15 minutes if S3 is unset.

**UI:** Company → Backup. Owner creates a pair with a password, then downloads both files. Restore of the **data** file is enabled only when this company is operationally empty. After a passing data restore, the matching **files** pack may be uploaded (chunked when larger than 8 MB). Viewer and Admin are denied. Rate limit: one prepare per two minutes per company. The page reminds the owner if no backup exists or the last export is older than 30 days. Prepared files stay on the download list for 15 minutes.

---

## 5. Schema evolution

`schemaVersion` is an integer. Bump it when the **archive shape** changes (often aligned with the latest additive migration).

- Restore **refused** if `schemaVersion` > running app.
- Restore **allowed** if `schemaVersion` ≤ running app after running archive transformers `vN → vN+1 → … → current`.
- Additive SQL columns with defaults need no transformer.
- A breaking change (rename, split table, JSON shape) ships an **archive transformer in the same PR as the migration**.
- Keep transformers for a published window (target: last 12 months or last 20 versions). Older files: refuse with “this backup needs BookOne from {date}”.

CI (when restore exists): golden export at version N, restore on N+1, assert trial balance, invoice totals, stock on hand, one receipt key remapped.

---

## 6. Restore sequence

1. Owner is in a **new** company that passes the empty gate.  
2. Upload **data** file. Decrypt, verify checksum, run transformers, **UUID-remap** every PK/FK into the new tenant, insert in FK order, replace seed CoA/jobs, recompute document sequences, run integrity (journals balanced, stock vs layers, AR/AP vs documents). On failure, roll back; tenant stays empty.  
3. Upload **files** pack (same `exportId`), immediately or later. Copy blobs to `tenants/{newId}/…`. Fill only pointers that still point at missing objects.  
4. If files are absent, the company opens; attachments show as missing until the matching pack is uploaded.

Lock the tenant for the data import. One in-flight restore per tenant. Files pack for an `exportId` applies at most once.

**Login:** the person who restores becomes owner of the new tenant (existing Better Auth user). The archive does not recreate other users’ passwords. Teammates are invited again after restore. Membership rows in the data file may restore **jobs/permissions templates** for the owner; extra user accounts are skipped or created as invite-only (implementation: skip extra auth users in v1).

---

## 7. Security and limits

- Owner-only (primary owner / `company` owner job). Super-admin may export a tenant from Control Room later; v1 is self-serve owner.  
- Export runs inside `withTenantContext`.  
- Rate-limit downloads. Audit `tenant.archive.export` / `tenant.archive.restore` (tenant audit log).  
- Stream / chunk the files pack. Do not rely on a single POST through Traefik/Cloudflare for multi-hundred-MB zips.  
- Never write old `tenant_id` values into the new company.

---

## 8. Non-goals (v1)

- Overwrite or merge into a company that has journals/documents.  
- Customer-held SQL `pg_dump`.  
- Restoring Better Auth passwords for the whole team.  
- Using the owner archive as the only disaster-recovery plan.  
- Cross-downgrade (newer archive into older app).

---

## 9. Implementation order

| Phase | Deliverable |
|-------|-------------|
| **0** | This document + change record (done when committed). |
| **1** | Export: empty-check helper, data snapshot, files listing, paired encrypted downloads. No restore yet. **Shipped in v2.3.0.** |
| **2** | Restore **data** into empty tenant + integrity + rollback. **Shipped in v2.4.0.** |
| **3** | Restore **files** pack (chunked), pointer rewrite, “missing attachment” UI. **Shipped in v2.5.0.** |
| **4** | `schemaVersion` transformers + CI golden restore. **Shipped in v2.5.0** (identity pipeline at v1; golden unit tests). |
| **5** | Scheduled reminder / optional copy to the owner’s download list. **Shipped in v2.5.0** (in-app 30-day reminder + 15-minute prepared download list). |

Platform off-site `pg_dump` + MinIO replica is operator work in parallel (already described in `DEPLOYMENT_WORKFLOW.md`). Confirm it is actually running on the VPS; that is independent of this feature.

---

## 10. UI sketch (after phase 1)

**Company → Backup** (owner):

- Download company data  
- Download attachments (files pack)  
- Restore into **this** company (data file + password; enabled only when empty)
- Restore attachments (matching `.bookone-files`; after data restore)
- 30-day reminder when no backup exists or the last export is old

Copy on restore: “Only a new company with no invoices, journals, or stock can be restored. This replaces the starter chart of accounts.”
