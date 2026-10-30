// A stand-in for the Sweed "Ecom API v2", answering the endpoints the storefront uses from recorded fixtures.
//
// Run on its own (the Playwright config does this):  node tests/mock-sweed/server.js
// Environment: MOCK_PORT (default 4010), MOCK_API_KEY (default "test"), MOCK_ALLOWED_ORIGIN (default http://localhost:4100),
// MOCK_LOG=1 to print one line per request.
//
// Like the real API it checks the key and the Origin header, answers 404 for another store id, and speaks ProblemDetails
// ({ detail }) on errors. Nothing is sent anywhere: codes, orders and sign-ups exist only in this process's memory.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCatalog } from './catalog.js'
import { createCommerce } from './commerce.js'
import { createUsers } from './users.js'
import { ApiFailure, fail, NO_CONTENT, readJson, sendFailure, sendJson } from './http.js'

const here = dirname(fileURLToPath(import.meta.url))
export const FIXTURES_DIR = join(here, '..', 'fixtures')

export function loadFixtures(dir = FIXTURES_DIR) {
  const read = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'))
  return {
    store: read('store.json'),
    categories: read('categories.json'),
    products: read('products.json'),
    productDetails: read('product-details.json'),
    brands: read('brands.json'),
    promotions: read('promotions.json'),
    carousels: read('carousels.json'),
    delivery: read('delivery.json'),
    storesByLocation: read('stores-by-location.json'),
  }
}

const PUBLIC_ROUTES = new Set(['users/sign-in', 'users/send-otp', 'users/password'])

// Each route: method, path below /ecom/v2/stores/{id} (":name" is a parameter), and a handler returning the JSON body,
// NO_CONTENT, or { status, body }.
function buildRoutes({ catalog, commerce, users }) {
  return [
    ['GET', '', () => ({ store: catalog.store })],
    ['GET', 'categories', () => catalog.categories()],
    ['GET', 'categories/:id', ({ params }) => catalog.category(params.id)],
    ['GET', 'brands', ({ query }) => catalog.brands(query)],
    ['GET', 'brands/:id', ({ params }) => catalog.brand(params.id)],
    ['GET', 'promotions', () => catalog.promotions()],
    ['GET', 'promotions/:id', ({ params }) => catalog.promotion(params.id)],
    ['GET', 'carousels', ({ query }) => catalog.carousels(query)],
    ['GET', 'carousels/:id', ({ params, query }) => catalog.carousel(params.id, query)],
    ['GET', 'products', ({ query }) => catalog.products(query)],
    ['GET', 'products/:id', ({ params }) => catalog.product(params.id)],
    // The live demo store's AI-Picker questions endpoint answers 500; the products endpoint works with a category.
    ['GET', 'upsells/ai-picker', () => { throw fail(500, 'An unexpected error occurred.') }],
    ['GET', 'upsells/ai-picker/products', ({ query }) => catalog.aiPickerProducts(query)],
    ['GET', 'delivery', ({ query }) => catalog.delivery(query)],
    ['GET', 'stores-by-location', () => catalog.stores()],
    ['POST', 'carts', ({ body, auth }) => commerce.create(body, auth)],
    ['PUT', 'carts/current', ({ body, auth }) => commerce.transfer(body, auth)],
    ['GET', 'carts/:id', ({ params }) => commerce.read(params.id)],
    ['DELETE', 'carts/:id', ({ params }) => commerce.remove(params.id)],
    ['GET', 'carts/:id/items', ({ params }) => commerce.items(params.id)],
    ['PATCH', 'carts/:id/items', ({ params, body }) => commerce.patchItems(params.id, body)],
    ['PUT', 'carts/:id/settings', ({ params, body }) => commerce.updateSettings(params.id, body)],
    ['GET', 'carts/:id/checkout', ({ params, auth }) => commerce.checkout(params.id, auth)],
    ['PATCH', 'carts/:id/checkout', ({ params, body, auth }) => commerce.updateCheckout(params.id, body, auth)],
    ['POST', 'orders', ({ body, auth }) => commerce.placeOrder(body, auth)],
    ['GET', 'orders', ({ query, auth }) => commerce.listOrders(auth, query)],
    ['GET', 'orders/:id', ({ params, auth }) => commerce.getOrder(auth, params.id)],
    ['POST', 'orders/:id/payment-link', () => { throw fail(400, 'Online payment is not available in the test store.') }],
    ['POST', 'users/send-otp', ({ body }) => users.sendOtp(body)],
    ['POST', 'users/sign-in', ({ body }) => users.signIn(body)],
    ['POST', 'users/password', ({ body }) => users.setPassword(body)],
    ['POST', 'users', ({ body, auth }) => users.create(body, auth)],
    ['GET', 'users/:id', ({ params, auth }) => users.get(params.id, auth)],
    ['GET', 'users/:id/settings', ({ params, auth }) => users.settings(params.id, auth)],
    ['DELETE', 'users/:id', ({ params, auth, body }) => users.remove(params.id, auth, body)],
  ].map(([method, path, handler]) => ({
    method,
    path,
    public: PUBLIC_ROUTES.has(path),
    pattern: new RegExp(`^${path === '' ? '' : `/${path.replace(/:(\w+)/g, '(?<$1>[^/]+)')}`}$`),
    handler,
  }))
}

