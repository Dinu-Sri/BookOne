export const COMMERCE_OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'BookOne Commerce API',
    version: '1.4.0',
    description:
      'Rate limit: 600 requests per minute per key; every response has X-RateLimit-Limit, X-RateLimit-Remaining and (when known) X-Request-Id. GET responses carry a weak ETag; send If-None-Match to get 304. Money is a 2-dp decimal string, quantities are decimal strings, timestamps are ISO 8601. List endpoints take cursor and limit (default 50, max 250). Full guide: /docs/developers/custom-website. v1 single-store, single-location, single-currency commerce contract. HTTP 2xx means the request was accepted for processing. Accounting and stock effects are confirmed by reading the order, inventory, and journals. Every POST, PUT and PATCH accepts Idempotency-Key; a replay returns the first response with replayed: true. Scopes: catalog, inventory, order, lifecycle; the names catalog:read, pricing:read, webhooks:manage, inventory:read, reservations:write, orders:write, orders:read, customers:read, customers:write are accepted as aliases. Keep the bearer token on the server. Never put it in a theme file or shopper HTML. GET /products stays mapped-only. BookOne-first publish uses /catalog/candidates plus /catalog/acknowledge.',
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
              'INSUFFICIENT_STOCK',
            ],
            description: 'INSUFFICIENT_STOCK (409): a reservation change needs more stock than is available; the previous hold is kept.',
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
          grantedScopes: { type: 'array', items: { type: 'string' }, description: 'Fine-grained names this key grants (WP7 aliases).', example: ['catalog:read', 'pricing:read', 'orders:write'] },
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
              reservations: { type: 'boolean' },
              customers: { type: 'boolean' },
              orderList: { type: 'boolean' },
              orderInvoice: { type: 'boolean' },
              returns: { type: 'boolean' },
              productStats: { type: 'boolean' },
              relatedProducts: { type: 'boolean' },
              newArrivals: { type: 'boolean' },
              incomingStock: { type: 'boolean' },
              changeKindFilter: { type: 'boolean' },
              apiCallLog: { type: 'boolean' },
              ipAllowList: { type: 'boolean' },
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
                available: { type: 'string', example: '12', description: 'onHand − committed − channel safety buffer. committed includes held web orders and active reservations.' },
                lowStockThreshold: { type: ['string', 'null'], example: '3', description: 'Reorder level from the product (WP3).' },
                incoming: {
                  type: 'array',
                  description: 'Open purchase orders (ordered minus received) with their delivery date (WP3).',
                  items: { type: 'object', properties: { quantity: { type: 'string', example: '48' }, expectedAt: { type: ['string', 'null'], example: '2026-12-10' } } },
                },
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
                  enum: ['catalog', 'product', 'price', 'image', 'inventory', 'category', 'brand', 'order', 'customer', 'reservation', 'mapping', 'publish'],
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
                listPrice: { type: 'string', example: '1250.00' },
                bundleParentLineId: { type: ['string', 'null'] },
              },
            },
          },
          displayNumber: { type: 'string', example: 'WLK-100245' },
          channelCustomerId: { type: 'string', example: 'usr_812' },
          customerId: { type: 'string', description: 'BookOne customerId from PUT /customers.' },
          customerGroup: { type: 'string', example: 'wholesale' },
          shippingAddress: { $ref: '#/components/schemas/Address' },
          billingAddress: { anyOf: [{ $ref: '#/components/schemas/Address' }, { type: 'null' }] },
          delivery: {
            type: ['object', 'null'],
            properties: {
              method: { type: 'string', example: 'standard' },
              carrier: { type: 'string', example: 'fardar' },
              fee: { type: 'string', example: '450.00' },
              weightGrams: { type: 'integer', example: 750 },
              notes: { type: 'string' },
            },
          },
          reservationId: { type: 'string', description: 'Converts this checkout hold into the order; held lines never fail on stock.' },
          discounts: {
            type: 'array',
            description: 'Order-level coupons. When discountAmount is not sent, their sum is used.',
            items: { type: 'object', properties: { code: { type: 'string' }, type: { type: 'string' }, amount: { type: 'string' }, description: { type: 'string' } } },
          },
          fees: {
            type: 'array',
            description: 'Shipping, COD and other fees. When shippingAmount is not sent, their sum (or delivery.fee) is posted as shipping.',
            items: { type: 'object', properties: { kind: { type: 'string', example: 'shipping' }, amount: { type: 'string', example: '450.00' } } },
          },
          attachments: {
            type: 'array',
            items: { type: 'object', properties: { kind: { type: 'string', example: 'bank_slip' }, url: { type: 'string' }, fileName: { type: 'string' } } },
          },
          customerNote: { type: 'string' },
          marketing: { type: 'object', additionalProperties: { type: 'string' } },
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
              gatewayFee: { type: 'string', example: '77.64', description: 'Shown on the web order; book it when reconciling the gateway payout.' },
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
          kind: {
            type: 'string',
            enum: ['paid', 'cancelled', 'fulfilled', 'refunded', 'payment_pending_verification', 'payment_failed', 'address_updated'],
            description:
              'payment_pending_verification: bank slip uploaded (attachment). payment_failed: card declined (externalRef, reason); held stock is released. address_updated: new shippingAddress before dispatch (409 after dispatch). Idempotent on externalEventId.',
          },
          attachment: { type: 'object', properties: { kind: { type: 'string' }, url: { type: 'string' }, fileName: { type: 'string' } } },
          externalRef: { type: 'string' },
          reason: { type: 'string' },
          shippingAddress: { $ref: '#/components/schemas/Address' },
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
      Address: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          line1: { type: 'string' },
          line2: { type: 'string' },
          city: { type: 'string' },
          district: { type: 'string' },
          province: { type: 'string' },
          postalCode: { type: 'string' },
          country: { type: 'string', example: 'LK' },
        },
      },
      OrderView: {
        type: 'object',
        description: 'Full order (GET /orders, GET /orders/{externalId}). Includes the OrderReceipt fields.',
        properties: {
          externalId: { type: 'string' },
          displayNumber: { type: 'string' },
          status: { type: 'string' },
          placedAt: { type: 'string', format: 'date-time' },
          total: { type: 'string' },
          customer: { type: 'object', additionalProperties: true },
          shippingAddress: { $ref: '#/components/schemas/Address' },
          delivery: { type: ['object', 'null'], additionalProperties: true },
          discounts: { type: 'array', items: { type: 'object', additionalProperties: true } },
          fees: { type: 'array', items: { type: 'object', additionalProperties: true } },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                externalLineId: { type: 'string' },
                sku: { type: 'string' },
                quantity: { type: 'string' },
                unitPrice: { type: 'string' },
                fulfilledQuantity: { type: 'string' },
                restockedQuantity: { type: 'string' },
                refundedAmount: { type: 'string' },
              },
            },
          },
          payment: {
            type: 'object',
            properties: { method: { type: ['string', 'null'] }, status: { type: ['string', 'null'] }, amount: { type: ['string', 'null'] }, externalRef: { type: ['string', 'null'] }, gatewayFee: { type: ['string', 'null'] } },
          },
          invoice: { type: ['object', 'null'], properties: { documentId: { type: 'string' }, documentNumber: { type: 'string' } } },
          fulfilment: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['unfulfilled', 'confirmed', 'picking', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'returned', 'cancelled'] },
              shipments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    carrier: { type: 'string', example: 'fardar' },
                    trackingNumber: { type: 'string', example: 'FE123456789LK' },
                    trackingUrl: { type: ['string', 'null'] },
                    shippedAt: { type: 'string', format: 'date-time' },
                    deliveredAt: { type: ['string', 'null'], format: 'date-time' },
                    lines: { type: 'array', items: { type: 'object', properties: { externalLineId: { type: 'string' }, quantity: { type: 'string' } } } },
                  },
                },
              },
            },
          },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Reservation: {
        type: 'object',
        properties: {
          reservationId: { type: 'string' },
          externalId: { type: 'string', description: 'Your checkout id.' },
          status: { type: 'string', enum: ['active', 'converted', 'released', 'expired'] },
          held: { type: 'boolean', description: 'POST only: true when the hold is active.' },
          expiresAt: { type: 'string', format: 'date-time' },
          partial: { type: 'boolean' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                sku: { type: 'string' },
                quantity: { type: 'string' },
                held: { type: 'string' },
                available: { type: 'string' },
                status: { type: 'string', enum: ['held', 'insufficient', 'unknown_sku'] },
              },
            },
          },
          requestId: { type: 'string' },
        },
        example: {
          reservationId: '6f1c…',
          externalId: 'chk_812_1',
          status: 'active',
          held: true,
          expiresAt: '2026-11-27T10:15:00.000Z',
          partial: false,
          lines: [{ sku: 'WN-COT-8ML-CHWHITE', quantity: '2', held: '2', available: '12', status: 'held' }],
        },
      },
      Webhook: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          url: { type: 'string' },
          kinds: { type: 'array', items: { type: 'string' } },
          status: { type: 'string', enum: ['active', 'failing'] },
          secret: { type: 'string', description: 'Returned once on create and rotate.' },
          lastSuccessAt: { type: ['string', 'null'] },
          failingSince: { type: ['string', 'null'] },
          lastError: { type: ['string', 'null'] },
          rotationOverlapUntil: { type: ['string', 'null'] },
        },
      },
      Customer: {
        type: 'object',
        properties: {
          customerId: { type: 'string' },
          channelCustomerId: { type: 'string' },
          name: { type: 'string' },
          email: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'] },
          addresses: { type: 'array', items: { $ref: '#/components/schemas/Address' } },
          marketingOptIn: { type: 'boolean' },
          customerGroup: { type: ['string', 'null'] },
          matchedExisting: { type: 'boolean', description: 'PUT only: linked to an existing BookOne (e.g. POS) customer by email or phone.' },
          created: { type: 'boolean' },
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
          { name: 'include', in: 'query', schema: { type: 'string', example: 'variants,images,prices,inventory,attributes,stats' }, description: 'stats adds unitsSold30d, unitsSold90d, unitsSoldAllTime (all channels incl. POS).' },
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
          'Send payment.method as any name your store uses (for example cod, bank_transfer or a gateway id). BookOne maps names to accounts under Commerce API → Payments; a 4-digit account code is still accepted. Methods appear here after the first order that uses them, or when the owner adds them.',
        responses: {
          '200': { description: 'Methods', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaymentMethods' } } } },
          '401': { description: 'Unauthenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '403': { description: 'Key lacks the order scope', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/changes': {
      get: {
        summary: 'Resumable change feed (same items as webhooks)',
        description:
          'Items: id, revision, kind, entityId, productId, sku, payload, occurredAt. Kinds: product, variant (product items with variantId), price, image, inventory, category, brand, order, customer, reservation, mapping, publish. Cursors stay valid for at least 7 days; an expired cursor returns CURSOR_EXPIRED with fullResync.',
        parameters: [
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'kinds', in: 'query', schema: { type: 'string', example: 'price,inventory' }, description: 'Comma list. The cursor still advances past other kinds.' },
        ],
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
      get: {
        summary: "This channel's orders for reconciliation (WP5)",
        parameters: [
          { name: 'updatedSince', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 250, default: 50 } },
        ],
        responses: {
          '200': { description: 'Orders', content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/OrderView' } }, nextCursor: { type: ['string', 'null'] } } } } } },
          '422': { description: 'Bad updatedSince', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
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
        summary: 'Order status, lines, payment, invoice and shipments',
        parameters: [{ name: 'externalId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Order', content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderView' } } } },
          '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/orders/{externalId}/events': {
      post: {
        summary: 'Lifecycle events: paid, cancelled, fulfilled, refunded, payment_pending_verification, payment_failed, address_updated',
        parameters: [{ name: 'externalId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderEvent' } } } },
        responses: {
          '202': { description: 'Event applied or staged', content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderReceipt' } } } },
        },
      },
    },
    '/orders/{externalId}/invoice': {
      get: {
        summary: 'Invoice number, date, total and a public link (print or save as PDF)',
        parameters: [{ name: 'externalId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Invoice', content: { 'application/json': { schema: { type: 'object', properties: { documentNumber: { type: 'string' }, issuedAt: { type: 'string' }, total: { type: 'string' }, pdfUrl: { type: 'string' } } }, example: { documentNumber: 'INV-000245', issuedAt: '2026-11-27', total: '2588.00', pdfUrl: 'https://bookone.lk/i/9f2c1a7b3d4e5f60' } } } },
          '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/orders/{externalId}/returns': {
      post: {
        summary: 'Return lines from an order (with or without restock)',
        parameters: [{ name: 'externalId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['externalReturnId', 'lines'],
                properties: {
                  externalReturnId: { type: 'string' },
                  restock: { type: 'boolean' },
                  lines: { type: 'array', items: { type: 'object', properties: { externalLineId: { type: 'string' }, quantity: { type: 'string' }, reason: { type: 'string' }, condition: { type: 'string' } } } },
                },
              },
              example: { externalReturnId: 'RET-1', restock: true, lines: [{ externalLineId: '1', quantity: '1', reason: 'damaged', condition: 'opened' }] },
            },
          },
        },
        responses: {
          '202': { description: 'Return recorded (amount = line price less line discount)', content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderReceipt' } } } },
          '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '422': { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/reservations': {
      post: {
        summary: 'Hold stock during checkout (WP3)',
        description: 'ttlSeconds 60-3600 (default 900). partial=false (default) holds all lines or none. Held units cannot be sold at the POS. Same externalId while active returns the existing hold.',
        parameters: [{ name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', required: ['externalId', 'lines'], properties: { externalId: { type: 'string' }, lines: { type: 'array', items: { type: 'object', properties: { sku: { type: 'string' }, quantity: { type: 'string' } } } }, ttlSeconds: { type: 'integer' }, partial: { type: 'boolean' } } },
              example: { externalId: 'chk_812_1', ttlSeconds: 900, lines: [{ sku: 'WN-COT-8ML-CHWHITE', quantity: '2' }] },
            },
          },
        },
        responses: {
          '201': { description: 'Reservation (status released + insufficient lines when it could not hold)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Reservation' } } } },
          '403': { description: 'Key lacks the scope', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '422': { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/reservations/{reservationId}': {
      get: {
        summary: 'Reservation status: active, converted, released or expired',
        parameters: [{ name: 'reservationId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Reservation', content: { 'application/json': { schema: { $ref: '#/components/schemas/Reservation' } } } }, '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } },
      },
      patch: {
        summary: 'Extend the time (ttlSeconds from now) or change the lines',
        parameters: [{ name: 'reservationId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { ttlSeconds: { type: 'integer' }, lines: { type: 'array', items: { type: 'object' } } } }, example: { ttlSeconds: 600 } } } },
        responses: {
          '200': { description: 'Reservation', content: { 'application/json': { schema: { $ref: '#/components/schemas/Reservation' } } } },
          '409': { description: 'Not active, or INSUFFICIENT_STOCK for new quantities', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      delete: {
        summary: 'Release the hold',
        parameters: [{ name: 'reservationId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Released', content: { 'application/json': { schema: { $ref: '#/components/schemas/Reservation' } } } }, '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } },
      },
    },
    '/webhooks': {
      get: { summary: 'Webhooks on this connection', responses: { '200': { description: 'Webhooks', content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Webhook' } } } } } } } } },
      post: {
        summary: 'Register an HTTPS endpoint (secret returned once)',
        description:
          'BookOne POSTs each change-feed item as JSON with X-BookOne-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">. Reject signatures older than 300 seconds. Non-2xx responses are retried with exponential backoff (30 s, 1 min, 2 min … up to 6 h) for 24 hours, then the endpoint is marked failing. Delivery is at least once: de-duplicate on X-BookOne-Event-Id (the item id). Sandbox connections may use http://127.0.0.1 or localhost.',
        parameters: [{ name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['url'], properties: { url: { type: 'string' }, kinds: { type: 'array', items: { type: 'string' } } } }, example: { url: 'https://staging.watercolor.lk/api/bookone/webhook', kinds: ['product', 'price', 'inventory', 'order'] } } } },
        responses: { '201': { description: 'Webhook with secret', content: { 'application/json': { schema: { $ref: '#/components/schemas/Webhook' } } } }, '422': { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } },
      },
    },
    '/webhooks/{webhookId}': {
      delete: { summary: 'Remove a webhook', parameters: [{ name: 'webhookId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Removed' }, '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } } },
    },
    '/webhooks/{webhookId}/test': {
      post: { summary: 'Queue a signed ping delivery now', parameters: [{ name: 'webhookId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '202': { description: 'Queued' }, '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } } },
    },
    '/webhooks/{webhookId}/rotate': {
      post: {
        summary: 'New secret; the old one keeps signing (a second v1=) for 24 hours',
        parameters: [{ name: 'webhookId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Webhook with new secret', content: { 'application/json': { schema: { $ref: '#/components/schemas/Webhook' } } } }, '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } },
      },
    },
    '/webhooks/{webhookId}/deliveries': {
      get: { summary: 'Latest deliveries (status, attempts, last HTTP status, next retry)', parameters: [{ name: 'webhookId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Deliveries' }, '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } } },
    },
    '/customers/{channelCustomerId}': {
      put: {
        summary: 'Upsert a website customer (matches BookOne customers by email, then phone)',
        parameters: [{ name: 'channelCustomerId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, addresses: { type: 'array', items: { $ref: '#/components/schemas/Address' } }, marketingOptIn: { type: 'boolean' }, customerGroup: { type: 'string' } } },
              example: { name: 'Nimal Perera', email: 'nimal@example.com', phone: '+94771234567', addresses: [{ line1: '78/A2, Pattiyagama', city: 'Madampe', country: 'LK' }], marketingOptIn: true },
            },
          },
        },
        responses: { '200': { description: 'Customer', content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } } }, '422': { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } },
      },
      get: {
        summary: 'A customer by customerId (or channelCustomerId)',
        parameters: [{ name: 'channelCustomerId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Customer', content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } } }, '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } },
      },
    },
    '/customers/{customerId}/orders': {
      get: {
        summary: "The customer's website orders plus in-store (POS / BookOne) invoices",
        parameters: [{ name: 'customerId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Orders; source is web, pos or store' }, '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } },
      },
    },
    '/catalog/related': {
      get: {
        summary: 'Products often bought together with this SKU (all channels)',
        parameters: [{ name: 'sku', in: 'query', required: true, schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 8, maximum: 24 } }, { name: 'include', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: 'Products', content: { 'application/json': { schema: { $ref: '#/components/schemas/CatalogPage' } } } }, '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } },
      },
    },
    '/catalog/new-arrivals': {
      get: {
        summary: 'Published products created in the last N days, newest first',
        parameters: [{ name: 'days', in: 'query', schema: { type: 'integer', default: 30, minimum: 1, maximum: 365 } }, { name: 'include', in: 'query', schema: { type: 'string' } }, { name: 'cursor', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer' } }],
        responses: { '200': { description: 'Products', content: { 'application/json': { schema: { $ref: '#/components/schemas/CatalogPage' } } } }, '422': { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } },
      },
    },
    '/health': {
      get: {
        summary: 'Service status and API version (no key needed)',
        security: [],
        responses: { '200': { description: 'OK', content: { 'application/json': { example: { ok: true, status: 'ok', apiVersion: 'v1', specVersion: '1.4.0', serviceTime: '2026-11-27T10:00:00.000Z' } } } } },
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

# Hold stock while the customer pays by card (15 minutes)
curl -sS -X POST -H "Authorization: Bearer $BOOKONE_COMMERCE_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"externalId":"chk_812_1","ttlSeconds":900,"lines":[{"sku":"SKU-1","quantity":"1"}]}' \\
  "$BOOKONE_COMMERCE_BASE/reservations"

# Receive changes by webhook
curl -sS -X POST -H "Authorization: Bearer $BOOKONE_COMMERCE_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://shop.example/api/bookone/webhook","kinds":["product","price","inventory","order"]}' \\
  "$BOOKONE_COMMERCE_BASE/webhooks"
`.trim();
