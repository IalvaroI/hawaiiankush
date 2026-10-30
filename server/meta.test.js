import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCache, resolvePage, truncate } from './meta.js'

const S = '/v2/stores/store1'
const ENV = { STORE_ID: 'store1', VITE_SALE_TYPE: 'recreational', BASE_PATH: '/maui' }
const ORIGIN = 'https://shop.example.com'

const store = {
  id: 'store1',
  name: 'Green Leaf',
  description: 'Friendly neighborhood dispensary.',
  settings: { images: { logo: 'https://cdn.example.test/logo.svg' } },
}
const edibles = { id: 'cat1', name: 'Edibles', children: [{ id: 'sub1', name: 'Gummies & Chews', children: [] }] }
const flower = { id: 'cat2', name: 'Flower', children: [] }
const product = {
  id: 'p1',
  name: 'Coconut <script>"Sour"</script> Gummy',
  description: '  Tangy\n\n  gummy rings   made with real coconut.  ',
  attributes: {
    category: { id: 'sub1', name: 'Gummies & Chews' },
    brand: { id: 'b1', name: 'Mountain "Co"' },
  },
  images: [],
  variants: [
    { id: 'v1', prices: { base: '25.00', discounted: '20.00' }, stock: { quantity: '3' }, images: [{ source: 'https://cdn.example.test/v1.jpg' }] },
    { id: 'v2', prices: { base: '40', discounted: null }, stock: { quantity: '0' }, images: [] },
  ],
}
const brand = { id: 'b1', name: 'Mountain "Co"', filters: [], images: [] }

// Fake Ecom API: any path not listed is a 404, and an Error value is thrown as-is.
function fakeApi(overrides = {}, calls = []) {
  const routes = {
    [S]: { store },
    [`${S}/categories`]: { items: [edibles, flower] },
    [`${S}/categories/cat1`]: { category: edibles },
    [`${S}/products/p1`]: { product, relations: {} },
    [`${S}/brands/b1`]: { brand },
    ...overrides,
  }
  return async function fetchJson(apiPath) {
    calls.push(apiPath)
    const hit = routes[apiPath]
    if (hit === undefined) throw Object.assign(new Error('Not found'), { status: 404 })
    if (hit instanceof Error) throw hit
    return hit
  }
}

const run = (path, search = '', overrides = {}) =>
  resolvePage(path, search, ENV, { fetchJson: fakeApi(overrides), cache: createCache() })

const PRODUCT_PATH = '/maui/p/coconut-script-sour-script-gummy-p1'

test('home title and canonical use the store name', async () => {
  const page = await run('/maui/')
  assert.equal(page.status, 200)
  assert.ok(page.head.includes('<title>Green Leaf · Shop</title>'))
  assert.ok(page.head.includes(`<link rel="canonical" href="${ORIGIN}/maui/">`))
  assert.ok(page.head.includes('<meta name="description" content="Friendly neighborhood dispensary.">'))
})

test('shop canonical drops the search query', async () => {
  const page = await run('/maui/shop', '?q=gummies')
  assert.ok(page.head.includes(`<link rel="canonical" href="${ORIGIN}/maui/shop">`))
  assert.ok(page.head.includes('<title>Shop · Green Leaf</title>'))
})

test('category found through the children fallback', async () => {
  const page = await run('/maui/c/gummies-and-chews-sub1')
  assert.equal(page.status, 200)
  assert.ok(page.head.includes('<title>Gummies &amp; Chews · Green Leaf</title>'))
  assert.ok(page.head.includes(`href="${ORIGIN}/maui/c/gummies-and-chews-sub1"`))
})

test('category with a wrong slug redirects and keeps the query', async () => {
  const page = await run('/maui/c/wrong-cat1', '?sort=price')
  assert.equal(page.status, 301)
  assert.equal(page.redirect, '/maui/c/edibles-cat1?sort=price')
})

test('unknown category is a 404', async () => {
  const page = await run('/maui/c/nothing-zzz999')
  assert.equal(page.status, 404)
  assert.ok(page.head.includes('noindex'))
})

test('product tags, variant canonical and JSON-LD price range', async () => {
  const page = await run(PRODUCT_PATH, '?variant=v1')
  assert.equal(page.status, 200)
  assert.ok(page.head.includes('<meta property="og:type" content="product">'))
  assert.ok(page.head.includes(`<link rel="canonical" href="${ORIGIN}${PRODUCT_PATH}?variant=v1">`))
  assert.ok(page.head.includes('<meta property="og:image" content="https://cdn.example.test/v1.jpg">'))
  assert.ok(page.head.includes('<meta name="twitter:card" content="summary_large_image">'))

  const match = page.head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
  assert.ok(match, 'JSON-LD block present')
  const ld = JSON.parse(match[1])
  assert.equal(ld['@type'], 'Product')
  assert.equal(ld.name, product.name)
  assert.equal(ld.sku, 'v1')
  assert.equal(ld.brand.name, 'Mountain "Co"')
  assert.equal(ld.offers['@type'], 'AggregateOffer')
  assert.equal(ld.offers.lowPrice, '20.00')
  assert.equal(ld.offers.highPrice, '40.00')
  assert.equal(ld.offers.priceCurrency, 'USD')
  assert.equal(ld.offers.availability, 'https://schema.org/InStock')
})

