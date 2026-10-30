// GA4-style e-commerce events. track() pushes them to window.dataLayer, where any tag manager or analytics tag reads
// them. The Google Tag Manager container loads only when VITE_GTM_ID is set; without it events just collect in the
// dataLayer. Events carry product, cart and order facts only: never a name, email, phone or birth date.
import { cartLines } from '../features/cart/cartLines.js'
import { categoryIdOf, pickVariant, sizeText, variantLabel } from './format.js'

const CURRENCY = 'USD'
const GTM_ID = import.meta.env.VITE_GTM_ID || ''
const GTM_PATTERN = /^GTM-[A-Z0-9]+$/
let tagStarted = false
// purchaseKey -> item, filled when a product is shown, so a later cart change can name the product.
const seen = new Map()

// Loads the tag manager once, the first time it is asked. A missing or malformed id loads nothing.
export function initAnalytics() {
  if (tagStarted || typeof window === 'undefined') return
  tagStarted = true
  if (!GTM_ID) return
  if (!GTM_PATTERN.test(GTM_ID)) {
    console.warn('VITE_GTM_ID should look like GTM-XXXXXXX; the analytics tag was not loaded.')
    return
  }
  try {
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' })
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`
    document.head.appendChild(script)
  } catch {
    // Blocked script or storage: the shop works without analytics.
  }
}

// Pushes one event. The ecommerce object is cleared first, as GA4 recommends, so no stale items carry over.
export function track(event, params = {}) {
  if (typeof window === 'undefined') return
  initAnalytics()
  try {
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ ecommerce: null })
    window.dataLayer.push({ event, ecommerce: clean(params) })
  } catch {
    // A blocked dataLayer must never break a purchase or an add to bag.
  }
}

// One item for an event. Only what the call site knows: a field with no value is left out.
export function productItem(product, { variant = pickVariant(product), brand, category, quantity = 1 } = {}) {
  return clean({
    item_id: product?.id == null ? undefined : String(product.id),
    item_name: product?.name || undefined,
    item_brand: brand || undefined,
    item_category: category || undefined,
    item_variant: sizeText(variant) || variantLabel(product, variant) || undefined,
    price: amount(variant?.prices?.discounted ?? variant?.prices?.base),
    quantity,
  })
}

// A catalog list shown on a page. `pathname` names the page (e.g. "/c/flower-123" becomes "c/flower-123"). `brands`
// maps brand id to name and `categories` maps category id to { name }: the lookups the grid uses for its cards.
export function trackListView(pathname, products = [], { brands = {}, categories = {} } = {}) {
  if (!products.length) return
  const items = products.map((product) => {
    const brand = brands[String(product?.attributeIds?.brandId)]
    const category = categories[categoryIdOf(product)]?.name
    remember(product, brand, category)
    return productItem(product, { brand, category })
  })
  track('view_item_list', { item_list_name: pathname.replace(/^\/+/, '') || 'menu', items })
}

// The product page once its product has loaded (default size, the one the page opens with).
export function trackView(product) {
  if (!product) return
  const brand = product.attributes?.brand?.name
  const category = product.attributes?.category?.name
  remember(product, brand, category)
  const item = productItem(product, { brand, category })
  track('view_item', { currency: CURRENCY, value: item.price, items: [item] })
}

// A bag change by delta: positive adds, negative removes. The item comes from what the page showed or the bag holds.
export function trackCartChange(purchaseKey, delta, name = '', cart = null) {
  if (!delta) return
  const known = seen.get(purchaseKey) || lineItem(cart, purchaseKey) || { item_name: name || undefined }
  const quantity = Math.abs(delta)
  const item = { ...known, quantity }
  const value = item.price == null ? undefined : Math.round(item.price * quantity * 100) / 100
  track(delta > 0 ? 'add_to_cart' : 'remove_from_cart', { currency: CURRENCY, value, items: [item] })
}

// A checkout or order event carrying the whole bag. `extra` adds fields (shipping_tier, transaction_id, ...);
// an extra `value` replaces the bag total, e.g. the order total on purchase.
export function trackCart(event, cart, extra = {}) {
  const lines = cartLines(cart)
  const items = lines
    .filter((line) => line.product)
    .map((line) => productItem(line.product, { variant: line.variant, brand: brandName(cart, line.product), quantity: line.quantity }))
  const bagTotal = lines.reduce((sum, line) => sum + (amount(line.lineTotal) ?? 0), 0)
  const { value, ...rest } = extra
  track(event, { currency: CURRENCY, value: amount(value) ?? Math.round(bagTotal * 100) / 100, ...rest, items })
}

function remember(product, brand, category) {
  for (const variant of product?.variants || []) {
    if (variant?.purchaseKey) seen.set(variant.purchaseKey, productItem(product, { variant, brand, category }))
  }
}

function lineItem(cart, purchaseKey) {
  const line = cartLines(cart).find((entry) => entry.purchaseKey === purchaseKey)
  return line?.product ? productItem(line.product, { variant: line.variant, brand: brandName(cart, line.product) }) : null
}

// Brand name from the product's own attributes, or from the cart's brand list through attributeIds.
function brandName(cart, product) {
  const direct = product?.attributes?.brand?.name
  if (direct) return direct
  const id = String(product?.attributeIds?.brandId ?? '')
  return (cart?.relations?.brands || []).find((brand) => String(brand.id) === id)?.name
}

// A number from a store value (number or numeric string), or undefined.
function amount(value) {
  if (value == null || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function clean(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ''))
}
