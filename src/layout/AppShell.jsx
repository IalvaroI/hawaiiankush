import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Check, ShoppingBag, X } from 'lucide-react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client.js'
import { DEMO_MODE, SALE_TYPE, STORE_ID } from '../config.js'
import { DEMO_CATEGORIES } from '../demo-data.js'
import { useStore } from '../hooks/useStore.js'
import { CartDrawer } from '../features/cart/CartDrawer.jsx'
import { CartRail } from '../features/cart/CartRail.jsx'
import { useCartState } from '../features/cart/useCartState.js'
import { money } from '../lib/format.js'
import { CartProvider } from './CartContext.jsx'
import { MobileNav } from './MobileNav.jsx'
import { Sidebar } from './Sidebar.jsx'
import { TopBar } from './TopBar.jsx'
import { useMediaQuery } from './useMediaQuery.js'
import { AgeGate } from '../features/compliance/AgeGate.jsx'

// Toasts: one at a time. Success toasts clear themselves (longer when they offer Undo); errors stay until dismissed.
function useNotice() {
  const [notice, setNotice] = useState(null)
  const timer = useRef(0)
  const flash = useCallback((message, kind = 'success', action = null) => {
    window.clearTimeout(timer.current)
    setNotice({ message, kind, action })
    if (kind === 'success') timer.current = window.setTimeout(() => setNotice(null), action?.undo ? 6000 : 2800)
  }, [])
  const dismiss = useCallback(() => { window.clearTimeout(timer.current); setNotice(null) }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return { notice, flash, dismiss }
}

// Frame around every page: sidebar | top bar + page | cart rail, with the overlays (bag, checkout, toasts) above it.
export function AppShell() {
  const store = useStore()
  // Empty until the store loads; the server already put the store's name in the first page title.
  const storeName = store?.name || ''
  const logo = store?.settings?.images?.logo || ''
  const { pathname } = useLocation()
  const wide = useMediaQuery('(min-width: 1280px)')
  const { notice, flash, dismiss } = useNotice()
  const [categories, setCategories] = useState([])
  // Facets from the latest catalog response; the menu fills them, the sidebar reads the Staff Picks tag from them.
  const [facets, setFacets] = useState([])
  const staffPickId = useMemo(() => {
    const option = facets.find((facet) => facet.key === 'userTag')?.options?.find((entry) => /staff\s*pick/i.test(entry.name || ''))
    return option ? String(option.value) : ''
  }, [facets])
  const [cartOpen, setCartOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  // Below 1280px the bag is a drawer; at 1280px and up the rail is already on screen, except on checkout, which has its
  // own summary instead of the rail and so opens the drawer like a narrow screen. On the bag page the bag is the page.
  const openBag = useCallback(() => {
    if (pathname === '/bag') document.querySelector('.bag-page h1')?.focus({ preventScroll: true })
    else if (wide && pathname !== '/checkout') document.querySelector('.cart-rail h2')?.focus({ preventScroll: true })
    else setCartOpen(true)
  }, [wide, pathname])

  const cart = useCartState({ flash, openBag })

  const categoryList = useMemo(() => categories.map((item) => ({ ...item, value: String(item.value ?? item.id) })), [categories])
  // Top-level categories are the pills; their children (subcategories set up in Sweed) are looked up by id too, each
  // knowing its parent, so a subcategory page can show its siblings.
  const categoryById = useMemo(() => {
    const entries = []
    for (const item of categoryList) {
      entries.push([item.value, item])
      for (const child of Array.isArray(item.children) ? item.children : []) {
        const value = String(child?.value ?? child?.id ?? '')
        if (value && child?.name) entries.push([value, { ...child, value, parent: item.value }])
      }
    }
    return Object.fromEntries(entries)
  }, [categoryList])

  useEffect(() => {
    if (DEMO_MODE) { setCategories(DEMO_CATEGORIES); return }
    if (!STORE_ID) return
    let active = true
    api(`/categories?Scope.SaleType=${encodeURIComponent(SALE_TYPE)}`)
      .then((result) => { if (active) setCategories(result?.items || []) })
      .catch(() => { if (active) setCategories([]) })
    return () => { active = false }
  }, [])


  // Each route starts at the top; filter and search changes keep the scroll position (they replace the query).
  useEffect(() => {
    window.scrollTo({ top: 0 })
    setNavOpen(false)
  }, [pathname])

  const navigate = useNavigate()
  // Checkout is its own page; the bag drawer closes on the way there.
  // `step` opens that checkout step (the rail's pickup Change asks for 'fulfillment'); a click event is not a step.
  const openCheckout = useCallback((step) => { setCartOpen(false); navigate(typeof step === 'string' ? `/checkout?step=${step}` : '/checkout') }, [navigate])

  const showToastAction = notice?.action && !(notice.action.opensCart && (cartOpen || wide))
  const showMobileBag = !wide && cart.cartCount > 0 && !cartOpen && pathname !== '/checkout' && pathname !== '/bag' && !filtersOpen && !navOpen

  const value = {
    store,
    storeName,
    categoryList,
    categoryById,
    flash,
    openBag,
    openCheckout,
    filtersOpen,
    setFiltersOpen,
    facets,
    setFacets,
    wide,
    ...cart,
  }

  return (
    <CartProvider value={value}>
      <div className={`shell ${pathname === '/checkout' ? 'no-rail' : ''}`}>
        <AgeGate />
        <Sidebar storeName={storeName} logo={logo} staffPickId={staffPickId} />
        <div className="shell-main">
          <TopBar storeName={storeName} onMenu={() => setNavOpen(true)} navOpen={navOpen} onBag={openBag} focused={pathname === '/checkout'} />
          <main id="main" className="shell-page" tabIndex={-1}>
            <Outlet />
          </main>
          <footer className="site-footer">
            {storeName && <span>{storeName}</span>}
            <span>For adults 21 and over with valid ID. Keep out of reach of children.</span>
          </footer>
        </div>
        {/* The checkout page has its own order summary, so the rail steps aside there. */}
        {wide && pathname !== '/checkout' && <CartRail />}
      </div>

      {showMobileBag && (
        <button type="button" className="mobile-bag-bar" onClick={openBag}>
          <ShoppingBag size={18} aria-hidden="true" />
          <span>View bag · {cart.cartCount}</span>
          <strong>{money(cart.cartTotal)}</strong>
        </button>
      )}

      {notice && (
        <div className={`toast toast-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.kind === 'error' ? <AlertCircle size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
          <span>{notice.message}</span>
          {showToastAction && <button type="button" className="toast-action" onClick={() => { dismiss(); notice.action.run() }}>{notice.action.label}</button>}
          <button type="button" className="toast-close" aria-label="Dismiss message" onClick={dismiss}><X size={16} /></button>
        </div>
      )}

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart.cart}
        cartCount={cart.cartCount}
        cartTotal={cart.cartTotal}
        categoryById={categoryById}
        busyKey={cart.busyKey}
        onChange={cart.changeCartItem}
        onCheckout={pathname === '/checkout' ? null : openCheckout}
      />



      {navOpen && !wide && <MobileNav storeName={storeName} logo={logo} staffPickId={staffPickId} onClose={() => setNavOpen(false)} />}
    </CartProvider>
  )
}
