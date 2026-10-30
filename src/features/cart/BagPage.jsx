import { useCallback, useMemo, useRef, useState } from 'react'
import { ArrowRight, ShoppingBag, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DEMO_MODE } from '../../config.js'
import { usePageTitle } from '../../lib/usePageTitle.js'
import { categoryIdOf, money } from '../../lib/format.js'
import { useCart } from '../../layout/CartContext.jsx'
import { ProductImage } from '../../ui/ProductImage.jsx'
import { QuantityStepper } from '../../ui/QuantityStepper.jsx'
import { cartLines, checkoutBlock, totalsView } from './cartLines.js'
import { AvailabilityNotice, CartTotals, LimitMeters, LineNotices, LinePrice, PromoChips, PromoNudge } from './CartParts.jsx'
import { PickupCard } from './PickupCard.jsx'

// The full bag at /bag: for long bags and phones. The same cart, limits, availability and totals as the rail.
export function BagPage() {
  const { cart, cartLoading, cartError, cartTotal, cartCount, categoryById, changeCartItem, clearCart, refreshCart } = useCart()
  usePageTitle('Your bag')
  const lines = useMemo(() => cartLines(cart), [cart])
  const { blocked } = checkoutBlock(cart)
  // Below 900px the summary comes after the lines, so in a long bag its Checkout is a scroll away. While it is out of
  // view, a bar pinned to the bottom carries Checkout and the total (the "View bag" bar is not shown here: one bottom
  // bar at a time). Under the sticky top bar counts as out of view: the button is covered there. The top bar's height
  // changes (it wraps on narrow screens, a row can appear), so the watch is set up again whenever it does.
  const [checkoutInView, setCheckoutInView] = useState(true)
  const stopWatching = useRef(() => {})
  const watchCheckout = useCallback((node) => {
    stopWatching.current()
    stopWatching.current = () => {}
    if (!node || typeof IntersectionObserver === 'undefined') { setCheckoutInView(true); return }
    const bar = document.querySelector('.topbar')
    let covered = -1
    let seen = null
    const watch = () => {
      const height = bar?.offsetHeight || 0
      if (height === covered) return
      covered = height
      seen?.disconnect()
      seen = new IntersectionObserver(([entry]) => setCheckoutInView(entry.isIntersecting), { rootMargin: `-${height}px 0px 0px 0px` })
      seen.observe(node)
    }
    watch()
    const resized = bar && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(watch) : null
    resized?.observe(bar)
    stopWatching.current = () => { seen?.disconnect(); resized?.disconnect() }
  }, [])

  if (!lines.length) {
    if (!cart && cartError) {
      return (
        <section className="sheet bag-page bag-state">
          <h1>We couldn’t load your bag</h1>
          <p>The store did not answer. Try again in a moment.</p>
          <button type="button" className="secondary-button" onClick={() => refreshCart()}>Try again</button>
        </section>
      )
    }
    if (!cart && cartLoading) {
      return (
        <section className="sheet bag-page bag-state">
          <h1>Loading your bag…</h1>
        </section>
      )
    }
    return (
      <section className="sheet bag-page bag-state">
        <ShoppingBag size={36} strokeWidth={1.5} aria-hidden="true" />
        <h1>Your bag is empty</h1>
        <p>Add something from the menu and it will show up here.</p>
        <Link className="primary-button" to="/">Browse the menu</Link>
      </section>
    )
  }

  return (
    <section className="sheet bag-page">
      <header className="bag-head">
        <h1 tabIndex={-1}>Your bag <span className="bag-count-text">({cartCount})</span></h1>
        <button type="button" className="rail-clear" onClick={clearCart}>Empty bag</button>
      </header>

      <div className="bag-layout">
        <ul className="bag-lines">
          {lines.map((line) => (
            <li className="bag-line" key={line.purchaseKey}>
              <ProductImage product={line.image} category={categoryById[categoryIdOf(line.product)]} className="bag-thumb" />
              <div className="bag-line-info">
                <h2 className="bag-line-name">{line.name}</h2>
                {line.detail && <p className="bag-line-detail">{line.detail}</p>}
                <PromoChips names={line.promotions} />
                <LineNotices line={line} onRemove={() => changeCartItem(line.purchaseKey, -line.quantity, line.name)} />
              </div>
              <div className="bag-line-foot">
                <QuantityStepper quantity={line.quantity} name={line.name} onChange={(delta) => changeCartItem(line.purchaseKey, delta, line.name)} />
                <button type="button" className="line-remove" aria-label={`Remove ${line.name}`} onClick={() => changeCartItem(line.purchaseKey, -line.quantity, line.name)}>
                  <Trash2 size={15} aria-hidden="true" /> Remove
                </button>
                <LinePrice line={line} className="bag-line-price" />
              </div>
            </li>
          ))}
        </ul>

        <aside className="bag-summary" aria-label="Order summary">
          <LimitMeters cart={cart} />
          <PromoNudge cart={cart} />
          <CartTotals totals={cart.totals} fallback={cartTotal} />
          <p className="bag-muted">Taxes calculated at checkout</p>
          <AvailabilityNotice cart={cart} />
          {DEMO_MODE
            ? <p className="bag-muted">Online checkout isn’t available yet.</p>
            : blocked
              ? <button type="button" className="cart-checkout" disabled ref={watchCheckout}>Checkout</button>
              : <Link className="cart-checkout" to="/checkout" ref={watchCheckout}>Checkout <ArrowRight size={18} aria-hidden="true" /></Link>}
          <Link className="bag-continue" to="/">Continue shopping</Link>
          <PickupCard className="bag-pickup" />
          <p className="bag-age"><strong>You must be 21+ to purchase.</strong> Have a valid government-issued ID ready at pickup.</p>
        </aside>
      </div>

      {!DEMO_MODE && !checkoutInView && (blocked
        ? <button type="button" className="cart-checkout bag-checkout-bar" disabled><span>Checkout</span><strong>{money(totalsView(cart.totals).total ?? cartTotal)}</strong></button>
        : <Link className="cart-checkout bag-checkout-bar" to="/checkout"><span>Checkout</span><strong>{money(totalsView(cart.totals).total ?? cartTotal)}</strong></Link>)}
    </section>
  )
}
