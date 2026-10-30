import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { mergeEntries } from '../lib/catalog.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowRight, Loader2, Search, Tag, X } from 'lucide-react'
import { splitSlugId } from '../../shared/slug.js'
import { api } from '../api/client.js'
import { DEMO_MODE, FILTER_LABELS, FILTER_ORDER, PAGE_SIZE, RANGE_UNITS, SALE_TYPE, STORE_ID } from '../config.js'
import { DEMO_PRODUCTS } from '../demo-data.js'
import { FilterPanel } from '../features/catalog/FilterPanel.jsx'
import { ProductGrid, ProductGridSkeleton } from '../features/catalog/ProductGrid.jsx'
import { HelpSection } from '../features/help/HelpSection.jsx'
import { isPlaceholder, rangeBounds, rangeLabel } from '../lib/format.js'
import { Hero } from '../layout/Hero.jsx'
import { StoryBand } from '../layout/StoryBand.jsx'
import { useCart } from '../layout/CartContext.jsx'
import { MenuToolbar } from './MenuToolbar.jsx'
import { Carousels } from '../features/catalog/Carousels.jsx'
import { useCatalogFacts } from '../features/catalog/catalogFacts.js'
import { carouselNames } from '../features/catalog/carouselNames.js'
import { formatSchedule } from '../lib/format.js'
import { clearFacets, DEFAULT_SORT, facetValues, readCatalogQuery, setFacetValues } from './catalogQuery.js'
import { NotConnected } from '../ui/NotConnected.jsx'
import { errorText } from '../lib/errors.js'

// The demo catalog has no store to ask for sorting options, so it uses the API's own values.
const DEMO_SORT_OPTIONS = [
  { value: 'popularityDesc', name: 'Most Popular' },
  { value: 'priceAsc', name: 'Price low to high' },
  { value: 'priceDesc', name: 'Price high to low' },
  { value: 'thcPercentDesc', name: 'THC% low to high' },
  { value: 'createdDesc', name: 'Newest first' },
]

// The catalog: /, /shop and /c/{slug}-{id}. Search, sort and filters are read from and written to the query string.
// Store-wide promotions ("10% Off Everything") said once, above the menu, instead of on every card.
function StoreWideDeals() {
  const { storeWide } = useCatalogFacts()
  if (!storeWide.length) return null
  return (
    <Link className="store-deal" to="/deals">
      <Tag size={16} aria-hidden="true" />
      <span className="store-deal-text">
        {storeWide.map((deal) => <span key={deal.id}><strong>{deal.name}</strong>{deal.schedule && <span className="store-deal-when">{formatSchedule(deal.schedule)}</span>}</span>)}
      </span>
      <span className="store-deal-link">See deals<ArrowRight size={14} aria-hidden="true" /></span>
    </Link>
  )
}

