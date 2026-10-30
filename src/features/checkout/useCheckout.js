import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api/client.js'
import { useCart } from '../../layout/CartContext.jsx'
import { cartQuantity } from '../cart/cartLines.js'
import { trackCart } from '../../lib/analytics.js'
import {
  addressText, allRequiredDone, clearCheckoutDrafts, contactErrors, deliveryMethodFor, draftFromCheckout, fillBlankGuest, isGuestCheckout, nextIncomplete,
  readDraft, readGuest, reconcileDraft, sameCode, settingsPayload, STEPS, trimGuest, writeDraft, writeGuest,
} from './checkoutDraft.js'
import { errorText, ShopperError } from '../../lib/errors.js'
import { money } from '../../lib/format.js'

// All checkout state for one cart: the server's latest answer, the shopper's draft (one settings object plus the
// step state), the contact, and every write. Each write sends the complete settings and the guest.
export function useCheckout({ cartId, refreshCart, resetCart, onPlaced, onSignInLapsed }) {
  const [checkout, setCheckout] = useState(null)
  const [draft, setDraft] = useState(() => readDraft(cartId))
  const [guest, setGuest] = useState(readGuest)
  const [changes, setChanges] = useState([])
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState('')
  const [errors, setErrors] = useState({})

  // The draft and the contact survive a refresh (this tab only). Nothing typed is lost on an error either.
  useEffect(() => { if (draft) writeDraft(draft) }, [draft])
  useEffect(() => { writeGuest(guest) }, [guest])

  const reload = useCallback(async () => {
    setLoadError('')
    try {
      const result = await api(`/carts/${encodeURIComponent(cartId)}/checkout`)
      setCheckout(result)
      // A notice about changed items stays until the shopper acknowledges it (a re-read after a bag tap must not clear
      // it and unblock Place order); a new one replaces it.
      if (result.itemChanges?.length) setChanges(result.itemChanges)
      if (result.guest) setGuest((current) => fillBlankGuest(current, result.guest))
      // The store's own list of applied promo codes wins: a code it stopped applying is not shown as applied.
      setDraft((current) => {
        const base = current || draftFromCheckout(result, cartId)
        return reconcileDraft({ ...base, promoCodes: result.settings?.promoCodes ?? base.promoCodes }, result.options)
      })
    } catch (err) {
      if (err.status === 401) { onSignInLapsed(); return }
      setLoadError(errorText(err, 'Checkout could not be loaded. Try again in a moment.'))
    }
  }, [cartId, onSignInLapsed])

  useEffect(() => { reload() }, [reload])

  // begin_checkout once per visit, when the checkout opens with items in the bag.
  const { cart } = useCart()
  // The bag can change while checkout is open (the bag drawer works on every page). The lines follow the bag at once;
  // the total, fees and options come from the store's checkout, so it is read again whenever the bag changes: once when
  // the change shows, and again when the store's own cart totals confirm it.
  const contents = cart?.items?.length
    ? `${cart.items.map((item) => `${item.purchaseKey}:${cartQuantity(item)}`).join('|')}#${JSON.stringify(cart.totals || null)}`
    : ''
  const seenContents = useRef(contents)
  useEffect(() => {
    if (contents === seenContents.current) return
    seenContents.current = contents
    if (contents) reload()
  }, [contents, reload])
  const began = useRef(false)
  useEffect(() => { if (!began.current && cart?.items?.length) { began.current = true; trackCart('begin_checkout', cart) } }, [cart])

  // Runs one write at a time; a failure is shown under the step that caused it and nothing else changes.
  const attempt = useCallback(async (key, action) => {
    setBusy(key)
    setErrors((current) => ({ ...current, [key]: '' }))
    try {
      await action()
      return true
    } catch (err) {
      if (err.status === 401) onSignInLapsed()
      else setErrors((current) => ({ ...current, [key]: errorText(err, 'That didn’t save. Try again.') }))
      return false
    } finally {
      setBusy('')
    }
  }, [onSignInLapsed])

  const updateDraft = useCallback((patch) => {
    setDraft((current) => ({ ...current, ...patch }))
    // A message about an old choice is stale as soon as the shopper changes something.
    setErrors((current) => (Object.keys(current).some((key) => current[key]) ? {} : current))
  }, [])

  // One PATCH with the complete settings and, for a guest cart, the complete contact. Returns the response.
  async function save(next) {
    const body = { settings: settingsPayload(next), ...(isGuestCheckout() ? { guest: trimGuest(guest) } : {}) }
    const result = await api(`/carts/${encodeURIComponent(cartId)}/checkout`, { method: 'PATCH', body: JSON.stringify(body) })
    setCheckout(result)
    // As in reload: a new notice replaces the shown one; only "Review and continue" clears it.
    if (result.itemChanges?.length) setChanges(result.itemChanges)
    return result
  }

  // Saves one step and opens the next incomplete one. `patch` lets a button save a different choice in one click.
  async function saveStep(key, patch = {}) {
    return attempt(key, async () => {
      const options = checkout?.options
      if (key === 'contact' && Object.keys(contactErrors(guest)).length) throw new ShopperError('Check your contact details.')
      let next = { ...draft, ...patch }
      if (key === 'fulfillment') {
        if (!next.choice) throw new ShopperError('Choose pickup or delivery.')
        if (next.choice === 'delivery' && !deliveryMethodFor(next)) throw new ShopperError('Check that we deliver to this address before continuing.')
        // Time windows belong to the fulfillment method, so a new method asks for a time again.
        next = { ...next, timeWindow: null, done: { ...next.done, time: false } }
      }
      if (key === 'time' && options?.timeWindows?.required && !next.timeWindow) throw new ShopperError('Choose a time.')
      if (key === 'payment' && options?.paymentMethods?.required && !next.paymentType) throw new ShopperError('Choose a payment method.')
      const result = await save(next)
      if (key === 'fulfillment') trackCart('add_shipping_info', cart, { shipping_tier: next.choice })
      if (key === 'payment') trackCart('add_payment_info', cart, { payment_type: next.paymentType })
      const saved = reconcileDraft({ ...next, done: { ...next.done, [key]: true } }, result.options)
      setDraft({ ...saved, step: nextIncomplete(saved, result.options, STEPS.indexOf(key)) })
    })
  }

  async function applyPromo(text) {
    const code = String(text || '').trim()
    return attempt('promo', async () => {
      if (!code) throw new ShopperError('Enter a promo code.')
      if (draft.promoCodes.some(sameCode(code))) throw new ShopperError('That code is already applied.')
      const next = { ...draft, promoCodes: [...draft.promoCodes, code] }
      const result = await save(next)
      const codes = result.settings?.promoCodes ?? next.promoCodes
      // A code the store does not take is not kept, even when the request itself succeeded.
      if (!codes.some(sameCode(code))) throw new ShopperError('That promo code can’t be applied to this order.')
      setDraft((current) => ({ ...current, promoCodes: codes }))
    })
  }

  async function removePromo(code) {
    await attempt('promo', async () => {
      const promoCodes = draft.promoCodes.filter((item) => !sameCode(code)(item))
      const result = await save({ ...draft, promoCodes })
      setDraft((current) => ({ ...current, promoCodes: result.settings?.promoCodes ?? promoCodes }))
    })
  }

  // The points the store applied are what counts: it may cap them, or apply none, whatever was asked.
  async function setLoyaltyPoints(points) {
    await attempt('loyalty', async () => {
      const result = await save({ ...draft, loyaltyPoints: points })
      const applied = result.settings?.loyaltyPoints ?? null
      setDraft((current) => ({ ...current, loyaltyPoints: applied }))
      if (points != null && points !== '' && applied == null) throw new ShopperError('The store didn’t apply those points. Try a smaller amount.')
    })
  }

  // Saves the whole checkout once more, then creates the order. Item changes at either point stop the order and
  // show the reconciliation panel instead.
  const UNCONFIRMED = 'We couldn’t confirm your order. Check your email before you try again.'
  async function placeOrder() {
    await attempt('place', async () => {
      if (!allRequiredDone(draft, checkout?.options)) throw new ShopperError('Finish the steps above to place your order.')
      const shown = checkout?.receipt?.totals?.total
      const result = await save(draft)
      const reconciled = reconcileDraft(draft, result.options)
      setDraft((current) => reconcileDraft(current, result.options))
      if (result.itemChanges?.length) return
      // A time or payment method the store stopped offering just now reopens its step: no order without it.
      if (!allRequiredDone(reconciled, result.options)) throw new ShopperError('Something you chose is no longer offered. Check the steps above, then place your order.')
      // The order is placed at the store's current total. If that is not the total on the button, stop: the shopper sees
      // the new one (the save above already shows it) and places the order again knowing what it costs.
      const now = result.receipt?.totals?.total
      if (shown != null && now != null && Math.abs(Number(now) - Number(shown)) >= 0.005) {
        throw new ShopperError(`Your total changed from ${money(shown)} to ${money(now)}. Check it, then place your order.`)
      }
      let order
      try {
        order = await api('/orders', { method: 'POST', body: JSON.stringify({ cartId }) })
      } catch (err) {
        // No answer, or a server fault: the order may have been created anyway, so "try again" could place it twice.
        if (!err.status || err.status >= 500) throw new ShopperError(UNCONFIRMED)
        throw err
      }
      if (order?.type === 'cartChanged') {
        setChanges(order.itemChanges || [])
        if (!order.itemChanges?.length) {
          await refreshCart(cartId)
          throw new ShopperError('Your bag changed. Review it and try again.')
        }
        return
      }
      if (order?.type !== 'orderCreated' || !order.orderId) throw new ShopperError(UNCONFIRMED)
      trackCart('purchase', cart, { transaction_id: order.orderId, value: checkout?.receipt?.totals?.total })
      clearCheckoutDrafts()
      // Where and when, for the confirmation: the cart is gone after this.
      onPlaced({ orderId: order.orderId, choice: reconciled.choice, timeWindow: reconciled.timeWindow || null, address: reconciled.choice === 'delivery' ? addressText(reconciled) : '' })
      resetCart()
    })
  }

  // "Review and continue": take the shopper's bag as it is now, then re-read the checkout.
  async function acknowledgeChanges() {
    await attempt('changes', async () => {
      await refreshCart(cartId)
      setChanges([])
      await reload()
    })
  }

  return {
    checkout, draft, guest, setGuest, changes, loadError, busy, errors,
    reload, updateDraft, saveStep, applyPromo, removePromo, setLoyaltyPoints, placeOrder, acknowledgeChanges,
  }
}
