// Carts, checkout, orders and the cart transfer for the Sweed mock. Nothing here reaches a real store.
//
// Rules copied from the storefront's needs and the spec:
// - An anonymous checkout needs guest contact data, and loyalty points are refused for guests.
// - Pickup needs no time window; delivery needs one, and only inside the synthetic zone.
// - Promo codes must be known (PROMO_CODES); an unknown code fails the whole PATCH with a 400 detail.
// - Placing an order needs delivery method, payment method (and time for delivery); it closes the cart.
// - Stock caps adds: a line never goes above the variant's stock quantity, and the applied delta is returned.
import { randomBytes } from 'node:crypto'
import { created, fail, money, NO_CONTENT } from './http.js'

const PICKUP_TYPES = ['inStorePickup', 'curbside', 'driveThrough']
const PAYMENT_TYPES = ['payOnSite']
const SALE_TYPES = ['medical', 'recreational']
const GUEST_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'birthDate']
// Code -> share of the discounted subtotal it takes off. Anything else is not a valid code for this store.
const PROMO_CODES = new Map([['WELCOME10', 0.1]])
const LOYALTY_POINTS = 120
const LOYALTY_CAP = 100
const DAY = 24 * 60 * 60 * 1000

const newId = () => randomBytes(9).toString('hex')
// Dates in the store's zone (Hawaii), the zone the tests' browser runs in (playwright.config.js): in UTC, Hawaii's
// afternoon is already the next day, and "tomorrow" would read as the day after.
const dateKey = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toLocaleDateString('en-CA', { timeZone: 'Pacific/Honolulu' })
const hasGuestContact = (guest) => GUEST_FIELDS.every((field) => String(guest?.[field] ?? '').trim())
const isOver21 = (birthDate) => {
  const born = new Date(`${birthDate}T00:00:00Z`)
  const cutoff = new Date()
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 21)
  return !Number.isNaN(born.valueOf()) && born <= cutoff
}

