import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useCart } from '../../layout/CartContext.jsx'
import { trackListView } from '../../lib/analytics.js'
import { categoryIdOf } from '../../lib/format.js'
import { ProductCard } from './ProductCard.jsx'
import { useProductExtras } from './useProductExtras.js'
import { useCatalogFacts } from './catalogFacts.js'

// Hybrid / Sativa / Indica. The API sends prevalence as a string; accept an object too.
export function strainPrevalence(strain) {
  const value = strain?.prevalence
  return typeof value === 'string' ? value : value?.name || undefined
}

// Lookup maps from a products response's `relations`, so cards can show brand and strain names.
export function relationMaps(relations) {
  return {
    brands: Object.fromEntries((relations?.brands || []).map((brand) => [String(brand.id), brand.name])),
    strains: Object.fromEntries((relations?.strains || []).map((strain) => [String(strain.id), strain])),
  }
}

// The one place catalog products become cards, so every page (menu, product, deals, brands) shows them the same way.
// `brands` maps brand id → name, `strains` maps strain id → strain, `extras` maps product id → { effects, badge, compounds, deals }.
// Effects and tag badges are looked up for every grid (useProductExtras); an entry passed in `extras` replaces the looked-up one.
// `matches` maps product id → { percent, reasons } on the product finder's results. `rail` lays the cards out as one
// scrolling row (the home page carousels) instead of a grid.
export function ProductGrid({ products, brands = {}, strains = {}, extras = {}, matches = {}, categoryById: catalogCategories = {}, rail = false }) {
  const { categoryById: storeCategories, quantities, busyKey, changeCartItem } = useCart()
  const categoryById = { ...storeCategories, ...catalogCategories }
  const fetched = useProductExtras(products)
  const { names: promotionNames, quietIds, ready } = useCatalogFacts()
  // Unknown (null) until the store-wide list can be told: the cards keep promoted prices plain until then.
  const storeWideIds = ready ? quietIds : null
  const { pathname } = useLocation()
  const listKey = products.map((product) => product.id).join(',')
  // One view per distinct product set, not per render.
  useEffect(() => { trackListView(pathname, products, { brands, categories: categoryById }) }, [listKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={rail ? 'product-grid product-carousel' : 'product-grid'}>
      {products.map((product) => {
        const extra = extras[product.id] ?? fetched[product.id]
        return (
          <ProductCard
            key={product.id}
            product={product}
            category={categoryById[categoryIdOf(product)]}
            brand={brands[String(product?.attributeIds?.brandId)]}
            strain={strainPrevalence(strains[String(product?.attributeIds?.strainId)])}
            badge={extra?.badge || null}
            effects={extra?.effects}
            compounds={extra?.compounds}
            deals={extra?.deals}
            promotionNames={promotionNames}
            storeWideIds={storeWideIds}
            match={matches[product.id]}
            quantities={quantities}
            busyKey={busyKey}
            onChange={changeCartItem}
          />
        )
      })}
    </div>
  )
}

export function ProductGridSkeleton({ count = 8, rail = false }) {
  return (
    <div className={rail ? 'product-grid product-carousel' : 'product-grid'} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => <div className="skeleton" key={index}><div className="skeleton-image" /><div className="skeleton-line" /><div className="skeleton-line short" /></div>)}
    </div>
  )
}
