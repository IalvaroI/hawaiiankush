import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CART_KEY, DEMO_MODE, GUEST_KEY, SALE_TYPE } from '../../config.js'
import { DEMO_PRODUCTS } from '../../demo-data.js'
import { sessionGet, sessionSet, storageGet, storageSet } from '../../lib/storage.js'
import { applyDeltas, cartLines, cartQuantity } from './cartLines.js'
import { api } from '../../api/client.js'
import { trackCartChange } from '../../lib/analytics.js'
import { withRetry } from './cartRequest.js'
import { CART_COOKIE, readCartCookie } from '../../../shared/cartCookie.js'
import { errorText, SIGNED_OUT_MESSAGE } from '../../lib/errors.js'
import { moveDraft } from '../checkout/checkoutDraft.js'

// Statuses meaning the store refused the request as sent (a bad or unavailable line), so retrying line by line can help.
const REJECTED = new Set([400, 404, 422])
const FLUSHED_KEY = `${CART_KEY}:flushed-at`
// Sweed's id for the signed-in shopper's own cart.

// Taps on the same line inside this window go out as one PATCH /items. The store answers 429 to quick cart writes.
export const WRITE_WINDOW_MS = 350
const FAILED_TEXT = 'Your bag could not be updated. Try again.'
const stuckText = (lines) => (lines.length > 1
  ? `${lines.length} items are no longer available, and the store couldn’t change them in your bag. Ask the store to remove them.`
  : `${lines[0].name || 'An item'} is no longer available, and the store couldn’t change it in your bag. Ask the store to remove it.`)
const encode = encodeURIComponent

// The id the proxy put in a cookie when the cart was created (shared/cartCookie.js). It covers a page that was left
// before the create request answered, when the page itself never learned the id.
function cookieCartId() {
  try { return readCartCookie(document.cookie) } catch { return '' }
}

function clearCartCookie() {
  try { document.cookie = `${CART_COOKIE}=; Max-Age=0; Path=${import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}; SameSite=Lax` } catch { /* no cookies */ }
}

function storedCartId() {
  const stored = storageGet(CART_KEY)
  if (stored || DEMO_MODE) return stored || ''
  const fromCookie = cookieCartId()
  if (fromCookie) storageSet(CART_KEY, fromCookie)
  return fromCookie
}

function quantityIn(cart, purchaseKey) {
  return cartQuantity((cart?.items || []).find((item) => item.purchaseKey === purchaseKey))
}

// The cart with its relations merged in, the shape every consumer reads.
async function fetchCart(id) {
  const result = await withRetry(() => api(`/carts/${encode(id)}`))
  return result?.cart ? { ...result.cart, relations: result.relations } : result
}

// A read-back retries a few times: the store answers a server error, or nothing, now and then.
async function readCart(id) {
  let lastError = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetchCart(id)
    } catch (err) {
      lastError = err
      if (err.status && err.status < 500) throw err
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)))
    }
  }
  throw lastError
}

