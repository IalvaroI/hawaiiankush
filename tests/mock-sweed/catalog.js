// Catalog answers for the Sweed mock, built from the recorded fixtures in tests/fixtures/.
//
// Matching is deliberately basic:
// - Products: `Search` is a case-insensitive substring of the name. Facets the mock can read (category, brand, strain,
//   strainPrevalence, qualityLine, effect, scent, flavoring, userTag, promotion, quickFilter) match on the ids in the
//   recorded product. Price ranges match the first variant's price. Other facets (THC, CBD, subcategory, ...) are ignored.
// - Sort: priceAsc and priceDesc, alphabetical, and the recorded order (popularity) for everything else.
// - Carousels: Sweed's carousel rules are not in the API, so a carousel holds the products in the category of the same
//   name (case-insensitive). A carousel with no such products is empty, which the storefront hides.
// - Delivery: inside the synthetic zone (fixtures/delivery.json) the answer is "available"; elsewhere it is the
//   recorded "outOfZone" answer.
import { fail, intParam } from './http.js'

const DEFAULT_PAGE_SIZE = 24
const MAX_PAGE_SIZE = 100
const ids = (list) => (Array.isArray(list) ? list.map((item) => item?.id).filter(Boolean) : [])

// Each facet key maps to the ids a product carries for it.
const FACET_VALUES = {
  category: (p) => [p.list.attributeIds?.categoryId],
  brand: (p) => [p.list.attributeIds?.brandId],
  strain: (p) => [p.list.attributeIds?.strainId],
  qualityLine: (p) => [p.list.attributeIds?.qualityLineId],
  strainPrevalence: (p) => [p.detail.attributes?.strain?.prevalence?.id],
  effect: (p) => ids(p.detail.attributes?.effects),
  scent: (p) => ids(p.detail.attributes?.scents),
  flavoring: (p) => ids(p.detail.attributes?.flavorings),
  userTag: (p) => ids(p.detail.attributes?.tags),
  promotion: (p) => p.promotionIds,
  quickFilter: (p, facet) => (p.promotionIds.length ? facet.options.map((option) => option.value) : []),
}

