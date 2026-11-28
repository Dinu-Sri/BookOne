# CoreGuard financial surface

Mirror of `packages/coreguard/src/surface.ts` (added in Step 3; [IMPLEMENTATION_GUIDE.md §6.5](IMPLEMENTATION_GUIDE.md)). A diff that touches any of these paths needs a "CoreGuard impact" section in its CHG (Rule Zero, CI-1). Removing an entry needs an owner-approved waiver (§4.7, §6.6).

```
packages/accounting/**              packages/ledger-core/**          packages/coreguard/**
packages/commerce/**                packages/agent-bridge/src/**     packages/db/migrations/**
packages/db/src/archive/**          scripts/init-db.ts               scripts/coreguard/**
docker/entrypoint.sh                apps/web/src/lib/post-balanced-journal.ts
packages/db/src/schema/{accounts,transactions,journal-entries,journal-lines,business-documents,settlement-allocations,
  party-advances,opening-balances,inventory,inventory-settings,reconciliation,sales-settings,purchase-settings,
  tenants,company-settings,parties}.ts
apps/web/src/app/actions/{record-entry,commercial-docs,documents,inventory,entity-lifecycle,rental-money,rental-bookings,
  advances,opening-balances,bank-reconciliation,reconciliation,statement-import,bank-import-studio,financial-statements,
  workspace,dashboard,cashbook,cashbook-banks,chart-of-accounts,accounts,parties,pos-session,pos-registers,commerce,
  agent-bridge}.ts
```