export function createMockSweed({
  fixtures = loadFixtures(),
  apiKey = process.env.MOCK_API_KEY || 'test',
  allowedOrigin = process.env.MOCK_ALLOWED_ORIGIN || 'http://localhost:4100',
  log = process.env.MOCK_LOG === '1',
} = {}) {
  const storeId = fixtures.store.store.id
  const catalog = createCatalog(fixtures)
  const users = createUsers()
  const commerce = createCommerce({ catalog, users, storeId })
  const routes = buildRoutes({ catalog, commerce, users })
  const prefix = `/ecom/v2/stores/${storeId}`

  // Seeded history for the signed-in test account: one order being packed, one already picked up.
  const [first, second] = fixtures.products.items
  const keyOf = (product) => product.variants[0].purchaseKey
  commerce.seedOrder('user-known', { purchaseKey: keyOf(first), quantity: 1, status: 'packing', paid: false, hoursAgo: 2 })
  commerce.seedOrder('user-known', { purchaseKey: keyOf(second), quantity: 2, status: 'pickedUp', paid: true, hoursAgo: 30 })

  async function handleStore(req, res, subpath, url) {
    if (req.headers['x-api-key'] !== apiKey) throw fail(401, 'Invalid API key.')
    if (req.headers.origin !== allowedOrigin) throw fail(403, 'Origin is not allowed')
    const onPath = routes.filter((candidate) => candidate.pattern.test(subpath))
    if (!onPath.length) throw fail(404, 'Not found.')
    const route = onPath.find((candidate) => candidate.method === req.method)
    if (!route) throw fail(405, 'Method not allowed.')
    const match = route.pattern.exec(subpath)
    const body = req.method === 'GET' ? {} : await readJson(req)
    // A stale token must not stop a call that does not need one (a new sign-in, a code), as the real API ignores it there.
    const auth = route.public ? users.authOrNull(req.headers.authorization) : users.authOf(req.headers.authorization)
    const result = await route.handler({ params: match.groups || {}, query: url.searchParams, body, auth })
    if (result === NO_CONTENT) { res.writeHead(204); res.end(); return }
    if (result && typeof result === 'object' && 'status' in result && 'body' in result) { sendJson(res, result.status, result.body); return }
    sendJson(res, 200, result)
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const started = Date.now()
    res.on('finish', () => { if (log) console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`) })
    try {
      if (url.pathname === '/__health') { sendJson(res, 200, { status: 'ok', store: storeId }); return }
      if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) throw fail(404, 'Not found.')
      await handleStore(req, res, url.pathname.slice(prefix.length), url)
    } catch (error) {
      if (!(error instanceof ApiFailure)) console.error(error)
      if (!res.headersSent) sendFailure(res, error)
      else res.end()
    }
  })
}

// Runs the mock on MOCK_PORT when this file is the entry point.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.MOCK_PORT || 4010)
  createMockSweed().listen(port, '127.0.0.1', () => console.log(`Mock Sweed API on http://127.0.0.1:${port}`))
}
