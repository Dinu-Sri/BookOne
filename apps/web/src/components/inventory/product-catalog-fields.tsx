'use client';

import { useState } from 'react';
import type { ProductCatalogEditor } from '@/app/actions/product-catalog';
import { SelectField } from '@/components/ui/select-field';
import { TextAreaField, TextField } from '@/components/ui/text-field';

/**
 * "Online store" tab of the product form (Commerce WP1): what websites show.
 * Field names are read by catalogValuesFromForm (lib/product-catalog-fields).
 */
export function ProductCatalogFields({ editor, disabled }: { editor: ProductCatalogEditor; disabled?: boolean }) {
  const v = editor.values;
  const [brandId, setBrandId] = useState(v.productBrandId);
  const [parentId, setParentId] = useState(v.parentProductId);
  const [isParent, setIsParent] = useState(v.isParentListing);

  return (
    <div className="party-tab-grid">
      <input type="hidden" name="catalogFields" value="1" />
      <p className="field-help field-full">
        These details are sent to your online stores (Company → Commerce Integrations). Websites charge delivery by
        weight, so fill in the weight for every product you sell online.
      </p>

      <TextField id="cat-short-name" name="shortName" label="Short name" defaultValue={v.shortName} help="Shown on product cards and in the cart." disabled={disabled} />
      <SelectField
        id="cat-brand"
        name="productBrandId"
        label="Product brand"
        value={brandId}
        onChange={setBrandId}
        disabled={disabled}
        options={[{ value: '', label: 'No brand' }, ...editor.brands.map((b) => ({ value: b.id, label: b.name }))]}
        help="The maker, e.g. Winsor & Newton. Add brands under Inventory → Categories."
      />

      <TextField id="cat-weight" name="weightGrams" label="Weight (grams)" type="number" min={0} step={1} defaultValue={v.weightGrams} disabled={disabled} help="Packed weight for delivery charges." />
      <TextField id="cat-length" name="lengthMm" label="Length (mm)" type="number" min={0} step={1} defaultValue={v.lengthMm} disabled={disabled} />
      <TextField id="cat-width" name="widthMm" label="Width (mm)" type="number" min={0} step={1} defaultValue={v.widthMm} disabled={disabled} />
      <TextField id="cat-height" name="heightMm" label="Height (mm)" type="number" min={0} step={1} defaultValue={v.heightMm} disabled={disabled} />
      <label className="party-check field-full">
        <input type="checkbox" name="fragile" defaultChecked={v.fragile} disabled={disabled} /> Fragile (pack with care)
      </label>

      <TextField id="cat-tags" name="tags" label="Tags" defaultValue={v.tags} placeholder="student-grade, gift" help="Comma separated." disabled={disabled} />
      <TextField id="cat-barcodes" name="extraBarcodes" label="More barcodes" defaultValue={v.extraBarcodes} help="Comma separated, in addition to the main barcode." disabled={disabled} />

      <TextField id="cat-min" name="minOrderQty" label="Minimum order quantity" type="number" min={0} step="any" defaultValue={v.minOrderQty} disabled={disabled} />
      <TextField id="cat-max" name="maxOrderQty" label="Maximum order quantity" type="number" min={0} step="any" defaultValue={v.maxOrderQty} disabled={disabled} />
      <TextField id="cat-step" name="orderQtyStep" label="Sell in steps of" type="number" min={0} step="any" defaultValue={v.orderQtyStep} disabled={disabled} help="For example 6 for boxes of six." />
      <label className="party-check">
        <input type="checkbox" name="allowBackorder" defaultChecked={v.allowBackorder} disabled={disabled} /> Website may take orders when out of stock
      </label>

      <TextAreaField
        id="cat-attributes"
        name="attributeValues"
        label="Specifications"
        rows={3}
        defaultValue={v.attributeValues}
        placeholder={'volume_ml=8\npigment=PW6'}
        help="One per line as code=value. Websites use these for filters and spec tables."
        className="field-full"
        disabled={disabled}
      />

      <fieldset className="field-full commerce-fields" disabled={disabled}>
        <legend className="commerce-section-title">Variants (colours, sizes)</legend>
        <label className="party-check">
          <input
            type="checkbox"
            name="isParentListing"
            checked={isParent}
            onChange={(e) => {
              setIsParent(e.target.checked);
              if (e.target.checked) setParentId('');
            }}
          />{' '}
          This is a listing with variants (each colour/size is its own product with its own stock)
        </label>
        {isParent ? (
          <>
            <TextField
              id="cat-options"
              name="productOptions"
              label="Options"
              defaultValue={v.productOptions}
              placeholder="Colour: Chinese White, Lemon Yellow; Size: 8ml, 21ml"
              help="The listing itself is not sold or stocked. Create each variant as a product and choose this listing under Variant of."
              required
            />
            {editor.variants.length ? (
              <p className="field-help">
                Variants: {editor.variants.map((x) => `${x.sku} (${x.options})`).join(', ')}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <SelectField
              id="cat-parent"
              name="parentProductId"
              label="Variant of"
              value={parentId}
              onChange={setParentId}
              options={[{ value: '', label: 'Not a variant' }, ...editor.parents.map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}` }))]}
              emptyReason="Tick “listing with variants” on the parent product first."
            />
            {parentId ? (
              <>
                <TextField
                  id="cat-variant-options"
                  name="variantOptions"
                  label="This variant's options"
                  defaultValue={v.variantOptions}
                  placeholder="Colour=Lemon Yellow; Size=8ml"
                  required
                />
                <TextField id="cat-swatch" name="swatchHex" label="Swatch colour" defaultValue={v.swatchHex} placeholder="#F7F5EE" />
                <TextField id="cat-variant-order" name="variantSortOrder" label="Order in the list" type="number" min={0} step={1} defaultValue={v.variantSortOrder} />
                <label className="party-check">
                  <input type="checkbox" name="isDefaultVariant" defaultChecked={v.isDefaultVariant} /> Show this variant first
                </label>
              </>
            ) : null}
          </>
        )}
      </fieldset>
    </div>
  );
}
