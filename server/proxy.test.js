// Run with `npm run test:server`. Each stack gets its own fake Ecom API and fresh rate-limit state.
import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createApiHandler } from './proxy.js'
import { createEnricher } from './enrich.js'

const PREFIX = '/maui/api'
const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString()

// Fake Ecom API: records every request and answers with canned JSON keyed on method and path.
function startUpstream() {
  const requests = []
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      const url = new URL(req.url, 'http://upstream')
      const route = `${req.method} ${url.pathname.replace('/ecom/v2/stores/s1', '')}`
      requests.push({ method: req.method, path: url.pathname, search: url.search, headers: req.headers, body: raw })
      const reply = (status, json) => {
        if (status === 204) { res.writeHead(204); res.end(); return }
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(json))
      }
      if (req.headers.authorization === 'Bearer revoked') { reply(401, { title: 'Unauthorized', status: 401 }); return }
      const detail = /^GET \/products\/([A-Za-z0-9]+)$/.exec(route)
      if (detail) { answerProduct(detail[1], reply); return }
      if (route === 'POST /users/sign-in') {
        if (raw.includes('"password":"wrong"')) reply(400, { title: 'Bad Request', status: 400, detail: 'Wrong code.' })
        else if (raw.includes('new-user@example.com')) reply(200, { token: { value: 'reg-token', tokenType: 'registration', expiresAt: future() }, userId: 'current' })
        else if (raw.includes('revoke-me@example.com')) reply(200, { token: { value: 'revoked', tokenType: 'auth', expiresAt: future() }, userId: 'u-revoke' })
        else reply(200, { token: { value: 'auth-token-1', tokenType: 'auth', expiresAt: future() }, userId: 'u1' })
      } else if (route === 'POST /users') {
        reply(200, { userId: 'u2', token: { value: 'auth-token-2', tokenType: 'auth', expiresAt: future() } })
      } else if (route === 'POST /carts') reply(201, { id: 'c1' })
      else if (route === 'DELETE /carts/c1') reply(204)
      else if (route === 'GET /categories') reply(200, { items: [{ id: 'cat1' }] })
      else reply(200, { path: url.pathname })
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, requests, port: server.address().port }))
  })
}

// Product detail with effects and tags. p404 and p500 fail on purpose, for the enrichment tests.
function answerProduct(id, reply) {
  if (id === 'p404') { reply(404, { title: 'Not Found', status: 404 }); return }
  if (id === 'p500') { reply(500, { title: 'Internal Server Error', status: 500 }); return }
  const attributes = id === 'p1'
    ? { effects: [{ id: 'e1', name: 'Relaxed' }, { id: 'e2', name: 'Happy' }, { id: 'e3', name: 'Relaxed' }], tags: [{ id: 't1', name: 'Staff Pick', filters: [] }], flavorings: [{ id: 'f1', name: 'Guava' }] }
    : { effects: [], tags: [{ id: 't2', name: 'New', filters: [] }] }
  // p1 has lab figures on one variant, plus entries the enricher must drop (no values, an unknown unit).
  const variants = id === 'p1'
    ? [
        { id: 'v1', promotionIds: ['pr1', 'pr1', 'gone'], compounds: { thc: [{ label: 'THCA', values: ['24.5'], uom: 'percent' }, { label: 'THC', values: [], uom: 'percent' }], cbd: [], terpenes: [{ label: 'Limonene', values: [0.6, 0.8], uom: 'percent' }, { label: 'Odd', values: [1], uom: 'ppm' }] } },
        { id: 'v2', promotionIds: [], compounds: { thc: [], cbd: [], terpenes: [] } },
      ]
    : []
  // pr1 is a named deal; v1 also lists an id with no promotion in the relations, which is dropped.
  reply(200, { product: { id, name: `Product ${id}`, attributes, variants }, relations: { promotions: [{ id: 'pr1', name: 'Early Bird', schedule: 'Daily, 07:00 AM - 10:00 AM' }] } })
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

function closeServer(server) {
  return new Promise((resolve) => { server.closeAllConnections(); server.close(resolve) })
}

// Mounts the handler at /maui/api the way server/index.js does: the prefix is stripped before the handler sees req.url.
async function startStack(overrides = {}) {
  const upstream = await startUpstream()
  const handler = createApiHandler({
    API_BASE_URL: `http://127.0.0.1:${upstream.port}`,
    STORE_ID: 's1',
    ECOM_API_KEY: 'k',
    API_ORIGIN: 'https://shop.example',
    BASE_PATH: '/maui',
    PUBLIC_ORIGIN: 'https://shop.example',
    COOKIE_SECURE: 'false',
    ...overrides,
  })
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname
    if (pathname !== PREFIX && !pathname.startsWith(`${PREFIX}/`)) { res.writeHead(404); res.end('Not found'); return }
    req.url = req.url.slice(PREFIX.length) || '/'
    handler(req, res)
  })
  const port = await listen(server)
  return {
    base: `http://127.0.0.1:${port}${PREFIX}`,
    origin: `http://127.0.0.1:${port}`,
    upstream: upstream.requests,
    close: async () => { await closeServer(server); await closeServer(upstream.server) },
  }
}

