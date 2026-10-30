import { useEffect, useState } from 'react'
import { usePageTitle } from '../../lib/usePageTitle.js'
import { AlertCircle } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../../api/client.js'
import { bySize } from '../../lib/sizes.js'
import { SALE_TYPE } from '../../config.js'
import { useCart } from '../../layout/CartContext.jsx'
import { pickVariant } from '../../lib/format.js'
import { trackView } from '../../lib/analytics.js'
import { joinSlugId, splitSlugId } from '../../../shared/slug.js'
import { ProductFacts } from './ProductFacts.jsx'
import { ProductGallery } from './ProductGallery.jsx'
import { ProductInfo } from './ProductInfo.jsx'
import { RelatedProducts } from './RelatedProducts.jsx'
import { categoryTrail, sameId } from './productModel.js'
import './product.css'
import { errorText } from '../../lib/errors.js'

const NOT_FOUND = /404|not found/i

// The product page, /p/{slug}-{id}. The id comes from the URL; everything shown comes from GET /products/{id}.
export function ProductPage() {
  const { slugId = '' } = useParams()
  const { id } = splitSlugId(slugId)
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { storeName, categoryById, quantities, busyKey, changeCartItem } = useCart()
  const [reloads, setReloads] = useState(0)
  const [result, setResult] = useState({ id: '', status: 'loading' })
  // A result only counts for the id it was requested for, so a changed URL never shows the previous product.
  const current = result.id === id ? result : { status: 'loading' }
  const { status, product } = current

  useEffect(() => {
    if (!id) {
      setResult({ id, status: 'missing' })
      return undefined
    }
    let active = true
    api(`/products/${encodeURIComponent(id)}?Scope.SaleType=${encodeURIComponent(SALE_TYPE)}`)
      .then((payload) => {
        if (!payload?.product) throw new Error('The store returned no product.')
        // Sizes smallest first, as on the cards, whatever order the store lists them in.
        if (active) setResult({ id, status: 'ready', product: { ...payload.product, variants: bySize(payload.product.variants) }, relations: payload.relations || {} })
      })
      .catch((err) => {
        if (active) setResult({ id, status: NOT_FOUND.test(err.message) ? 'missing' : 'error', error: errorText(err, 'The store didn’t answer. Try again in a moment.') })
      })
    return () => { active = false }
  }, [id, reloads])

  useEffect(() => { if (status === 'ready') trackView(product) }, [status, product])

  usePageTitle(status === 'ready' ? `${product.name} · ${storeName}` : status === 'missing' ? `Product not found · ${storeName}` : '')

  // The URL carries the product's canonical slug. A stale or wrong name is replaced, and the query (e.g. ?variant=) is kept.
  useEffect(() => {
    if (status !== 'ready') return
    const canonical = joinSlugId(product.name, product.id)
    if (canonical !== slugId) navigate({ pathname: `/p/${canonical}`, search: location.search, hash: location.hash }, { replace: true })
  }, [status, product, slugId, location.search, location.hash, navigate])

  const variants = product?.variants || []
  // ?variant=<id> preselects a size; without it the first size in stock is shown.
  let index = variants.findIndex((item) => sameId(item.id, searchParams.get('variant')))
  if (index < 0) index = Math.max(0, variants.indexOf(pickVariant(product)))
  const variant = variants[index]

  // Picking a size replaces the history entry, so Back still leaves the product.
  function selectVariant(variantId) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('variant', String(variantId))
      return next
    }, { replace: true })
  }

  if (status === 'loading') return <ProductSkeleton />

  if (status === 'missing') {
    return (
      <div className="sheet state-page">
        <h1>Product not found</h1>
        <p>It may have sold out or been taken off the menu, or the link may be out of date.</p>
        <Link className="primary-button state-link" to="/">Back to the menu</Link>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="sheet">
        <div className="state-panel" role="alert">
          <AlertCircle size={28} aria-hidden="true" />
          <h2>This product didn’t load</h2>
          <p>{current.error}</p>
          <button className="primary-button" type="button" onClick={() => { setResult({ id: '', status: 'loading' }); setReloads((count) => count + 1) }}>Try again</button>
        </div>
      </div>
    )
  }

  const attributes = product.attributes || {}
  const category = attributes.category
  // Store categories carry images; the product's own category is the fallback for the placeholder photo.
  const imageCategory = categoryById[String(category?.id)] || category

  return (
    <div className="sheet pd-page">
      <Breadcrumbs category={category} />
      <div className="pd-layout">
        <ProductGallery product={product} variant={variant} category={imageCategory} />
        <div className="pd-info">
          <ProductInfo
            product={product}
            variant={variant}
            index={index}
            relations={current.relations}
            onSelect={selectVariant}
            quantities={quantities}
            busyKey={busyKey}
            onChange={changeCartItem}
          />
          <ProductFacts product={product} variant={variant} />
        </div>
      </div>
      <RelatedProducts product={product} category={category} brand={attributes.brand} />
    </div>
  )
}

function Breadcrumbs({ category }) {
  return (
    <nav className="pd-crumbs" aria-label="Breadcrumb">
      <ol>
        <li><Link to="/">Menu</Link></li>
        {categoryTrail(category).map((node) => (
          <li key={node.id}><Link to={`/c/${joinSlugId(node.name, node.id)}`}>{node.name}</Link></li>
        ))}
      </ol>
    </nav>
  )
}

function ProductSkeleton() {
  return (
    <div className="sheet pd-page" aria-busy="true">
      <span className="sr-only" role="status">Loading product…</span>
      <div className="pd-layout" aria-hidden="true">
        <div className="pd-skel-main skeleton-image" />
        <div className="pd-info">
          <div className="pd-skel-line" style={{ width: '35%' }} />
          <div className="pd-skel-line pd-skel-title" />
          <div className="pd-skel-line" style={{ width: '40%' }} />
          <div className="pd-skel-line pd-skel-block" />
          <div className="pd-skel-line pd-skel-block" />
        </div>
      </div>
    </div>
  )
}
