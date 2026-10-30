import { sizeText, variantLabel } from '../../lib/format.js'

// Plain-language copy for the store's reasons. Unknown values fall back to the "unknown" text.
export const CART_REASON_TEXT = {
  limits: 'Over the purchase limit — remove some items',
  outOfStock: 'An item sold out — remove it to continue',
  saleTypeMismatch: "Some items aren't available for this sale type",
  exclusiveAccessRequired: 'Members only — sign in to check out',
  unknown: "Checkout isn't available right now",
}

export const ITEM_REASON_TEXT = {
  outOfStock: 'Sold out — remove it',
  saleTypeMismatch: "Not available for this sale type — remove it",
  exclusiveAccessRequired: 'Members only — sign in to check out',
  unknown: "Can't be checked out right now",
}

// Quantity of a cart item, whichever shape the store or the demo cart uses.
export function cartQuantity(item) {
  return Number(item?.quantity?.current ?? item?.quantity ?? 0)
}

// Ids arrive as strings or numbers depending on the endpoint; compare them as strings.
function sameId(a, b) {
  return a != null && b != null && String(a) === String(b)
}

// A number from a store value (a number or a numeric string), or null when there is none. Number(null) is 0, so null is checked first.
export function numberOf(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const round2 = (value) => Math.round(value * 100) / 100
const unique = (values) => [...new Set(values)]

// The cart with quantity changes (keyed by purchase key) applied on top, without touching the server copy.
// A line that reaches zero drops out. Lines the cart does not hold yet cannot be drawn, so they are left out here.
export function applyDeltas(cart, deltas) {
  const changed = Object.entries(deltas || {}).filter(([, delta]) => delta)
  if (!cart || !changed.length) return cart
  const lookup = Object.fromEntries(changed)
  const items = (cart.items || [])
    .map((item) => (lookup[item.purchaseKey]
      ? { ...item, quantity: { ...item.quantity, current: Math.max(0, cartQuantity(item) + lookup[item.purchaseKey]) } }
      : item))
    .filter((item) => cartQuantity(item) > 0)
  return { ...cart, items }
}

// Display rows for a cart, shared by the bag drawer, the cart rail and the bag page.
export function cartLines(cart) {
  const relations = cart?.relations || {}
  const products = relations.products || []
  return (cart?.items || []).map((item) => {
    const product = products.find((entry) => sameId(entry.id, item.productId))
    const variant = product?.variants?.find((entry) => sameId(entry.id, item.variantId))
    const quantity = cartQuantity(item)
    // The store prices a cart item as its whole line (all units): prices.base is the line total, the same figure the totals sum.
    const base = numberOf(item.prices?.base)
    const discounted = numberOf(item.prices?.discounted)
    const unavailable = item.checkoutAvailability?.state === 'unavailable'
    const notices = unavailable
      ? unique((item.checkoutAvailability.reasons?.length ? item.checkoutAvailability.reasons : ['unknown'])
        .map((reason) => ITEM_REASON_TEXT[reason] || ITEM_REASON_TEXT.unknown))
      : []
    return {
      purchaseKey: item.purchaseKey,
      product,
      variant,
      quantity,
      name: product?.name || 'Selected product',
      detail: [variantLabel(product, variant), sizeText(variant)].filter(Boolean).join(' · '),
      lineTotal: discounted ?? base,
      lineBase: base,
      hasDiscount: discounted != null && base != null && discounted < base,
      promotions: promotionNames(cart, item.promotions?.appliedIds),
      notices,
      image: product ? { ...product, images: variant?.images?.length ? variant.images : product.images } : null,
    }
  })
}

// Names of promotions by id, from the cart's relations. Ids with no name are skipped.
export function promotionNames(cart, ids = []) {
  const promotions = cart?.relations?.promotions || []
  return unique((ids || [])
    .map((id) => promotions.find((entry) => sameId(entry.id, id))?.shortName)
    .filter(Boolean))
}

// The "deals you could add" nudge: recommended promotions, named when the store names them. Null when there are none.
export function promotionNudge(cart) {
  const promotions = cart?.promotions || {}
  const ids = unique([...(promotions.recommendedIds || []), ...(promotions.upsellRecommendedIds || [])].map(String))
  if (!ids.length) return null
  return { names: promotionNames(cart, ids), count: ids.length }
}

const formatAmount = (value) => value.toLocaleString('en-US', { maximumFractionDigits: 2 })

// Purchase limits with their progress. ok below 80%, warn from 80%, over above 100%. Limits without a maximum are left out.
export function cartLimits(cart) {
  return (cart?.restrictions?.limits || []).map((limit, index) => {
    const max = numberOf(limit.maxAmount)
    const used = numberOf(limit.usedAmount) ?? 0
    if (!max || max <= 0) return null
    const ratio = used / max
    const level = ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok'
    const unit = limit.unit ? ` ${limit.unit}` : ''
    return {
      key: `${limit.name}-${index}`,
      label: limit.name || 'Limit',
      used,
      max,
      ratio,
      level,
      text: `${limit.name || 'Limit'}: ${formatAmount(used)} / ${formatAmount(max)}${unit}`,
    }
  }).filter(Boolean)
}

// Whether the cart can go to checkout, and the plain-language reasons when it cannot.
export function checkoutBlock(cart) {
  const availability = cart?.checkoutAvailability
  if (availability?.state !== 'unavailable') return { blocked: false, messages: [] }
  const reasons = unique(availability.reasons || [])
  const messages = reasons.length
    ? unique(reasons.map((reason) => CART_REASON_TEXT[reason] || CART_REASON_TEXT.unknown))
    : [CART_REASON_TEXT.unknown]
  return { blocked: true, messages }
}

// Base, discounted and saving for the totals block. The discounted total is shown only when a discount applies.
export function totalsView(totals) {
  const base = numberOf(totals?.base)
  const discounted = numberOf(totals?.discounted)
  const discount = numberOf(totals?.discount) ?? (base != null && discounted != null ? round2(base - discounted) : 0)
  return {
    base,
    discounted,
    discount,
    hasDiscount: discount > 0 && base != null && discounted != null,
    total: discounted ?? base,
  }
}
