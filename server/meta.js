// Server-rendered <head> tags for storefront routes. The SPA shell is the same for every URL, so without
// these, search engines and link previews only ever see the generic "Shop" title.
import { joinSlugId, slugify, splitSlugId } from '../shared/slug.js'

const DEFAULT_ORIGIN = 'https://shop.example.com'
const DEFAULT_DESCRIPTION = "Browse the store's available cannabis products."
const DESCRIPTION_MAX = 160
const UPSTREAM_TIMEOUT_MS = 8000
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_MAX_ENTRIES = 500
const ID_PATTERN = /^[A-Za-z0-9]+$/
// Maps instead of plain objects so a path like /constructor is not mistaken for a known route.
const LISTINGS = new Map([['shop', 'Shop'], ['brands', 'Brands'], ['deals', 'Deals'], ['learn', 'Learn'], ['locations', 'Locations'], ['picker', 'Find your match']])
const PRIVATE = new Map([['bag', 'Bag'], ['checkout', 'Checkout'], ['sign-in', 'Sign in'], ['account', 'Account'], ['orders', 'Orders'], ['saved', 'Saved']])
const ENTITIES = new Map([['c', 'category'], ['b', 'brand'], ['p', 'product']])
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

const sharedCache = createCache()

// Small TTL map. Successful responses and 404s are stored; other failures never are, so an outage is not cached.
export function createCache({ ttl = CACHE_TTL_MS, max = CACHE_MAX_ENTRIES, now = Date.now } = {}) {
  const entries = new Map()
  return {
    // Loads under way, by key, so requests that miss together share one upstream call.
    pending: new Map(),
    get(key) {
      const entry = entries.get(key)
      if (!entry) return undefined
      if (entry.expires <= now()) {
        entries.delete(key)
        return undefined
      }
      return entry.value
    },
    set(key, value) {
      entries.delete(key)
      // Map keeps insertion order, so the first key is the oldest entry.
      if (entries.size >= max) entries.delete(entries.keys().next().value)
      entries.set(key, { value, expires: now() + ttl })
    },
  }
}

// Calls the Ecom API the same way server/proxy.js does: same base URL, key and origin header.
export function createEcomFetcher(env) {
  return async function fetchEcom(apiPath, query = {}) {
    const key = env.ECOM_API_KEY || env.API_KEY
    if (!key || !env.STORE_ID || !env.API_BASE_URL) throw new Error('Store API is not configured')
    const base = new URL(env.API_BASE_URL)
    const url = new URL(`${base.pathname.replace(/\/$/, '')}/ecom${apiPath}`, base.origin)
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value)
    const headers = { 'x-api-key': key, accept: 'application/json' }
    if (env.API_ORIGIN) headers.origin = env.API_ORIGIN
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
    if (!response.ok) throw Object.assign(new Error(`Store API responded ${response.status}`), { status: response.status })
    return response.json()
  }
}

// Resolves one storefront URL. `pathname` includes BASE_PATH. Returns { status, redirect?, head }.
// `options` lets tests inject a fake fetchJson(apiPath, query) and their own cache.
export async function resolvePage(pathname, search = '', env = {}, options = {}) {
  const ctx = createContext(env, options)
  const route = parseRoute(pathname, ctx.base)
  let page
  try {
    const store = await loadStore(ctx)
    page = { siteName: store?.name || null, ...(await buildPage(route, search, ctx, store)) }
  } catch {
    // Upstream trouble must never break the page; these are the same generic tags the shell ships with.
    page = { title: 'Shop', description: DEFAULT_DESCRIPTION }
  }
  if (page.redirect) return { status: 301, redirect: page.redirect, head: '' }
  return { status: page.status || 200, head: renderHead(page, ctx) }
}

// Collapses whitespace and cuts at a word boundary, ending with an ellipsis when it had to cut.
export function truncate(text, max = DESCRIPTION_MAX) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  const kept = space > max / 2 ? cut.slice(0, space) : cut
  return `${kept.replace(/[\s.,;:!?-]+$/, '')}…`
}

