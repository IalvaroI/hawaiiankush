import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useCart } from '../../layout/CartContext.jsx'
import { SignInPrompt } from './SignInPrompt.jsx'
import { StatusPill } from './StatusPill.jsx'
import { OrderTimeline } from './OrderTimeline.jsx'
import { OrderReceipt } from './OrderReceipt.jsx'
import { OrderPayment } from './OrderPayment.jsx'
import { useOrder } from './useOrder.js'
import { useSignedIn } from './useSignedIn.js'
import {
  dateTimeText, fulfillmentLabel, isActive, isDelivery, itemsText, quantityOf, sameStore, whenText, windowText,
} from './orderModel.js'
import './orders.css'

// /orders/:orderId: one order, with its progress, fulfillment, payment, receipt and Order again.
export function OrderPage() {
  const { orderId } = useParams()
  const session = useSignedIn()
  if (session.status === 'out') return <SignInPrompt />
  return (
    <div className="sheet ord-page">
      <div className="ord-wrap">
        {session.status === 'loading' && <p className="ord-muted" role="status">Loading your order…</p>}
        {session.status === 'error' && (
          <div className="ord-state" role="alert">
            <h1>Couldn’t check your sign-in</h1>
            <p>Check your connection and try again.</p>
            <button type="button" className="primary-button ord-state-action" onClick={session.retry}>Try again</button>
          </div>
        )}
        {session.status === 'in' && <OrderDetail orderId={orderId} />}
      </div>
    </div>
  )
}

function OrderDetail({ orderId }) {
  const { store, changeCartItem, refreshCart, quantities, flash } = useCart()
  const [params] = useSearchParams()
  // Coming back from the payment page: the store redirects here with ?paid=1.
  const returning = params.get('paid') === '1'
  const { status, order, error, confirming, timedOut, refresh, checkAgain } = useOrder(orderId, { returning })
  const [reordering, setReordering] = useState(false)

  if (status === 'loading') return <p className="ord-muted" role="status">Loading your order…</p>

  if (status === 'missing') {
    return (
      <div className="ord-state">
        <h1>Order not found</h1>
        <p>It may have been removed, or it belongs to another account.</p>
        <Link className="secondary-button ord-state-action" to="/orders">Back to your orders</Link>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="ord-state" role="alert">
        <h1>Couldn’t load this order</h1>
        <p>{error}</p>
        <button type="button" className="primary-button ord-state-action" onClick={refresh}>Try again</button>
      </div>
    )
  }

  const type = order.status?.type
  const cancelled = type === 'cancelled'
  const actionNeeded = type === 'actionRequired'
  const done = type === 'pickedUp' || type === 'delivered'
  const delivery = isDelivery(order)
  const timing = order.timeTracking || {}
  const slot = windowText(order.timeWindow)
  const lines = (order.items || [])
    .map((item) => ({ purchaseKey: item.purchaseKey, quantity: quantityOf(item.quantity) }))
    .filter((line) => line.purchaseKey && line.quantity > 0)
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)
  const method = order.deliveryMethod
  const storeMatches = method?.type === 'pickup' && sameStore(method, store)

  // Adds every line back to the bag one after another, then checks the bag to report what was actually added.
  async function orderAgain() {
    if (!lines.length || reordering) return
    const before = Object.fromEntries(lines.map((line) => [line.purchaseKey, quantityOf(quantities[line.purchaseKey])]))
    setReordering(true)
    try {
      // Started together, the bag batches these into a single cart update instead of one request per line.
      await Promise.all(lines.map((line) => changeCartItem(line.purchaseKey, line.quantity, 'item')))
      // The store's cart read can fail on its own; one more try before reporting that the bag could not be checked.
      const cart = (await refreshCart()) || (await refreshCart())
      if (!cart) {
        flash('We couldn’t check your bag. Open the bag to see what is in it.', 'error')
        return
      }
      const after = Object.fromEntries((cart.items || []).map((item) => [item.purchaseKey, quantityOf(item.quantity?.current ?? item.quantity)]))
      const added = lines.filter((line) => (after[line.purchaseKey] || 0) > before[line.purchaseKey]).length
      flash(`Added ${added} of ${lines.length} items to your bag`, added === lines.length ? 'success' : 'error')
    } finally {
      setReordering(false)
    }
  }

  return (
    <>
      <header className="ord-head ord-detail-head">
        <Link className="ord-back" to="/orders"><ArrowLeft size={16} aria-hidden="true" /> All orders</Link>
        <div className="ord-title-row">
          <h1>Order #{order.number}</h1>
          <StatusPill status={order.status} />
        </div>
        {order.timeTracking?.createdAt && <p className="ord-muted">Placed {dateTimeText(order.timeTracking.createdAt)}</p>}
      </header>

      {cancelled && (
        <div className="ord-banner is-cancelled" role="status">
          <strong>This order was cancelled</strong>
          <p>{order.status?.reason || 'No reason was given.'}</p>
        </div>
      )}
      {actionNeeded && (
        <div className="ord-banner is-action" role="status">
          <strong>Action needed</strong>
          <p>{order.status?.reason || 'Please contact the store.'}</p>
        </div>
      )}

      <div className="ord-grid">
        <div className="ord-main">
          {!cancelled && (
            <section className="ord-panel ord-progress" aria-label="Progress">
              <OrderTimeline order={order} />
              {isActive(order) && timing.estimatedAt && (
                <p className="ord-callout">{delivery ? 'Estimated delivery by' : 'Estimated ready by'} <strong>{whenText(timing.estimatedAt)}</strong></p>
              )}
              {isActive(order) && timing.expiredAt && (
                <p className="ord-callout">We’ll hold it until <strong>{whenText(timing.expiredAt)}</strong></p>
              )}
              {done && timing.finishedAt && (
                <p className="ord-callout">{type === 'delivered' ? 'Delivered' : 'Picked up'} <strong>{dateTimeText(timing.finishedAt)}</strong></p>
              )}
              {slot && <p className="ord-callout">Time window <strong>{slot}</strong></p>}
            </section>
          )}

          <section className="ord-panel" aria-labelledby="ord-fulfil-title">
            <h2 id="ord-fulfil-title">Fulfillment</h2>
            <p className="ord-fulfil-type">{fulfillmentLabel(method)}</p>
            {delivery && method.location?.address && (
              <address className="ord-address">
                {method.location.address}
                {method.location.secondaryAddress && <><br />{method.location.secondaryAddress}</>}
              </address>
            )}
            {storeMatches && (
              <address className="ord-address">
                {store?.name && <strong>{store.name}</strong>}
                {store?.name && store?.contacts?.address && <br />}
                {store?.contacts?.address}
              </address>
            )}
          </section>

          <section className="ord-panel" aria-labelledby="ord-items-title">
            <h2 id="ord-items-title">Items</h2>
            <p>{itemsText(itemCount)}</p>
            {lines.length > 0 && (
              <button type="button" className="secondary-button ord-wide" onClick={orderAgain} disabled={reordering}>
                {reordering ? 'Adding to your bag…' : 'Order again'}
              </button>
            )}
          </section>
        </div>

        <aside className="ord-side">
          <OrderPayment order={order} confirming={confirming} timedOut={timedOut} onCheckAgain={checkAgain} />
          <OrderReceipt receipt={order.receipt} />
        </aside>
      </div>
    </>
  )
}
