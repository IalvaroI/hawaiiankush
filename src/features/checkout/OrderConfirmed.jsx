import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useCart } from '../../layout/CartContext.jsx'
import { cleanText } from '../../lib/format.js'
import { fetchOrder } from '../orders/ordersApi.js'
import { useSignedIn } from '../orders/useSignedIn.js'
import { windowSummary } from './checkoutDraft.js'

const NEXT = {
  delivery: 'We’ll text you when your order is on its way. Have a valid ID ready for the driver.',
  curbside: 'Park in a pickup spot and we’ll text you when it’s ready. Bring a valid ID.',
  driveThrough: 'Pull into the drive-through and we’ll text you when it’s ready. Bring a valid ID.',
  inStorePickup: 'We’ll text you when it’s ready for pickup — bring a valid ID.',
}

// Where and when the order is collected, as chosen at checkout: the store's address for pickup (its name when it has no
// address), the shopper's for delivery.
// The order number the store quotes ("#1042") comes only with the order itself, which Sweed shows to signed-in shoppers;
// a guest sees the order's reference instead, as a reference, not as the order number.
export function OrderConfirmed({ placed, onKeepShopping }) {
  const { store } = useCart()
  const { status: session } = useSignedIn()
  const [number, setNumber] = useState(session === 'in' ? 'loading' : '')
  const delivering = placed.choice === 'delivery'
  const where = delivering ? placed.address : cleanText(store?.contacts?.address) || cleanText(store?.name)
  const heading = useRef(null)
  // The checkout above was long and scrolled; the confirmation starts at the top, clear of the sticky top bar.
  useEffect(() => {
    window.scrollTo(0, 0)
    heading.current?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    if (session !== 'in') return undefined
    let live = true
    fetchOrder(placed.orderId)
      .then((order) => { if (live) setNumber(cleanText(String(order?.number ?? ''))) })
      .catch(() => { if (live) setNumber('') })
    return () => { live = false }
  }, [session, placed.orderId])
  return (
    <div className="sheet co-page">
      <section className="co-confirm" aria-labelledby="co-confirm-title">
        <span className="co-confirm-mark" aria-hidden="true"><Check size={40} strokeWidth={2.5} /></span>
        <h1 id="co-confirm-title" tabIndex={-1} ref={heading}>Order placed</h1>
        {number && number !== 'loading' && (
          <p>Order number <strong>#{number}</strong> · <Link className="co-order-link" to={`/orders/${encodeURIComponent(placed.orderId)}`}>View order</Link></p>
        )}
        {!number && <p className="co-reference">Order reference <span>{placed.orderId}</span></p>}
        {(where || placed.timeWindow) && (
          <p className="co-where">
            {where && <>{delivering ? 'Delivery to' : 'Pick up at'} <strong>{where}</strong></>}
            {where && placed.timeWindow && <br />}
            {placed.timeWindow && <strong>{windowSummary(placed.timeWindow)}</strong>}
          </p>
        )}
        <p className="co-next">{NEXT[placed.choice] || NEXT.inStorePickup}</p>
        <button type="button" className="primary-button" onClick={onKeepShopping}>Keep shopping</button>
      </section>
    </div>
  )
}
