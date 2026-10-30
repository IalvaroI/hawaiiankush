// The cart id also travels in a cookie the proxy sets when a cart is created. A shopper who leaves the page while the
// create request is still out never sees its answer in JavaScript, but the browser still stores the cookie, so the
// next page can find the bag. The id is not secret: the page keeps the same value in localStorage.
export const CART_COOKIE = 'maui_cart'
export const CART_COOKIE_MAX_AGE = 30 * 24 * 60 * 60

// Sweed cart ids are short alphanumeric strings; anything else is never written into a header or read back.
const CART_ID = /^[A-Za-z0-9_-]{1,64}$/

export function isCartId(value) {
  return typeof value === 'string' && CART_ID.test(value)
}

export function readCartCookie(cookieHeader) {
  const pair = String(cookieHeader || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${CART_COOKIE}=`))
  const value = pair ? pair.slice(CART_COOKIE.length + 1) : ''
  return isCartId(value) ? value : ''
}

export function serializeCartCookie(value, { maxAge = CART_COOKIE_MAX_AGE, path, secure }) {
  return [`${CART_COOKIE}=${value}`, `Max-Age=${maxAge}`, `Path=${path}`, 'SameSite=Lax', ...(secure ? ['Secure'] : [])].join('; ')
}
