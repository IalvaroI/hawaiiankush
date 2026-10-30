import { useEffect, useState } from 'react'
import { api } from '../../api/client.js'
import { SALE_TYPE } from '../../config.js'
import { apiFilters } from '../product/productModel.js'

// Facts about the store's catalog, loaded once per page load and shared by every page:
// - names: full promotion names by id. A product detail's relations cut names short ("10% Off Everythi"); the list
//   does not.
// - storeWide: the promotions that cover (nearly) the whole menu, such as "10% Off Everything". The API has no flag for
//   this, so a promotion counts as store-wide when its products are at least STORE_WIDE_SHARE of the catalog. Cards
//   leave these out (one banner says it instead), so a card's deal line and red price mean a deal on that product.
// - ranges: whether the store can sort and filter by THC % and CBD %. Sweed does both from product-level percentages a
//   store may never fill in (the lab figures on each size are separate): then every cannabis product counts as 0%,
//   "THC: high to low" comes back in popularity order and a range finds nothing. A 1–100% range that finds nothing
//   while the menu has products means the field is empty, and the menu hides that sort and filter. Until the answer
//   is in, or when the check fails, they show.
// - quietIds: the promotions cards and the product page treat as store-wide (no deal line, no red): the store-wide ones,
//   and any whose own count failed, so a store-wide deal is never shown in red; only the store-wide ones are named in
//   the banner.
// - ready: whether the promotions list and the menu's size are known, without which quietIds can't be told (it is not
//   "none"). Until then promoted prices stay plain.
// A load that leaves anything unknown keeps what it learned and asks again after a pause that doubles each time.
const STORE_WIDE_SHARE = 0.9
const FIRST_RETRY_MS = 5000
const LAST_RETRY_MS = 5 * 60 * 1000
const EMPTY = { names: {}, storeWide: [], quietIds: [], ranges: { thc: true, cbd: true }, ready: false, complete: false }

let facts = null
let pending = null
let retries = 0
let retryAt = 0
const listeners = new Set()

const scope = `Scope.SaleType=${encodeURIComponent(SALE_TYPE)}`
const countOf = (filters = '') => api(`/products?${scope}&Pagination.Page=1&Pagination.PageSize=1${filters ? `&${filters}` : ''}`)
  .then((result) => Number(result?.totalItems || 0))

async function fetchFacts() {
  let ready = true
  const unknown = (fallback) => () => { ready = false; return fallback }
  const [promotions, total] = await Promise.all([
    api(`/promotions?${scope}&Pagination.Page=1&Pagination.PageSize=50`)
      .then((result) => (result?.items || []).filter((item) => item?.id && item?.name))
      .catch(unknown([])),
    countOf().catch(unknown(0)),
  ])
  const names = Object.fromEntries(promotions.map((item) => [String(item.id), String(item.name).trim()]))
  const candidates = promotions.map((item) => ({ item, filters: apiFilters(item.filters) })).filter((entry) => entry.filters)
  // A failed range check leaves its fact at the safe default: the sort and filter shown.
  const [counts, withThc, withCbd] = await Promise.all([
    Promise.all(candidates.map((entry) => countOf(entry.filters).catch(() => null))),
    countOf('filters.thcRange=1,100').catch(() => null),
    countOf('filters.cbdRange=1,100').catch(() => null),
  ])
  const judged = total > 0 ? candidates.map((entry, index) => ({ ...entry, count: counts[index] })) : []
  const storeWide = judged.filter((entry) => entry.count != null && entry.count >= total * STORE_WIDE_SHARE)
    .map(({ item }) => ({ id: String(item.id), name: names[item.id], schedule: item.schedule || '' }))
  const unsure = judged.filter((entry) => entry.count == null).map(({ item }) => String(item.id))
  return {
    names,
    storeWide,
    quietIds: [...storeWide.map((item) => item.id), ...unsure],
    ranges: { thc: !(total > 0 && withThc === 0), cbd: !(total > 0 && withCbd === 0) },
    ready,
    complete: ready && !unsure.length,
  }
}

function load() {
  if (facts?.complete || pending || Date.now() < retryAt) return
  pending = fetchFacts()
    // A retry that learns less than the last load (its promotions request failed this time) keeps the last load.
    .then((value) => { facts = !value.ready && facts?.ready ? facts : value })
    .catch(() => { facts = facts || EMPTY })
    .finally(() => {
      pending = null
      if (!facts.complete) {
        const wait = Math.min(LAST_RETRY_MS, FIRST_RETRY_MS * 2 ** retries)
        retries += 1
        retryAt = Date.now() + wait
        window.setTimeout(load, wait)
      }
      for (const notify of listeners) notify()
    })
}

export function useCatalogFacts() {
  const [, setVersion] = useState(0)
  useEffect(() => {
    const notify = () => setVersion((count) => count + 1)
    listeners.add(notify)
    load()
    return () => listeners.delete(notify)
  }, [])
  return facts || EMPTY
}
