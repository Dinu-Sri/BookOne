import { describe, expect, it } from 'vitest';
import { COMMERCE_OPENAPI } from '../src/openapi';

describe('OpenAPI document', () => {
  it('documents every WP0/WP1 route with responses', () => {
    const paths = COMMERCE_OPENAPI.paths as Record<string, Record<string, { responses?: Record<string, unknown> }>>;
    for (const p of [
      '/connection',
      '/catalog/products',
      '/catalog/products/{productId}',
      '/catalog/products/by-sku/{sku}',
      '/catalog/categories',
      '/catalog/brands',
      '/catalog/attributes',
      '/pricing',
      '/health',
      '/reservations',
      '/reservations/{reservationId}',
      '/webhooks',
      '/webhooks/{webhookId}',
      '/webhooks/{webhookId}/test',
      '/webhooks/{webhookId}/rotate',
      '/webhooks/{webhookId}/deliveries',
      '/customers/{channelCustomerId}',
      '/customers/{customerId}/orders',
      '/orders/{externalId}/invoice',
      '/orders/{externalId}/returns',
      '/catalog/related',
      '/catalog/new-arrivals',
      '/inventory',
      '/changes',
      '/payment-methods',
      '/orders',
      '/orders/{externalId}',
      '/orders/{externalId}/events',
    ]) {
      expect(paths[p], p).toBeDefined();
      const op = paths[p]!.get ?? paths[p]!.post ?? (paths[p] as Record<string, { responses?: Record<string, unknown> }>).delete;
      expect(Object.keys(op?.responses ?? {}).length, p).toBeGreaterThan(0);
    }
    expect(JSON.stringify(COMMERCE_OPENAPI)).toContain('600 requests per minute');
    expect(JSON.stringify(COMMERCE_OPENAPI)).toContain('PRICE_MISMATCH');
    expect(JSON.stringify(COMMERCE_OPENAPI)).toContain('X-BookOne-Signature');
    expect(JSON.stringify(COMMERCE_OPENAPI)).toContain('INSUFFICIENT_STOCK');
    expect(COMMERCE_OPENAPI.info.version).toBe('1.4.0');
  });
});
