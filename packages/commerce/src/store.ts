import type {
  ActivityRow,
  ConnectionRow,
  CredentialRow,
  IdempotencyRow,
  MappingRow,
  OrderRow,
  OutboxRow,
  ProductRecord,
  StockRecord,
} from './types';

export type CommerceStore = {
  insertConnection(row: ConnectionRow): Promise<void>;
  getConnection(tenantId: string, id: string): Promise<ConnectionRow | null>;
  listConnections(tenantId: string): Promise<ConnectionRow[]>;
  updateConnection(row: ConnectionRow): Promise<void>;

  insertCredential(row: CredentialRow): Promise<void>;
  getCredentialByPrefix(prefix: string): Promise<CredentialRow | null>;
  listCredentials(tenantId: string, connectionId: string): Promise<CredentialRow[]>;
  updateCredential(row: CredentialRow): Promise<void>;

  listMappings(tenantId: string, connectionId: string): Promise<MappingRow[]>;
  upsertMapping(row: MappingRow): Promise<void>;
  deleteMapping(tenantId: string, id: string): Promise<void>;

  getProduct(tenantId: string, id: string): Promise<ProductRecord | null>;
  findProductBySku(tenantId: string, sku: string): Promise<ProductRecord | null>;
  listSellableProducts(tenantId: string): Promise<ProductRecord[]>;
  getStock(tenantId: string, productId: string, locationId: string | null): Promise<StockRecord | null>;
  listStock(tenantId: string, locationId: string | null): Promise<StockRecord[]>;

  getOrderByExternalId(tenantId: string, connectionId: string, externalId: string): Promise<OrderRow | null>;
  insertOrder(row: OrderRow): Promise<void>;
  updateOrder(row: OrderRow): Promise<void>;
  listOrders(tenantId: string, connectionId?: string, status?: string): Promise<OrderRow[]>;

  getIdempotency(tenantId: string, connectionId: string, key: string): Promise<IdempotencyRow | null>;
  putIdempotency(tenantId: string, connectionId: string, key: string, row: IdempotencyRow): Promise<void>;

  insertEvent(row: {
    id: string;
    tenantId: string;
    connectionId: string;
    orderId: string;
    externalEventId: string;
    kind: string;
    status: string;
    sourceVersion: string | null;
    effectiveAt: string;
    amount: string | null;
    restock: boolean;
    payload: Record<string, unknown>;
    result: Record<string, unknown> | null;
  }): Promise<'inserted' | 'duplicate'>;

  insertRefund(row: {
    id: string;
    tenantId: string;
    connectionId: string;
    orderId: string;
    externalRefundId: string;
    amount: string;
    restock: boolean;
    documentId: string | null;
  }): Promise<'inserted' | 'duplicate'>;

  nextRevision(tenantId: string, connectionId: string): Promise<number>;
  insertOutbox(row: OutboxRow & { tenantId: string; connectionId: string }): Promise<void>;
  listOutbox(tenantId: string, connectionId: string, afterRevision: number, limit: number): Promise<OutboxRow[]>;
  maxRevision(tenantId: string, connectionId: string): Promise<number>;

  insertActivity(row: ActivityRow & { tenantId: string }): Promise<void>;
  listActivity(tenantId: string, connectionId?: string): Promise<ActivityRow[]>;
};
