import { useEffect, useMemo, useState } from 'react'
import { mergeEntries } from '../lib/catalog.js'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Award, Loader2, Search } from 'lucide-react'
import { joinSlugId, splitSlugId } from '../../shared/slug.js'
import { api } from '../api/client.js'
import { DEMO_MODE, PAGE_SIZE, SALE_TYPE, STORE_ID } from '../config.js'
import { ProductGrid, ProductGridSkeleton, relationMaps } from '../features/catalog/ProductGrid.jsx'
import { useCart } from '../layout/CartContext.jsx'
import { usePageTitle } from '../lib/usePageTitle.js'
import { BrandMark } from './BrandsPage.jsx'
import './pages.css'
import { NotConnected } from '../ui/NotConnected.jsx'
import { errorText } from '../lib/errors.js'

// The filters that select a brand's products: the brand's own filters, or the brand key with its id if it has none.
function brandFilters(brand) {
  const own = (Array.isArray(brand?.filters) ? brand.filters : [])
    .filter((filter) => filter?.key && Array.isArray(filter.values) && filter.values.length)
    .map((filter) => ({ key: String(filter.key), values: filter.values.map(String) }))
  return own.length ? own : [{ key: 'brand', values: [String(brand.id)] }]
}

// The menu with the same filters: /shop?f.<key>=<values>.
function shopPath(filters) {
  return `/shop?${filters.map((filter) => `f.${encodeURIComponent(filter.key)}=${filter.values.map(encodeURIComponent).join(',')}`).join('&')}`
}