// `path` is relative to the mount for local endpoints and starts with /v2/... for forwarded ones, as the browser sends it.
function call(stack, method, path, { headers = {}, body } = {}) {
  return fetch(`${stack.base}${path}`, { method, headers, body })
}

const sameSite = (stack) => ({ origin: stack.origin, 'content-type': 'application/json' })

function signIn(stack, email) {
  return call(stack, 'POST', '/v2/stores/s1/users/sign-in', {
    headers: sameSite(stack),
    body: JSON.stringify({ login: { type: 'email', email }, password: '123456' }),
  })
}

// Sign-in as the storefront sends it: the login is the email address itself.
function signInFrom(stack, email, address, password = '123456') {
  return call(stack, 'POST', '/v2/stores/s1/users/sign-in', {
    headers: { ...sameSite(stack), 'x-forwarded-for': address },
    body: JSON.stringify({ login: email, password }),
  })
}

async function signInCookie(stack, email) {
  const res = await signIn(stack, email)
  assert.equal(res.status, 200)
  return res.headers.get('set-cookie').split(';')[0]
}

const sendOtp = (stack, headers = {}) => call(stack, 'POST', '/v2/stores/s1/users/send-otp', {
  headers: { ...sameSite(stack), ...headers },
  body: JSON.stringify({ contact: 'user@example.com' }),
})

// Every allowlisted route, with a sample id where the template has one.
const ALLOWED = [
  ['GET', ''], ['GET', '/products'], ['GET', '/products/x1'], ['GET', '/categories'], ['GET', '/categories/x1'],
  ['GET', '/brands'], ['GET', '/brands/x1'], ['GET', '/carousels'], ['GET', '/carousels/x1'],
  ['GET', '/promotions'], ['GET', '/promotions/x1'], ['GET', '/upsells/ai-picker'], ['GET', '/upsells/ai-picker/products'],
  ['GET', '/delivery'], ['GET', '/stores-by-location'],
  ['POST', '/carts'], ['GET', '/carts/x1'], ['DELETE', '/carts/x1'], ['PUT', '/carts/current'], ['GET', '/carts/current'], ['DELETE', '/carts/current'],
  ['GET', '/carts/x1/items'], ['PATCH', '/carts/x1/items'], ['GET', '/carts/x1/checkout'], ['PATCH', '/carts/x1/checkout'],
  ['PUT', '/carts/x1/settings'], ['POST', '/orders'], ['GET', '/orders'], ['GET', '/orders/x1'], ['POST', '/orders/x1/payment-link'],
  ['POST', '/users/send-otp'], ['POST', '/users/sign-in'], ['POST', '/users/password'], ['POST', '/users'],
  ['GET', '/users/x1'], ['DELETE', '/users/x1'], ['GET', '/users/x1/settings'],
]

