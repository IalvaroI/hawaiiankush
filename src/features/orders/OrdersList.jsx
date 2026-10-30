import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { money } from '../../lib/format.js'
import { fetchOrders } from './ordersApi.js'
import { StatusPill } from './StatusPill.jsx'
import { dateTimeText, fulfillmentLabel, itemsText } from './orderModel.js'
import { errorText } from '../../lib/errors.js'

// Order history, newest first, ten at a time. "Show more" loads the next page and appends it.
export function OrdersList({ onProblem }) {
  const [state, setState] = useState({ status: 'loading', items: [], total: 0, page: 0, loadingMore: false, moreError: '', error: '' })
  const seq = useRef(0)
  const problemRef = useRef(onProblem)
  problemRef.current = onProblem

  const loadPage = useCallback(async (next, append) => {
    const id = ++seq.current
    setState((prev) => (append ? { ...prev, loadingMore: true, moreError: '' } : { ...prev, status: 'loading', error: '' }))
    try {
      const result = await fetchOrders(next)
      if (id !== seq.current) return
      const rows = result?.items || []
      setState((prev) => {
        const seen = new Set(append ? prev.items.map((order) => order.id) : [])
        return {
          status: 'ready',
          items: append ? [...prev.items, ...rows.filter((order) => !seen.has(order.id))] : rows,
          total: Number(result?.totalItems) || 0,
          page: next,
          loadingMore: false,
          moreError: '',
          error: '',
        }
      })
    } catch (err) {
      if (id !== seq.current) return
      setState((prev) => (append
        ? { ...prev, loadingMore: false, moreError: errorText(err, 'More orders could not be loaded. Try again.') }
        : { ...prev, status: 'error', loadingMore: false, error: errorText(err, 'Your orders could not be loaded. Try again in a moment.') }))
      // The session may have ended; the page re-checks it and shows sign-in if so.
      problemRef.current?.()
    }
  }, [])

  useEffect(() => { loadPage(1, false) }, [loadPage])

  const hasMore = state.items.length < state.total

  return (
    <>
      <header className="ord-head">
        <h1>Your orders</h1>
        {state.status === 'ready' && state.total > 0 && <p className="ord-muted">{state.total} {state.total === 1 ? 'order' : 'orders'}</p>}
      </header>

      {state.status === 'loading' && (
        <ul className="ord-list" aria-busy="true" aria-label="Loading orders">
          {[0, 1, 2].map((key) => <li key={key} className="ord-card is-skeleton" aria-hidden="true" />)}
        </ul>
      )}

      {state.status === 'error' && (
        <div className="ord-state" role="alert">
          <h2>Couldn’t load your orders</h2>
          <p>{state.error}</p>
          <button type="button" className="primary-button ord-state-action" onClick={() => loadPage(1, false)}>Try again</button>
        </div>
      )}

      {state.status === 'ready' && state.items.length === 0 && (
        <div className="ord-state">
          <h2>No orders yet</h2>
          <p>Orders you place appear here with their status and receipt.</p>
          <Link className="primary-button ord-state-action" to="/">Browse the menu</Link>
        </div>
      )}

      {state.status === 'ready' && state.items.length > 0 && (
        <>
          <ul className="ord-list">
            {state.items.map((order) => <OrderRow key={order.id} order={order} />)}
          </ul>
          <div className="ord-more">
            <p className="ord-muted">Showing {state.items.length} of {state.total}</p>
            {hasMore && (
              <button type="button" className="secondary-button" onClick={() => loadPage(state.page + 1, true)} disabled={state.loadingMore}>
                {state.loadingMore ? 'Loading…' : 'Show more'}
              </button>
            )}
            {state.moreError && <p className="ord-note is-bad" role="alert">{state.moreError}</p>}
          </div>
        </>
      )}
    </>
  )
}

function OrderRow({ order }) {
  const placed = order.timeTracking?.createdAt
  return (
    <li>
      <article className="ord-card">
        <div className="ord-card-top">
          <Link className="ord-card-link" to={`/orders/${encodeURIComponent(order.id)}`}>Order #{order.number}</Link>
          <StatusPill status={order.status} />
        </div>
        <p className="ord-card-meta">
          <time dateTime={placed}>{dateTimeText(placed)}</time>
          <span aria-hidden="true"> · </span>
          <span>{fulfillmentLabel(order.deliveryMethod)}</span>
        </p>
        <div className="ord-card-foot">
          <span className="ord-muted">{itemsText(order.itemsQuantity)}</span>
          <strong className="ord-card-total">{money(order.priceTotal)}</strong>
        </div>
      </article>
    </li>
  )
}
