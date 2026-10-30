// Forwards browser requests to the Ecom API with the server-held key.
// Shared by the Vite dev server and the production server so both behave the same.
import { readFileSync } from 'node:fs'
import { createRateLimiter } from './rate-limit.js'
import { createEnricher } from './enrich.js'
import { encodeSession, readSession, serializeSessionCookie } from './session.js'
import { isCartId, serializeCartCookie } from '../shared/cartCookie.js'

const MAX_BODY_BYTES = 1024 * 1024
const UPSTREAM_TIMEOUT_MS = 20000
const ENRICH_TIMEOUT_MS = 8000
const ENRICH_MAX_IDS = 48
const CATALOG_ID = /^[A-Za-z0-9]+$/
const MINUTE = 60 * 1000

// Everything the storefront may call, relative to /v2/stores/{STORE_ID}. Anything else is refused, so the key
// cannot reach auth introspection, the store list or other stores through the proxy.
const ROUTES = [
  ['GET', ''],
  ['GET', '/products'],
  ['GET', '/products/{id}'],
  ['GET', '/categories'],
  ['GET', '/categories/{id}'],
  ['GET', '/brands'],
  ['GET', '/brands/{id}'],
  ['GET', '/carousels'],
  ['GET', '/carousels/{id}'],
  ['GET', '/promotions'],
  ['GET', '/promotions/{id}'],
  ['GET', '/upsells/ai-picker'],
  ['GET', '/upsells/ai-picker/products'],
  ['GET', '/delivery'],
  ['GET', '/stores-by-location'],
  ['POST', '/carts'],
  ['GET', '/carts/{id}'],
  ['DELETE', '/carts/{id}'],
  // `current` is the signed-in shopper's own cart. Its exact path beats /carts/{id}, so every method it takes is listed:
  // PUT moves the guest bag in at sign-in, GET and DELETE read and clear it like any other cart.
  ['PUT', '/carts/current'],
  ['GET', '/carts/current'],
  ['DELETE', '/carts/current'],
  ['GET', '/carts/{id}/items'],
  ['PATCH', '/carts/{id}/items'],
  ['GET', '/carts/{id}/checkout'],
  ['PATCH', '/carts/{id}/checkout'],
  ['PUT', '/carts/{id}/settings'],
  ['POST', '/orders'],
  ['GET', '/orders'],
  ['GET', '/orders/{id}'],
  ['POST', '/orders/{id}/payment-link'],
  ['POST', '/users/send-otp'],
  ['POST', '/users/sign-in'],
  ['POST', '/users/password'],
  ['POST', '/users'],
  ['GET', '/users/{id}'],
  ['DELETE', '/users/{id}'],
  ['GET', '/users/{id}/settings'],
]

const ROUTE_TABLE = ROUTES.map(([method, template]) => ({
  method,
  template,
  pattern: new RegExp(`^${template.replaceAll('{id}', '[A-Za-z0-9_-]+')}$`),
}))

// Per client IP and route, to slow down OTP guessing and password attempts, and per account (the login or contact in
// the body) as well, so attempts spread over many addresses still count against the one account they aim at. For
// sign-in and password only failed attempts count (the store's refusals), so a shopper signing in is never locked out;
// every code sent to a contact counts, with room for the store's own resend pacing.
const RATE_LIMITS = {
  '/users/send-otp': { limit: 5, windowMs: 10 * MINUTE, perAccount: { limit: 30, windowMs: 60 * MINUTE } },
  '/users/sign-in': { limit: 10, windowMs: 10 * MINUTE, perAccount: { limit: 8, windowMs: 10 * MINUTE, failuresOnly: true } },
  '/users/password': { limit: 5, windowMs: 10 * MINUTE, perAccount: { limit: 8, windowMs: 10 * MINUTE, failuresOnly: true } },
}
// Enrichment fans out to the store API per product; one client gets this many calls a minute.
const ENRICH_LIMIT = { limit: 60, windowMs: MINUTE }
const TOO_MANY = 'Too many attempts. Try again in a few minutes.'

// The account a sign-in request is about: the login, or the contact's value, in lower case.
function accountOf(body) {
  try {
    const parsed = JSON.parse(body.toString('utf8'))
    const value = parsed?.login ?? parsed?.email ?? parsed?.contact?.value
    return typeof value === 'string' ? value.trim().toLowerCase() : ''
  } catch { return '' }
}