// Cart state shared by the top bar, the cart rail, the bag drawer, the bag page and the menu.
// `flash` shows a toast; `openBag` is called from an Undo/View bag toast action.
//
// Quantity changes are optimistic and coalesced: each tap is shown at once and queued; the queue sends one PATCH per
// window with every pending delta, then the cart is read back. The shown bag is the server bag plus whatever is still
// queued or on its way (the overlay), so the count is right before the store has answered.
export function useCartState({ flash, openBag }) {
  const [cartId, setCartId] = useState(storedCartId)
  // An Undo can run after the cart was replaced, so cart writes read the current ID, not the one from their render.
  const cartIdRef = useRef(cartId)
  cartIdRef.current = cartId
  const flashRef = useRef(flash)
  flashRef.current = flash
  const openBagRef = useRef(openBag)
  openBagRef.current = openBag

  const [serverCart, setServerCart] = useState(null)
  const cartRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [overlay, setOverlay] = useState({})
  const overlayRef = useRef({})
  // Batches: `open` collects taps, `sending` is on its way to the store. Each batch keeps a waiter per tap.
  const openRef = useRef(null)
  const sendingRef = useRef(null)
  // Resolves when the batch in flight has finished. Reads wait for it: the store answers 500 to overlapping reads of one cart.
  const settledRef = useRef(Promise.resolve())
  // Set when a batch creates the bag: the refresh that the new id triggers would repeat the read-back that follows.
  const skipRefreshRef = useRef('')
  const timerRef = useRef(0)
  // Set when a request for the account's bag answered 401: the sign-in lapsed. Cleared when the shopper signs in again.
  const [signInLapsed, setSignInLapsed] = useState(false)
  const [demoItems, setDemoItems] = useState(() => {
    try { return JSON.parse(storageGet(`${CART_KEY}:demo`) || '{}') } catch { return {} }
  })

  // A reload or a closed tab must not drop taps still inside the window: send them now, with keepalive so the request outlives the page.
  useEffect(() => {
    const sendNow = () => {
      if (!openRef.current && !sendingRef.current) return
      if (!sendingRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = 0
        flush({ keepalive: true })
      }
      // The next page may read the cart before the store applies this write, or before a new cart's id is known; it
      // looks again shortly (see below).
      sessionSet(FLUSHED_KEY, String(Date.now()))
    }
    window.addEventListener('pagehide', sendNow)
    return () => {
      window.removeEventListener('pagehide', sendNow)
      window.clearTimeout(timerRef.current)
    }
  }, [])

  function commit(next) {
    cartRef.current = next
    setServerCart(next)
  }

  // The overlay is the sum of every change not yet reflected in the server cart.
  function recompute() {
    const sums = {}
    for (const batch of [openRef.current, sendingRef.current]) {
      if (!batch) continue
      for (const [key, change] of batch.changes) sums[key] = (sums[key] || 0) + change.delta
    }
    overlayRef.current = sums
    setOverlay(sums)
  }

  function shownQuantity(purchaseKey) {
    return Math.max(0, quantityIn(cartRef.current, purchaseKey) + (overlayRef.current[purchaseKey] || 0))
  }

  function forgetCart() {
    storageSet(CART_KEY, null)
    clearCartCookie()
    cartIdRef.current = ''
    setCartId('')
    commit(null)
  }

  // Only the account's bag is read with a token, so a 401 on the bag means the sign-in lapsed: the device lets go of
  // that bag (it is still the account's on the store) and says so; signing in again finds it (adoptUserCart).
  function lapseSignIn() {
    forgetCart()
    setSignInLapsed(true)
    flashRef.current(SIGNED_OUT_MESSAGE, 'error')
  }

  const refreshCart = useCallback(async (id = cartIdRef.current) => {
    if (!id) { commit(null); return null }
    setLoading(true)
    try {
      await settledRef.current
      const next = await fetchCart(id)
      // The bag may have been forgotten or replaced while this read waited: an old bag is never brought back.
      if (cartIdRef.current !== id) return null
      setLoadError('')
      commit(next)
      return next
    } catch (err) {
      if (cartIdRef.current !== id) return null
      // A 404 is a bag that is gone; a 401 a sign-in that has lapsed (see lapseSignIn).
      if (err.status === 404) forgetCart()
      else if (err.status === 401) lapseSignIn()
      else {
        setLoadError(errorText(err, 'Your bag could not be loaded.'))
        flashRef.current(errorText(err, 'Your bag could not be loaded. Try again in a moment.'), 'error')
      }
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (DEMO_MODE) {
      const items = DEMO_PRODUCTS.filter((product) => Number(demoItems[product.variants[0].purchaseKey] || 0) > 0).map((product) => {
        const variant = product.variants[0]
        // Demo prices are per unit; the store's line prices cover every unit of the line.
        const quantity = Number(demoItems[variant.purchaseKey])
        const line = (value) => (value == null ? null : Number(value) * quantity)
        return { purchaseKey: variant.purchaseKey, productId: product.id, variantId: variant.id, quantity: { current: quantity }, prices: { base: line(variant.prices.base), discounted: line(variant.prices.discounted) } }
      })
      const total = items.reduce((sum, item) => sum + Number(item.prices.discounted ?? item.prices.base), 0)
      commit(items.length ? { id: 'demo-cart', items, totals: { base: total }, relations: { products: DEMO_PRODUCTS } } : null)
      return
    }
    if (cartId && cartId === skipRefreshRef.current) { skipRefreshRef.current = ''; return }
    if (cartId) refreshCart(cartId)
    // A write sent as the previous page closed can land after this page's first read, so read once more.
    const flushedAt = Number(sessionGet(FLUSHED_KEY) || 0)
    // If that write was creating the bag, its id arrives in the proxy's cookie; watch for it for a few seconds.
    if (!cartId && Date.now() - flushedAt < 10000) {
      let tries = 0
      const timer = window.setInterval(() => {
        tries += 1
        const found = cookieCartId()
        if (found && !cartIdRef.current) {
          storageSet(CART_KEY, found)
          cartIdRef.current = found
          setCartId(found)
        }
        if (found || tries >= 12) window.clearInterval(timer)
      }, 500)
      return () => window.clearInterval(timer)
    }
    if (cartId && Date.now() - flushedAt < 10000) {
      sessionSet(FLUSHED_KEY, null)
      const timer = window.setTimeout(() => refreshCart(cartId), 1500)
      return () => window.clearTimeout(timer)
    }
  }, [cartId, refreshCart, demoItems])

  // Demo mode keeps the bag in local storage; there is no store to send to.
  function applyDemo(changes) {
    setDemoItems((current) => {
      const next = { ...current }
      for (const { purchaseKey, delta } of changes) {
        const quantity = Number(next[purchaseKey] || 0) + delta
        if (quantity > 0) next[purchaseKey] = quantity
        else delete next[purchaseKey]
      }
      storageSet(`${CART_KEY}:demo`, JSON.stringify(next))
      return next
    })
  }

  // One PATCH for all lines. If the store rejects it outright (one line it no longer sells can fail the whole request),
  // the lines are sent one by one so the rest still go in; a refused line counts as nothing applied.
  async function writeLines(id, changes, keepalive, { oneByOne = false } = {}) {
    const patch = async (list) => {
      const response = await withRetry(() => api(`/carts/${encode(id)}/items`, {
        method: 'PATCH',
        keepalive,
        body: JSON.stringify({ items: list.map(({ purchaseKey, delta }) => ({ purchaseKey, quantityDelta: delta })) }),
      }))
      return new Map((response?.items || []).map((item) => [item.purchaseKey, Number(item.quantityDelta)]).filter(([, value]) => Number.isFinite(value)))
    }
    if (!oneByOne) {
      try {
        return { applied: await patch(changes), refused: new Set(), failed: new Set() }
      } catch (error) {
        if (changes.length < 2 || !REJECTED.has(error.status)) throw error
      }
    }
    // `failed` keeps the lines whose write failed, and `refused` those of them the store answered "not found" for, so a
    // removal it didn't make is noticed (see settle).
    const applied = new Map()
    const refused = new Set()
    const failed = new Set()
    for (const change of changes) {
      try {
        for (const [key, value] of await patch([change])) applied.set(key, value)
      } catch (error) {
        applied.set(change.purchaseKey, 0)
        failed.add(change.purchaseKey)
        if (error.status === 404) refused.add(change.purchaseKey)
      }
    }
    return { applied, refused, failed }
  }

  // Sends one batch: one PATCH for every line that changed (or one POST when the bag does not exist yet), then reads the cart back.
  // Resolves with the cart (undefined in demo mode; `confirmed` when the store sent it rather than the change being
  // applied locally), the delta the store applied per line, the lines whose write failed and those of them it refused as
  // not found, and the quantities before the batch.
  async function sendBatch(batch, sentId, { keepalive = false } = {}) {
    const changes = [...batch.changes].filter(([, change]) => change.delta).map(([purchaseKey, change]) => ({ purchaseKey, delta: change.delta }))
    const before = new Map(changes.map(({ purchaseKey }) => [purchaseKey, quantityIn(cartRef.current, purchaseKey)]))
    if (!changes.length) return { cart: undefined, cartId: sentId, applied: new Map(), before }
    if (DEMO_MODE) {
      applyDemo(changes)
      return { cart: undefined, cartId: sentId, applied: new Map(changes.map(({ purchaseKey, delta }) => [purchaseKey, delta])), before }
    }
    let id = sentId
    let applied = new Map()
    let refused = new Set()
    let failed = new Set()
    if (!id) {
      let created
      try {
        // Always keepalive: leaving the page must not cancel the request that creates the bag (its id comes back in a cookie).
        created = await withRetry(() => api('/carts', {
          method: 'POST',
          keepalive: true,
          body: JSON.stringify({ settings: { saleType: SALE_TYPE, isResident: false }, items: changes.map(({ purchaseKey, delta }) => ({ purchaseKey, quantity: delta })) }),
        }))
      } catch (error) {
        if (changes.length < 2 || !REJECTED.has(error.status)) throw error
        // One line the store refuses would sink the whole new bag; start it empty and add the lines one by one.
        created = await withRetry(() => api('/carts', { method: 'POST', keepalive: true, body: JSON.stringify({ settings: { saleType: SALE_TYPE, isResident: false } }) }))
        if (created?.id) ({ applied, refused, failed } = await writeLines(created.id, changes, keepalive, { oneByOne: true }))
      }
      id = created?.id
      if (!id) throw new Error('The store did not return a cart ID.')
      storageSet(CART_KEY, id)
      cartIdRef.current = id
      skipRefreshRef.current = id
      setCartId(id)
    } else {
      ({ applied, refused, failed } = await writeLines(id, changes, keepalive))
    }
    // The write went through. If the read-back still fails, show the change locally and read again shortly.
    let cart = null
    let confirmed = true
    try {
      cart = await readCart(id)
    } catch {
      confirmed = false
      cart = applyDeltas(cartRef.current, Object.fromEntries(applied))
      window.setTimeout(() => { if (cartIdRef.current === id && !sendingRef.current) refreshCart(id) }, 2000)
    }
    return { cart, confirmed, cartId: id, applied, refused, failed, before }
  }

  // Tells the shopper what happened to each line in a batch: a clamped add, a new line, or a removal with Undo.
  function notify(batch, { cart, applied, before }) {
    for (const [purchaseKey, change] of batch.changes) {
      if (change.silent || !change.delta) continue
      const requested = change.delta
      const serverBefore = before.get(purchaseKey) ?? 0
      const appliedDelta = applied.has(purchaseKey) ? applied.get(purchaseKey) : cart ? quantityIn(cart, purchaseKey) - serverBefore : requested
      const after = serverBefore + appliedDelta
      if (requested > 0) {
        if (appliedDelta < requested) {
          // The store can accept the request yet add less (a purchase limit, or it just sold out); say so.
          flashRef.current(appliedDelta <= 0
            ? `The store couldn’t add ${change.before ? 'more of ' : ''}${change.name || 'this item'}. It may be limited or just sold out.`
            : `Only ${appliedDelta} added — the store limits this item.`, 'error')
          return
        }
        if (change.before === 0) {
          flashRef.current('Added to your bag', 'success', { label: 'View bag', opensCart: true, run: () => openBagRef.current?.() })
          return
        }
      } else if (after <= 0) {
        // Removing the last one is the step people regret; offer it back instead of asking first.
        flashRef.current(`Removed ${change.name || 'item'}`, 'success', { label: 'Undo', undo: true, run: () => changeCartItem(purchaseKey, change.before, change.name) })
        return
      }
    }
  }

  function schedule() {
    if (!timerRef.current && !sendingRef.current) timerRef.current = window.setTimeout(flush, WRITE_WINDOW_MS)
  }

  async function flush({ keepalive = false } = {}) {
    timerRef.current = 0
    const batch = openRef.current
    if (!batch || sendingRef.current) return
    openRef.current = null
    sendingRef.current = batch
    let finish = () => {}
    settledRef.current = new Promise((resolve) => { finish = resolve })
    try {
      await settle(batch, keepalive)
    } finally {
      finish()
    }
    if (openRef.current) schedule()
  }

  // The removals among `keys` the store didn't make, for lines its bag still holds. When it answered "not found" (a
  // product gone from the menu, say), the bag is kept as the store has it and the shopper is told.
  function keptLines(batch, cart, keys) {
    return [...batch.changes]
      .filter(([purchaseKey, change]) => keys.has(purchaseKey) && change.delta < 0 && quantityIn(cart, purchaseKey) > 0)
      .map(([purchaseKey, change]) => ({ purchaseKey, name: change.name }))
  }

  // Sends one batch and settles its taps: the bag is updated, the taps are told what happened and the waiters resolve or reject.
  async function settle(batch, keepalive) {
    const sentCartId = cartIdRef.current
    let result = null
    let failure = null
    try {
      result = await sendBatch(batch, sentCartId, { keepalive })
    } catch (err) {
      failure = err
    }
    if (failure) {
      let message = errorText(failure, FAILED_TEXT)
      // The batch counts as on its way until the read-back below is done, so taps made meanwhile wait for it and then
      // go to whichever bag is current (a new one, if this one turns out to be gone).
      if (failure.status === 401 && sentCartId && cartIdRef.current === sentCartId) {
        lapseSignIn()
        message = ''
      } else if (sentCartId && cartIdRef.current === sentCartId) {
        // Read back so the bag shows what the store really holds, even if the write landed before the error. A failed
        // create has no bag to read yet. A 404 on the write can mean a product that is gone (taken off the menu) as well
        // as a bag that is gone, so the bag is forgotten only when the store has no bag under that id either.
        let fresh = null
        try {
          fresh = await readCart(sentCartId)
        } catch (err) {
          if (failure.status === 404 && err.status === 404 && cartIdRef.current === sentCartId) forgetCart()
        }
        if (fresh && cartIdRef.current === sentCartId) {
          commit(fresh)
          // A 404 that gets this far is for a one-line batch (writeLines sends longer ones line by line).
          const stuck = failure.status === 404 ? keptLines(batch, fresh, new Set(batch.changes.keys())) : []
          if (stuck.length) message = stuckText(stuck)
        }
      }
      sendingRef.current = null
      recompute()
      if (message) flashRef.current(message, 'error')
      batch.waiters.forEach((waiter) => waiter.reject(failure))
    } else {
      sendingRef.current = null
      let stuck = []
      let unchanged = []
      // A batch sent for a bag that has since been reset must not bring the old bag back.
      if (result.cart !== undefined && cartIdRef.current === result.cartId) {
        commit(result.cart)
        // Sent line by line, a removal that failed does not fail the batch; it is caught here.
        if (result.confirmed && result.failed?.size) {
          stuck = keptLines(batch, result.cart, result.refused)
          unchanged = keptLines(batch, result.cart, result.failed).filter((line) => !result.refused.has(line.purchaseKey))
        }
      }
      recompute()
      notify(batch, result)
      // After the batch's own notices, which they outrank.
      if (stuck.length) flashRef.current(stuckText(stuck), 'error')
      else if (unchanged.length) flashRef.current(FAILED_TEXT, 'error')
      // The waiters learn which lines are still in the bag although a removal was asked for (see clearCart).
      const kept = [...stuck, ...unchanged].map((line) => line.purchaseKey)
      batch.waiters.forEach((waiter) => waiter.resolve(kept))
    }
  }

  // Adds a change to the open batch. The promise settles when the batch has been sent. Silent changes raise no notice.
  function queueChange(purchaseKey, delta, { name = '', silent = false } = {}) {
    return new Promise((resolve, reject) => {
      if (!openRef.current) openRef.current = { changes: new Map(), waiters: [] }
      const batch = openRef.current
      const existing = batch.changes.get(purchaseKey)
      batch.changes.set(purchaseKey, {
        delta: (existing?.delta || 0) + delta,
        before: existing ? existing.before : shownQuantity(purchaseKey),
        name: existing?.name || name,
        silent: existing ? existing.silent && silent : silent,
      })
      batch.waiters.push({ resolve, reject })
      recompute()
      schedule()
    })
  }

  // One tap: `delta` is the change to the shown quantity. Taps are queued, not blocked, so the controls stay responsive.
  function changeCartItem(purchaseKey, delta, name = '') {
    trackCartChange(purchaseKey, delta, name, cartRef.current)
    return queueChange(purchaseKey, delta, { name }).catch(() => {})
  }

  // Removes every line in one write; Undo adds the same quantities back.
  async function clearCart() {
    const keys = new Set([...(cartRef.current?.items || []).map((item) => item.purchaseKey), ...Object.keys(overlayRef.current)])
    const names = Object.fromEntries(cartLines(cartRef.current).map((line) => [line.purchaseKey, line.name]))
    const lines = [...keys].map((purchaseKey) => ({ purchaseKey, quantity: shownQuantity(purchaseKey), name: names[purchaseKey] || '' })).filter((line) => line.quantity > 0)
    if (!lines.length) return
    const restore = () => Promise.all(lines.map(({ purchaseKey, quantity }) => queueChange(purchaseKey, quantity, { silent: true })))
      .then(() => flashRef.current('Your items are back in your bag', 'success'))
      .catch(() => {})
    try {
      for (const { purchaseKey, quantity } of lines) trackCartChange(purchaseKey, -quantity, '', cartRef.current)
      const kept = (await Promise.all(lines.map(({ purchaseKey, quantity, name }) => queueChange(purchaseKey, -quantity, { name, silent: true })))).flat()
      // A line the store kept has already been reported (see settle); the bag is not cleared, so no Undo either.
      if (kept.some((purchaseKey) => lines.some((line) => line.purchaseKey === purchaseKey))) return
      flashRef.current('Bag cleared', 'success', { label: 'Undo', undo: true, run: restore })
    } catch {
      // The failed write has already been reported.
    }
  }

  // Called after an order is placed: the cart is gone on the server side too.
  function resetCart() {
    storageSet(CART_KEY, null)
    clearCartCookie()
    sessionSet(GUEST_KEY, null)
    cartIdRef.current = ''
    setCartId('')
    commit(null)
    const dropped = openRef.current
    openRef.current = null
    window.clearTimeout(timerRef.current)
    timerRef.current = 0
    dropped?.waiters.forEach((waiter) => waiter.reject(new Error('The bag was reset')))
    recompute()
  }

  // After sign-in the guest bag has been moved into the account's cart, whose id the transfer doesn't return. Creating a
  // cart while signed in hands back the account's own cart, so that is how its id is learned.
  async function adoptUserCart() {
    if (DEMO_MODE) return
    try {
      const created = await withRetry(() => api('/carts', { method: 'POST', body: JSON.stringify({ settings: { saleType: SALE_TYPE, isResident: false } }) }))
      if (!created?.id) return
      // A checkout begun as a guest, or before the sign-in lapsed, carries on with the account's bag.
      moveDraft(created.id)
      storageSet(CART_KEY, created.id)
      cartIdRef.current = created.id
      setCartId(created.id)
      setSignInLapsed(false)
      await refreshCart(created.id)
    } catch {
      // Keep whatever cart the device had; the next add creates or finds one.
    }
  }

  // What is shown: the server bag with the pending changes applied. Quantities include lines still being added.
  const cart = useMemo(() => applyDeltas(serverCart, overlay), [serverCart, overlay])
  const quantities = useMemo(() => {
    const map = Object.fromEntries((cart?.items || []).map((item) => [item.purchaseKey, cartQuantity(item)]))
    for (const [key, delta] of Object.entries(overlay)) if (!(key in map) && delta > 0) map[key] = delta
    return map
  }, [cart, overlay])
  const cartCount = Object.values(quantities).reduce((sum, value) => sum + value, 0)
  const cartTotal = cart?.totals?.discounted ?? cart?.totals?.base

  return {
    cartId,
    cart,
    signInLapsed,
    lapseSignIn,
    cartLoading: loading,
    cartError: loadError,
    quantities,
    cartCount,
    cartTotal,
    refreshCart,
    changeCartItem,
    clearCart,
    resetCart,
    adoptUserCart,
  }
}
