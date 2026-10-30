import { useEffect, useState } from 'react'
import { mergeEntries } from '../lib/catalog.js'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock, Tag } from 'lucide-react'
import { api, fetchAll } from '../api/client.js'
import { DEMO_MODE, SALE_TYPE, STORE_ID } from '../config.js'
import { ProductGrid, ProductGridSkeleton, relationMaps } from '../features/catalog/ProductGrid.jsx'
import { useCart } from '../layout/CartContext.jsx'
import { usePageTitle } from '../lib/usePageTitle.js'
import './pages.css'
import { NotConnected } from '../ui/NotConnected.jsx'
import { errorText } from '../lib/errors.js'
import { cleanText, formatSchedule } from '../lib/format.js'

// A promotion's filters, keeping only the ones with values: [{ key, values }].
function promotionFilters(filters) {
  return (Array.isArray(filters) ? filters : [])
    .filter((filter) => filter?.key && Array.isArray(filter.values) && filter.values.length)
    .map((filter) => ({ key: String(filter.key), values: filter.values.map(String) }))
}

// "See all" opens the menu with the same filters: /shop?f.<key>=<values>.
function shopPath(filters) {
  const parts = filters.map((filter) => `f.${encodeURIComponent(filter.key)}=${filter.values.map(encodeURIComponent).join(',')}`)
  return `/shop${parts.length ? `?${parts.join('&')}` : ''}`
}

// The banner for the device: desktop and mobile versions when both exist, otherwise whichever is there.
function bannerSources(banners) {
  const list = Array.isArray(banners) ? banners : []
  const desktop = list.find((banner) => banner?.type === 'desktop' && banner.source)?.source
  const mobile = list.find((banner) => banner?.type === 'mobile' && banner.source)?.source
  return desktop || mobile ? { desktop, mobile } : null
}

function Banner({ sources, alt }) {
  const [failed, setFailed] = useState(false)
  if (!sources || failed) return null
  const primary = sources.desktop || sources.mobile
  return (
    <picture className="deal-banner">
      {sources.desktop && sources.mobile && <source media="(max-width: 599px)" srcSet={sources.mobile} />}
      <img src={primary} alt={alt} loading="lazy" onError={() => setFailed(true)} />
    </picture>
  )
}

function Deal({ promotion, result }) {
  const description = cleanText(promotion.description)
  const schedule = formatSchedule(cleanText(promotion.schedule))
  const filters = promotionFilters(promotion.filters)
  const titleId = `deal-${promotion.id}`
  const maps = result?.items ? relationMaps(result.relations) : null
  return (
    <section className="deal" aria-labelledby={titleId}>
      <Banner sources={bannerSources(promotion.banners)} alt="" />
      <div className="deal-head">
        <div className="deal-info">
          <h2 id={titleId} className="deal-title">{promotion.name}</h2>
          {schedule && <p className="deal-schedule"><Clock size={14} aria-hidden="true" />{schedule}</p>}
          {description && <p className="deal-description">{description}</p>}
        </div>
        {filters.length > 0 && (
          <Link className="secondary-button" to={shopPath(filters)}>See all <ArrowRight size={16} aria-hidden="true" /></Link>
        )}
      </div>
      {filters.length > 0 && (
        !result ? <ProductGridSkeleton count={4} />
          : result.error ? <p className="deal-note">The products in this deal could not be loaded. <Link to={shopPath(filters)}>Open them in the menu</Link>.</p>
            : result.items.length ? <ProductGrid products={result.items} brands={maps.brands} strains={maps.strains} />
              : <p className="deal-note">No products in this deal are in stock right now.</p>
      )}
    </section>
  )
}

// Deals: every promotion of the store, with its schedule, banner and first products.
export function DealsPage() {
  const { store } = useCart()
  const connected = !DEMO_MODE && Boolean(STORE_ID)
  const [promotions, setPromotions] = useState(null)
  const [results, setResults] = useState({})
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!connected) return undefined
    let active = true
    setPromotions(null)
    setResults({})
    setError('')
    fetchAll('/promotions', 50).then((list) => {
      if (!active) return
      const found = list.filter((promotion) => promotion?.id)
      setPromotions(found)
      // Each deal's products load on their own, so one slow deal does not hold up the others.
      for (const promotion of found) {
        const filters = promotionFilters(promotion.filters)
        if (!filters.length) continue
        const query = new URLSearchParams([
          ['Scope.SaleType', SALE_TYPE],
          ['Pagination.Page', '1'],
          ['Pagination.PageSize', '8'],
          ...filters.map((filter) => [`filters.${filter.key}`, filter.values.join(',')]),
        ])
        api(`/products?${query}`)
          .then((result) => { if (active) setResults((current) => ({ ...current, [promotion.id]: { items: mergeEntries(result?.items || []), relations: result?.relations || {} } })) })
          .catch(() => { if (active) setResults((current) => ({ ...current, [promotion.id]: { error: true } })) })
      }
    }).catch((err) => {
      if (active) setError(errorText(err, 'Deals could not be loaded. Try again in a moment.'))
    })
    return () => { active = false }
  }, [connected, attempt])

  // Until the store is known the server's title stays.
  usePageTitle(store?.name ? `Deals · ${store.name}` : '')

  let body
  if (!connected) {
    body = <NotConnected icon={Tag} title="Deals aren’t available right now" />
  } else if (error) {
    body = (
      <div className="state-panel" role="alert">
        <Tag size={28} aria-hidden="true" />
        <h2>Deals didn’t load</h2>
        <p>{error}</p>
        <button className="primary-button" type="button" onClick={() => setAttempt((count) => count + 1)}>Try again</button>
      </div>
    )
  } else if (promotions === null) {
    body = (
      <div className="deal-list" aria-hidden="true">
        {[0, 1].map((index) => <div className="deal" key={index}><div className="skeleton-image deal-banner" /><div className="skeleton-line short" /><ProductGridSkeleton count={4} /></div>)}
      </div>
    )
  } else if (!promotions.length) {
    body = <div className="state-panel"><Tag size={28} aria-hidden="true" /><h2>No deals right now — check back soon.</h2></div>
  } else {
    body = (
      <div className="deal-list">
        {promotions.map((promotion) => <Deal key={promotion.id} promotion={promotion} result={results[promotion.id]} />)}
      </div>
    )
  }

  return (
    <div className="sheet page">
      <header className="page-head">
        <h1 className="page-title">Deals</h1>
        <p className="page-lede">Current promotions and the products they apply to.</p>
      </header>
      {body}
    </div>
  )
}
