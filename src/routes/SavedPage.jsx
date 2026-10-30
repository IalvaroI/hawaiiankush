import { useEffect, useState } from 'react'
import { WISHLIST_EVENT, WISHLIST_KEY } from '../lib/wishlist.js'
import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { api } from '../api/client.js'
import { SALE_TYPE } from '../config.js'
import { ProductGrid, ProductGridSkeleton, relationMaps } from '../features/catalog/ProductGrid.jsx'
import { useCart } from '../layout/CartContext.jsx'
import { usePageTitle } from '../lib/usePageTitle.js'
import './pages.css'

// Saved products are product ids in this browser, written by the heart on each product card (ProductCard, key
// "wishlist"). The API has no wishlist yet, so this is per browser until accounts can hold it.
const LOAD_CONCURRENCY = 4

export function readSavedIds() {
  try {
    const ids = JSON.parse(window.localStorage.getItem(WISHLIST_KEY) || '[]')
    return Array.isArray(ids) ? ids.map(String) : []
  } catch {
    return []
  }
}

function writeSavedIds(ids) {
  try {
    window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(ids))
    window.dispatchEvent(new Event(WISHLIST_EVENT))
  } catch {
    // Blocked storage: nothing to remove from.
  }
}

// The saved ids as they are now: re-read when a heart announces a change, when another tab writes storage, and on focus.
export function useSavedIds() {
  const [ids, setIds] = useState(readSavedIds)
  useEffect(() => {
    const refresh = () => {
      const next = readSavedIds()
      setIds((previous) => (previous.join() === next.join() ? previous : next))
    }
    window.addEventListener('storage', refresh)
    window.addEventListener(WISHLIST_EVENT, refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener(WISHLIST_EVENT, refresh)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return ids
}

// Loads each saved product, at most LOAD_CONCURRENCY requests at a time. A 404 means the product is gone for good;
// any other failure keeps the id so a later visit can try again. Products come back in the order of `ids`.
async function loadSaved(ids) {
  const results = new Map()
  let next = 0
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next]
      next += 1
      try {
        const payload = await api(`/products/${encodeURIComponent(id)}?Scope.SaleType=${encodeURIComponent(SALE_TYPE)}`)
        results.set(id, payload?.product ? { product: payload.product, relations: payload.relations || {} } : { gone: true })
      } catch (error) {
        results.set(id, error?.status === 404 ? { gone: true } : { failed: true })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(LOAD_CONCURRENCY, ids.length) }, worker))
  const entries = ids.map((id) => results.get(id))
  const relations = entries.reduce((merged, entry) => ({
    brands: [...merged.brands, ...(entry?.relations?.brands || [])],
    strains: [...merged.strains, ...(entry?.relations?.strains || [])],
  }), { brands: [], strains: [] })
  return {
    products: entries.filter((entry) => entry?.product).map((entry) => entry.product),
    relations,
    gone: ids.filter((id) => results.get(id)?.gone),
    failed: entries.filter((entry) => entry?.failed).length,
  }
}

// Saved products, newest first. Un-saving a product takes effect on the next visit, not while the page is open.
export function SavedPage() {
  const { storeName } = useCart()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ status: 'loading' })
  usePageTitle(`Saved · ${storeName}`)

  useEffect(() => {
    let active = true
    const current = readSavedIds().slice().reverse()
    if (!current.length) {
      setState({ status: 'ready', products: [], relations: { brands: [], strains: [] }, gone: [], failed: 0 })
      return undefined
    }
    setState({ status: 'loading' })
    loadSaved(current).then((loaded) => {
      if (!active) return
      // Products that no longer exist are dropped from the saved list for good.
      if (loaded.gone.length) writeSavedIds(readSavedIds().filter((id) => !loaded.gone.includes(id)))
      setState({ status: 'ready', ...loaded })
    })
    return () => { active = false }
  }, [attempt])

  if (state.status === 'loading') {
    return (
      <div className="sheet page saved-page" aria-busy="true">
        <header className="page-head">
          <h1 className="page-title">Saved</h1>
          <p className="page-note" role="status">Loading your saved products…</p>
        </header>
        <ProductGridSkeleton count={4} />
      </div>
    )
  }

  const maps = relationMaps(state.relations)
  const count = state.products.length
  return (
    <div className="sheet page saved-page">
      <header className="page-head">
        <h1 className="page-title">Saved</h1>
        {count > 0 && <p className="page-lede">{count} saved {count === 1 ? 'product' : 'products'}, kept in this browser.</p>}
      </header>
      {state.failed > 0 && (
        <p className="saved-notice" role="alert">
          {state.failed} saved {state.failed === 1 ? 'product' : 'products'} didn’t load.
          <button className="secondary-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
        </p>
      )}
      {count > 0 ? (
        <ProductGrid products={state.products} brands={maps.brands} strains={maps.strains} />
      ) : (
        <div className="state-panel saved-empty">
          <Heart size={28} aria-hidden="true" />
          <p>Nothing saved yet — tap the heart on any product to keep it here.</p>
          <Link className="primary-button" to="/">Browse the menu</Link>
        </div>
      )}
    </div>
  )
}
