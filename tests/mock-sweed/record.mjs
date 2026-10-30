// Records a snapshot of the live Sweed store into tests/fixtures/ for the mock (tests/mock-sweed/server.js).
//
// Read-only: every request is a GET, so no cart, order, user or payment call can reach the store from here.
// Usage (from the repo root, with the real .env in place):
//   NODE_USE_ENV_PROXY=1 node tests/mock-sweed/record.mjs
// The API key is read from .env and sent only in the x-api-key header. It is never printed or written to disk.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const outDir = join(root, 'tests', 'fixtures')
const SALE_TYPE = 'recreational'
const PRODUCT_TARGET = 60
const PAGE_SIZE = 24
const PER_CATEGORY = 12
const BRAND_LIMIT = 24
const PACE_MS = 400

try {
  process.loadEnvFile(join(root, '.env'))
} catch {
  console.error('No .env file at the repo root. Copy .env.example and fill in the store values first.')
  process.exit(1)
}
const { API_BASE_URL, STORE_ID, ECOM_API_KEY, API_ORIGIN } = process.env
if (!API_BASE_URL || !STORE_ID || !ECOM_API_KEY) {
  console.error('.env must set API_BASE_URL, STORE_ID and ECOM_API_KEY.')
  process.exit(1)
}

const base = new URL(API_BASE_URL)
const storeRoot = `${base.pathname.replace(/\/$/, '')}/ecom/v2/stores/${encodeURIComponent(STORE_ID)}`
const headers = { 'x-api-key': ECOM_API_KEY, accept: 'application/json' }
if (API_ORIGIN) headers.origin = API_ORIGIN
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
let requests = 0

// GET only. Retries 429 and 5xx a few times with the store's Retry-After (or a growing pause); other failures stop the run.
async function get(path, query = {}) {
  const url = new URL(`${storeRoot}${path}`, base.origin)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value))
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await sleep(PACE_MS)
    requests += 1
    let response
    try {
      response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) })
    } catch (error) {
      if (attempt === 5) throw new Error(`GET ${path} failed: ${error.name}`)
      await sleep(1000 * attempt)
      continue
    }
    if (response.ok) return response.json()
    if ((response.status === 429 || response.status >= 500) && attempt < 5) {
      const retryAfter = Number(response.headers.get('retry-after')) || 0
      await sleep(Math.max(retryAfter * 1000, 1000 * attempt * 2))
      continue
    }
    throw new Error(`GET ${path} answered ${response.status}`)
  }
  throw new Error(`GET ${path} gave up`)
}

// Merges relation lists by id, keeping the first copy seen.
function mergeRelations(into, from = {}) {
  for (const [key, list] of Object.entries(from)) {
    if (!Array.isArray(list)) continue
    const seen = new Set((into[key] || []).map((item) => String(item.id)))
    into[key] = into[key] || []
    for (const item of list) {
      if (!seen.has(String(item.id))) { seen.add(String(item.id)); into[key].push(item) }
    }
  }
  return into
}

const scope = { 'Scope.SaleType': SALE_TYPE }
const list = (query) => get('/products', { ...scope, 'Pagination.PageSize': PAGE_SIZE, ...query })