describe('storefront API proxy', () => {
  let stack
  before(async () => { stack = await startStack() })
  after(async () => { await stack.close() })

  test('forwards an allowed GET with the key, origin and query string', async () => {
    const res = await call(stack, 'GET', '/v2/stores/s1/categories?Scope.SaleType=recreational')
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { items: [{ id: 'cat1' }] })
    const sent = stack.upstream.at(-1)
    assert.equal(sent.path, '/ecom/v2/stores/s1/categories')
    assert.equal(sent.search, '?Scope.SaleType=recreational')
    assert.equal(sent.headers['x-api-key'], 'k')
    assert.equal(sent.headers.origin, 'https://shop.example')
  })

  test('answers paths outside the allowlist with 404', async () => {
    for (const path of ['/v2/stores/s1/unknown', '/v2/stores/s1/auth/introspect', '/v2/stores', '/v2/stores/s2/products', '/v2/stores/s2']) {
      const res = await call(stack, 'GET', path)
      assert.equal(res.status, 404, path)
      assert.deepEqual(await res.json(), { detail: 'Not found.' })
    }
    const introspectPost = await call(stack, 'POST', '/v2/stores/s1/auth/introspect', { headers: sameSite(stack), body: '{}' })
    assert.equal(introspectPost.status, 404)
  })

  test('forwards PUT /carts/current and relays a DELETE 204 with an empty body', async () => {
    const put = await call(stack, 'PUT', '/v2/stores/s1/carts/current', { headers: sameSite(stack), body: '{"id":"c1"}' })
    assert.equal(put.status, 200)
    const sentPut = stack.upstream.at(-1)
    assert.equal(sentPut.method, 'PUT')
    assert.equal(sentPut.path, '/ecom/v2/stores/s1/carts/current')
    assert.equal(sentPut.body, '{"id":"c1"}')

    const del = await call(stack, 'DELETE', '/v2/stores/s1/carts/c1', { headers: { origin: stack.origin } })
    assert.equal(del.status, 204)
    assert.equal(await del.text(), '')
    assert.equal(stack.upstream.at(-1).method, 'DELETE')
  })

  test('answers a known path with the wrong method with 405', async () => {
    assert.equal((await call(stack, 'GET', '/v2/stores/s1/carts')).status, 405)
    assert.equal((await call(stack, 'DELETE', '/v2/stores/s1/products', { headers: { origin: stack.origin } })).status, 405)
    // The literal /users/sign-in beats /users/{id}, so DELETE cannot reach the id route.
    assert.equal((await call(stack, 'DELETE', '/v2/stores/s1/users/sign-in', { headers: { origin: stack.origin } })).status, 405)
  })

  test('refuses non-GET requests without a matching Origin, and forwards matching ones', async () => {
    const none = await call(stack, 'POST', '/v2/stores/s1/carts', { headers: { 'content-type': 'application/json' }, body: '{}' })
    assert.equal(none.status, 403)
    assert.deepEqual(await none.json(), { detail: 'Cross-site request refused.' })

    const cross = await call(stack, 'POST', '/v2/stores/s1/carts', { headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' })
    assert.equal(cross.status, 403)

    const sameHost = await call(stack, 'POST', '/v2/stores/s1/carts', { headers: sameSite(stack), body: '{}' })
    assert.equal(sameHost.status, 201)

    const publicHost = await call(stack, 'POST', '/v2/stores/s1/carts', { headers: { origin: 'https://shop.example', 'content-type': 'application/json' }, body: '{}' })
    assert.equal(publicHost.status, 201)
    assert.equal(stack.upstream.at(-1).headers.origin, 'https://shop.example')
  })

  test('rejects bodies over 1 MB with 413', async () => {
    const res = await call(stack, 'POST', '/v2/stores/s1/carts', { headers: sameSite(stack), body: 'x'.repeat(1024 * 1024 + 1) })
    assert.equal(res.status, 413)
  })

  test('sign-in keeps the token in an HttpOnly cookie and strips it from the body', async () => {
    const res = await signIn(stack, 'user@example.com')
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.token.value, undefined)
    assert.equal(body.token.tokenType, 'auth')
    assert.equal(body.userId, 'u1')
    assert.doesNotMatch(JSON.stringify(body), /auth-token-1/)

    const cookie = res.headers.get('set-cookie')
    assert.match(cookie, /^maui_session=[A-Za-z0-9_-]+; /)
    assert.match(cookie, /; Path=\/maui(;|$)/)
    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /SameSite=Lax/)
    assert.doesNotMatch(cookie, /Secure/)
    const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)[1])
    assert.ok(maxAge > 3500 && maxAge <= 3600, `Max-Age ${maxAge}`)
  })

  test('the next forwarded request carries the token as a bearer, and GET /session reports it', async () => {
    const cookie = await signInCookie(stack, 'user@example.com')
    const res = await call(stack, 'GET', '/v2/stores/s1/carts/c1', { headers: { cookie } })
    assert.equal(res.status, 200)
    assert.equal(stack.upstream.at(-1).headers.authorization, 'Bearer auth-token-1')

    const session = await (await call(stack, 'GET', '/session', { headers: { cookie } })).json()
    assert.deepEqual(Object.keys(session).sort(), ['expiresAt', 'signedIn', 'tokenType', 'userId'])
    assert.equal(session.signedIn, true)
    assert.equal(session.tokenType, 'auth')
    assert.equal(session.userId, 'u1')
  })

  test('an upstream 401 on a session request clears the cookie', async () => {
    const cookie = await signInCookie(stack, 'revoke-me@example.com')
    const res = await call(stack, 'GET', '/v2/stores/s1/carts/c1', { headers: { cookie } })
    assert.equal(res.status, 401)
    assert.match(res.headers.get('set-cookie'), /^maui_session=; .*Max-Age=0/)
  })

  test('sign-out clears the session cookie', async () => {
    const res = await call(stack, 'POST', '/session/sign-out', { headers: { origin: stack.origin } })
    assert.equal(res.status, 204)
    assert.equal(await res.text(), '')
    assert.match(res.headers.get('set-cookie'), /^maui_session=; .*Max-Age=0/)
  })

  test('a registration token is not a signed-in session, and POST /users swaps it for an auth token', async () => {
    const signedIn = await signIn(stack, 'new-user@example.com')
    const cookie = signedIn.headers.get('set-cookie').split(';')[0]
    const session = await (await call(stack, 'GET', '/session', { headers: { cookie } })).json()
    assert.equal(session.signedIn, false)
    assert.equal(session.tokenType, 'registration')
    assert.equal(session.userId, 'current')

    // Catalog and cart calls during sign-up must not carry the registration token.
    await call(stack, 'GET', '/v2/stores/s1/carts/c1', { headers: { cookie } })
    assert.equal(stack.upstream.at(-1).headers.authorization, undefined)

    const created = await call(stack, 'POST', '/v2/stores/s1/users', { headers: { ...sameSite(stack), cookie }, body: '{}' })
    assert.equal(created.status, 200)
    assert.equal(stack.upstream.at(-1).headers.authorization, 'Bearer reg-token')
    const replaced = created.headers.get('set-cookie').split(';')[0]
    const after = await (await call(stack, 'GET', '/session', { headers: { cookie: replaced } })).json()
    assert.equal(after.signedIn, true)
    assert.equal(after.userId, 'u2')
  })

  test('a new cart\'s id is also set in a readable cookie, so a page left mid-request can find the bag', async () => {
    const res = await call(stack, 'POST', '/v2/stores/s1/carts', { headers: sameSite(stack), body: '{}' })
    assert.equal(res.status, 201)
    assert.deepEqual(await res.json(), { id: 'c1' })
    const cookie = res.headers.get('set-cookie')
    assert.match(cookie, /^maui_cart=c1; /)
    assert.match(cookie, /; Path=\/maui(;|$)/)
    assert.match(cookie, /SameSite=Lax/)
    assert.doesNotMatch(cookie, /HttpOnly/)
  })

  test('a successful account deletion clears the session cookie', async () => {
    const cookie = await signInCookie(stack, 'user@example.com')
    const res = await call(stack, 'DELETE', '/v2/stores/s1/users/u1', { headers: { ...sameSite(stack), cookie }, body: '{"otp":{"value":"123456"}}' })
    assert.equal(res.status, 200)
    assert.match(res.headers.get('set-cookie'), /^maui_session=; .*Max-Age=0/)
  })

  test('enrichment uses the requested sale type and caches each catalog separately', async () => {
    const before = stack.upstream.length
    await call(stack, 'GET', '/enrich?ids=p1&saleType=medical')
    await call(stack, 'GET', '/enrich?ids=p1&saleType=medical')
    const medical = stack.upstream.slice(before).filter((r) => r.path.endsWith('/products/p1'))
    assert.equal(medical.length, 1)
    assert.match(medical[0].search, /Scope\.SaleType=medical/)
    await call(stack, 'GET', '/enrich?ids=p1&saleType=bogus')
    const fallback = stack.upstream.slice(before).filter((r) => r.path.endsWith('/products/p1')).at(-1)
    assert.doesNotMatch(fallback.search, /medical/)
  })

  test('an expired session cookie is not forwarded', async () => {
    const value = Buffer.from(JSON.stringify({ token: 'old', type: 'auth', userId: 'u1', expiresAt: new Date(Date.now() - 1000).toISOString() })).toString('base64url')
    const res = await call(stack, 'GET', '/v2/stores/s1/carts/c1', { headers: { cookie: `maui_session=${value}` } })
    assert.equal(res.status, 200)
    assert.equal(stack.upstream.at(-1).headers.authorization, undefined)
    const session = await (await call(stack, 'GET', '/session', { headers: { cookie: `maui_session=${value}` } })).json()
    assert.equal(session.signedIn, false)
  })

  test('every allowlisted route is forwarded to the same path', async () => {
    const fresh = await startStack()
    try {
      for (const [method, path] of ALLOWED) {
        const isWrite = method !== 'GET'
        const res = await call(fresh, method, `/v2/stores/s1${path}`, {
          headers: isWrite ? sameSite(fresh) : {},
          body: isWrite ? '{}' : undefined,
        })
        assert.ok(res.status < 400, `${method} ${path} answered ${res.status}`)
        assert.equal(fresh.upstream.at(-1).path, `/ecom/v2/stores/s1${path}`, `${method} ${path}`)
      }
    } finally {
      await fresh.close()
    }
  })
})

