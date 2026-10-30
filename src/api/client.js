import { SALE_TYPE, STORE_ID } from '../config.js'
import { loadSession } from '../features/account/useSession.js'

// Sweed intermittently answers 500 when two requests touch the same cart at once (seen live: a cart read racing the
// checkout read), so requests for one cart run one after another. Other requests are not queued.
const cartQueues = new Map()
const RETRY_DELAY_MS = 400

function cartOf(path) {
  return /^\/carts\/([^/?]+)/.exec(path)?.[1] || null
}

async function send(path, options) {
  const response = await fetch(`${import.meta.env.BASE_URL}api/v2/stores/${encodeURIComponent(STORE_ID)}${path}`, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  })
  const payload = response.status === 204 ? null : await response.json().catch(() => null)
  // The status travels with the error so callers can tell a 404 from other failures without matching message text.
  if (!response.ok) {
    // A 401 means the proxy has dropped the session: every part of the page learns the shopper is signed out.
    if (response.status === 401) loadSession().catch(() => null)
    // Retry-After (seconds) rides along so callers can wait as long as the store asks after a 429.
    const retryAfter = Number(response.headers.get('retry-after')) || undefined
    throw Object.assign(new Error(payload?.detail || payload?.title || `Store request failed (${response.status})`), { status: response.status, retryAfter })
  }
  return payload
}

// A read that hits a transient server error is tried once more; writes are never repeated automatically.
async function sendWithRetry(path, options) {
  try {
    return await send(path, options)
  } catch (error) {
    const read = !options.method || options.method === 'GET'
    if (!read || !(error.status >= 500)) throw error
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    return send(path, options)
  }
}

export function api(path, options = {}) {
  const cart = cartOf(path)
  if (!cart) return sendWithRetry(path, options)
  const previous = cartQueues.get(cart) || Promise.resolve()
  const run = previous.catch(() => {}).then(() => sendWithRetry(path, options))
  const tail = run.catch(() => {})
  cartQueues.set(cart, tail)
  tail.then(() => { if (cartQueues.get(cart) === tail) cartQueues.delete(cart) })
  return run
}

// Every page of a list endpoint (brands, promotions). The API requires Pagination.Page and PageSize, and reports
// totalItems; at most 50 pages are read.
export async function fetchAll(path, pageSize) {
  const items = []
  let page = 1
  let total = Infinity
  while (items.length < total && page <= 50) {
    const query = new URLSearchParams({ 'Scope.SaleType': SALE_TYPE, 'Pagination.Page': String(page), 'Pagination.PageSize': String(pageSize) })
    const result = await api(`${path}?${query}`)
    const batch = result?.items || []
    total = Number(result?.totalItems ?? batch.length)
    items.push(...batch)
    if (!batch.length) break
    page += 1
  }
  return items
}
