// The Sweed mock is test infrastructure, so it gets its own checks: the same contracts the storefront relies on.
// Runs the mock in-process on a random port; nothing leaves this machine.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createMockSweed, loadFixtures } from '../mock-sweed/server.js'

const ORIGIN = 'http://localhost:4100'
const fixtures = loadFixtures()
const storeId = fixtures.store.store.id
let server
let base

const headers = (extra = {}) => ({ 'x-api-key': 'test', origin: ORIGIN, accept: 'application/json', ...extra })

async function call(method, path, body, extra) {
  const response = await fetch(`${base}/ecom/v2/stores/${storeId}${path}`, {
    method,
    headers: headers({ ...(body ? { 'content-type': 'application/json' } : {}), ...extra }),
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = response.status === 204 ? '' : await response.text()
  return { status: response.status, json: text ? JSON.parse(text) : null }
}

const guest = { firstName: 'Test', lastName: 'Shopper', email: 'shopper@example.com', phone: '8085550199', birthDate: '1990-01-01' }
const firstKey = fixtures.products.items[0].variants[0].purchaseKey

before(async () => {
  server = createMockSweed({ fixtures, apiKey: 'test', allowedOrigin: ORIGIN })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(() => new Promise((resolve) => {
  // fetch keeps connections alive; close them, or server.close never finishes.
  server.close(resolve)
  server.closeAllConnections()
}))

describe('mock Sweed: gatekeeping', () => {
  it('refuses a wrong key and a foreign origin the way the real API does', async () => {
    assert.equal((await call('GET', '/products', null, { 'x-api-key': 'nope' })).status, 401)
    const foreign = await fetch(`${base}/ecom/v2/stores/${storeId}/products`, { headers: headers({ origin: 'https://elsewhere.test' }) })
    assert.equal(foreign.status, 403)
  })

  it('answers 404 for another store id and for unknown paths', async () => {
    const other = await fetch(`${base}/ecom/v2/stores/someone-else/products`, { headers: headers() })
    assert.equal(other.status, 404)
    assert.equal((await call('GET', '/nope')).status, 404)
  })
})

describe('mock Sweed: catalog', () => {
  it('pages products and reports the full total', async () => {
    const page = await call('GET', '/products?Pagination.Page=2&Pagination.PageSize=10')
    assert.equal(page.status, 200)
    assert.equal(page.json.items.length, 10)
    assert.equal(Number(page.json.totalItems), fixtures.products.items.length)
  })

  it('searches by name, case-insensitively', async () => {
    const name = fixtures.products.items[0].name.split(' ')[0]
    const found = await call('GET', `/products?Search=${encodeURIComponent(name.toUpperCase())}`)
    assert.ok(found.json.items.every((item) => item.name.toLowerCase().includes(name.toLowerCase())))
    assert.ok(found.json.items.length >= 1)
  })

  it('sorts price low to high', async () => {
    const sorted = await call('GET', '/products?SortingOption=priceAsc&Pagination.PageSize=100')
    const prices = sorted.json.items.map((item) => Number(item.variants[0].prices.discounted ?? item.variants[0].prices.base))
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b))
  })

  it('returns 404 for a product that is not in the fixtures', async () => {
    assert.equal((await call('GET', '/products/zz9notaproductid00')).status, 404)
  })
})

describe('mock Sweed: bag and checkout', () => {
  it('caps an add at the stock quantity and reports what was applied', async () => {
    const created = await call('POST', '/carts', { settings: { saleType: 'recreational', isResident: false } })
    assert.equal(created.status, 201)
    const stock = Number(fixtures.products.items[0].variants[0].stock.quantity)
    const patch = await call('PATCH', `/carts/${created.json.id}/items`, { items: [{ purchaseKey: firstKey, quantityDelta: stock + 50 }] })
    assert.equal(patch.json.items[0].quantityDelta, stock)
  })

  it('needs guest details for an anonymous checkout and refuses loyalty points for guests', async () => {
    const created = await call('POST', '/carts', { settings: { saleType: 'recreational', isResident: false }, items: [{ purchaseKey: firstKey, quantity: 1 }] })
    const cartId = created.json.id
    const settings = { deliveryMethod: { type: 'pickup', pickupType: 'inStorePickup' }, timeWindow: null, paymentMethod: null, promoCodes: [], notes: null }
    assert.match((await call('PATCH', `/carts/${cartId}/checkout`, { settings })).json.detail, /Guest data is required/)
    assert.equal((await call('PATCH', `/carts/${cartId}/checkout`, { settings: { ...settings, loyaltyPoints: 5 }, guest })).status, 400)
  })

  it('answers 401 for an account\'s checkout without its sign-in, and applies loyalty points up to the cap', async () => {
    const signIn = await call('POST', '/users/sign-in', { login: { type: 'email', value: 'known@example.com' }, password: { type: 'password', value: 'Known-Pass1' } })
    const auth = { authorization: `Bearer ${signIn.json.token.value}` }
    const created = await call('POST', '/carts', { settings: { saleType: 'recreational' } }, auth)
    const id = created.json.id
    assert.equal((await call('GET', `/carts/${id}/checkout`, null)).status, 401)
    assert.equal((await call('PATCH', `/carts/${id}/checkout`, { settings: { loyaltyPoints: '120' } })).status, 401)
    const applied = await call('PATCH', `/carts/${id}/checkout`, { settings: { loyaltyPoints: '120' } }, auth)
    assert.equal(applied.status, 200)
    assert.equal(applied.json.settings.loyaltyPoints, '100')
    assert.equal(applied.json.loyalty.pointsRedemptionType, 'maximumAvailable')
    const none = await call('PATCH', `/carts/${id}/checkout`, { settings: {} }, auth)
    assert.equal(none.json.settings.loyaltyPoints, null)
  })

  it('refuses an unknown promo code and accepts a known one', async () => {
    const created = await call('POST', '/carts', { settings: { saleType: 'recreational', isResident: false }, items: [{ purchaseKey: firstKey, quantity: 1 }] })
    const settings = { deliveryMethod: { type: 'pickup', pickupType: 'inStorePickup' }, timeWindow: null, paymentMethod: { type: 'payOnSite' }, promoCodes: ['NOT-REAL'], notes: null }
    const refused = await call('PATCH', `/carts/${created.json.id}/checkout`, { settings, guest })
    assert.equal(refused.status, 400)
    assert.match(refused.json.detail, /not a valid promo code/)
    const accepted = await call('PATCH', `/carts/${created.json.id}/checkout`, { settings: { ...settings, promoCodes: ['WELCOME10'] }, guest })
    assert.equal(accepted.status, 200)
    assert.deepEqual(accepted.json.settings.promoCodes, ['WELCOME10'])
  })

  it('places an order once and closes the cart', async () => {
    const created = await call('POST', '/carts', { settings: { saleType: 'recreational', isResident: false }, items: [{ purchaseKey: firstKey, quantity: 1 }] })
    const cartId = created.json.id
    await call('PATCH', `/carts/${cartId}/checkout`, {
      settings: { deliveryMethod: { type: 'pickup', pickupType: 'curbside' }, timeWindow: null, paymentMethod: { type: 'payOnSite' }, promoCodes: [], notes: null },
      guest,
    })
    const order = await call('POST', '/orders', { cartId })
    assert.equal(order.json.type, 'orderCreated')
    assert.match(order.json.orderId, /^[0-9a-f]+$/)
    assert.equal((await call('GET', `/carts/${cartId}`)).status, 404)
  })

  it('refuses online payment links, which the test store never offers', async () => {
    assert.equal((await call('POST', '/orders/anything/payment-link', { redirectUrl: 'https://example.test' })).status, 400)
  })
})

describe('mock Sweed: accounts', () => {
  it('signs in with the test code, and a wrong code is a 400', async () => {
    const known = await call('POST', '/users/sign-in', { login: { type: 'email', value: 'known@example.com' }, password: { type: 'otp', value: '123456' } })
    assert.equal(known.json.token.tokenType, 'auth')
    assert.equal(known.json.userId, 'user-known')
    const wrong = await call('POST', '/users/sign-in', { login: { type: 'email', value: 'known@example.com' }, password: { type: 'otp', value: '000000' } })
    assert.equal(wrong.status, 400)
  })

  it('gives a new address a registration token that can only create the account', async () => {
    const signIn = await call('POST', '/users/sign-in', { login: { type: 'email', value: 'new@example.com' }, password: { type: 'otp', value: '123456' } })
    assert.equal(signIn.json.token.tokenType, 'registration')
    const registration = { authorization: `Bearer ${signIn.json.token.value}` }
    assert.equal((await call('GET', '/orders', null, registration)).status, 401)
    const created = await call('POST', '/users', { firstName: 'New', lastName: 'Person', birthDate: '1990-05-05' }, registration)
    assert.equal(created.status, 200)
    assert.equal(created.json.token.tokenType, 'auth')
  })

  it('shows the seeded orders to the signed-in account only', async () => {
    const signIn = await call('POST', '/users/sign-in', { login: { type: 'email', value: 'known@example.com' }, password: { type: 'password', value: 'Known-Pass1' } })
    const list = await call('GET', '/orders', null, { authorization: `Bearer ${signIn.json.token.value}` })
    assert.equal(list.json.totalItems, 2)
    const anonymous = await call('GET', '/orders')
    assert.equal(anonymous.status, 401)
  })
})

describe('mock Sweed: delivery', () => {
  it('answers available inside the synthetic zone and the recorded outOfZone answer outside it', async () => {
    const zone = fixtures.delivery.synthetic.zone.center
    const inside = await call('GET', `/delivery?Location.Address=Waialua&Location.Coordinates.Latitude=${zone.latitude}&Location.Coordinates.Longitude=${zone.longitude}`)
    assert.equal(inside.json.delivery.availability, 'available')
    const outside = await call('GET', '/delivery?Location.Address=Honolulu&Location.Coordinates.Latitude=21.3069&Location.Coordinates.Longitude=-157.8583')
    assert.equal(outside.json.delivery.availability, 'notAllowed')
  })
})