describe('cookie and security settings', () => {
  test('the session cookie is Secure unless COOKIE_SECURE is false', async () => {
    const stack = await startStack({ COOKIE_SECURE: undefined })
    try {
      const res = await signIn(stack, 'user@example.com')
      assert.match(res.headers.get('set-cookie'), /; Secure/)
    } finally {
      await stack.close()
    }
  })
})

describe('rate limits', () => {
  test('send-otp allows five attempts per window, then answers 429 with Retry-After', async () => {
    const stack = await startStack()
    try {
      for (let i = 0; i < 5; i++) assert.equal((await sendOtp(stack)).status, 200)
      const limited = await sendOtp(stack)
      assert.equal(limited.status, 429)
      assert.match(limited.headers.get('retry-after'), /^\d+$/)
      assert.deepEqual(await limited.json(), { detail: 'Too many attempts. Try again in a few minutes.' })
      assert.equal(stack.upstream.filter((request) => request.path.endsWith('/send-otp')).length, 5)
    } finally {
      await stack.close()
    }
  })

  test('refused sign-in attempts against one account are limited across addresses', async () => {
    const stack = await startStack({ TRUST_PROXY: 'true' })
    try {
      const attempt = (i, email, password) => signInFrom(stack, email, `203.0.113.${i}`, password)
      // Sign-ins that go through never count: the shopper is not locked out for signing in often.
      for (let i = 1; i <= 9; i++) assert.equal((await attempt(i, 'target@example.com')).status, 200)
      // Eight refused attempts at one login from eight addresses; the ninth is turned away whatever its address.
      for (let i = 11; i <= 18; i++) assert.equal((await attempt(i, 'target@example.com', 'wrong')).status, 400)
      const limited = await attempt(19, 'TARGET@example.com', 'wrong')
      assert.equal(limited.status, 429)
      assert.match(limited.headers.get('retry-after'), /^\d+$/)
      assert.equal((await attempt(20, 'target@example.com')).status, 429, 'locked for the right code too, until the window passes')
      // Another account is not affected.
      assert.equal((await attempt(21, 'other@example.com')).status, 200)
      assert.equal(stack.upstream.filter((request) => request.path.endsWith('/sign-in')).length, 18)
    } finally {
      await stack.close()
    }
  })

  test('enrichment is limited per address', async () => {
    const stack = await startStack()
    try {
      for (let i = 0; i < 60; i++) assert.equal((await call(stack, 'GET', '/enrich?ids=p1')).status, 200)
      const limited = await call(stack, 'GET', '/enrich?ids=p1')
      assert.equal(limited.status, 429)
      assert.match(limited.headers.get('retry-after'), /^\d+$/)
    } finally {
      await stack.close()
    }
  })

  test('X-Forwarded-For is ignored unless TRUST_PROXY is true', async () => {
    const untrusted = await startStack()
    try {
      for (let i = 1; i <= 5; i++) assert.equal((await sendOtp(untrusted, { 'x-forwarded-for': `203.0.113.${i}` })).status, 200)
      assert.equal((await sendOtp(untrusted, { 'x-forwarded-for': '203.0.113.99' })).status, 429)
    } finally {
      await untrusted.close()
    }

    const trusted = await startStack({ TRUST_PROXY: 'true' })
    try {
      for (let i = 1; i <= 6; i++) assert.equal((await sendOtp(trusted, { 'x-forwarded-for': `203.0.113.${i}, 10.0.0.1` })).status, 200)
    } finally {
      await trusted.close()
    }
  })
})