test('product title and text escape markup and quotes', async () => {
  const page = await run(PRODUCT_PATH)
  assert.ok(page.head.includes(
    '<title>Coconut &lt;script&gt;&quot;Sour&quot;&lt;/script&gt; Gummy · Mountain &quot;Co&quot; · Green Leaf</title>',
  ))
  // Exactly one closing tag: the real end of the JSON-LD block. The product name must not close it early.
  assert.equal(page.head.split('</script>').length, 2)
  assert.ok(!page.head.includes('<script>"'))
})

test('out-of-stock product reports OutOfStock and falls back to the variant image', async () => {
  const outOfStock = {
    ...product,
    variants: product.variants.map((variant) => ({ ...variant, stock: { quantity: '0' } })),
  }
  const page = await run(PRODUCT_PATH, '', { [`${S}/products/p1`]: { product: outOfStock } })
  const ld = JSON.parse(page.head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])
  assert.equal(ld.offers.availability, 'https://schema.org/OutOfStock')
  assert.ok(page.head.includes('og:image" content="https://cdn.example.test/v1.jpg"'))
})

test('product with a wrong slug redirects and keeps the variant', async () => {
  const page = await run('/maui/p/nope-p1', '?variant=v2')
  assert.equal(page.status, 301)
  assert.equal(page.redirect, `${PRODUCT_PATH}?variant=v2`)
})

test('unknown product is a 404', async () => {
  const page = await run('/maui/p/nope-zzzzzz')
  assert.equal(page.status, 404)
  assert.ok(page.head.includes('<meta name="robots" content="noindex">'))
  assert.ok(page.head.includes('<title>Page not found · Green Leaf</title>'))
})

test('brand title and slug redirect', async () => {
  const ok = await run('/maui/b/mountain-co-b1')
  assert.equal(ok.status, 200)
  assert.ok(ok.head.includes('<title>Mountain &quot;Co&quot; · Green Leaf</title>'))
  const redirect = await run('/maui/b/whatever-b1')
  assert.equal(redirect.redirect, '/maui/b/mountain-co-b1')
})

test('Sweed menu link redirects to the matching category', async () => {
  const page = await run(
    '/maui/recreational/menu/edibles-40493/gummies-coconut-sour-gummy-rings-edible-coconut-sour-gummy-rings-5-pack-25mg-4461454',
  )
  assert.equal(page.status, 301)
  assert.equal(page.redirect, '/maui/c/edibles-cat1')
})

test('Sweed menu link with no matching category goes to the shop', async () => {
  const page = await run('/maui/medical/menu/unknown-category-12')
  assert.equal(page.status, 301)
  assert.equal(page.redirect, '/maui/shop')
})

test('private routes are noindex with a plain title', async () => {
  for (const path of ['/maui/checkout', '/maui/bag', '/maui/sign-in', '/maui/account', '/maui/orders', '/maui/orders/ord123']) {
    const page = await run(path)
    assert.equal(page.status, 200, path)
    assert.ok(page.head.includes('<meta name="robots" content="noindex">'), path)
    assert.ok(!page.head.includes('rel="canonical"'), path)
    if (path === '/maui/checkout') assert.ok(page.head.includes('<title>Checkout · Green Leaf</title>'))
  }
})

test('unknown paths under /maui are 404 and noindex', async () => {
  const page = await run('/maui/nothing/here')
  assert.equal(page.status, 404)
  assert.ok(page.head.includes('noindex'))
})

test('upstream failure on the store still serves the default tags', async () => {
  const page = await run('/maui/', '', { [S]: Object.assign(new Error('timeout'), { name: 'TimeoutError' }) })
  assert.equal(page.status, 200)
  assert.ok(page.head.includes('<title>Shop</title>'))
  // The home URL is still its own canonical even when the store name is unknown.
  assert.ok(page.head.includes(`<link rel="canonical" href="${ORIGIN}/maui/">`))
})

test('upstream failure on a product serves the default tags with status 200', async () => {
  const page = await run(PRODUCT_PATH, '', { [`${S}/products/p1`]: Object.assign(new Error('boom'), { status: 500 }) })
  assert.equal(page.status, 200)
  assert.ok(page.head.includes('<title>Shop</title>'))
  assert.ok(!page.head.includes('ld+json'))
})

test('successful upstream responses are cached per URL', async () => {
  const calls = []
  const cache = createCache()
  const fetchJson = fakeApi({}, calls)
  await resolvePage('/maui/', '', ENV, { fetchJson, cache })
  await resolvePage('/maui/shop', '', ENV, { fetchJson, cache })
  assert.equal(calls.filter((path) => path === S).length, 1)
})

test('requests for one entry that arrive while it loads share one upstream call', async () => {
  const calls = []
  const cache = createCache()
  const slow = fakeApi({}, calls)
  const fetchJson = async (apiPath) => { await new Promise((resolve) => setTimeout(resolve, 10)); return slow(apiPath) }
  await Promise.all([resolvePage('/maui/', '', ENV, { fetchJson, cache }), resolvePage('/maui/shop', '', ENV, { fetchJson, cache })])
  assert.equal(calls.filter((path) => path === S).length, 1)
})

test('cache entries expire', () => {
  let time = 0
  const cache = createCache({ ttl: 1000, now: () => time })
  cache.set('k', 'v')
  assert.equal(cache.get('k'), 'v')
  time = 1000
  assert.equal(cache.get('k'), undefined)
})

test('truncate cuts at a word boundary with an ellipsis', () => {
  const long = truncate('word '.repeat(80))
  assert.ok(long.length <= 160)
  assert.ok(long.endsWith('…'))
  assert.ok(long.slice(0, -1).split(' ').every((word) => word === 'word'))
  assert.equal(truncate('  short \n text '), 'short text')
})
