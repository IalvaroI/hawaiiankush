import { useMemo } from 'react'
import { ArrowRight, Clock, Trash2, ShoppingBag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DEMO_MODE } from '../../config.js'
import { categoryIdOf } from '../../lib/format.js'
import { useContent } from '../../lib/content.js'
import { useCart } from '../../layout/CartContext.jsx'
import { ProductImage } from '../../ui/ProductImage.jsx'
import { QuantityStepper } from '../../ui/QuantityStepper.jsx'
import { SiteImage, imageSources } from '../../ui/SiteImage.jsx'
import { CtaLink } from '../../layout/Hero.jsx'
import { cartLines, checkoutBlock } from './cartLines.js'
import { AvailabilityNotice, CartTotals, LimitMeters, LineNotices, LinePrice, PromoChips, PromoNudge } from './CartParts.jsx'
import { PickupCard } from './PickupCard.jsx'

// The bag as a side rail, shown from 1280px. Totals and line math come from cartLines and the cart itself.
export function CartRail() {
  const { cart, cartCount, cartTotal, categoryById, changeCartItem, clearCart, openCheckout } = useCart()
  const { promo } = useContent()
  const lines = useMemo(() => cartLines(cart), [cart])
  const empty = !lines.length
  const { blocked } = checkoutBlock(cart)

  return (
    <aside className="cart-rail" aria-label="Your bag">
      {/* The heading, total and Checkout stay pinned at the top of the rail while the lines scroll under them, so
          checking out is one click from anywhere in a long bag. */}
      <div className={`rail-summary${empty ? '' : ' has-items'}`}>
        <div className="rail-head">
          <h2 tabIndex={-1}>{empty ? 'Your bag' : `Your bag (${cartCount})`}</h2>
          {!empty && <button type="button" className="rail-clear" onClick={clearCart}>Empty bag</button>}
        </div>
        {!empty && (
          <div className="rail-totals">
            <CartTotals totals={cart.totals} fallback={cartTotal} />
            <p className="rail-muted">Taxes calculated at checkout</p>
            <AvailabilityNotice cart={cart} />
            {DEMO_MODE
              ? <p className="rail-muted">Online checkout isn’t available yet.</p>
              : <button type="button" className="rail-checkout cart-checkout" disabled={blocked} onClick={openCheckout}>Checkout <ArrowRight size={18} aria-hidden="true" /></button>}
          </div>
        )}
      </div>

      {empty ? (
        <div className="rail-empty">
          <ShoppingBag size={28} strokeWidth={1.5} aria-hidden="true" />
          <p>Your bag is empty</p>
          <Link className="rail-link" to="/">Browse the menu</Link>
        </div>
      ) : (
        <>
          <ul className="rail-lines">
            {lines.map((line) => (
              <li className="rail-line" key={line.purchaseKey}>
                <ProductImage product={line.image} category={categoryById[categoryIdOf(line.product)]} className="cart-thumb" />
                <div className="rail-line-info">
                  <h3>{line.name}</h3>
                  {line.detail && <p className="rail-line-detail">{line.detail}</p>}
                  <LinePrice line={line} className="rail-line-price" />
                </div>
                <div className="rail-line-side">
                  <QuantityStepper quantity={line.quantity} name={line.name} onChange={(delta) => changeCartItem(line.purchaseKey, delta, line.name)} />
                  <button type="button" className="line-remove" aria-label={`Remove ${line.name}`} onClick={() => changeCartItem(line.purchaseKey, -line.quantity, line.name)}>
                    <Trash2 size={15} aria-hidden="true" /> Remove
                  </button>
                </div>
                {(line.promotions.length > 0 || line.notices.length > 0) && (
                  <div className="rail-line-extra">
                    <PromoChips names={line.promotions} />
                    <LineNotices line={line} onRemove={() => changeCartItem(line.purchaseKey, -line.quantity, line.name)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <LimitMeters cart={cart} />
        </>
      )}


      {!empty && <PromoNudge cart={cart} />}

      <PickupCard className="rail-card rail-pickup" />

      <div className="rail-card rail-age">
        <Clock size={20} aria-hidden="true" />
        <div>
          <strong>21+ with valid ID</strong>
          <span>Bring a photo ID to pickup.</span>
        </div>
      </div>

      {promo?.title && (
        <div className={`rail-promo ${imageSources(promo.image) ? 'has-media' : ''}`}>
          <SiteImage className="rail-promo-media" image={promo.image} sizes="300px" />
          {promo.eyebrow && <p className="eyebrow">{promo.eyebrow}</p>}
          <p className="rail-promo-title">{promo.title}</p>
          {promo.cta?.label && promo.cta?.to && (
            <CtaLink className="rail-promo-button" to={promo.cta.to}>{promo.cta.label} <ArrowRight size={16} aria-hidden="true" /></CtaLink>
          )}
        </div>
      )}
    </aside>
  )
}