describe('effects and tags enrichment', () => {
  const productCalls = (stack, id) => stack.upstream.filter((request) => request.path === `/ecom/v2/stores/s1/products/${id}`)

  test('returns effects, tags and well-formed lab figures per id, with duplicate effects removed', async () => {
    const stack = await startStack()
    try {
      const res = await call(stack, 'GET', '/enrich?ids=p1,p2')
      assert.equal(res.status, 200)
      assert.equal(res.headers.get('cache-control'), 'public, max-age=60')
      assert.deepEqual(await res.json(), {
        items: {
          p1: {
            effects: ['Relaxed', 'Happy'],
            tags: ['Staff Pick'],
            flavorings: ['Guava'],
            compounds: { v1: { thc: [{ label: 'THCA', uom: 'percent', values: [24.5] }], cbd: [], terpenes: [{ label: 'Limonene', uom: 'percent', values: [0.6, 0.8] }] } },
            deals: { v1: [{ id: 'pr1', name: 'Early Bird', schedule: 'Daily, 07:00 AM - 10:00 AM' }] },
          },
          p2: { effects: [], tags: ['New'], flavorings: [], compounds: {}, deals: {} },
        },
      })
      const sent = productCalls(stack, 'p1').at(-1)
      assert.equal(sent.search, '?Scope.SaleType=recreational')
      assert.equal(sent.headers['x-api-key'], 'k')
      assert.equal(sent.headers.origin, 'https://shop.example')
    } finally {
      await stack.close()
    }
  })

  test('an answer missing a product whose lookup failed is not cached', async () => {
    const stack = await startStack()
    try {
      const res = await call(stack, 'GET', '/enrich?ids=p1,p500')
      assert.equal(res.status, 200)
      assert.equal(res.headers.get('cache-control'), 'no-store')
      assert.deepEqual(Object.keys(await res.json().then((body) => body.items)), ['p1'])
      // A product that does not exist is a complete answer.
      const missing = await call(stack, 'GET', '/enrich?ids=p1,p404')
      assert.equal(missing.headers.get('cache-control'), 'public, max-age=60')
    } finally {
      await stack.close()
    }
  })

  test('sends no shopper session upstream, even when one is signed in', async () => {
    const stack = await startStack()
    try {
      const cookie = await signInCookie(stack, 'user@example.com')
      const res = await call(stack, 'GET', '/enrich?ids=p1', { headers: { cookie } })
      assert.equal(res.status, 200)
      assert.equal(productCalls(stack, 'p1').at(-1).headers.authorization, undefined)
    } finally {
      await stack.close()
    }
  })

  test('one shopper\'s bag and orders are never for a shared cache', async () => {
    const stack = await startStack()
    try {
      const cookie = await signInCookie(stack, 'user@example.com')
      for (const path of ['/v2/stores/s1/carts/current', '/v2/stores/s1/orders?Pagination.Page=1&Pagination.PageSize=10']) {
        const res = await call(stack, 'GET', path, { headers: { cookie } })
        assert.equal(res.headers.get('cache-control'), 'private, no-store', path)
        assert.equal(res.headers.get('vary'), 'Cookie', path)
      }
      // A guest's bag is one shopper's too; the catalog is for everyone.
      assert.equal((await call(stack, 'GET', '/v2/stores/s1/carts/c1')).headers.get('cache-control'), 'private, no-store')
      assert.equal((await call(stack, 'GET', '/v2/stores/s1/categories')).headers.get('cache-control'), null)
    } finally {
      await stack.close()
    }
  })

  test('a second call for the same ids is answered from the cache', async () => {
    const stack = await startStack()
    try {
      await call(stack, 'GET', '/enrich?ids=p1,p2')
      assert.equal(productCalls(stack, 'p1').length, 1)
      const again = await call(stack, 'GET', '/enrich?ids=p2,p1')
      const cached = (await again.json()).items.p1
      assert.deepEqual([cached.effects, cached.tags, Object.keys(cached.compounds)], [['Relaxed', 'Happy'], ['Staff Pick'], ['v1']])
      assert.equal(productCalls(stack, 'p1').length, 1)
      assert.equal(productCalls(stack, 'p2').length, 1)
    } finally {
      await stack.close()
    }
  })

  test('invalid id lists are refused with 400', async () => {
    const stack = await startStack()
    try {
      const fortyNine = Array.from({ length: 49 }, (_, i) => `p${i}`).join(',')
      const fortyEight = Array.from({ length: 48 }, (_, i) => `p${i}`).join(',')
      for (const query of ['', '?ids=', '?ids=p1,,p2', '?ids=p1,', '?ids=p-1', '?ids=p1%20p2', '?ids=../p1', `?ids=${fortyNine}`]) {
        const res = await call(stack, 'GET', `/enrich${query}`)
        assert.equal(res.status, 400, query || '(no ids)')
        assert.match((await res.json()).detail, /48/)
      }
      assert.equal((await call(stack, 'GET', `/enrich?ids=${fortyEight}`)).status, 200)
    } finally {
      await stack.close()
    }
  })

  test('a 404 id is omitted and cached, so it is not asked for again', async () => {
    const stack = await startStack()
    try {
      const res = await call(stack, 'GET', '/enrich?ids=p404,p1')
      assert.deepEqual(Object.keys((await res.json()).items), ['p1'])
      await call(stack, 'GET', '/enrich?ids=p404')
      assert.equal(productCalls(stack, 'p404').length, 1)
    } finally {
      await stack.close()
    }
  })

  test('an upstream failure omits only that id and is not cached', async () => {
    const stack = await startStack()
    try {
      const res = await call(stack, 'GET', '/enrich?ids=p500,p1')
      assert.deepEqual(Object.keys((await res.json()).items), ['p1'])
      await call(stack, 'GET', '/enrich?ids=p500')
      assert.equal(productCalls(stack, 'p500').length, 2)
    } finally {
      await stack.close()
    }
  })

  test('POST to the enrichment endpoint is 405', async () => {
    const stack = await startStack()
    try {
      const res = await call(stack, 'POST', '/enrich?ids=p1', { headers: sameSite(stack), body: '{}' })
      assert.equal(res.status, 405)
      assert.equal(stack.upstream.length, 0)
    } finally {
      await stack.close()
    }
  })
})