export function MenuPage({ home = false }) {
  const { slugId } = useParams()
  const category = slugId ? splitSlugId(slugId).id : ''
  const [searchParams, setSearchParams] = useSearchParams()
  const { search: query, sort: askedSort, selected } = useMemo(() => readCatalogQuery(searchParams), [searchParams])
  const { store, storeName, categoryList, categoryById: storeCategories, facets: storeFacets, setFacets, flash, filtersOpen, setFiltersOpen } = useCart()
  // The THC % and CBD % filters only where the store can filter by them (see catalogFacts).
  const { ranges } = useCatalogFacts()
  const thcIndexed = ranges.thc
  const facets = useMemo(() => storeFacets.filter((filter) => (filter.key !== 'thcRange' || ranges.thc) && (filter.key !== 'cbdRange' || ranges.cbd)), [storeFacets, ranges])
  // A link that asks for a THC % sort the store cannot do gets the default order instead.
  const sort = thcIndexed || !/^thcPercent/.test(askedSort) ? askedSort : DEFAULT_SORT

  const [products, setProducts] = useState([])
  const [relationCategories, setRelationCategories] = useState({})
  const [sortOptions, setSortOptions] = useState([])
  const [strains, setStrains] = useState({})
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [totalItems, setTotalItems] = useState(0)
  const requestRef = useRef(0)
  // Option names seen so far, so a chip keeps its label after the option drops out of a narrower result.
  const optionNames = useRef({})
  // A carousel's "See all" opens the menu filtered to it (f.carousel); its name comes from the store, for the heading
  // and the filter chip.
  const carouselId = selected.carousel?.length === 1 ? selected.carousel[0] : ''
  // The carousel's name: known from the home page's rails, else asked for; until then (or when the ask fails) the list
  // is "Selection", never "All products" over a list that is not.
  const [carouselName, setCarouselName] = useState(() => Object.fromEntries(carouselNames))
  useEffect(() => {
    if (!carouselId || carouselName[carouselId]) return undefined
    let active = true
    api(`/carousels/${encodeURIComponent(carouselId)}?Scope.SaleType=${encodeURIComponent(SALE_TYPE)}`)
      .then((result) => {
        const name = result?.carousel?.name || 'Selection'
        if (result?.carousel?.name) carouselNames.set(carouselId, name)
        if (active) setCarouselName((current) => ({ ...current, [carouselId]: name }))
      })
      .catch(() => { if (active) setCarouselName((current) => ({ ...current, [carouselId]: 'Selection' })) })
    return () => { active = false }
  }, [carouselId, carouselName])
  // The THC % and CBD % filters where the store cannot filter by them (a link from before, or made by hand) are
  // ignored, as their sort is: a menu that offers no THC control shows no THC chip and no empty page for it.
  // Keyed on the two answers, not the facts object (replaced on every update): the list must not load twice.
  const usable = useMemo(() => Object.fromEntries(Object.entries(selected).filter(([key]) => (key !== 'thcRange' || ranges.thc) && (key !== 'cbdRange' || ranges.cbd))), [selected, ranges.thc, ranges.cbd])

  // The store's categories (with their subcategories) win over the names a products answer carries.
  const categoryById = useMemo(() => ({
    ...Object.fromEntries(Object.entries(relationCategories).map(([id, item]) => [id, { ...item, value: id }])),
    ...storeCategories,
  }), [storeCategories, relationCategories])
  const sortChoices = (DEMO_MODE && !sortOptions.length ? DEMO_SORT_OPTIONS : sortOptions)
    .filter((option) => thcIndexed || !/^thcPercent/.test(option.value))
  const brandNames = useMemo(() => Object.fromEntries((facets.find((filter) => filter.key === 'brand')?.options || []).map((option) => [String(option.value), option.name])), [facets])
  const quickFilters = facets.filter((filter) => filter.key === 'quickFilter' && filter.options?.length)
  const panelFilters = useMemo(() => facets
    .filter((filter) => filter.key !== 'category' && filter.key !== 'quickFilter')
    .filter((filter) => filter.type === 'range' ? rangeBounds(filter) : filter.options?.some((option) => !isPlaceholder(option.name)))
    .sort((a, b) => (FILTER_ORDER.indexOf(a.key) + 1 || 99) - (FILTER_ORDER.indexOf(b.key) + 1 || 99)), [facets])
  const panelKeys = useMemo(() => new Set(panelFilters.map((filter) => filter.key)), [panelFilters])
  const rangeKeys = new Set(facets.filter((filter) => filter.type === 'range').map((filter) => filter.key).concat(Object.keys(RANGE_UNITS)))
  const activeChips = Object.entries(usable).flatMap(([key, values]) => {
    if (!values?.length) return []
    if (rangeKeys.has(key)) return [{ key, range: true, label: `${FILTER_LABELS[key] || facets.find((item) => item.key === key)?.name || key} ${rangeLabel(key, values)}` }]
    return values.map((value) => ({ key, value, label: key === 'carousel' ? carouselName[value] || 'Selection' : optionNames.current[`${key}:${value}`] || value }))
  })
  const panelCount = activeChips.filter((chip) => chip.key !== 'quickFilter').length
  const hasQuery = Boolean(query || category || activeChips.length)
  const configurationMissing = !DEMO_MODE && !STORE_ID

  const loadCatalog = useCallback(async (pageNumber = 1) => {
    const requestId = ++requestRef.current
    const appending = pageNumber > 1
    appending ? setLoadingMore(true) : setLoading(true)
    setError('')
    if (DEMO_MODE) {
      const needle = query.toLowerCase()
      let items = DEMO_PRODUCTS.filter((item) => (!needle || `${item.name} ${item.description}`.toLowerCase().includes(needle)) && (!category || item.attributeIds.categoryId === category))
      const price = (item) => item.variants[0].prices.discounted ?? item.variants[0].prices.base
      const thc = (item) => item.variants[0].compounds?.cannabinoids?.[0]?.values?.[0] ?? -1
      if (sort === 'priceAsc') items = [...items].sort((a, b) => price(a) - price(b))
      if (sort === 'priceDesc') items = [...items].sort((a, b) => price(b) - price(a))
      if (sort === 'thcPercentDesc') items = [...items].sort((a, b) => thc(b) - thc(a))
      setProducts(items)
      setTotalItems(items.length)
      setPage(1)
      setLoading(false)
      return
    }
    try {
      const params = new URLSearchParams({ 'Scope.SaleType': SALE_TYPE, 'Pagination.Page': String(pageNumber), 'Pagination.PageSize': String(PAGE_SIZE), SortingOption: sort })
      if (query) params.set('Search', query)
      // The API takes flattened filters (filters.brand=a,b; ranges as filters.price=min,max), never JSON.
      if (category) params.set('filters.category', category)
      for (const [key, values] of Object.entries(usable)) {
        if (values?.length) params.set(`filters.${key}`, values.join(','))
      }
      const result = await api(`/products?${params.toString()}`)
      if (requestId !== requestRef.current) return
      setProducts((current) => mergeEntries(appending ? [...current, ...(result?.items || [])] : result?.items || []))
      setRelationCategories((current) => ({
        ...current,
        ...Object.fromEntries((result?.relations?.categories || []).map((item) => [String(item.id), item])),
      }))
      const strainMap = Object.fromEntries((result?.relations?.strains || []).map((strain) => [String(strain.id), strain]))
      setStrains((current) => appending ? { ...current, ...strainMap } : strainMap)
      if (!appending && result?.sortingOptions?.length) setSortOptions(result.sortingOptions)
      // An empty result returns no facets; keep the last ones so filters can still be removed from the panel.
      if (!appending && result?.filters?.length) {
        for (const filter of result.filters) for (const option of filter.options || []) optionNames.current[`${filter.key}:${option.value}`] = option.name
        setFacets(result.filters)
      }
      setTotalItems(Number(result?.totalItems || 0))
      setPage(pageNumber)
    } catch (err) {
      if (requestId !== requestRef.current) return
      if (appending) flash(errorText(err, 'More products could not be loaded. Try again.'), 'error')
      else setError(errorText(err, 'The store didn’t answer. Check your connection and try again.'))
    } finally {
      if (requestId === requestRef.current) { setLoading(false); setLoadingMore(false) }
    }
  }, [category, query, usable, sort, flash])

  useEffect(() => { if (DEMO_MODE || STORE_ID) loadCatalog(1) }, [loadCatalog])

  // Filter, sort and search changes replace the current history entry, so Back still leaves the menu.
  const updateQuery = useCallback((change) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous)
    change(next)
    return next
  }, { replace: true }), [setSearchParams])

  function toggleFilter(key, value) {
    updateQuery((params) => {
      const values = facetValues(params, key)
      const text = String(value)
      setFacetValues(params, key, values.includes(text) ? values.filter((item) => item !== text) : [...values, text])
    })
  }

  function setRange(key, range) {
    updateQuery((params) => setFacetValues(params, key, range ? range.map(String) : []))
  }

  // Quick selects hold one choice; "All …" (an empty value) clears the facet.
  function setFacet(key, value) {
    updateQuery((params) => setFacetValues(params, key, value ? [value] : []))
  }

  function setSort(value) {
    updateQuery((params) => {
      if (value && value !== DEFAULT_SORT) params.set('sort', value)
      else params.delete('sort')
    })
  }

  function removeChip(chip) {
    chip.range ? setRange(chip.key, null) : toggleFilter(chip.key, chip.value)
  }

  function clearSearch() {
    updateQuery((params) => params.delete('q'))
  }

  function clearFilters() {
    updateQuery((params) => clearFacets(params))
  }

  // Clears search and filters; the category is a page, so it stays.
  function clearAll() {
    updateQuery((params) => {
      params.delete('q')
      clearFacets(params)
    })
  }

  // The list is named for what it is: a category, a carousel, a search ("Results for “blue”"), or the whole menu.
  const heading = category && categoryById[category] ? categoryById[category].name : carouselId ? carouselName[carouselId] || 'Selection' : query ? `Results for “${query}”` : 'All products'
  // A search or a filter the shopper can take back. A category is a page, not a filter, so it has nothing to clear.
  const narrowed = Boolean(query || activeChips.length)
  usePageTitle(home && !category ? `${storeName} · Shop` : `${heading} · ${storeName}`)

  return (
    <>
      <h1 className="sr-only">{storeName ? `${storeName} shop` : 'Shop'}</h1>
      {home && !hasQuery && <Hero />}
      <div className="sheet">
        <StoreWideDeals />
        <MenuToolbar
          categoryList={categoryList}
          categoryById={categoryById}
          category={category}
          facets={facets}
          selected={selected}
          panelKeys={panelKeys}
          panelCount={panelCount}
          quickFilters={quickFilters}
          onFacet={setFacet}
          onToggle={toggleFilter}
          onOpenFilters={() => setFiltersOpen(true)}
          sort={sort}
          sortOptions={sortChoices}
          onSort={setSort}
        />

        {home && !hasQuery && <Carousels />}

        <div className="result-head">
          <h2 className="result-count" aria-live="polite">
            {loading ? 'Loading products…' : error || configurationMissing ? '' : <>{heading} <span>{totalItems.toLocaleString('en-US')} {totalItems === 1 ? 'product' : 'products'}</span></>}
          </h2>
        </div>

        {narrowed && (
          <div className="chip-row">
            {query && <button type="button" className="chip" onClick={clearSearch} aria-label={`Clear search ${query}`}>“{query}”<X size={14} aria-hidden="true" /></button>}
            {activeChips.map((chip) => (
              <button type="button" className="chip" key={`${chip.key}:${chip.value ?? 'range'}`} onClick={() => removeChip(chip)} aria-label={`Remove filter ${chip.label}`}>
                {chip.label}<X size={14} aria-hidden="true" />
              </button>
            ))}
            <button type="button" className="text-button" onClick={clearAll}>{query ? 'Clear search and filters' : 'Clear filters'}</button>
          </div>
        )}

        {configurationMissing ? (
          <NotConnected icon={AlertCircle} title="The menu isn’t available right now" />
        ) : error ? (
          <div className="state-panel" role="alert">
            <AlertCircle size={28} aria-hidden="true" />
            <h2>Products didn’t load</h2>
            <p>{error}</p>
            <button className="primary-button" type="button" onClick={() => loadCatalog(1)}>Try again</button>
          </div>
        ) : loading ? (
          <ProductGridSkeleton />
        ) : products.length ? (
          <>
            <ProductGrid products={products} brands={brandNames} strains={strains} categoryById={categoryById} />
            {products.length < totalItems && (
              <div className="load-more">
                <span>Showing {products.length} of {totalItems.toLocaleString('en-US')}</span>
                <button className="secondary-button" type="button" disabled={loadingMore} onClick={() => loadCatalog(page + 1)}>
                  {loadingMore ? <><Loader2 className="spin" size={16} aria-hidden="true" /> Loading</> : 'Show more'}
                </button>
              </div>
            )}
          </>
        ) : narrowed ? (
          <div className="state-panel">
            <Search size={28} aria-hidden="true" />
            <h2>Nothing matches</h2>
            <p>{query ? 'Try another search term or remove a filter.' : 'Remove a filter to see more.'}</p>
            <button className="primary-button" type="button" onClick={clearAll}>{query ? 'Clear search and filters' : 'Clear filters'}</button>
            <Link className="text-button" to="/picker">Or answer a few questions to find a match</Link>
          </div>
        ) : (
          // Nothing to clear: the category (or the whole menu) simply has nothing in stock right now.
          <div className="state-panel">
            <Search size={28} aria-hidden="true" />
            <h2>{category ? `No products in ${heading} right now` : 'No products right now'}</h2>
            <p>New stock arrives often. The rest of the menu is a tap away.</p>
            {category && <Link className="primary-button" to="/shop">Browse the menu</Link>}
            <Link className="text-button" to="/picker">Or answer a few questions to find a match</Link>
          </div>
        )}

        {home && !hasQuery && <StoryBand />}
        <HelpSection store={store} />
      </div>

      <FilterPanel
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={panelFilters}
        selected={selected}
        count={panelCount}
        totalItems={totalItems}
        loading={loading}
        onToggle={toggleFilter}
        onRange={setRange}
        onClear={clearFilters}
      />
    </>
  )
}
