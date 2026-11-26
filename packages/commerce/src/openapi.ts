export const COMMERCE_OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'BookOne Commerce API',
    version: '1.3.0',
    description:
      'Rate limit: 600 requests per minute per key; every response has X-RateLimit-Limit, X-RateLimit-Remaining and (when known) X-Request-Id. GET responses carry a weak ETag; send If-None-Match to get 304. Money is a 2-dp decimal string, quantities are decimal strings, timestamps are ISO 8601. List endpoints take cursor and limit (default 50, max 250). Full guide: /docs/developers/custom-website. v1 single-store, single-location, single-currency commerce contract. HTTP 2xx means the request was accepted for processing. Accounting and stock effects are confirmed by reading the order, inventory, and journals. Reservation endpoints stay disabled. Keep the bearer token on the server. Never put it in a theme file or shopper HTML. GET /products stays mapped-only. BookOne-first publish uses /catalog/candidates plus /catalog/acknowledge.',
  },
  servers: [{ url: '/api/commerce/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'bkc' },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['ok', 'code', 'error', 'requestId'],
        properties: {
          ok: { type: 'boolean', enum: [false] },
          code: {
            type: 'string',
            enum: [
              'UNAUTHENTICATED',
              'FORBIDDEN',
              'NOT_FOUND',
              'CONFLICT',
              'VALIDATION',
              'RATE_LIMITED',
              'INBOUND_PAUSED',
              'OUTBOUND_PAUSED',
              'RESERVATION_DISABLED',
              'CURSOR_EXPIRED',
              'UNSUPPORTED',
            ],
          },
          error: { type: 'string' },
          requestId: { type: 'string' },
          details: { type: 'object', additionalProperties: true },
        },
      },
      Connection: {
        type: 'object',
        required: ['id', 'name', 'kind', 'environment', 'currency', 'scopes', 'apiVersion'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          kind: { type: 'string', enum: ['woocommerce', 'custom_website'] },
          environment: { type: 'string', enum: ['sandbox', 'live'] },
          locationId: { type: ['string', 'null'] },
          currency: { type: 'string', example: 'LKR' },
          scopes: { type: 'array', items: { type: 'string', enum: ['catalog', 'inventory', 'order', 'lifecycle'] } },
          postingMode: { type: 'string', enum: ['preview', 'posting'] },
          inboundPaused: { type: 'boolean' },
          outboundPaused: { type: 'boolean' },
          oversellPolicy: { type: 'string', enum: ['review'] },
          reservationMode: { type: 'string', enum: ['disabled'] },
          channel: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
          priceListId: { type: 'string', example: 'default', description: 'The price list this channel sells at; default = BookOne sell price.' },
          stockLocationIds: { type: 'array', items: { type: 'string' } },
          taxMode: { type: 'string', enum: ['inclusive', 'exclusive'] },
          timezone: { type: 'string', example: 'Asia/Colombo' },
          safetyBuffer: { type: 'integer', example: 0 },
          allowBackorder: { type: 'boolean' },
          capabilities: {
            type: 'object',
            additionalProperties: true,
            description: 'Feature flags. Check before using a feature; false or absent means not available yet.',
            properties: {
              catalog: { type: 'boolean' },
              catalogProducts: { type: 'boolean' },
              variants: { type: 'boolean' },
              images: { type: 'boolean' },
              channelPublishing: { type: 'boolean' },
              committedStock: { type: 'boolean' },
              webOrders: { type: 'boolean' },
              fulfilment: { type: 'boolean' },
              paymentMethods: { type: 'boolean' },
              etag: { type: 'boolean' },
              priceLists: { type: 'boolean' },
              salePrices: { type: 'boolean' },
              priceTiers: { type: 'boolean' },
              customerGroupPricing: { type: 'boolean' },
              webhooks: { type: 'boolean' },
              changeKinds: { type: 'array', items: { type: 'string' } },
              inventory: { type: 'boolean' },
              orders: { type: 'boolean' },
              lifecycle: { type: 'boolean' },
              reservations: { type: 'boolean', enum: [false] },
              priceExport: { type: 'boolean', description: 'GET /pricing and price changes are available (WP2).' },
            },
          },
          serviceTime: { type: 'string', format: 'date-time' },
          apiVersion: { type: 'string', enum: ['v1'] },
        },
      },
      ProductPage: {
        type: 'object',
        required: ['items', 'nextCursor'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'sku', 'name', 'externalProductId'],
              properties: {
                id: { type: 'string' },
                sku: { type: 'string' },
                name: { type: 'string' },
                unit: { type: 'string' },
                revision: { type: 'integer' },
                archived: { type: 'boolean' },
                externalProductId: { type: 'string' },
                externalVariantId: { type: 'string' },
              },
            },
          },
          nextCursor: { type: ['string', 'null'] },
        },
      },
      Inventory: {
        type: 'object',
        required: ['items', 'authority', 'mode'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['sku', 'quantity', 'revision'],
              properties: {
                sku: { type: 'string' },
                productId: { type: 'string' },
                locationId: { type: ['string', 'null'] },
                quantity: {
                  type: 'string',
                  example: '12',
                  description: 'What this channel may sell now: onHand minus committed (same as available).',
                },
                onHand: { type: 'string', example: '14', description: 'Physical stock at the connection location.' },
                committed: {
                  type: 'string',
                  example: '2',
                  description: 'Held for open web orders (cash on delivery, bank transfer) that are not invoiced yet.',
                },
                available: { type: 'string', example: '12', description: 'onHand − committed.' },
                revision: { type: 'integer' },
                asOf: { type: 'string', format: 'date-time' },
                stale: { type: 'boolean' },
              },
            },
          },
          authority: { type: 'string', enum: ['bookone'] },
          mode: { type: 'string', enum: ['absolute'] },
          scope: {
            type: 'string',
            enum: ['mapped'],
            description:
              'Items are the SKUs linked (mapped) to this connection, i.e. the products published to this channel. Unlinked BookOne products are not returned.',
          },
        },
      },
      Changes: {
        type: 'object',
        required: ['items', 'nextCursor', 'fullResync'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                revision: { type: 'integer' },
                kind: {
                  type: 'string',
                  enum: ['catalog', 'product', 'price', 'inventory', 'order', 'mapping', 'publish'],
                  description:
                    'price: the channel price of a product or variant changed (list price edited, channel list switched, a scheduled sale started or ended); payload.price is the full CatalogPrice. order: BookOne-side change to a web order (stock_held, confirmed, paid, dispatched, delivered, cancelled, refunded, posted). mapping: a SKU was linked. publish: a product was queued for publishing or claimed by the store.',
                },
                productId: { type: ['string', 'null'] },
                createdAt: { type: 'string', format: 'date-time' },
                sku: { type: 'string' },
                payload: { type: 'object', additionalProperties: true },
              },
            },
          },
          nextCursor: { type: 'string' },
          fullResync: { type: 'boolean' },
        },
      },
      CatalogCandidates: {
        type: 'object',
        required: ['items', 'bootstrap', 'mappedOnlyProductsPath'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                claimId: { type: 'string' },
                bookoneProductId: { type: 'string' },
                sku: { type: 'string' },
                name: { type: 'string' },
                unit: { type: 'string' },
                sellPrice: { type: 'string' },
                status: { type: 'string' },
                alreadyLinked: { type: 'boolean' },
              },
            },
          },
          bootstrap: { type: 'string', enum: ['idle', 'queued'] },
          defaultWooStatus: { type: 'string', enum: ['draft'] },
          mappedOnlyProductsPath: { type: 'string', enum: ['/products'] },
        },
      },
      Acknowledgement: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['bookoneProductId', 'externalProductId'],
              properties: {
                bookoneProductId: { type: 'string' },
                claimId: { type: 'string' },
                externalProductId: { type: 'string' },
                externalVariantId: { type: 'string' },
              },
            },
          },
        },
      },
      AcknowledgementReceipt: {
        type: 'object',
        required: ['ok', 'items'],
        properties: {
          ok: { type: 'boolean', enum: [true] },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                bookoneProductId: { type: 'string' },
                status: { type: 'string', enum: ['acknowledged'] },
                replayed: { type: 'boolean' },
                externalProductId: { type: 'string' },
              },
            },
          },
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
          sourceVersion: { type: 'string' },
          customer: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
            },
          },
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
                taxAmount: { type: 'string' },
                discountAmount: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
          shippingAmount: { type: 'string' },
          discountAmount: { type: 'string' },
          taxAmount: { type: 'string' },
          total: { type: 'string', example: '1500.00' },
          payment: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['pending', 'paid', 'failed'] },
              method: { type: 'string', description: 'Payment method or a 4-digit BookOne cash/bank code for settlement.' },
              amount: { type: 'string' },
              externalRef: { type: 'string' },
            },
          },
          status: { type: 'string', enum: ['pending', 'paid', 'cancelled'] },
        },
      },
      OrderEvent: {
        type: 'object',
        required: ['externalEventId', 'kind', 'effectiveAt'],
        properties: {
          externalEventId: { type: 'string' },
          kind: { type: 'string', enum: ['paid', 'cancelled', 'fulfilled', 'refunded'] },
          sourceVersion: { type: 'string' },
          effectiveAt: { type: 'string', format: 'date-time' },
          amount: { type: 'string' },
          restock: { type: 'boolean' },
          externalRefundId: { type: 'string' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              required: ['externalLineId'],
              properties: {
                externalLineId: { type: 'string' },
                quantity: { type: 'string' },
                amount: { type: 'string' },
              },
            },
          },
        },
      },
      OrderReceipt: {
        type: 'object',
        required: ['ok', 'status', 'externalId', 'httpStatusIsNotAccountingAcceptance'],
        properties: {
          ok: { type: 'boolean', enum: [true] },
          requestId: { type: 'string' },
          processing: { type: 'string' },
          status: {
            type: 'string',
            enum: [
              'received',
              'needs_review',
              'accepted',
              'posted',
              'paid',
              'cancelled',
              'fulfilled',
              'refunded',
              'partially_refunded',
              'failed',
            ],
          },
          externalId: { type: 'string' },
          reviewReason: { type: ['string', 'null'] },
          documentId: { type: ['string', 'null'] },
          documentNumber: { type: ['string', 'null'] },
          lastAppliedVersion: { type: ['string', 'null'] },
          settlement: { type: 'string', enum: ['none', 'not_configured', 'settled'] },
          paymentStatus: { type: ['string', 'null'], enum: ['pending', 'paid', 'failed', null] },
          stock: {
            type: 'string',
            enum: ['none', 'committed', 'released', 'consumed'],
            description:
              'committed: stock is held for this unpaid order. consumed: the hold became the invoice stock movement. released: the order was cancelled.',
          },
          fulfilment: { $ref: '#/components/schemas/Fulfilment' },
          replayed: { type: 'boolean' },
          httpStatusIsNotAccountingAcceptance: { type: 'boolean', enum: [true] },
        },
      },
      Fulfilment: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['unfulfilled', 'confirmed', 'picking', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'returned', 'cancelled'],
          },
          confirmedAt: { type: ['string', 'null'], format: 'date-time' },
          shipments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                carrier: { type: 'string', example: 'Courier name' },
                trackingNumber: { type: 'string', example: 'TRK123456' },
                trackingUrl: { type: ['string', 'null'] },
                shippedAt: { type: 'string', format: 'date-time' },
                deliveredAt: { type: ['string', 'null'], format: 'date-time' },
              },
            },
          },
          stock: { type: 'string', enum: ['none', 'committed', 'released', 'consumed'] },
        },
      },
      PaymentMethods: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                method: { type: 'string', example: 'cod', description: 'payment.method as your store sends it (lower-cased).' },
                settlementAccountCode: { type: ['string', 'null'], example: '1201' },
                settlesOnPaid: { type: 'boolean', description: 'false means a paid order stays open in receivables.' },
                holdsStockWhilePending: { type: 'boolean' },
              },
            },
          },
          defaultSettlementAccountCode: { type: ['string', 'null'] },
          acceptsAnyMethodName: { type: 'boolean', enum: [true] },
          nextCursor: { type: ['string', 'null'] },
        },
        example: {
          items: [
            { method: 'bank_transfer', settlementAccountCode: '1100', settlesOnPaid: true, holdsStockWhilePending: true },
            { method: 'cod', settlementAccountCode: null, settlesOnPaid: false, holdsStockWhilePending: true },
            { method: 'payhere', settlementAccountCode: '1201', settlesOnPaid: true, holdsStockWhilePending: false },
          ],
          defaultSettlementAccountCode: '1201',
          acceptsAnyMethodName: true,
          nextCursor: null,
        },
      },
      CatalogImage: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'img_77' },
          url: { type: 'string', description: 'Public, stable. The last segment changes when the bytes change; cache it for as long as you like.' },
          width: { type: 'integer', example: 2000 },
          height: { type: 'integer', example: 2000 },
          alt: { type: ['string', 'null'] },
          position: { type: 'integer', description: '1 = main image' },
          checksum: { type: 'string', example: 'sha256:9f2c…', description: 'Re-download when this changes.' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CatalogPrice: {
        type: 'object',
        description:
          'Charge effectivePrice for quantity 1. For larger quantities use the highest tier whose minQty <= quantity when it is lower. compareAtPrice is only sent when higher than price (show it struck through).',
        properties: {
          currency: { type: 'string', example: 'LKR' },
          priceListId: { type: 'string', example: 'default' },
          price: { type: 'string', example: '1250.00', description: 'List price (or BookOne sell price when the product is not on the list).' },
          compareAtPrice: { type: ['string', 'null'] },
          sale: {
            type: ['object', 'null'],
            description: 'Scheduled sale; active tells you whether it applies right now. Day boundaries are in the company timezone.',
            properties: {
              price: { type: 'string', example: '999.00' },
              startsAt: { type: ['string', 'null'], format: 'date-time' },
              endsAt: { type: ['string', 'null'], format: 'date-time' },
              active: { type: 'boolean' },
            },
          },
          tiers: {
            type: 'array',
            description: 'Quantity prices: unit price from minQty upward.',
            items: { type: 'object', properties: { minQty: { type: 'string', example: '6' }, price: { type: 'string', example: '1050.00' } } },
          },
          effectivePrice: { type: 'string', example: '999.00', description: 'Unit price for one item now (sale when active, else price).' },
          revision: { type: 'integer' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CatalogInventory: {
        type: 'object',
        properties: {
          trackInventory: { type: 'boolean' },
          onHand: { type: ['string', 'null'], example: '14' },
          committed: { type: ['string', 'null'], example: '2', description: 'Held for open COD / bank-transfer orders.' },
          available: { type: ['string', 'null'], example: '12', description: 'onHand − committed − channel safety buffer, never below 0.' },
          allowBackorder: { type: 'boolean' },
          revision: { type: 'integer' },
          asOf: { type: 'string', format: 'date-time' },
        },
      },
      CatalogVariant: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          sku: { type: 'string', example: 'WN-COT-8ML-CHWHITE' },
          barcodes: { type: 'array', items: { type: 'string' } },
          options: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, value: { type: 'string' } } } },
          swatch: { type: ['object', 'null'], properties: { hex: { type: 'string' }, imageId: { type: ['string', 'null'] } } },
          status: { type: 'string', enum: ['active', 'archived'] },
          sortOrder: { type: 'integer' },
          isDefault: { type: 'boolean' },
          shipping: { type: 'object', properties: { weightGrams: { type: ['integer', 'null'] } } },
          images: { type: 'array', items: { $ref: '#/components/schemas/CatalogImage' } },
          price: { $ref: '#/components/schemas/CatalogPrice' },
          inventory: { $ref: '#/components/schemas/CatalogInventory' },
          externalVariantId: { type: ['string', 'null'] },
          revision: { type: 'integer' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CatalogProduct: {
        type: 'object',
        description:
          'A simple product carries price and inventory itself; a variable product carries them on each variant. images, variants, price, inventory and attributes appear only when requested with include=.',
        properties: {
          id: { type: 'string' },
          sku: { type: 'string', example: 'WN-COT-8ML' },
          type: { type: 'string', enum: ['simple', 'variable', 'service'] },
          status: { type: 'string', enum: ['active', 'archived'] },
          name: { type: 'string' },
          shortName: { type: ['string', 'null'] },
          slugHint: { type: 'string', example: 'winsor-newton-cotman-8ml-tube' },
          descriptionHtml: { type: ['string', 'null'] },
          descriptionText: { type: ['string', 'null'] },
          shortDescriptionHtml: { type: ['string', 'null'] },
          brand: { type: ['object', 'null'], properties: { id: { type: 'string' }, name: { type: 'string' } } },
          categories: {
            type: 'array',
            items: {
              type: 'object',
              properties: { id: { type: 'string' }, name: { type: 'string' }, path: { type: 'array', items: { type: 'string' } }, primary: { type: 'boolean' } },
            },
          },
          unit: { type: 'object', properties: { code: { type: 'string' }, name: { type: 'string' }, decimals: { type: 'integer' } } },
          barcodes: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
          attributes: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' }, name: { type: 'string' }, value: { type: 'string' } } } },
          shipping: {
            type: 'object',
            properties: {
              weightGrams: { type: ['integer', 'null'] },
              lengthMm: { type: ['integer', 'null'] },
              widthMm: { type: ['integer', 'null'] },
              heightMm: { type: ['integer', 'null'] },
              fragile: { type: 'boolean' },
            },
          },
          tax: { type: 'object', properties: { taxCategory: { type: 'string', enum: ['standard', 'zero', 'exempt'] }, rate: { type: 'string', example: '18.00' } } },
          trackInventory: { type: 'boolean' },
          allowBackorder: { type: 'boolean' },
          minOrderQty: { type: 'string' },
          maxOrderQty: { type: ['string', 'null'] },
          orderQtyStep: { type: 'string' },
          options: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, values: { type: 'array', items: { type: 'string' } } } } },
          images: { type: 'array', items: { $ref: '#/components/schemas/CatalogImage' } },
          variants: { type: 'array', items: { $ref: '#/components/schemas/CatalogVariant' } },
          price: { $ref: '#/components/schemas/CatalogPrice' },
          inventory: { $ref: '#/components/schemas/CatalogInventory' },
          externalProductId: { type: ['string', 'null'] },
          revision: { type: 'integer', description: 'Increases on every change to the product, its variants or images.' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CatalogPage: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/CatalogProduct' } },
          nextCursor: { type: ['string', 'null'], description: 'null at the end of the list.' },
          requestId: { type: 'string' },
        },
      },
      ListPage: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'object', additionalProperties: true } },
          nextCursor: { type: ['string', 'null'] },
          requestId: { type: 'string' },
        },
      },
      ValidatePreview: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'PRICE_MISMATCH' },
                message: { type: 'string', example: 'PRICE_MISMATCH:WN-COT-10' },
                field: { type: 'string' },
                blocking: { type: 'boolean', description: 'false = warning; the order is still accepted (e.g. PRICE_MISMATCH after a coupon).' },
                expected: { type: 'string' },
                received: { type: 'string' },
              },
            },
          },
          mapped: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/connection': {
      get: {
        summary: 'Connection identity, scopes and capabilities',
        responses: {
          '200': { description: 'Connection', content: { 'application/json': { schema: { $ref: '#/components/schemas/Connection' } } } },
          '401': { description: 'Unauthenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/products': {
      get: {
        summary: 'Mapped products and variants only',
        parameters: [{ name: 'cursor', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Mapped products', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProductPage' } } } },
        },
      },
    },
    '/catalog/products': {
      get: {
        summary: 'Products published to this channel (WP1)',
        description:
          'Ordered by revision then id, so a client can import everything and then poll with updatedSince. Variants of a variable product are nested. Unpublished products are excluded unless scope=all.',
        parameters: [
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 250, default: 50 } },
          { name: 'updatedSince', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'archived', 'all'], default: 'active' } },
          { name: 'categoryId', in: 'query', schema: { type: 'string' }, description: 'Includes child categories.' },
          { name: 'brandId', in: 'query', schema: { type: 'string' } },
          { name: 'sku', in: 'query', schema: { type: 'string' }, description: 'Repeat or comma-separate, up to 100. Matches product or variant SKU.' },
          { name: 'include', in: 'query', schema: { type: 'string', example: 'variants,images,prices,inventory,attributes' } },
          { name: 'scope', in: 'query', schema: { type: 'string', enum: ['published', 'all'], default: 'published' } },
          { name: 'customerGroup', in: 'query', schema: { type: 'string', example: 'wholesale' }, description: 'Use the price list for this customer group when one exists (WP2).' },
          { name: 'If-None-Match', in: 'header', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Page', content: { 'application/json': { schema: { $ref: '#/components/schemas/CatalogPage' } } } },
          '304': { description: 'Not modified (ETag matched)' },
          '401': { description: 'Unauthenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Key lacks the catalog scope', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '422': { description: 'Bad updatedSince or more than 100 SKUs', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '429': { description: 'Rate limited (Retry-After)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/catalog/products/{productId}': {
      get: {
        summary: 'One published product by BookOne id (a variant id returns its parent)',
        parameters: [
          { name: 'productId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'include', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Product', content: { 'application/json': { schema: { $ref: '#/components/schemas/CatalogProduct' } } } },
          '304': { description: 'Not modified' },
          '404': { description: 'Not published on this channel', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/catalog/products/by-sku/{sku}': {
      get: {
        summary: 'One published product by product or variant SKU',
        parameters: [
          { name: 'sku', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'include', in: 'query', schema: { type: 'string' } },
          { name: 'customerGroup', in: 'query', schema: { type: 'string', example: 'wholesale' }, description: 'Use the price list for this customer group when one exists (WP2).' },
        ],
        responses: {
          '200': { description: 'Product', content: { 'application/json': { schema: { $ref: '#/components/schemas/CatalogProduct' } } } },
          '404': { description: 'Not published on this channel', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/pricing': {
      get: {
        summary: 'Current channel prices for up to 100 SKUs (WP2)',
        description:
          'Fast price re-check, e.g. at cart or checkout. Accepts product or variant SKUs that are published on this channel; unknown or unpublished SKUs are listed in missing.',
        parameters: [
          { name: 'sku', in: 'query', required: true, schema: { type: 'string' }, description: 'Repeat or comma-separate, 1 to 100.' },
          { name: 'customerGroup', in: 'query', schema: { type: 'string', example: 'wholesale' }, description: 'Use the price list for this customer group when one exists (WP2).' },
        ],
        responses: {
          '200': {
            description: 'Prices',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          sku: { type: 'string' },
                          productId: { type: 'string' },
                          parentProductId: { type: ['string', 'null'] },
                          price: { $ref: '#/components/schemas/CatalogPrice' },
                        },
                      },
                    },
                    missing: { type: 'array', items: { type: 'string' } },
                    priceListId: { type: 'string' },
                    customerGroup: { type: ['string', 'null'] },
                    requestId: { type: 'string' },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Key lacks the catalog scope', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '422': { description: 'No SKU or more than 100', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/catalog/categories': {
      get: {
        summary: 'Category tree as a flat list (id, parentId, name, slugHint, description, imageUrl, sortOrder, status, updatedAt)',
        parameters: [
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 250, default: 50 } },
        ],
        responses: { '200': { description: 'Categories', content: { 'application/json': { schema: { $ref: '#/components/schemas/ListPage' } } } } },
      },
    },
    '/catalog/brands': {
      get: {
        summary: 'Product brands (id, name, slugHint, logoUrl, description, websiteUrl, status, updatedAt)',
        parameters: [
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 250, default: 50 } },
        ],
        responses: { '200': { description: 'Brands', content: { 'application/json': { schema: { $ref: '#/components/schemas/ListPage' } } } } },
      },
    },
    '/catalog/attributes': {
      get: {
        summary: 'Specification attributes (code, name, type, unit, allowedValues, filterable)',
        parameters: [
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 250, default: 50 } },
        ],
        responses: { '200': { description: 'Attributes', content: { 'application/json': { schema: { $ref: '#/components/schemas/ListPage' } } } } },
      },
    },
    '/catalog/candidates': {
      get: {
        summary: 'Feature-gated BookOne-first publish queue. Empty unless an operator queued products.',
        responses: {
          '200': { description: 'Candidates', content: { 'application/json': { schema: { $ref: '#/components/schemas/CatalogCandidates' } } } },
        },
      },
    },
    '/catalog/acknowledge': {
      post: {
        summary: 'Report stable external product IDs after the store created listings',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Acknowledgement' } } } },
        responses: {
          '200': { description: 'Mapped', content: { 'application/json': { schema: { $ref: '#/components/schemas/AcknowledgementReceipt' } } } },
          '409': { description: 'Conflict', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/inventory': {
      get: {
        summary: 'BookOne availability for the SKUs linked to this channel',
        description:
          'quantity = available = onHand − committed. committed is stock held for unpaid cash-on-delivery / bank-transfer orders. Pass up to 100 SKUs as repeated sku= or a comma list.',
        parameters: [{ name: 'sku', in: 'query', schema: { type: 'string' }, style: 'form', explode: true }],
        responses: {
          '200': { description: 'Inventory', content: { 'application/json': { schema: { $ref: '#/components/schemas/Inventory' } } } },
          '409': { description: 'Outbound paused', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/payment-methods': {
      get: {
        summary: 'Payment methods this channel uses, where each settles and whether it holds stock while unpaid',
        description:
          'Send payment.method as any name your store uses (for example cod, bank_transfer or a gateway id). BookOne maps names to accounts under Commerce Integrations → Payments; a 4-digit account code is still accepted. Methods appear here after the first order that uses them, or when the owner adds them.',
        responses: {
          '200': { description: 'Methods', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaymentMethods' } } } },
          '401': { description: 'Unauthenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Key lacks the order scope', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/changes': {
      get: {
        summary: 'Resumable catalog and stock changes',
        parameters: [{ name: 'cursor', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Changes', content: { 'application/json': { schema: { $ref: '#/components/schemas/Changes' } } } },
          '422': { description: 'Cursor expired', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/orders/validate': {
      post: {
        summary: 'Side-effect-free order preview',
        description:
          'Flags lines whose unitPrice differs from the channel price with a non-blocking PRICE_MISMATCH issue (expected, received). The order is still accepted because coupons and manual discounts are legitimate. Send customerGroup in the body to compare against that group list.',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } },
        responses: {
          '200': { description: 'Preview', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidatePreview' } } } },
        },
      },
    },
    '/orders': {
      post: {
        summary: 'Durable order submit',
        parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } },
        responses: {
          '202': { description: 'Accepted for processing', content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderReceipt' } } } },
          '409': { description: 'Conflict', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/orders/{externalId}': {
      get: {
        summary: 'Store-visible order status',
        parameters: [{ name: 'externalId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Order', content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderReceipt' } } } },
          '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/orders/{externalId}/events': {
      post: {
        summary: 'Supported lifecycle events: paid, cancelled, fulfilled, refunded',
        parameters: [{ name: 'externalId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderEvent' } } } },
        responses: {
          '202': { description: 'Event applied or staged', content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderReceipt' } } } },
        },
      },
    },
    '/reservations': {
      post: {
        summary: 'Disabled until a contention test passes',
        responses: {
          '422': { description: 'Reservation disabled', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
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

curl -sS -H "Authorization: Bearer $BOOKONE_COMMERCE_TOKEN" \\
  "$BOOKONE_COMMERCE_BASE/catalog/candidates"

curl -sS -X POST -H "Authorization: Bearer $BOOKONE_COMMERCE_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"items":[{"bookoneProductId":"33333333-3333-3333-3333-333333333333","externalProductId":"woo-12"}]}' \\
  "$BOOKONE_COMMERCE_BASE/catalog/acknowledge"

curl -sS -X POST -H "Authorization: Bearer $BOOKONE_COMMERCE_TOKEN" \\
  -H "Idempotency-Key: store-order-1001" \\
  -H "Content-Type: application/json" \\
  -d '{"externalId":"1001","currency":"LKR","placedAt":"2026-11-20T10:00:00Z","customer":{"name":"Walk-in"},"lines":[{"externalLineId":"1001-1","sku":"SKU-1","quantity":"1","unitPrice":"1500.00"}],"total":"1500.00","payment":{"status":"paid","method":"card","amount":"1500.00","externalRef":"pay_1001"}}' \\
  "$BOOKONE_COMMERCE_BASE/orders"
`.trim();