async function main() {
  console.log('Recording the store snapshot (GET requests only)…')
  const store = await get('')
  const categories = await get('/categories', scope)
  const brands = await get('/brands', { ...scope, 'Pagination.Page': 1, 'Pagination.PageSize': 100 })
  const promotions = await get('/promotions', { ...scope, 'Pagination.Page': 1, 'Pagination.PageSize': 50 })
  const carousels = await get('/carousels', { ...scope, 'Pagination.Page': 1, 'Pagination.PageSize': 50 })

  // The default catalog view supplies the facets and sort options; category pages widen the product pool so the
  // fixtures cover several categories, not only the first few products of the default sort.
  const defaultView = await list({ 'Pagination.Page': 1, SortingOption: 'popularityDesc' })
  const relations = mergeRelations({}, defaultView.relations)
  const products = new Map()
  const addItems = (items = []) => { for (const item of items) if (!products.has(item.id)) products.set(item.id, item) }
  addItems(defaultView.items)

  const topCategories = (categories.items || []).filter((category) => category.id)
  for (const category of topCategories) {
    if (products.size >= PRODUCT_TARGET + 20) break
    const page = await list({ 'Pagination.Page': 1, 'Pagination.PageSize': PER_CATEGORY, SortingOption: 'popularityDesc', 'filters.category': category.id })
    mergeRelations(relations, page.relations)
    addItems(page.items)
  }
  const chosen = [...products.values()].slice(0, PRODUCT_TARGET)
  console.log(`  ${chosen.length} products from ${topCategories.length} categories`)

  const details = {}
  for (const item of chosen) {
    const detail = await get(`/products/${encodeURIComponent(item.id)}`, scope)
    mergeRelations(relations, detail.relations)
    details[item.id] = { product: detail.product, relations: detail.relations }
  }

  const brandDetails = {}
  for (const brand of (brands.items || []).slice(0, BRAND_LIMIT)) {
    brandDetails[brand.id] = await get(`/brands/${encodeURIComponent(brand.id)}`, scope)
  }
  const carouselDetails = {}
  for (const carousel of carousels.items || []) {
    carouselDetails[carousel.id] = await get(`/carousels/${encodeURIComponent(carousel.id)}`, scope)
  }
  const categoryDetails = {}
  for (const category of topCategories.slice(0, 12)) {
    categoryDetails[category.id] = await get(`/categories/${encodeURIComponent(category.id)}`, scope)
  }

  // Delivery and store lookups are GETs too. Two recorded delivery answers: at the store, and in Honolulu.
  // The live store has no delivery zones, so both answer "notAllowed / outOfZone" as recorded. The in-zone answer
  // therefore cannot be recorded; `synthetic` is written by hand and marked as such (the mock answers with it).
  const at = store.store.location.coordinates
  const honolulu = { latitude: 21.3069, longitude: -157.8583 }
  const delivery = {
    atStore: {
      query: { latitude: at.latitude, longitude: at.longitude },
      response: await get('/delivery', {
        'Location.Address': '1 Kamehameha Hwy, Kahuku, HI 96731',
        'Location.Coordinates.Latitude': at.latitude,
        'Location.Coordinates.Longitude': at.longitude,
      }),
    },
    honolulu: {
      query: honolulu,
      response: await get('/delivery', {
        'Location.Address': 'Honolulu Hale, Honolulu, HI 96813',
        'Location.Coordinates.Latitude': honolulu.latitude,
        'Location.Coordinates.Longitude': honolulu.longitude,
      }),
    },
    synthetic: {
      note: 'Hand-written, not recorded: the live store has no zones. The mock answers "available" with these terms inside the circle.',
      zone: { center: { latitude: 21.5767, longitude: -158.129 }, radiusKm: 8 },
      response: {
        delivery: {
          availability: 'available',
          reason: null,
          terms: {
            policy: { fee: '5', amountForMinOrder: '25', amountForFreeDelivery: '100' },
            schedule: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((dayOfWeek) => ({
              dayOfWeek,
              interval: { from: '10:00', to: '20:00' },
            })),
          },
        },
      },
    },
  }
  const storesByLocation = await get('/stores-by-location', {
    'Location.Address': '1 Kamehameha Hwy, Kahuku, HI 96731',
    'Location.Coordinates.Latitude': at.latitude,
    'Location.Coordinates.Longitude': at.longitude,
  })

  const files = {
    // The contact email is a person's address, so the snapshot keeps a placeholder instead.
    'store.json': { store: { ...store.store, contacts: { ...store.store.contacts, email: 'store@example.com' } } },
    'categories.json': { categories: categories.items, details: categoryDetails },
    'products.json': {
      items: chosen.map((item) => ({ ...item })),
      relations,
      filters: defaultView.filters,
      sortingOptions: defaultView.sortingOptions,
    },
    'product-details.json': details,
    'brands.json': { items: brands.items, details: brandDetails },
    'promotions.json': { items: promotions.items, totalItems: promotions.totalItems },
    'carousels.json': { items: carousels.items, details: carouselDetails },
    'delivery.json': delivery,
    'stores-by-location.json': storesByLocation,
  }

  await mkdir(outDir, { recursive: true })
  for (const name of await readdir(outDir)) if (name.endsWith('.json')) await rm(join(outDir, name))
  let bytes = 0
  for (const [name, body] of Object.entries(files)) {
    const text = `${JSON.stringify(body, null, 2)}\n`
    bytes += Buffer.byteLength(text)
    await writeFile(join(outDir, name), text)
  }
  console.log(`Wrote ${Object.keys(files).length} fixture files to tests/fixtures (${(bytes / 1024).toFixed(0)} KB, ${requests} GET requests).`)
}

main().catch((error) => {
  console.error(`Recording failed: ${error.message}`)
  process.exit(1)
})
