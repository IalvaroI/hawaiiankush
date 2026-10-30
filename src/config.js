export const DEMO_MODE = import.meta.env.VITE_SHOP_MODE === 'demo'
export const STORE_ID = import.meta.env.VITE_STORE_ID || (DEMO_MODE ? 'demo-store' : '')

// Sale type: the shopper's Recreational / Medical choice (localStorage, set by the top bar switch) wins over the build default.
// `let` so setSaleType can update the binding; the switch reloads the page, so every module picks up the new value.
export const SALE_TYPE_KEY = 'sale-type'
const SALE_TYPES = ['medical', 'recreational']
function savedSaleType() {
  try {
    const value = localStorage.getItem(SALE_TYPE_KEY)
    return SALE_TYPES.includes(value) ? value : null
  } catch { return null }
}
export let SALE_TYPE = savedSaleType() || import.meta.env.VITE_SALE_TYPE || 'recreational'

// Stores the choice for the next load. Returns false when storage is unavailable, so the caller can say so.
export function setSaleType(value) {
  if (!SALE_TYPES.includes(value)) return false
  try { localStorage.setItem(SALE_TYPE_KEY, value) } catch { return false }
  SALE_TYPE = value
  return true
}

// The store's time zone (IANA), for its pickup windows. Sweed's store record names a Windows zone, which the browser
// can't use, so it is set here.
export const STORE_TIME_ZONE = import.meta.env.VITE_STORE_TIME_ZONE || 'Pacific/Honolulu'

export const CART_KEY = `fieldwork-cart:${STORE_ID || 'store'}`
export const GUEST_KEY = `${CART_KEY}:guest`
export const PAGE_SIZE = 24
// Filters in the panel, most useful first; anything the API adds later goes at the end.
export const FILTER_ORDER = ['strainPrevalence', 'promotion', 'price', 'thcRange', 'brand', 'effect', 'productType', 'subcategory', 'strain', 'cbdRange', 'qualityLine', 'totalSize', 'unitSize', 'flavoring', 'scent', 'userTag']
export const FILTER_LABELS = { strainPrevalence: 'Strain type', promotion: 'Promotions', thcRange: 'THC', cbdRange: 'CBD', userTag: 'Collections' }
export const RANGE_UNITS = { price: { prefix: '$', suffix: '' }, thcRange: { prefix: '', suffix: '%' }, cbdRange: { prefix: '', suffix: '%' } }
export const OPTIONS_SHOWN = 8
export const UNITS = { gram: 'g', milligram: 'mg', ounce: 'oz', milliliter: 'ml', fluidOunce: 'fl oz', percent: '%' }

export const EMPTY_GUEST = { firstName: '', lastName: '', email: '', phone: '', birthDate: '' }
