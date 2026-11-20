export const COMMERCE_OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'BookOne Commerce API',
    version: '1.0.0',
    description:
      'v1 single-store, single-location, single-currency commerce contract. HTTP 2xx means the request was accepted for processing. Accounting and stock effects are confirmed by reading the order, inventory, and journals. Reservation endpoints stay disabled. Keep the bearer token on the server. Never put it in a theme file or shopper HTML.',
  },
  servers: [{ url: '/api/commerce/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'bkc' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', enum: [false] },
          code: { type: 'string' },
          error: { type: 'string' },
          requestId: { type: 'string' },
        },
      },
      Order: {
        type: 'object',
        required: ['externalId', 'currency', 'placedAt', 'customer', 'lines', 'total'],
        properties: {
          externalId: { type: 'string' },
          currency: { type: 'string', example: 'LKR' },
          placedAt: { type: 'string', format: 'date-time' },
          sourceTimezone: { type: 'string', example: 'Asia/Colombo' },
          customer: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' } } },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              required: ['externalLineId', 'sku', 'quantity', 'unitPrice'],
              properties: {
                externalLineId: { type: 'string' },
                sku: { type: 'string' },
                quantity: { type: 'string', example: '1' },
                unitPrice: { type: 'string', example: '1500.00' },
              },
            },
          },
          total: { type: 'string', example: '1500.00' },
          payment: {
            type: 'object',
            properties: { status: { type: 'string', enum: ['pending', 'paid', 'failed'] } },
          },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/connection': { get: { summary: 'Connection identity, scopes and capabilities', responses: { '200': { description: 'Connection' }, '401': { description: 'Unauthenticated' } } } },
    '/products': { get: { summary: 'Mapped products and variants', responses: { '200': { description: 'Products' } } } },
    '/inventory': { get: { summary: 'Absolute BookOne availability', responses: { '200': { description: 'Inventory' } } } },
    '/changes': { get: { summary: 'Resumable catalog and stock changes', parameters: [{ name: 'cursor', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Changes' }, '422': { description: 'Cursor expired' } } } },
    '/orders/validate': { post: { summary: 'Side-effect-free order preview', requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } }, responses: { '200': { description: 'Preview' } } } },
    '/orders': {
      post: {
        summary: 'Durable order submit',
        parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } },
        responses: { '202': { description: 'Accepted for processing' }, '409': { description: 'Conflict' } },
      },
    },
    '/orders/{externalId}': { get: { summary: 'Store-visible order status', parameters: [{ name: 'externalId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Order' }, '404': { description: 'Not found' } } } },
    '/orders/{externalId}/events': {
      post: {
        summary: 'Supported lifecycle events',
        parameters: [{ name: 'externalId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '202': { description: 'Event applied or staged' } },
      },
    },
    '/reservations': { post: { summary: 'Disabled until a contention test passes', responses: { '422': { description: 'Reservation disabled' } } } },
    '/openapi.json': { get: { summary: 'This document', security: [], responses: { '200': { description: 'OpenAPI' } } } },
  },
} as const;

export const CURL_EXAMPLES = `
# Keep the secret on the server. Never put it in a theme file.
export BOOKONE_COMMERCE_TOKEN='bkc_sand_prefix_secret'
export BOOKONE_COMMERCE_BASE='https://example.bookone.test/api/commerce/v1'

curl -sS -H "Authorization: Bearer $BOOKONE_COMMERCE_TOKEN" \\
  "$BOOKONE_COMMERCE_BASE/connection"

curl -sS -H "Authorization: Bearer $BOOKONE_COMMERCE_TOKEN" \\
  "$BOOKONE_COMMERCE_BASE/inventory"

curl -sS -X POST -H "Authorization: Bearer $BOOKONE_COMMERCE_TOKEN" \\
  -H "Idempotency-Key: store-order-1001" \\
  -H "Content-Type: application/json" \\
  -d '{"externalId":"1001","currency":"LKR","placedAt":"2026-11-20T10:00:00Z","customer":{"name":"Walk-in"},"lines":[{"externalLineId":"1001-1","sku":"SKU-1","quantity":"1","unitPrice":"1500.00"}],"total":"1500.00","payment":{"status":"paid"}}' \\
  "$BOOKONE_COMMERCE_BASE/orders"
`.trim();
