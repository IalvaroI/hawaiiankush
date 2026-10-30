// Effects, tags, flavours, lab figures (cannabinoids and terpenes per variant) and deals per variant for a page of product ids. The catalog list
// has none of them, so the storefront asks for them after the cards render. The data is public catalog data shared by every shopper, so the cache holds no user state.

// `fetchProduct(id, scope)` resolves to the product detail body, or null for a 404. Any other failure throws.
// `scope` is the sale type; answers are cached per scope and id, since medical and recreational catalogs differ.
// An answer with no lab figures for any variant is kept only `blankTtlMs`: the API now and then sends a product without
// its figures, and a card would otherwise say "Lab figures not listed" for the full five minutes.
// `maxWaiting` caps the lookups queued behind the `concurrency` running ones; past it a lookup fails at once rather
// than holding every shopper's cards behind a flood of unknown ids.
export function createEnricher({ fetchProduct, ttlMs = 5 * 60 * 1000, blankTtlMs = 30 * 1000, max = 2000, concurrency = 4, maxWaiting = 200, now = Date.now }) {
  const cache = createTtlMap({ ttlMs, max, now })
  const inFlight = new Map()
  const limit = createLimiter(concurrency, maxWaiting)

  // Resolves to { effects, tags, flavorings, compounds, deals }, or null when the product does not exist. Throws on other failures, which are not cached.
  async function lookup(id, scope) {
    const key = `${scope}:${id}`
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    let pending = inFlight.get(key)
    if (!pending) {
      pending = (async () => {
        try {
          const value = await limit(() => fetchExtras(id, scope))
          cache.set(key, value, value && !Object.keys(value.compounds).length ? Math.min(blankTtlMs, ttlMs) : ttlMs)
          return value
        } finally {
          inFlight.delete(key)
        }
      })()
      inFlight.set(key, pending)
    }
    return pending
  }

  async function fetchExtras(id, scope) {
    const body = await fetchProduct(id, scope)
    if (body === null) return null
    const product = body?.product
    if (!product || typeof product !== 'object') throw new Error('Malformed product response')
    return {
      effects: namesOf(product.attributes?.effects),
      tags: namesOf(product.attributes?.tags),
      flavorings: namesOf(product.attributes?.flavorings),
      compounds: compoundsOf(product.variants),
      deals: dealsOf(product.variants, body?.relations?.promotions),
    }
  }

  // Resolves to { items: { [id]: { effects, tags, flavorings, compounds } }, complete }. Ids that are missing or failed
  // are left out, so one bad id never fails the page; `complete` is false when one failed (not when one is missing).
  return async function enrich(ids, scope = '') {
    let complete = true
    const settled = await Promise.all(ids.map(async (id) => {
      try { return [id, await lookup(id, scope)] } catch { complete = false; return [id, null] }
    }))
    const items = {}
    for (const [id, value] of settled) if (value) items[id] = value
    return { items, complete }
  }
}

// Lab figures per variant id, in the API's shape (Shared_Compounds), keeping only well-formed entries so the cache and
// the response stay small: { [variantId]: { thc: [...], cbd: [...], terpenes: [...] } }. Variants without figures
// are left out.
const COMPOUND_KEYS = ['thc', 'cbd', 'terpenes']
const COMPOUND_UNITS = new Set(['percent', 'milligram'])
const MAX_COMPOUNDS = 24

function compoundsOf(variants) {
  const byVariant = {}
  for (const variant of Array.isArray(variants) ? variants : []) {
    const id = String(variant?.id ?? '')
    if (!id) continue
    const clean = {}
    let count = 0
    for (const key of COMPOUND_KEYS) {
      clean[key] = (Array.isArray(variant?.compounds?.[key]) ? variant.compounds[key] : [])
        .map((entry) => ({
          label: String(entry?.label ?? '').trim().slice(0, 60),
          uom: entry?.uom,
          values: (Array.isArray(entry?.values) ? entry.values : []).map(Number).filter(Number.isFinite).slice(0, 2),
        }))
        .filter((entry) => entry.label && entry.values.length && COMPOUND_UNITS.has(entry.uom))
        .slice(0, MAX_COMPOUNDS)
      count += clean[key].length
    }
    if (count) byVariant[id] = clean
  }
  return byVariant
}

// The promotions each variant qualifies for, named from the detail's relations: { [variantId]: [{ id, name, schedule }] }.
// Only the list's sizes carry no promotion ids, so this is how a menu card learns its deals. Variants without any are
// left out.
const MAX_DEALS = 4
const cleanText = (value) => (typeof value === 'string' && value.trim().toLowerCase() !== 'null' ? value.trim().slice(0, 80) : '')

function dealsOf(variants, promotions) {
  const byId = new Map((Array.isArray(promotions) ? promotions : []).map((promotion) => [String(promotion?.id ?? ''), promotion]))
  const byVariant = {}
  for (const variant of Array.isArray(variants) ? variants : []) {
    const id = String(variant?.id ?? '')
    if (!id) continue
    const deals = [...new Set((Array.isArray(variant?.promotionIds) ? variant.promotionIds : []).map(String))]
      .map((promotionId) => byId.get(promotionId))
      .filter((promotion) => promotion && cleanText(promotion.name))
      .slice(0, MAX_DEALS)
      .map((promotion) => ({ id: String(promotion.id), name: cleanText(promotion.name), schedule: cleanText(promotion.schedule) }))
    if (deals.length) byVariant[id] = deals
  }
  return byVariant
}

// Unique, non-empty names in API order.
function namesOf(list) {
  const names = (Array.isArray(list) ? list : []).map((item) => String(item?.name ?? '').trim()).filter(Boolean)
  return [...new Set(names)]
}

// Small TTL map. Missing products are stored as null, so they are cached like any other answer.
function createTtlMap({ ttlMs, max, now }) {
  const entries = new Map()
  return {
    get(key) {
      const entry = entries.get(key)
      if (!entry) return undefined
      if (entry.expires <= now()) {
        entries.delete(key)
        return undefined
      }
      return entry.value
    },
    set(key, value, lifetime = ttlMs) {
      entries.delete(key)
      // Map keeps insertion order, so the first key is the oldest entry.
      if (entries.size >= max) entries.delete(entries.keys().next().value)
      entries.set(key, { value, expires: now() + lifetime })
    },
  }
}

// At most `concurrency` tasks run at once across all requests; the rest wait their turn in order, at most `maxWaiting`
// of them.
function createLimiter(concurrency, maxWaiting = Infinity) {
  const waiting = []
  let active = 0
  function next() {
    if (active >= concurrency || waiting.length === 0) return
    const { task, resolve, reject } = waiting.shift()
    active++
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => { active--; next() })
  }
  return (task) => new Promise((resolve, reject) => {
    if (waiting.length >= maxWaiting) { reject(new Error('Too many lookups waiting')); return }
    waiting.push({ task, resolve, reject })
    next()
  })
}
