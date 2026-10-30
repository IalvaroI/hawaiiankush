import { useEffect, useMemo, useReducer } from 'react'
import { DEMO_MODE, SALE_TYPE } from '../../config.js'

// Effects, tags and lab figures are not in the catalog list, so the server looks them up per product (see
// server/enrich.js).
// Results live in a module-level cache, shared by every page, and are refreshed after 60 seconds.
const CHUNK_SIZE = 24
const DEBOUNCE_MS = 50
const FRESH_MS = 60 * 1000
const CHECK_MS = 10 * 1000
const CATALOG_ID = /^[A-Za-z0-9]+$/
// Checked in this order: a product with a "Staff Pick" tag shows that badge even when it also has a "New" tag.
const BADGE_RULES = [[/staff\s*pick/i, 'Staff Pick'], [/^new\b/i, 'New'], [/popular|best\s*seller/i, 'Popular']]

const cache = new Map() // product id -> { at, extras } where extras is null when the server had nothing for it
const queued = new Set()
const pending = new Set() // queued or in flight
const listeners = new Set()
let timer = null

// Returns { [productId]: { effects, badge, compounds } } for the products that have loaded. `compounds` maps a variant id
// to its lab figures. `effects` is undefined while loading.
export function useProductExtras(products) {
  const [, rerender] = useReducer((count) => count + 1, 0)
  const idList = (products || []).map((product) => String(product?.id ?? '')).filter((id) => CATALOG_ID.test(id)).join(',')
  const ids = useMemo(() => (idList ? idList.split(',') : []), [idList])

  useEffect(() => {
    listeners.add(rerender)
    return () => listeners.delete(rerender)
  }, [])

  // Fetch now, then re-check every few seconds so entries older than the freshness window are refreshed while the page stays open.
  useEffect(() => {
    if (DEMO_MODE) return undefined
    const refresh = () => {
      const stale = ids.filter(isStale)
      if (stale.length) enqueue(stale)
    }
    refresh()
    const interval = setInterval(refresh, CHECK_MS)
    return () => clearInterval(interval)
  }, [ids])

  if (DEMO_MODE) return {}
  const extras = {}
  for (const id of ids) {
    const entry = cache.get(id)
    if (entry?.extras) extras[id] = entry.extras
  }
  return extras
}

function isStale(id) {
  if (pending.has(id)) return false
  const entry = cache.get(id)
  return !entry || Date.now() - entry.at >= FRESH_MS
}

function enqueue(ids) {
  for (const id of ids) {
    queued.add(id)
    pending.add(id)
  }
  clearTimeout(timer)
  timer = setTimeout(flush, DEBOUNCE_MS)
}

// Sends the queued ids in chunks, so one page of cards is one request.
function flush() {
  timer = null
  const batch = [...queued]
  queued.clear()
  for (let start = 0; start < batch.length; start += CHUNK_SIZE) {
    loadChunk(batch.slice(start, start + CHUNK_SIZE))
  }
}

async function loadChunk(ids) {
  let items = {}
  try {
    // SALE_TYPE is fixed for the page's lifetime (switching reloads), so this module's cache never mixes catalogs.
    const response = await fetch(`${import.meta.env.BASE_URL}api/enrich?ids=${ids.join(',')}&saleType=${SALE_TYPE}`, { headers: { accept: 'application/json' } })
    if (response.ok) {
      const body = await response.json()
      if (body?.items && typeof body.items === 'object') items = body.items
    }
  } catch {
    // Offline or the server is down: the cards stay as they are, and these ids are retried after the freshness window.
  }
  const at = Date.now()
  for (const id of ids) {
    const item = Object.prototype.hasOwnProperty.call(items, id) ? items[id] : null
    cache.set(id, { at, extras: item ? toExtras(item) : null })
    pending.delete(id)
  }
  for (const notify of listeners) notify()
}

function toExtras(item) {
  const effects = [...new Set((Array.isArray(item.effects) ? item.effects : []).filter((name) => typeof name === 'string' && name))]
  const tags = (Array.isArray(item.tags) ? item.tags : []).filter((name) => typeof name === 'string')
  const compounds = item.compounds && typeof item.compounds === 'object' && !Array.isArray(item.compounds) ? item.compounds : {}
  const deals = item.deals && typeof item.deals === 'object' && !Array.isArray(item.deals) ? item.deals : {}
  return { effects, badge: badgeOf(tags), compounds, deals }
}

function badgeOf(tagNames) {
  for (const [pattern, label] of BADGE_RULES) {
    if (tagNames.some((name) => pattern.test(name))) return label
  }
  return null
}