describe('createEnricher', () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const emptyProduct = (id) => ({ product: { id, attributes: {} } })

  test('lookups past the waiting cap fail at once instead of queueing', async () => {
    const enrich = createEnricher({
      concurrency: 1,
      maxWaiting: 2,
      fetchProduct: async (id) => { await sleep(10); return emptyProduct(id) },
    })
    // One runs, two wait, the rest are turned away: the answer is incomplete and says so.
    const { items, complete } = await enrich(['a', 'b', 'c', 'd', 'e'])
    assert.equal(Object.keys(items).length, 3)
    assert.equal(complete, false)
  })

  test('never runs more than `concurrency` fetches at once', async () => {
    let active = 0
    let peak = 0
    const enrich = createEnricher({
      concurrency: 2,
      fetchProduct: async (id) => {
        active++
        peak = Math.max(peak, active)
        await sleep(5)
        active--
        return emptyProduct(id)
      },
    })
    const { items } = await enrich(Array.from({ length: 10 }, (_, i) => `q${i}`))
    assert.equal(Object.keys(items).length, 10)
    assert.equal(peak, 2)
  })

  test('concurrent lookups for one id share one upstream request', async () => {
    let calls = 0
    const enrich = createEnricher({
      fetchProduct: async (id) => { calls++; await sleep(5); return emptyProduct(id) },
    })
    await Promise.all([enrich(['a1']), enrich(['a1', 'a2']), enrich(['a1'])])
    assert.equal(calls, 2)
  })

  test('entries expire after the TTL and are fetched again', async () => {
    let clock = 0
    let calls = 0
    const enrich = createEnricher({
      ttlMs: 1000,
      now: () => clock,
      fetchProduct: async (id) => { calls++; return emptyProduct(id) },
    })
    await enrich(['a1'])
    clock = 999
    await enrich(['a1'])
    assert.equal(calls, 1)
    clock = 1000
    await enrich(['a1'])
    assert.equal(calls, 2)
  })

  test('an answer without lab figures is kept only briefly, so a passing blank does not stick', async () => {
    let clock = 0
    const calls = {}
    const tested = (id) => ({ product: { id, attributes: {}, variants: [{ id: `${id}-v`, compounds: { thc: [{ label: 'THC', uom: 'percent', values: [20] }] } }] } })
    const enrich = createEnricher({
      ttlMs: 60_000,
      blankTtlMs: 1000,
      now: () => clock,
      fetchProduct: async (id) => { calls[id] = (calls[id] || 0) + 1; return id === 'blank' ? emptyProduct(id) : tested(id) },
    })
    await enrich(['blank', 'tested'])
    clock = 1000
    await enrich(['blank', 'tested'])
    assert.deepEqual(calls, { blank: 2, tested: 1 })
  })
})
