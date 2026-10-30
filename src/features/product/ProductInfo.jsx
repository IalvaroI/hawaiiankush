import { Link } from 'react-router-dom'
import { joinSlugId } from '../../../shared/slug.js'
import { money } from '../../lib/format.js'
import { ProductBuy } from './ProductBuy.jsx'
import { VariantPicker } from './VariantPicker.jsx'
import { PotencyPanel } from './PotencyPanel.jsx'
import { hasLabProfile, noFiguresNote } from '../../lib/compounds.js'
import { NOT_FOR_PICKING } from '../picker/pickerModel.js'
import { LOW_STOCK, inStock, priceOf, prevalenceName, productBadge, promotionText, stockCount, strainTone, variantLabels, variantPromotions } from './productModel.js'
import { useCatalogFacts } from '../catalog/catalogFacts.js'

// Name, brand, potency and terpenes, price with promotions, size picker, stock note and the add-to-bag control.
export function ProductInfo({ product, variant, index, relations, onSelect, quantities, busyKey, onChange }) {
  const attributes = product.attributes || {}
  const variants = product.variants || []
  const labels = variantLabels(product)
  const badge = productBadge(attributes)
  const strainName = prevalenceName(attributes.strain?.prevalence)
  const brand = attributes.brand
  const quality = attributes.qualityLine?.name
  const { now, was } = priceOf(variant)
  // Full names from the promotions list: the product's relations cut them to 16 characters ("10% Off Everythi").
  const { names: promotionNames, quietIds, ready } = useCatalogFacts()
  // Red means a deal on this product, as on the cards: a price lowered only by a store-wide promotion ("10% Off
  // Everything", said once above the menu) keeps the normal colour, with the old price still struck. A lowered price with
  // no promotion behind it (a price set by the store) is a sale. Until the store-wide list can be told (see
  // catalogFacts), a promoted price stays plain rather than going red, then plain.
  const isSale = (option) => {
    if (priceOf(option).was == null) return false
    const ids = (option.promotionIds || []).map(String)
    if (!ids.length) return true
    return ready && ids.some((id) => !quietIds.includes(id))
  }
  const promotions = variantPromotions(variant, relations?.promotions).map((promotion) => ({ ...promotion, name: promotionNames[promotion.id] || promotion.name }))
  const available = Boolean(variant) && inStock(variant)
  const stock = variant ? stockCount(variant) : 0
  const purchaseKey = variant?.purchaseKey
  const quantity = purchaseKey ? quantities[purchaseKey] || 0 : 0
  // Lab figures belong to one size: a size without any says so (in the cards' words) instead of an empty panel. Things
  // nobody smokes (a lighter, a gift card) say nothing; their category is in the breadcrumbs.
  const labNote = variant && !hasLabProfile(variant) && !NOT_FOR_PICKING.test(attributes.category?.name || '') ? noFiguresNote(variant, variants) : ''

  return (
    <>
      <div className="pd-badges">
        {badge && <span className={`badge ${badge.style}`}>{badge.text}</span>}
        {strainName && <span className={`strain-pill pd-strain is-${strainTone(strainName)}`}>{strainName}</span>}
      </div>

      <h1 className="pd-name">{product.name}</h1>
      {(brand?.name || quality) && (
        <div className="pd-meta">
          {brand?.name && <Link className="pd-brand" to={`/b/${joinSlugId(brand.name, brand.id)}`}>{brand.name}</Link>}
          {/* The store's quality line ("Bronze", "Gold"): named, since a bare "Bronze" reads as a stray word. */}
          {quality && <span className="pd-quality">{quality} quality</span>}
        </div>
      )}

      <PotencyPanel variant={variant} />
      {labNote && <p className="pd-lab-none">{labNote}</p>}

      {variant && (
        <div className="pd-pricing">
          <div className="pd-price" aria-live="polite">
            {was != null && <del><span className="sr-only">Was </span>{money(was)}</del>}
            <strong className={isSale(variant) ? 'is-sale' : ''}>{was != null && <span className="sr-only">Now </span>}{money(now)}</strong>
          </div>
          {promotions.length > 0 && (
            <ul className="pd-promos" aria-label="Promotions">
              {promotions.map((promotion) => <li key={promotion.id}>{promotionText(promotion)}</li>)}
            </ul>
          )}
          {promotions.length > 0 && <p className="pd-bulk">Deals apply automatically in your bag.</p>}
        </div>
      )}

      {variants.length > 1 ? (
        <VariantPicker variants={variants} labels={labels} index={index} isSale={isSale} onSelect={onSelect} />
      ) : variant && (
        <p className="pd-single"><span>Size</span><strong>{labels[0]}</strong></p>
      )}

      {available && stock <= LOW_STOCK && <p className="pd-stock">Only {stock} left</p>}

      <ProductBuy name={product.name} size={variants.length > 1 ? labels[index] : ''} variant={variant} price={now} available={available} quantity={quantity} busy={Boolean(purchaseKey) && busyKey === purchaseKey} onChange={onChange} />
    </>
  )
}