const haversineKm = (a, b) => {
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export function createCatalog(fixtures) {
  const { store } = fixtures.store
  const categoryList = fixtures.categories.categories
  const categoryDetails = fixtures.categories.details
  const brandList = fixtures.brands.items
  const brandDetails = fixtures.brands.details
  const promotionList = fixtures.promotions.items
  const carouselList = fixtures.carousels.items
  const carouselDetails = fixtures.carousels.details
  const facets = fixtures.products.filters

  const entries = fixtures.products.items.map((list, order) => {
    const detail = fixtures.productDetails[list.id]?.product || { attributes: {}, variants: [] }
    const promotionIds = [...new Set(detail.variants.flatMap((variant) => variant.promotionIds || []))]
    const first = list.variants[0]
    const price = Number(first?.prices?.discounted ?? first?.prices?.base ?? 0)
    const categoryName = detail.attributes?.category?.name || categoryList.find((c) => c.id === list.attributeIds?.categoryId)?.name || ''
    return { id: list.id, name: list.name, order, list, detail, promotionIds, price, categoryName }
  })
  const entryById = new Map(entries.map((entry) => [entry.id, entry]))

  // purchaseKey -> { entry, variant } for every variant the storefront can put in a bag.
  const variantByKey = new Map()
  for (const entry of entries) {
    for (const variant of entry.list.variants) variantByKey.set(variant.purchaseKey, { entry, variant })
  }

  function carouselMembers(carouselId) {
    const carousel = carouselList.find((item) => item.id === carouselId)
    if (!carousel) return new Set()
    const wanted = carousel.name.trim().toLowerCase()
    return new Set(entries.filter((entry) => entry.categoryName.trim().toLowerCase() === wanted).map((entry) => entry.id))
  }

  function matchesFacet(entry, key, values) {
    if (key === 'carousel') return values.some((id) => carouselMembers(id).has(entry.id))
    if (key === 'price') {
      const [min, max] = values.map(Number)
      return entry.price >= min && entry.price <= max
    }
    const extract = FACET_VALUES[key]
    if (!extract) return true
    const facet = facets.find((item) => item.key === key) || { options: [] }
    const have = extract(entry, facet)
    return values.some((value) => have.includes(value))
  }

  function productView(entry) {
    return structuredClone(entry.list)
  }

  // Shared by the catalog and the carousel rails: filters.<key>=a,b (OR within a key, AND across keys).
  function filterEntries(query) {
    const filters = []
    for (const [name, raw] of query) {
      if (!name.startsWith('filters.') || !raw) continue
      filters.push([name.slice('filters.'.length), raw.split(',').filter(Boolean)])
    }
    return entries.filter((entry) => filters.every(([key, values]) => !values.length || matchesFacet(entry, key, values)))
  }

  const relations = fixtures.products.relations

  return {
    store,
    variantFor(purchaseKey) {
      return variantByKey.get(purchaseKey) || null
    },
    entryFor(productId) {
      return entryById.get(productId) || null
    },
    categories() {
      return { items: categoryList }
    },
    category(id) {
      if (categoryDetails[id]) return categoryDetails[id]
      throw fail(404, 'Category not found.')
    },
    brands(query) {
      const page = intParam(query, 'Pagination.Page', 1)
      const size = intParam(query, 'Pagination.PageSize', DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
      return { totalItems: brandList.length, items: brandList.slice((page - 1) * size, page * size) }
    },
    brand(id) {
      if (brandDetails[id]) return brandDetails[id]
      throw fail(404, 'Brand not found.')
    },
    promotions() {
      return { totalItems: promotionList.length, items: promotionList }
    },
    promotion(id) {
      const promotion = promotionList.find((item) => item.id === id)
      if (!promotion) throw fail(404, 'Promotion not found.')
      return { promotion }
    },
    // Like the live API: the list needs Scope and Pagination, the detail needs Scope (400 otherwise).
    carousels(query) {
      if (!query.get('Scope.SaleType') || !query.get('Pagination.Page') || !query.get('Pagination.PageSize')) throw fail(400, 'The Scope field is required. The Pagination field is required.')
      return {
        totalItems: carouselList.length,
        items: carouselList.map((item) => ({ ...item, totalItems: carouselMembers(item.id).size })),
      }
    },
    carousel(id, query) {
      if (!query.get('Scope.SaleType')) throw fail(400, 'The Scope field is required.')
      const carousel = carouselDetails[id]?.carousel
      if (!carousel) throw fail(404, 'Carousel not found.')
      return { carousel: { ...carousel, totalItems: carouselMembers(id).size } }
    },
    product(id) {
      const entry = entryById.get(id)
      if (!entry) throw fail(404, 'Product not found.')
      return { product: structuredClone(entry.detail), relations: structuredClone(fixtures.productDetails[id].relations || {}) }
    },
    products(query) {
      const search = (query.get('Search') || '').trim().toLowerCase()
      let matched = filterEntries(query)
      if (search) matched = matched.filter((entry) => entry.name.toLowerCase().includes(search))
      const sort = query.get('SortingOption') || ''
      const byPrice = (direction) => (a, b) => direction * (a.price - b.price) || a.order - b.order
      if (sort === 'priceAsc') matched = [...matched].sort(byPrice(1))
      else if (sort === 'priceDesc') matched = [...matched].sort(byPrice(-1))
      else if (sort === 'alphabeticalAsc') matched = [...matched].sort((a, b) => a.name.localeCompare(b.name))
      else if (sort === 'alphabeticalDesc') matched = [...matched].sort((a, b) => b.name.localeCompare(a.name))
      const page = intParam(query, 'Pagination.Page', 1)
      const size = intParam(query, 'Pagination.PageSize', DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
      return {
        relations: structuredClone(relations),
        filters: structuredClone(facets),
        sortingOptions: structuredClone(fixtures.products.sortingOptions),
        totalItems: matched.length,
        items: matched.slice((page - 1) * size, page * size).map(productView),
      }
    },
    // AI-Picker results, as the live demo store answers them today: only the category answer narrows the list, the
    // order is the catalog's, and the score falls by one point per place from 96.
    aiPickerProducts(query) {
      const categories = (query.get('filters.category') || '').split(',').filter(Boolean)
      if (!categories.length) throw fail(500, 'An unexpected error occurred.')
      const matched = filterEntries(new URLSearchParams({ 'filters.category': categories.join(',') })).slice(0, 8)
      return {
        relations: structuredClone(relations),
        items: matched.map((entry, index) => ({
          product: productView(entry),
          match: { percent: 96 - index, appliedFilters: [{ key: 'category', values: categories }] },
        })),
      }
    },
    stores() {
      return fixtures.storesByLocation
    },
    delivery(query) {
      const address = (query.get('Location.Address') || '').trim()
      const latitude = Number(query.get('Location.Coordinates.Latitude'))
      const longitude = Number(query.get('Location.Coordinates.Longitude'))
      if (!address) throw fail(400, 'Address is required.')
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw fail(400, 'Coordinates are required.')
      const { zone, response } = fixtures.delivery.synthetic
      if (haversineKm(zone.center, { latitude, longitude }) <= zone.radiusKm) return structuredClone(response)
      return structuredClone(fixtures.delivery.honolulu.response)
    },
    // The synthetic zone's centre, so tests can place a shopper inside it.
    deliveryZone() {
      return fixtures.delivery.synthetic.zone
    },
    // Kilometres between two points, for the checkout's own delivery-zone check.
    haversineKm,
  }
}
