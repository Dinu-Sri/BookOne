'use client';

import Link from 'next/link';
import { Package, X } from 'lucide-react';
import type { ProductRow } from '@/app/actions/inventory';
import { formatLKR, StatusBadge } from '@/components/module/list-page';
import { Button } from '@/components/ui/bookone-ui';

export function ProductSnapshotDialog({ product, onClose }: { product: ProductRow; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-panel party-snapshot" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="party-snapshot-close" type="button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
        <div className="party-snapshot-hero">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="product-snapshot-photo" src={product.imageUrl} alt="" width={72} height={72} />
          ) : (
            <div className="party-snapshot-avatar" aria-hidden>
              <Package size={22} />
            </div>
          )}
          <div className="party-snapshot-hero-text">
            <p className="party-snapshot-kicker">{product.productType}</p>
            <h2>{product.name}</h2>
            <div className="party-snapshot-meta">
              <span className="party-snapshot-chip">{product.sku}</span>
              <StatusBadge status={product.isActive === '1' ? 'active' : 'inactive'} />
            </div>
          </div>
        </div>
        <div className="party-snapshot-metrics">
          <div>
            <span>Sell price</span>
            <strong>{formatLKR(product.sellPrice)}</strong>
          </div>
          <div>
            <span>Unit cost</span>
            <strong>{formatLKR(product.unitCost)}</strong>
          </div>
          <div>
            <span>Qty on hand</span>
            <strong>{product.productType === 'physical' ? product.qtyOnHand : '—'}</strong>
          </div>
        </div>
        <div className="party-snapshot-grid">
          <div className="party-snapshot-item">
            <div className="party-snapshot-item-label">Unit</div>
            <p>{product.unit}</p>
          </div>
          <div className="party-snapshot-item">
            <div className="party-snapshot-item-label">Category</div>
            <p>{product.category || '—'}</p>
          </div>
          <div className="party-snapshot-item">
            <div className="party-snapshot-item-label">Revenue</div>
            <p>{product.revenueAccountCode}</p>
          </div>
          <div className="party-snapshot-item">
            <div className="party-snapshot-item-label">
              {product.productType === 'physical' ? 'COGS / Inventory' : 'Expense'}
            </div>
            <p>
              {product.productType === 'physical'
                ? `${product.cogsAccountCode} / ${product.inventoryAccountCode}`
                : product.expenseAccountCode}
            </p>
          </div>
          <div className="party-snapshot-item wide">
            <div className="party-snapshot-item-label">Usage</div>
            <p>
              {product.movementCount} movements · {product.documentLineCount} document lines
            </p>
          </div>
        </div>
        <div className="modal-actions party-snapshot-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            Close
          </Button>
          <Link href={`/inventory/products/${product.id}/edit`}>
            <Button variant="primary" type="button">
              Edit product
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
