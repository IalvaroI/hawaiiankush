import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchOrder } from './ordersApi.js'
import { isActive, isPaid } from './orderModel.js'
import { errorText } from '../../lib/errors.js'

const CONFIRM_EVERY_MS = 3000
const CONFIRM_FOR_MS = 60000
const ACTIVE_EVERY_MS = 60000

// One order: its first load, silent refreshes while it is active (every 60 s, only while the tab is visible),
// and, when the shopper comes back from a payment (`returning`), polling every 3 s for up to 60 s until it is paid.
export function useOrder(orderId, { returning = false } = {}) {
  const [state, setState] = useState({ status: 'loading', order: null, error: '' })
  const [timedOut, setTimedOut] = useState(false)
  const seq = useRef(0)

  const load = useCallback(async () => {
    const id = ++seq.current
    try {
      const order = await fetchOrder(orderId)
      if (id !== seq.current) return
      if (order) setState({ status: 'ready', order, error: '' })
      else setState((prev) => (prev.order ? prev : { status: 'missing', order: null, error: '' }))
    } catch (error) {
      if (id !== seq.current) return
      if (error.status === 404) setState({ status: 'missing', order: null, error: '' })
      // A refresh that fails keeps the last good order on screen; only the first load shows an error.
      else setState((prev) => (prev.order ? prev : { status: 'error', order: null, error: errorText(error, 'Your order could not be loaded. Try again in a moment.') }))
    }
  }, [orderId])

  useEffect(() => {
    setState({ status: 'loading', order: null, error: '' })
    setTimedOut(false)
    load()
    return () => { seq.current++ }
  }, [load])

  const order = state.order
  const rejected = order?.payment?.transaction?.status === 'rejected'
  const confirming = Boolean(returning && order && !isPaid(order) && !rejected && !timedOut)
  const active = Boolean(order && isActive(order))

  useEffect(() => {
    if (!confirming) return undefined
    const started = Date.now()
    const timer = window.setInterval(() => {
      if (Date.now() - started >= CONFIRM_FOR_MS) {
        window.clearInterval(timer)
        setTimedOut(true)
        return
      }
      if (document.visibilityState === 'visible') load()
    }, CONFIRM_EVERY_MS)
    return () => window.clearInterval(timer)
  }, [confirming, load])

  useEffect(() => {
    if (!active || confirming) return undefined
    const refresh = () => { if (document.visibilityState === 'visible') load() }
    const timer = window.setInterval(refresh, ACTIVE_EVERY_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [active, confirming, load])

  const checkAgain = useCallback(() => {
    setTimedOut(false)
    load()
  }, [load])

  return { status: state.status, order, error: state.error, confirming, timedOut, refresh: load, checkAgain }
}
