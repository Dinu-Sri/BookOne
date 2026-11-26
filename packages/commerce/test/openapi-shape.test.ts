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
      '/inventory',
      '/changes',
      '/payment-methods',
      '/orders',
      '/orders/{externalId}',
      '/orders/{externalId}/events',
    ]) {
      expect(paths[p], p).toBeDefined();
      const op = paths[p]!.get ?? paths[p]!.post;
      expect(Object.keys(op?.responses ?? {}).length, p).toBeGreaterThan(0);
    }
    expect(JSON.stringify(COMMERCE_OPENAPI)).toContain('600 requests per minute');
  });
});