// One brand: its header and its products, with the URL slug kept in its canonical form.
export function BrandPage() {
  const { slugId } = useParams()
  const { id } = splitSlugId(slugId)
  const navigate = useNavigate()
  const { store } = useCart()
  const connected = !DEMO_MODE && Boolean(STORE_ID)

  const [brand, setBrand] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | missing | error
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  const [entries, setEntries] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [productStatus, setProductStatus] = useState('loading') // loading | ready | error
  const [productError, setProductError] = useState('')
  const [productRetry, setProductRetry] = useState(0)
  const [relations, setRelations] = useState({ brands: [], strains: [] })

  useEffect(() => {
    if (!connected) return undefined
    let active = true
    setStatus('loading')
    setBrand(null)
    setError('')
    setPage(1)
    api(`/brands/${encodeURIComponent(id)}?${new URLSearchParams({ 'Scope.SaleType': SALE_TYPE })}`)
      .then((result) => {
        if (!active) return
        if (!result?.brand?.id) { setStatus('missing'); return }
        setBrand(result.brand)
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        // A 404 means no brand with this id, or none with products the shopper can see.
        if (err.status === 404) setStatus('missing')
        else { setError(errorText(err, 'The brand could not be loaded. Try again in a moment.')); setStatus('error') }
      })
    return () => { active = false }
  }, [connected, id, attempt])

  // The address follows the brand's name: a link with another slug is replaced by the canonical one.
  useEffect(() => {
    if (!brand) return
    const canonical = joinSlugId(brand.name, brand.id)
    if (slugId !== canonical) navigate(`/b/${canonical}`, { replace: true })
  }, [brand, slugId, navigate])

  useEffect(() => {
    if (!brand) return undefined
    let active = true
    setProductStatus('loading')
    setProductError('')
    const query = new URLSearchParams([
      ['Scope.SaleType', SALE_TYPE],
      ['Pagination.Page', String(page)],
      ['Pagination.PageSize', String(PAGE_SIZE)],
      ...brandFilters(brand).map((filter) => [`filters.${filter.key}`, filter.values.join(',')]),
    ])
    api(`/products?${query}`)
      .then((result) => {
        if (!active) return
        const batch = result?.items || []
        setEntries((current) => (page === 1 ? batch : [...current, ...batch]))
        setTotal(Number(result?.totalItems || 0))
        setRelations((current) => ({
          brands: [...(page === 1 ? [] : current.brands), ...(result?.relations?.brands || [])],
          strains: [...(page === 1 ? [] : current.strains), ...(result?.relations?.strains || [])],
        }))
        setProductStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setProductError(errorText(err, 'Products could not be loaded. Try again in a moment.'))
        setProductStatus('error')
      })
    return () => { active = false }
  }, [brand, page, productRetry])

  // Until the store is known the server's title stays.
  const pageLabel = brand?.name || (status === 'missing' ? 'Brand not found' : 'Brand')
  usePageTitle(store?.name ? `${pageLabel} · ${store.name}` : '')

  const products = useMemo(() => mergeEntries(entries), [entries])

  const maps = useMemo(() => {
    const lookup = relationMaps(relations)
    return brand ? { brands: { ...lookup.brands, [String(brand.id)]: brand.name }, strains: lookup.strains } : { brands: {}, strains: {} }
  }, [relations, brand])

  const filters = useMemo(() => (brand ? brandFilters(brand) : []), [brand])

  if (!connected) {
    return (
      <div className="sheet page">
        <NotConnected icon={Award} title="This brand isn’t available right now" level={1} />
      </div>
    )
  }

  if (status === 'missing') {
    return (
      <div className="sheet page">
        <div className="state-panel">
          <Award size={28} aria-hidden="true" />
          <h1>Brand not found</h1>
          <p>This brand is not on the menu right now.</p>
          <Link className="primary-button" to="/brands">Browse all brands</Link>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="sheet page">
        <div className="state-panel" role="alert">
          <Award size={28} aria-hidden="true" />
          <h1>Brand didn’t load</h1>
          <p>{error}</p>
          <button className="primary-button" type="button" onClick={() => setAttempt((count) => count + 1)}>Try again</button>
        </div>
      </div>
    )
  }

  if (!brand) {
    return (
      <div className="sheet page" aria-busy="true">
        <header className="brand-head">
          <span className="brand-mark is-large skeleton-image" aria-hidden="true" />
          <div className="brand-head-copy"><div className="skeleton-line skeleton-title" /></div>
        </header>
        <ProductGridSkeleton />
      </div>
    )
  }

  const count = productStatus === 'loading' && !entries.length ? 'Loading products…' : `${total.toLocaleString('en-US')} ${total === 1 ? 'product' : 'products'}`

  let list
  if (productStatus === 'error' && !entries.length) {
    list = (
      <div className="state-panel" role="alert">
        <Search size={28} aria-hidden="true" />
        <h2>Products didn’t load</h2>
        <p>{productError}</p>
        <button className="primary-button" type="button" onClick={() => setProductRetry((count) => count + 1)}>Try again</button>
      </div>
    )
  } else if (productStatus === 'loading' && !entries.length) {
    list = <ProductGridSkeleton />
  } else if (!products.length) {
    list = (
      <div className="state-panel">
        <Search size={28} aria-hidden="true" />
        <h2>No products right now</h2>
        <p>{brand.name} has nothing in stock at the moment.</p>
        <Link className="primary-button" to="/shop">Browse the menu</Link>
      </div>
    )
  } else {
    list = (
      <>
        <ProductGrid products={products} brands={maps.brands} strains={maps.strains} />
        {productStatus === 'error' && <p className="page-note" role="alert">{productError} <button className="text-button" type="button" onClick={() => setProductRetry((value) => value + 1)}>Try again</button></p>}
        {entries.length < total && (
          <div className="load-more">
            <span>Showing {entries.length} of {total.toLocaleString('en-US')}</span>
            <button className="secondary-button" type="button" disabled={productStatus === 'loading'} onClick={() => setPage((current) => current + 1)}>
              {productStatus === 'loading' ? <><Loader2 className="spin" size={16} aria-hidden="true" /> Loading</> : 'Show more'}
            </button>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="sheet page">
      <header className="brand-head">
        <BrandMark brand={brand} large />
        <div className="brand-head-copy">
          <h1 className="page-title">{brand.name}</h1>
          <p className="brand-meta">{count}</p>
          <Link className="secondary-button" to={shopPath(filters)}>View in menu with filters <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </header>
      <section className="brand-products" aria-label={`Products from ${brand.name}`}>
        {list}
      </section>
    </div>
  )
}
