import { useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ShoppingBag, Trash2, X } from 'lucide-react'
import { DEMO_MODE } from '../../config.js'
import { useDialog } from '../../hooks/useDialog.js'
import { categoryIdOf } from '../../lib/format.js'
import { ProductImage } from '../../ui/ProductImage.jsx'
import { QuantityStepper } from '../../ui/QuantityStepper.jsx'
import { cartLines, checkoutBlock } from './cartLines.js'
import { AvailabilityNotice, CartTotals, LimitMeters, LineNotices, LinePrice, PromoChips, PromoNudge } from './CartParts.jsx'

// Bag drawer for widths without the cart rail (below 1280px), and on checkout at any width (no rail there).
export function CartDrawer({ open, onClose, cart, cartCount, cartTotal, categoryById, onChange, onCheckout }) {
  const ref = useRef(null)
  useDialog(open, onClose, ref)
  const lines = useMemo(() => cartLines(cart), [cart])
  const { blocked } = checkoutBlock(cart)
  if (!open) return null
  return (
    <div className="backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title" ref={ref}>
        <div className="panel-header">
          <h2 id="cart-title" tabIndex={-1}>Bag{cartCount > 0 && <span className="count-badge">{cartCount}</span>}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close bag"><X size={20} /></button>
        </div>
        {!lines.length ? (
          <div className="drawer-empty">
            <ShoppingBag size={32} strokeWidth={1.5} aria-hidden="true" />
            <h3>Your bag is empty</h3>
            <Link className="primary-button" to="/" onClick={onClose}>Browse products</Link>
          </div>
        ) : (
          <>
            <ul className="cart-lines">
              {lines.map((line) => (
                <li className="cart-line" key={line.purchaseKey}>
                  <ProductImage product={line.image} category={categoryById[categoryIdOf(line.product)]} className="cart-thumb" />
                  <div className="cart-line-info">
                    <h3>{line.name}</h3>
                    {line.detail && <p>{line.detail}</p>}
                    <div className="cart-line-actions">
                      <QuantityStepper quantity={line.quantity} name={line.name} onChange={(delta) => onChange(line.purchaseKey, delta, line.name)} />
                      {/* The line goes with its Remove button, so focus moves to the bag's heading, not off the dialog. */}
                      <button type="button" className="line-remove" aria-label={`Remove ${line.name}`} onClick={() => { onChange(line.purchaseKey, -line.quantity, line.name); ref.current?.querySelector('#cart-title')?.focus() }}>
                        <Trash2 size={15} aria-hidden="true" /> Remove
                      </button>
                    </div>
                  </div>
                  <LinePrice line={line} className="cart-line-price" />
                  {(line.promotions.length > 0 || line.notices.length > 0) && (
                    <div className="cart-line-extra">
                      <PromoChips names={line.promotions} />
                      <LineNotices line={line} onRemove={() => onChange(line.purchaseKey, -line.quantity, line.name)} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="cart-summary">
              <LimitMeters cart={cart} />
              <PromoNudge cart={cart} />
              <CartTotals totals={cart?.totals} label="Subtotal" fallback={cartTotal} />
              <p>Tax and fees are added at checkout.</p>
              <AvailabilityNotice cart={cart} />
              {/* On the checkout page itself (no onCheckout) the way on is back to the checkout behind the drawer. */}
              {DEMO_MODE
                ? <p className="demo-note">Online checkout isn’t available yet.</p>
                : onCheckout
                  ? <button className="cart-checkout wide" type="button" disabled={blocked} onClick={onCheckout}>Checkout <ArrowRight size={18} aria-hidden="true" /></button>
                  : <button className="secondary-button wide" type="button" onClick={onClose}>Back to checkout</button>}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
