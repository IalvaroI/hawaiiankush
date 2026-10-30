import { useEffect, useState } from 'react'
import { api } from '../../api/client.js'
import { SALE_TYPE } from '../../config.js'
import { ProductGrid, ProductGridSkeleton, relationMaps } from '../catalog/ProductGrid.jsx'
import { apiFilters, mergeRelations } from './productModel.js'

const WANTED = 8
const MIN_BEFORE_BRAND = 4
const PAGE = `Scope.SaleType=${encodeURIComponent(SALE_TYPE)}&Pagination.Page=1&Pagination.PageSize=9`

// "You may also like": the subcategory's products first, topped up from the brand when there are fewer than four.
export function RelatedProducts({ product, category, brand }) {
  const categoryQuery = apiFilters(category?.filters)
  const brandQuery = apiFilters(brand?.filters)
  const key = `${product.id}|${categoryQuery}|${brandQuery}`
  const [state, setState] = useState({ key: '', items: [], relations: {} })

  useEffect(() => {
    let active = true
    const seen = new Set([String(product.id)])
    const items = []
    let relations = { brands: [], strains: [] }

    async function collect(query) {
      const result = await api(`/products?${PAGE}&${query}`)
      for (const item of result?.items || []) {
        if (items.length >= WANTED || seen.has(String(item.id))) continue
        seen.add(String(item.id))
        items.push(item)
      }
      relations = mergeRelations(relations, result?.relations)
    }

    async function load() {
      if (categoryQuery) await collect(categoryQuery)
      if (items.length < MIN_BEFORE_BRAND && brandQuery) await collect(brandQuery)
      return { items, relations }
    }

    load()
      .catch(() => ({ items: [], relations: {} }))
      .then((found) => { if (active) setState({ key, ...found }) })
    return () => { active = false }
    // The key covers everything the request depends on.
  }, [key])

  // Nothing to show: no filters to ask with, or the store has no other products in the group.
  if (!categoryQuery && !brandQuery) return null
  const ready = state.key === key
  if (ready && !state.items.length) return null

  return (
    <section className="pd-related" aria-labelledby="pd-related-title">
      <h2 id="pd-related-title">You may also like</h2>
      {ready
        ? <ProductGrid products={state.items} {...relationMaps(state.relations)} />
        : <ProductGridSkeleton count={4} />}
    </section>
  )
}