function createContext(env, options) {
  const load = options.fetchJson || createEcomFetcher(env)
  const cache = options.cache || sharedCache
  const base = basePathOf(env)
  return {
    base,
    publicOrigin: (env.PUBLIC_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, ''),
    storePath: `/v2/stores/${encodeURIComponent(env.STORE_ID || '')}`,
    // The category, product and brand endpoints require the sale type scope.
    scope: { 'Scope.SaleType': env.VITE_SALE_TYPE || 'recreational' },
    path: (...parts) => base + parts.join('/'),
    // Resolves to the JSON, or null for a 404. Any other failure throws.
    // Requests for one key that arrive while it loads share that one load (a burst after the entry expires).
    async get(apiPath, query = {}) {
      const key = `${apiPath}?${new URLSearchParams(query)}`
      const hit = cache.get(key)
      if (hit !== undefined) return hit
      let pending = cache.pending.get(key)
      if (!pending) {
        pending = load(apiPath, query)
          .then((json) => { cache.set(key, json); return json })
          .catch((error) => {
            // A 404 is cached too, so requests for made-up ids don't reach the store API every time.
            if (error?.status === 404) { cache.set(key, null); return null }
            throw error
          })
          .finally(() => cache.pending.delete(key))
        cache.pending.set(key, pending)
      }
      return pending
    },
  }
}