// Routes whose answer is for one shopper (a token was sent, or the bag, orders or account): never for a shared cache.
const privateRoute = (subpath, authorized) => authorized || /^\/(carts|orders|users)(\/|$)/.test(subpath)

// POST routes whose 2xx answer carries a token; the token moves from the body into the session cookie.
const TOKEN_ROUTES = new Set(['/users', '/users/sign-in'])

// A registration token only drives sign-up (creating the user, verifying its phone). Sent anywhere else it could be
// refused with a 401, which would clear the cookie and lose the sign-up halfway, so it goes only to these routes.
const REGISTRATION_ROUTES = new Set(['/users', '/users/send-otp'])

const STORE_PATH = /^\/v2\/stores\/([^/]+)(\/.*)?$/

function extractEcomKey() {
  try {
    const file = readFileSync('.env', 'utf8')
    return file.match(/^Ecom:\s*\r?\n([^\r\n#\s]+)\s*$/m)?.[1] || ''
  } catch { return '' }
}

function sendJson(res, status, body, headers = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value)
  res.end(JSON.stringify(body))
}

function hostOf(url) {
  try { return new URL(url).host.toLowerCase() } catch { return '' }
}

// Browsers attach Origin to cross-site POSTs, so an Origin that is not one of our hosts means another site started the request.
function isSameSite(req, publicHost) {
  const origin = hostOf(req.headers.origin || '')
  if (!origin) return false
  const forwarded = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim()
  const allowed = [req.headers.host, forwarded, publicHost].filter(Boolean).map((host) => host.toLowerCase())
  return allowed.includes(origin)
}

function clientIp(req, trustProxy) {
  // Only behind a proxy that overwrites X-Forwarded-For; otherwise the header is client-controlled.
  if (trustProxy) {
    const first = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    if (first) return first
  }
  return req.socket.remoteAddress || 'unknown'
}

// A literal path such as /users/sign-in wins over /users/{id}, so DELETE /users/sign-in is a 405 rather than a forwarded delete.
function findRoutes(subpath) {
  const literal = ROUTE_TABLE.filter((route) => route.template === subpath)
  return literal.length ? literal : ROUTE_TABLE.filter((route) => route.pattern.test(subpath))
}

// `ids` is a comma-separated list of 1 to 48 product ids. Anything else is refused, not trimmed, so a bad batch shows up.
function parseIds(raw) {
  if (!raw) return null
  const ids = raw.split(',')
  if (ids.length > ENRICH_MAX_IDS || !ids.every((id) => CATALOG_ID.test(id))) return null
  return [...new Set(ids)]
}

// `req.url` must already be relative to the mount point, e.g. /v2/stores/1300/products?...
export function createApiHandler(env) {
  const ecomKey = env.ECOM_API_KEY || env.API_KEY || extractEcomKey()
  const upstreamUrl = env.API_BASE_URL || ''
  const storeId = env.STORE_ID || ''
  // The key is restricted to allowed origins, so server-side calls must name one, e.g. https://shop.example.com.
  const origin = env.API_ORIGIN || ''
  const publicHost = hostOf(env.PUBLIC_ORIGIN || '')
  // Secure is the default; only an explicit COOKIE_SECURE=false (plain-HTTP local testing) drops it.
  const secureCookie = String(env.COOKIE_SECURE ?? '').trim().toLowerCase() !== 'false'
  const cookiePath = basePath(env).replace(/\/$/, '') || '/'
  const trustProxy = env.TRUST_PROXY === 'true'
  const rateLimit = createRateLimiter()
  const saleType = env.VITE_SALE_TYPE || 'recreational'
  const enrich = createEnricher({ fetchProduct: fetchProductDetail })

  function ecomUrl(apiPath) {
    const base = new URL(upstreamUrl)
    return new URL(`${base.pathname.replace(/\/$/, '')}/ecom${apiPath}`, base.origin)
  }

  function catalogHeaders() {
    const headers = { 'x-api-key': ecomKey, accept: 'application/json' }
    if (origin) headers.origin = origin
    return headers
  }

  // Public catalog data only: no shopper session is sent, so the shared enrichment cache never holds one shopper's answer.
  // Resolves to the detail body, or null for a 404. Any other failure throws.
  async function fetchProductDetail(productId, scope) {
    const target = ecomUrl(`/v2/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}`)
    target.searchParams.set('Scope.SaleType', scope || saleType)
    const upstream = await fetch(target, { headers: catalogHeaders(), signal: AbortSignal.timeout(ENRICH_TIMEOUT_MS) })
    const payload = Buffer.from(await upstream.arrayBuffer())
    if (upstream.status === 404) return null
    if (!upstream.ok) throw Object.assign(new Error(`Store API responded ${upstream.status}`), { status: upstream.status })
    return JSON.parse(payload.toString('utf8'))
  }

  function sessionCookie(value, maxAge) {
    return serializeSessionCookie(value, { maxAge, path: cookiePath, secure: secureCookie })
  }

  // Moves the issued token out of the JSON body and into the session cookie. Returns the body to relay and the Set-Cookie value.
  function takeToken(payload) {
    let data
    try { data = JSON.parse(payload.toString('utf8')) } catch { return null }
    const token = data?.token
    if (typeof token?.value !== 'string' || !token.value) return null
    const value = token.value
    const expires = Date.parse(token.expiresAt)
    delete token.value
    // Without a parseable expiry there is no safe Max-Age, so the token is withheld from the browser and not stored.
    const cookie = Number.isFinite(expires)
      ? sessionCookie(encodeSession({ token: value, type: token.tokenType, userId: data.userId ?? null, expiresAt: token.expiresAt }), Math.max(0, Math.floor((expires - Date.now()) / 1000)))
      : null
    return { payload: Buffer.from(JSON.stringify(data)), cookie }
  }

  return async function apiHandler(req, res, next) {
    try {
      const incoming = new URL(req.url, 'http://localhost')
      const path = incoming.pathname
      // HEAD is answered from the GET route; Node drops the body for HEAD responses.
      const method = req.method === 'HEAD' ? 'GET' : req.method

      // CSRF check first, so cross-site requests learn nothing about which routes exist.
      if (method !== 'GET' && !isSameSite(req, publicHost)) {
        sendJson(res, 403, { detail: 'Cross-site request refused.' })
        return
      }

      if (path === '/session') {
        if (method !== 'GET') { sendJson(res, 405, { detail: 'Method not allowed.' }); return }
        const session = readSession(req.headers.cookie)
        sendJson(res, 200, {
          signedIn: session?.tokenType === 'auth',
          tokenType: session?.tokenType ?? null,
          userId: session?.userId ?? null,
          expiresAt: session?.expiresAt ?? null,
        })
        return
      }
      if (path === '/session/sign-out') {
        if (method !== 'POST') { sendJson(res, 405, { detail: 'Method not allowed.' }); return }
        res.statusCode = 204
        res.setHeader('Set-Cookie', sessionCookie('', 0))
        res.end()
        return
      }

      if (!ecomKey || !storeId || !upstreamUrl) {
        sendJson(res, 503, { detail: 'Set API_BASE_URL, ECOM_API_KEY, and STORE_ID in .env, then restart the server.' })
        return
      }

      // Effects and tags for a page of product ids, which the catalog list does not include. See enrich.js.
      if (path === '/enrich') {
        if (method !== 'GET') { sendJson(res, 405, { detail: 'Method not allowed.' }); return }
        const ids = parseIds(incoming.searchParams.get('ids'))
        if (!ids) { sendJson(res, 400, { detail: 'Send 1 to 48 product ids in ids, separated by commas.' }); return }
        // The shopper's sale type picks the catalog; anything but the two known values falls back to the store default.
        const scope = ['medical', 'recreational'].includes(incoming.searchParams.get('saleType')) ? incoming.searchParams.get('saleType') : saleType
        const verdict = rateLimit(`/enrich|${clientIp(req, trustProxy)}`, ENRICH_LIMIT.limit, ENRICH_LIMIT.windowMs)
        if (!verdict.ok) { sendJson(res, 429, { detail: TOO_MANY }, { 'Retry-After': String(verdict.retryAfter) }); return }
        // An answer with a product missing because its lookup failed is not kept: the next ask fills it in.
        const { items, complete } = await enrich(ids, scope)
        sendJson(res, 200, { items }, { 'Cache-Control': complete ? 'public, max-age=60' : 'no-store' })
        return
      }

      const store = STORE_PATH.exec(path)
      if (!store || store[1] !== storeId) { sendJson(res, 404, { detail: 'Not found.' }); return }
      const subpath = store[2] ?? ''
      const routes = findRoutes(subpath)
      if (!routes.length) { sendJson(res, 404, { detail: 'Not found.' }); return }
      if (!routes.some((route) => route.method === method)) { sendJson(res, 405, { detail: 'Method not allowed.' }); return }

      const limit = RATE_LIMITS[subpath]
      if (limit) {
        const verdict = rateLimit(`${subpath}|${clientIp(req, trustProxy)}`, limit.limit, limit.windowMs)
        if (!verdict.ok) {
          sendJson(res, 429, { detail: TOO_MANY }, { 'Retry-After': String(verdict.retryAfter) })
          return
        }
      }

      let body
      if (method !== 'GET') {
        const chunks = []
        let size = 0
        for await (const chunk of req) {
          size += chunk.length
          if (size > MAX_BODY_BYTES) { sendJson(res, 413, { detail: 'Request body too large.' }); return }
          chunks.push(chunk)
        }
        if (size) body = Buffer.concat(chunks)
      }
      let accountKey = ''
      if (limit?.perAccount && body) {
        const account = accountOf(body)
        if (account) accountKey = `${subpath}|account|${account}`
        const verdict = accountKey ? rateLimit(accountKey, limit.perAccount.limit, limit.perAccount.windowMs, { record: !limit.perAccount.failuresOnly }) : { ok: true }
        if (!verdict.ok) {
          sendJson(res, 429, { detail: TOO_MANY }, { 'Retry-After': String(verdict.retryAfter) })
          return
        }
      }

      const session = readSession(req.headers.cookie)
      const headers = catalogHeaders()
      const authorized = Boolean(session && (session.tokenType === 'auth' || REGISTRATION_ROUTES.has(subpath)))
      if (authorized) headers.authorization = `Bearer ${session.token}`
      if (method !== 'GET') headers['content-type'] = req.headers['content-type'] || 'application/json'

      const target = ecomUrl(path)
      for (const [key, value] of incoming.searchParams) target.searchParams.append(key, value)
      const upstream = await fetch(target, { method, headers, body, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })

      // A refused sign-in or password attempt counts against the account (a 429 or a fault is not an attempt).
      if (accountKey && limit.perAccount.failuresOnly && upstream.status >= 400 && upstream.status < 429) rateLimit(accountKey, limit.perAccount.limit, limit.perAccount.windowMs)

      const responseHeaders = {}
      let payload = Buffer.from(await upstream.arrayBuffer())
      // A token the upstream no longer accepts is dropped, so the browser stops sending it.
      if (upstream.status === 401 && session) responseHeaders['Set-Cookie'] = sessionCookie('', 0)
      // A deleted account's token is worthless; drop the cookie with it.
      if (method === 'DELETE' && upstream.ok && subpath.startsWith('/users/')) responseHeaders['Set-Cookie'] = sessionCookie('', 0)
      // A new cart's id also goes into a cookie, so a page left before this answer arrived can still find the bag.
      if (method === 'POST' && upstream.ok && subpath === '/carts') {
        let id = null
        try { id = JSON.parse(payload.toString('utf8'))?.id } catch { /* not JSON: no cookie */ }
        if (isCartId(id)) {
          const cartCookie = serializeCartCookie(id, { path: cookiePath, secure: secureCookie })
          responseHeaders['Set-Cookie'] = responseHeaders['Set-Cookie'] ? [responseHeaders['Set-Cookie'], cartCookie] : cartCookie
        }
      }
      if (method === 'POST' && upstream.ok && TOKEN_ROUTES.has(subpath)) {
        const issued = takeToken(payload)
        if (issued) {
          payload = issued.payload
          if (issued.cookie) responseHeaders['Set-Cookie'] = issued.cookie
        }
      }

      res.statusCode = upstream.status
      for (const [name, value] of Object.entries(responseHeaders)) res.setHeader(name, value)
      // One shopper's bag, orders or account must never come out of a shared cache for another; the URL is the same for everyone.
      if (privateRoute(subpath, authorized)) { res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Vary', 'Cookie') }
      // A 204 has no body and no content type; relaying either would be wrong.
      if (upstream.status === 204) { res.end(); return }
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
      res.end(payload)
    } catch (error) {
      if (res.headersSent) { res.end(); return }
      sendJson(res, 502, { detail: error.name === 'TimeoutError' ? 'The store API took too long to respond.' : 'Could not reach the store API.' })
    }
  }
}

// Vite and the production server both mount under BASE_PATH, e.g. /maui/.
export function basePath(env) {
  const raw = env.BASE_PATH || '/'
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/')
}
