import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Menu, Search, ShoppingBag, User, X } from 'lucide-react'
import { useCart } from './CartContext.jsx'
import { useSession } from '../features/account/useSession.js'
import { SALE_TYPE } from '../config.js'
import { MedicalNotice, SaleTypeSwitch, canSwitchSaleType } from '../features/compliance/SaleTypeSwitch.jsx'

const SEARCH_DELAY = 280
const CATALOG_PATHS = new Set(['/', '/shop'])

// The search box writes the `q` query parameter (replace, after a short pause), the same URL the catalog reads.
// `focused` (checkout): no search or sale-type switch, so the form starts near the top.
export function TopBar({ storeName, onMenu, onBag, navOpen, focused = false }) {
  const { session } = useSession()
  const { cartCount, store } = useCart()
  const [searchParams, setSearchParams] = useSearchParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const urlQuery = searchParams.get('q') || ''
  const [draft, setDraft] = useState(urlQuery)
  const lastWritten = useRef(urlQuery)
  const urlQueryRef = useRef(urlQuery)
  urlQueryRef.current = urlQuery
  const onCatalog = CATALOG_PATHS.has(pathname) || pathname.startsWith('/c/')
  const showSaleSwitch = canSwitchSaleType(store)
  const medical = SALE_TYPE === 'medical'

  // Back/forward or a chip removal changes the query; bring the box along unless the user is typing.
  useEffect(() => {
    if (urlQuery !== lastWritten.current) {
      lastWritten.current = urlQuery
      setDraft(urlQuery)
    }
  }, [urlQuery])

  useEffect(() => {
    const term = draft.trim()
    if (term === urlQueryRef.current) return undefined
    const timer = window.setTimeout(() => {
      lastWritten.current = term
      if (onCatalog) {
        setSearchParams((previous) => {
          const next = new URLSearchParams(previous)
          if (term) next.set('q', term)
          else next.delete('q')
          return next
        }, { replace: true })
      } else if (term) {
        navigate({ pathname: '/shop', search: `?q=${encodeURIComponent(term)}` })
      }
    }, SEARCH_DELAY)
    return () => window.clearTimeout(timer)
    // Only typing starts a write; URL changes are handled by the effect above.
  }, [draft])

  // The bar stays at the top of the screen (sticky). Its height is shared as --topbar-h, so whatever else sticks or is
  // scrolled into view sits below it.
  const barRef = useRef(null)
  useEffect(() => {
    const bar = barRef.current
    if (!bar) return undefined
    const root = document.documentElement
    const observer = new ResizeObserver(() => root.style.setProperty('--topbar-h', `${bar.offsetHeight}px`))
    observer.observe(bar)
    return () => { observer.disconnect(); root.style.removeProperty('--topbar-h') }
  }, [])

  return (
    <>
      <header ref={barRef} className={`topbar${focused ? ' is-focused' : ''}`}>
        {onMenu && (
          <button type="button" className="top-icon top-menu" aria-label="Open menu" aria-expanded={navOpen} aria-haspopup="dialog" onClick={onMenu}>
            <Menu size={22} aria-hidden="true" />
          </button>
        )}
        <Link to="/" className="top-name" aria-label={storeName ? undefined : 'Home'}>{storeName}</Link>
        {medical && <span className="sale-badge">Medical</span>}
        {!focused && (
          <form className="top-search" role="search" onSubmit={(event) => event.preventDefault()}>
            <Search size={18} aria-hidden="true" />
            <label className="sr-only" htmlFor="top-search-input">Search products</label>
            <input id="top-search-input" type="search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Search strains, products, or brands…" autoComplete="off" />
            {draft && (
              <button type="button" className="top-search-clear" aria-label="Clear search" onClick={() => setDraft('')}><X size={16} aria-hidden="true" /></button>
            )}
          </form>
        )}
        {showSaleSwitch && !focused && <SaleTypeSwitch />}
        <Link to={session?.signedIn ? '/account' : pathname === '/checkout' ? '/sign-in?next=%2Fcheckout' : '/sign-in'} className="top-icon top-account" aria-label={session?.signedIn ? 'Your account' : 'Sign in'}>
          <User size={20} aria-hidden="true" />
        </Link>
        <button className="bag-button" type="button" onClick={onBag} aria-label={`Open bag, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}`}>
          <ShoppingBag size={20} aria-hidden="true" />
          {cartCount > 0 && <span className="bag-count">{cartCount}</span>}
        </button>
      </header>
      {medical && <MedicalNotice />}
    </>
  )
}
