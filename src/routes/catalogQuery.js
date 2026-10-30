// Catalog state lives in the query string: q (search), sort (an API sorting value), and f.<facet> (comma-separated values).
// The category is part of the path (/c/{slug}-{id}), so it is not read from the query here.

// The API's own sorting values. Old names from earlier links map onto them, so bookmarks keep working.
export const DEFAULT_SORT = 'popularityDesc'
const SORT_ALIASES = { mostPopular: 'popularityDesc', priceAscending: 'priceAsc', priceDescending: 'priceDesc', newest: 'createdDesc', thcDescending: 'thcPercentDesc' }
// Sweed's names for the THC sorts look inverted, so these labels override them. Every other option shows Sweed's name.
const SORT_LABEL_OVERRIDES = { popularityDesc: 'Popular', thcPercentAsc: 'THC: low to high', thcPercentDesc: 'THC: high to low', thcMgAsc: 'THC mg: low to high', thcMgDesc: 'THC mg: high to low' }

export function normalizeSort(value) {
  const raw = value || ''
  return SORT_ALIASES[raw] || raw || DEFAULT_SORT
}

export function sortLabel(option) {
  return SORT_LABEL_OVERRIDES[option.value] || option.name
}

export function readCatalogQuery(params) {
  const selected = {}
  for (const [key, value] of params) if (key.startsWith('f.') && value) selected[key.slice(2)] = value.split(',')
  return { search: (params.get('q') || '').trim(), sort: normalizeSort(params.get('sort')), selected }
}

export function facetValues(params, key) {
  return (params.get(`f.${key}`) || '').split(',').filter(Boolean)
}

export function setFacetValues(params, key, values) {
  if (values.length) params.set(`f.${key}`, values.join(','))
  else params.delete(`f.${key}`)
}

export function clearFacets(params) {
  for (const key of [...params.keys()]) if (key.startsWith('f.')) params.delete(key)
}
