// The products endpoint returns one entry per offer, so a product with several sizes can arrive as repeated entries
// with the same id. Merging by id (keeping every distinct variant) gives one card per product.
export function mergeEntries(entries) {
  const byId = new Map()
  for (const entry of entries || []) {
    if (!entry?.id) continue
    const current = byId.get(entry.id)
    if (!current) { byId.set(entry.id, { ...entry, variants: [...(entry.variants || [])] }); continue }
    const seen = new Set(current.variants.map((variant) => variant.id))
    for (const variant of entry.variants || []) {
      if (!seen.has(variant.id)) { seen.add(variant.id); current.variants.push(variant) }
    }
  }
  return [...byId.values()]
}