export function createCommerce({ catalog, users, storeId }) {
  const carts = new Map()
  const orders = new Map()
  let orderNumber = 2100

  // Seeded history for the signed-in test account, so the orders pages have something to show.
  function seedOrder(owner, { purchaseKey, quantity, status, paid, hoursAgo }) {
    const variant = catalog.variantFor(purchaseKey)
    const unit = Number(variant.variant.prices.discounted ?? variant.variant.prices.base)
    const order = {
      id: newId(),
      number: String(orderNumber += 1),
      owner,
      status: { type: status, reason: null },
      placement: 'ecom',
      deliveryMethod: { type: 'pickup', pickupType: 'inStorePickup', store: { id: storeId } },
      timeWindow: null,
      timeTracking: { createdAt: new Date(Date.now() - hoursAgo * 3600e3).toISOString(), finishedAt: status === 'pickedUp' ? new Date().toISOString() : null, estimatedAt: null, expiredAt: null },
      saleType: 'recreational',
      items: [{ purchaseKey, variantId: variant.variant.id, quantity }],
      priceTotal: money(unit * quantity),
      itemsQuantity: quantity,
      receipt: { total: money(unit * quantity), items: [{ type: 'item', title: variant.entry.name, value: `$${(unit * quantity).toFixed(2)}` }] },
      payment: { methodType: 'payOnSite', status: paid ? 'paid' : 'notPaid', isOnlinePaymentAvailable: false, transaction: null },
    }
    orders.set(order.id, order)
  }

  function cartOr404(id) {
    const cart = carts.get(id)
    if (!cart || cart.closed) throw fail(404, 'Cart not found.')
    return cart
  }

  function stockOf(variant) {
    return Math.max(0, Number(variant.stock?.quantity ?? 0))
  }

  // Changes one line by delta. Returns the delta the cart actually took (adds are capped by stock).
  function applyDelta(cart, purchaseKey, delta) {
    const found = catalog.variantFor(purchaseKey)
    if (!found) throw fail(400, `Unknown product variant: ${purchaseKey}`)
    const current = cart.items.get(purchaseKey) || 0
    let next = current + delta
    if (delta > 0) next = Math.min(next, Math.max(current, stockOf(found.variant)))
    next = Math.max(0, next)
    if (next === 0) cart.items.delete(purchaseKey)
    else cart.items.set(purchaseKey, next)
    return next - current
  }

  function validateLines(items) {
    if (!Array.isArray(items)) throw fail(400, 'items must be a list.')
    for (const item of items) {
      if (!catalog.variantFor(item?.purchaseKey)) throw fail(400, `Unknown product variant: ${item?.purchaseKey}`)
    }
  }

  function lineView(purchaseKey, quantity) {
    const { entry, variant } = catalog.variantFor(purchaseKey)
    const base = Number(variant.prices.base)
    const discounted = variant.prices.discounted == null ? null : Number(variant.prices.discounted)
    return {
      purchaseKey,
      productId: entry.id,
      variantId: variant.id,
      quantity: { current: quantity, available: stockOf(variant), reserved: 0 },
      prices: { base: money(base * quantity), discounted: discounted == null ? null : money(discounted * quantity) },
      promotions: { appliedIds: [] },
      checkoutAvailability: { state: 'available', reasons: [] },
    }
  }

  function totalsOf(cart) {
    let base = 0
    let discounted = 0
    for (const [purchaseKey, quantity] of cart.items) {
      const { variant } = catalog.variantFor(purchaseKey)
      const unitBase = Number(variant.prices.base)
      base += unitBase * quantity
      discounted += Number(variant.prices.discounted ?? unitBase) * quantity
    }
    const rate = [...cart.checkout.promoCodes].reduce((sum, code) => sum + (PROMO_CODES.get(code.toUpperCase()) || 0), 0)
    const promo = discounted * Math.min(rate, 1)
    return { base: money(base), subtotal: money(discounted), discount: money(base - discounted + promo), total: money(discounted - promo) }
  }

  function receiptOf(cart) {
    const totals = totalsOf(cart)
    return {
      totals: { total: totals.total, base: totals.base, discount: totals.discount, subtotal: totals.subtotal },
      deliveryThresholds: { amountLeftForMinOrder: null, amountLeftForFreeDelivery: null },
      items: [
        { type: 'item', title: 'Subtotal', value: `$${totals.subtotal.toFixed(2)}` },
        ...(totals.discount > 0 ? [{ type: 'item', title: 'Discount', value: `-$${totals.discount.toFixed(2)}` }] : []),
        { type: 'item', title: 'Total', value: `$${totals.total.toFixed(2)}` },
      ],
    }
  }

  function timeWindowsFor() {
    return [
      { id: `asap${dateKey(0).replaceAll('-', '')}`, date: dateKey(0), interval: { from: '10:00', to: '20:00' }, isAsap: true },
      { id: `day${dateKey(1).replaceAll('-', '')}a`, date: dateKey(1), interval: { from: '10:00', to: '12:00' }, isAsap: false },
      { id: `day${dateKey(1).replaceAll('-', '')}b`, date: dateKey(1), interval: { from: '12:00', to: '14:00' }, isAsap: false },
    ]
  }

  function optionsOf(cart) {
    const delivering = cart.checkout.deliveryMethod?.type === 'delivery'
    return {
      deliveryMethods: { required: true, items: [...PICKUP_TYPES, 'delivery'].map((type) => ({ type })) },
      timeWindows: delivering ? { required: true, items: timeWindowsFor() } : { required: false, items: [] },
      paymentMethods: { required: true, items: PAYMENT_TYPES.map((type) => ({ type })) },
    }
  }

  function checkoutView(cart) {
    return {
      options: optionsOf(cart),
      settings: {
        deliveryMethod: cart.checkout.deliveryMethod,
        timeWindow: cart.checkout.timeWindow,
        paymentMethod: cart.checkout.paymentMethod,
        promoCodes: [...cart.checkout.promoCodes],
        notes: cart.checkout.notes,
        loyaltyPoints: cart.checkout.loyaltyPoints ?? null,
      },
      guest: cart.checkout.guest ? { ...cart.checkout.guest } : null,
      receipt: receiptOf(cart),
      // A signed-in shopper has LOYALTY_POINTS points and may use all of them, which the store caps at LOYALTY_CAP.
      loyalty: cart.owner ? { pointsRedemptionType: 'maximumAvailable', points: LOYALTY_POINTS, pointsCap: LOYALTY_CAP } : { pointsRedemptionType: 'none' },
      itemChanges: [],
    }
  }

  function cartView(cart) {
    const lines = [...cart.items].map(([purchaseKey, quantity]) => lineView(purchaseKey, quantity))
    const totals = totalsOf(cart)
    const products = new Map()
    for (const [purchaseKey] of cart.items) {
      const { entry } = catalog.variantFor(purchaseKey)
      if (!products.has(entry.id)) {
        products.set(entry.id, {
          id: entry.id,
          name: entry.name,
          attributes: { categoryId: entry.list.attributeIds?.categoryId, brandId: entry.list.attributeIds?.brandId ?? null },
          variants: entry.list.variants.map((variant) => ({ id: variant.id, name: variant.name, images: variant.images || [] })),
        })
      }
    }
    return {
      cart: {
        id: cart.id,
        items: lines,
        settings: { ...cart.settings },
        checkoutAvailability: { state: 'available', reasons: [] },
        totals: { base: totals.base, discounted: totals.subtotal, discount: totals.discount, discountCap: null },
        promotions: { appliedIds: [], recommendedIds: [], upsellAppliedIds: [], upsellRecommendedIds: [] },
        restrictions: { limits: [] },
      },
      relations: { products: [...products.values()], promotions: [], categories: [], brands: [] },
    }
  }

  function newCart(owner, settings) {
    const cart = {
      id: newId(),
      owner,
      items: new Map(),
      settings: { saleType: settings?.saleType || 'recreational', isResident: Boolean(settings?.isResident) },
      checkout: { deliveryMethod: null, timeWindow: null, paymentMethod: null, promoCodes: [], notes: null, guest: null },
      closed: false,
    }
    carts.set(cart.id, cart)
    return cart
  }

  // Creates a cart. A signed-in shopper gets their own cart back when one is open, as Sweed does.
  function create(body, auth) {
    const settings = body.settings || {}
    if (settings.saleType && !SALE_TYPES.includes(settings.saleType)) throw fail(400, 'Unknown sale type.')
    validateLines(body.items || [])
    let cart = null
    if (auth?.type === 'auth') {
      const user = users.userById(auth.userId)
      cart = user?.currentCartId ? carts.get(user.currentCartId) : null
      if (cart?.closed) cart = null
      if (!cart) {
        cart = newCart(auth.userId, settings)
        if (user) user.currentCartId = cart.id
      }
    } else {
      cart = newCart(null, settings)
    }
    const items = (body.items || []).map((item) => ({ purchaseKey: item.purchaseKey, quantity: applyDelta(cart, item.purchaseKey, Number(item.quantity) || 0) }))
    return created({ id: cart.id, items })
  }

  function read(id) {
    return cartView(cartOr404(id))
  }

  function items(id) {
    const cart = cartOr404(id)
    return {
      items: [...cart.items].map(([purchaseKey, quantity]) => ({ purchaseKey, quantity: { current: quantity, available: stockOf(catalog.variantFor(purchaseKey).variant), reserved: 0 } })),
    }
  }

  function patchItems(id, body) {
    const cart = cartOr404(id)
    const requested = body.items
    if (!Array.isArray(requested) || !requested.length) throw fail(400, 'items must be a non-empty list.')
    for (const item of requested) {
      if (!catalog.variantFor(item?.purchaseKey)) throw fail(400, `Unknown product variant: ${item?.purchaseKey}`)
      if (!Number.isFinite(Number(item.quantityDelta))) throw fail(400, 'quantityDelta must be a number.')
    }
    return {
      items: requested.map((item) => ({ purchaseKey: item.purchaseKey, quantityDelta: applyDelta(cart, item.purchaseKey, Number(item.quantityDelta)) })),
    }
  }

  function remove(id) {
    cartOr404(id).closed = true
    return NO_CONTENT
  }

  function updateSettings(id, body) {
    const cart = cartOr404(id)
    const next = body.settings || {}
    if (!SALE_TYPES.includes(next.saleType)) throw fail(400, 'Unknown sale type.')
    cart.settings = { saleType: next.saleType, isResident: Boolean(next.isResident) }
    return NO_CONTENT
  }

  // Moves an anonymous bag into the signed-in account's cart. The source bag is emptied.
  function transfer(body, auth) {
    if (auth?.type !== 'auth') throw fail(401, 'Sign in to move your bag.')
    const source = cartOr404(body.sourceCartId)
    const user = users.userById(auth.userId)
    let target = user?.currentCartId ? carts.get(user.currentCartId) : null
    if (!target || target.closed) {
      target = newCart(auth.userId, source.settings)
      if (user) user.currentCartId = target.id
    }
    for (const [purchaseKey, quantity] of source.items) applyDelta(target, purchaseKey, quantity)
    source.items.clear()
    return NO_CONTENT
  }

  // An account's checkout is its owner's: without the sign-in it answers 401 (the shop then shows "sign in again").
  function ownedBy(cart, auth) {
    if (cart.owner && auth?.userId !== cart.owner) throw fail(401, 'Sign in to continue.')
    return cart
  }

  function checkout(id, auth) {
    return checkoutView(ownedBy(cartOr404(id), auth))
  }

  function updateCheckout(id, body, auth) {
    const cart = ownedBy(cartOr404(id), auth)
    const settings = body.settings || {}

    if (body.guest) {
      if (!hasGuestContact(body.guest)) throw fail(400, 'Guest contact details are incomplete.')
      if (!isOver21(body.guest.birthDate)) throw fail(400, 'The shopper must be 21 or older.')
      cart.checkout.guest = Object.fromEntries(GUEST_FIELDS.map((field) => [field, String(body.guest[field]).trim()]))
    }
    if (!cart.owner && !cart.checkout.guest) throw fail(400, 'Guest data is required for an unauthorized checkout')
    if (!cart.owner && settings.loyaltyPoints) throw fail(400, 'Loyalty points are only available to signed-in shoppers.')
    // Points asked for beyond the cap are applied up to the cap; none asked for means none applied.
    cart.checkout.loyaltyPoints = settings.loyaltyPoints ? String(Math.min(Number(settings.loyaltyPoints), LOYALTY_CAP)) : null

    if (settings.deliveryMethod) {
      const method = settings.deliveryMethod
      if (method.type === 'pickup') {
        if (!PICKUP_TYPES.includes(method.pickupType)) throw fail(400, 'Unknown pickup type.')
        cart.checkout.deliveryMethod = { type: 'pickup', pickupType: method.pickupType }
      } else if (method.type === 'delivery') {
        const { location } = method
        const coordinates = location?.coordinates
        if (!location?.address || !coordinates) throw fail(400, 'Delivery needs an address and coordinates.')
        const zone = catalog.deliveryZone()
        const distance = catalog.haversineKm(zone.center, { latitude: Number(coordinates.latitude), longitude: Number(coordinates.longitude) })
        if (distance > zone.radiusKm) throw fail(400, 'We do not deliver to this address.')
        cart.checkout.deliveryMethod = {
          type: 'delivery',
          location: { address: location.address, secondaryAddress: location.secondaryAddress || null, coordinates },
        }
      } else {
        throw fail(400, 'Unknown delivery method.')
      }
    } else {
      cart.checkout.deliveryMethod = null
    }

    if (settings.timeWindow) {
      const window = optionsOf(cart).timeWindows.items.find((item) => item.id === settings.timeWindow.id)
      if (!window) throw fail(400, 'That time is not available for this order.')
      cart.checkout.timeWindow = window
    } else {
      cart.checkout.timeWindow = null
    }

    if (settings.paymentMethod) {
      if (!PAYMENT_TYPES.includes(settings.paymentMethod.type)) throw fail(400, 'That payment method is not available.')
      cart.checkout.paymentMethod = { type: settings.paymentMethod.type }
    } else {
      cart.checkout.paymentMethod = null
    }

    const codes = Array.isArray(settings.promoCodes) ? settings.promoCodes : []
    for (const code of codes) {
      if (!PROMO_CODES.has(String(code).toUpperCase())) throw fail(400, `${code} is not a valid promo code.`)
    }
    cart.checkout.promoCodes = codes.map(String)
    cart.checkout.notes = settings.notes ? String(settings.notes) : null
    return checkoutView(cart)
  }

  function placeOrder(body, auth) {
    const cart = cartOr404(body.cartId)
    if (!cart.owner && !cart.checkout.guest) throw fail(400, 'Guest data is required for an unauthorized checkout')
    if (!cart.items.size) throw fail(400, 'The bag is empty.')
    if (!cart.checkout.deliveryMethod) throw fail(400, 'Choose pickup or delivery.')
    if (cart.checkout.deliveryMethod.type === 'delivery' && !cart.checkout.timeWindow) throw fail(400, 'Choose a time.')
    if (!cart.checkout.paymentMethod) throw fail(400, 'Choose a payment method.')
    if (cart.owner && auth?.userId !== cart.owner) throw fail(401, 'Sign in to place this order.')

    const totals = totalsOf(cart)
    const order = {
      id: newId(),
      number: String(orderNumber += 1),
      owner: cart.owner,
      status: { type: 'placed', reason: null },
      placement: 'ecom',
      deliveryMethod: cart.checkout.deliveryMethod.type === 'pickup'
        ? { type: 'pickup', pickupType: cart.checkout.deliveryMethod.pickupType, store: { id: storeId } }
        : { type: 'delivery', location: cart.checkout.deliveryMethod.location },
      timeWindow: cart.checkout.timeWindow,
      timeTracking: { createdAt: new Date().toISOString(), finishedAt: null, estimatedAt: null, expiredAt: null },
      saleType: cart.settings.saleType,
      items: [...cart.items].map(([purchaseKey, quantity]) => ({ purchaseKey, variantId: catalog.variantFor(purchaseKey).variant.id, quantity })),
      priceTotal: totals.total,
      itemsQuantity: [...cart.items.values()].reduce((sum, quantity) => sum + quantity, 0),
      receipt: { total: totals.total, items: receiptOf(cart).items },
      payment: { methodType: cart.checkout.paymentMethod.type, status: 'notPaid', isOnlinePaymentAvailable: false, transaction: null },
      guest: cart.owner ? null : { ...cart.checkout.guest },
    }
    orders.set(order.id, order)
    cart.closed = true
    return { type: 'orderCreated', orderId: order.id }
  }

  function listOrders(auth, query) {
    if (auth?.type !== 'auth') throw fail(401, 'Sign in to see your orders.')
    const mine = [...orders.values()].filter((order) => order.owner === auth.userId).sort((a, b) => b.number.localeCompare(a.number))
    const page = Math.max(1, Number(query.get('Pagination.Page')) || 1)
    const size = Math.min(100, Math.max(1, Number(query.get('Pagination.PageSize')) || 24))
    return { totalItems: mine.length, items: mine.slice((page - 1) * size, page * size).map(summaryOf) }
  }

  function getOrder(auth, id) {
    if (auth?.type !== 'auth') throw fail(401, 'Sign in to see this order.')
    const order = orders.get(id)
    if (!order || order.owner !== auth.userId) throw fail(404, 'Order not found.')
    const { guest, owner, ...view } = order
    return { order: view }
  }

  function summaryOf(order) {
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      placement: order.placement,
      deliveryMethod: order.deliveryMethod,
      priceTotal: order.priceTotal,
      itemsQuantity: order.itemsQuantity,
      timeWindow: order.timeWindow,
      timeTracking: order.timeTracking,
    }
  }

  return { create, read, items, patchItems, remove, updateSettings, transfer, checkout, updateCheckout, placeOrder, listOrders, getOrder, seedOrder }
}