// Same mapping as basePath() in server/proxy.js, kept local so this module does not depend on the proxy.
function basePathOf(env) {
  const trimmed = (env.BASE_PATH || '/').replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}/` : '/'
}

function parseRoute(pathname, base) {
  // Drop BASE_PATH but keep its leading slash, so /maui/shop becomes /shop.
  const relative = pathname.startsWith(base) ? pathname.slice(base.length - 1) : pathname
  const segments = relative.split('/').filter(Boolean).map(safeDecode)
  const [first, second, third] = segments
  if (segments.length === 0) return { kind: 'home' }
  if (segments.length === 1 && LISTINGS.has(first)) return { kind: first }
  if (first === 'orders' || (segments.length === 1 && PRIVATE.has(first))) return { kind: 'private', name: PRIVATE.get(first) || 'Orders' }
  if (segments.length === 2 && ENTITIES.has(first)) {
    const { slug, id } = splitSlugId(second)
    if (ID_PATTERN.test(id)) return { kind: ENTITIES.get(first), slug, id }
  }
  // Sweed's own menu links, e.g. /maui/recreational/menu/edibles-40493/<product-slug>-4461454.
  // Their numbers are not API ids, so these are matched by category name instead.
  if ((first === 'recreational' || first === 'medical') && second === 'menu' && segments.length >= 3 && segments.length <= 4) {
    return { kind: 'menu', segment: third }
  }
  return { kind: 'notfound' }
}

function safeDecode(text) {
  try { return decodeURIComponent(text) } catch { return text }
}

async function loadStore(ctx) {
  try {
    const res = await ctx.get(ctx.storePath)
    return res?.store ?? null
  } catch {
    return null
  }
}

async function buildPage(route, search, ctx, store) {
  const name = store?.name || null
  switch (route.kind) {
    case 'home':
      return { title: titleOf(name, 'Shop'), description: storeDescription(store), canonical: ctx.path() }
    case 'shop':
    case 'brands':
    case 'deals':
    case 'learn':
    case 'locations':
    case 'picker':
      return { title: titleOf(LISTINGS.get(route.kind), name), description: storeDescription(store), canonical: ctx.path(route.kind) }
    case 'private':
      // Account and checkout pages: keep out of search, no previews or canonical.
      return { noindex: true, title: titleOf(route.name, name) }
    case 'category': {
      const category = await findCategory(route.id, ctx)
      if (!category) return notFound(name)
      const canonical = ctx.path('c', joinSlugId(category.name, category.id))
      if (route.slug !== slugify(category.name)) return { redirect: canonical + search }
      return { title: titleOf(category.name, name), description: shopLine(category.name, name), canonical }
    }
    case 'brand': {
      const res = await ctx.get(`${ctx.storePath}/brands/${encodeURIComponent(route.id)}`, ctx.scope)
      if (!res?.brand) return notFound(name)
      const canonical = ctx.path('b', joinSlugId(res.brand.name, res.brand.id))
      if (route.slug !== slugify(res.brand.name)) return { redirect: canonical + search }
      return { title: titleOf(res.brand.name, name), description: shopLine(res.brand.name, name), canonical }
    }
    case 'product': {
      const res = await ctx.get(`${ctx.storePath}/products/${encodeURIComponent(route.id)}`, ctx.scope)
      if (!res?.product) return notFound(name)
      return productPage(res.product, route, search, store, ctx)
    }
    case 'menu': {
      const list = await ctx.get(`${ctx.storePath}/categories`, ctx.scope)
      const slug = route.segment.match(/^(.+)-\d+$/)?.[1]
      const top = (list?.items || []).find((category) => slugify(category.name) === slug)
      return { redirect: (top ? ctx.path('c', joinSlugId(top.name, top.id)) : ctx.path('shop')) + search }
    }
    default:
      return notFound(name)
  }
}

// The category detail endpoint only knows top-level categories, so subcategories are found in the tree.
async function findCategory(id, ctx) {
  const direct = await ctx.get(`${ctx.storePath}/categories/${encodeURIComponent(id)}`, ctx.scope)
  if (direct?.category) return direct.category
  const list = await ctx.get(`${ctx.storePath}/categories`, ctx.scope)
  return findInTree(list?.items || [], id)
}

function findInTree(categories, id) {
  for (const category of categories) {
    if (category.id === id) return category
    const found = findInTree(category.children || [], id)
    if (found) return found
  }
  return null
}

function productPage(product, route, search, store, ctx) {
  const canonicalPath = ctx.path('p', joinSlugId(product.name, product.id))
  if (route.slug !== slugify(product.name)) return { redirect: canonicalPath + search }

  const storeName = store?.name || null
  const brand = product.attributes?.brand?.name || null
  const category = product.attributes?.category?.name || null
  const variants = product.variants || []
  // ?variant= is the only query parameter that changes what the page is about, so it is the only one kept.
  const selected = variants.find((variant) => variant.id === new URLSearchParams(search).get('variant'))
  const canonical = selected ? `${canonicalPath}?variant=${encodeURIComponent(selected.id)}` : canonicalPath
  const image = absoluteUrl(product.images?.[0]?.source, ctx)
    || absoluteUrl(variants.flatMap((variant) => variant.images || [])[0]?.source, ctx)
    || absoluteUrl(store?.settings?.images?.logo, ctx)
  const fallback = `${product.name}${brand ? ` by ${brand}` : ''}${category ? ` (${category})` : ''}. Order online${storeName ? ` from ${storeName}` : ''} for pickup or delivery.`
  const description = truncate(product.description) || truncate(fallback)

  const prices = variants.map(priceOf).filter(Number.isFinite)
  const inStock = variants.some((variant) => Number(variant.stock?.quantity) > 0)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description,
    ...(image && { image }),
    ...(brand && { brand: { '@type': 'Brand', name: brand } }),
    ...(variants[0] && { sku: variants[0].id }),
    ...(prices.length && {
      offers: {
        '@type': 'AggregateOffer',
        lowPrice: Math.min(...prices).toFixed(2),
        highPrice: Math.max(...prices).toFixed(2),
        priceCurrency: 'USD',
        availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: ctx.publicOrigin + canonical,
      },
    }),
  }
  return { title: titleOf(product.name, brand, storeName), description, canonical, image, type: 'product', jsonLd }
}

// Discounted price when there is one, otherwise base. Prices arrive as strings or numbers, or null.
function priceOf(variant) {
  const raw = variant.prices?.discounted ?? variant.prices?.base
  return raw == null || raw === '' ? NaN : Number(raw)
}

function absoluteUrl(src, ctx) {
  if (!src) return null
  try {
    const url = new URL(src, `${ctx.publicOrigin}/`)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

function notFound(name) {
  return { status: 404, noindex: true, title: titleOf('Page not found', name) }
}

function storeDescription(store) {
  return truncate(store?.description) || orderLine(store?.name)
}

function orderLine(storeName) {
  return storeName ? `Order cannabis online from ${storeName} for pickup or delivery.` : DEFAULT_DESCRIPTION
}

function shopLine(label, storeName) {
  return `Order ${label} products online${storeName ? ` from ${storeName}` : ''} for pickup or delivery.`
}

function titleOf(...parts) {
  return parts.filter(Boolean).join(' · ')
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char])
}

function renderHead(page, ctx) {
  const tags = [`<title>${esc(page.title)}</title>`]
  if (page.noindex) {
    tags.push('<meta name="robots" content="noindex">')
    return tags.join('\n    ')
  }
  const url = page.canonical ? ctx.publicOrigin + page.canonical : null
  tags.push(`<meta name="description" content="${esc(page.description)}">`)
  if (url) tags.push(`<link rel="canonical" href="${esc(url)}">`)
  tags.push(
    `<meta property="og:type" content="${page.type || 'website'}">`,
    `<meta property="og:title" content="${esc(page.title)}">`,
    `<meta property="og:description" content="${esc(page.description)}">`,
    `<meta property="og:site_name" content="${esc(page.siteName || 'Shop')}">`,
  )
  if (url) tags.push(`<meta property="og:url" content="${esc(url)}">`)
  if (page.image) tags.push(`<meta property="og:image" content="${esc(page.image)}">`)
  tags.push(`<meta name="twitter:card" content="${page.image ? 'summary_large_image' : 'summary'}">`)
  // Escaping "<" keeps a product name like "</script>" from closing the JSON-LD block early.
  if (page.jsonLd) tags.push(`<script type="application/ld+json">${JSON.stringify(page.jsonLd).replace(/</g, '\\u003c')}</script>`)
  return tags.join('\n    ')
}
