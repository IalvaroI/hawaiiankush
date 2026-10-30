import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Check, ChevronDown, Cigarette, Cookie, CupSoda, Droplet, FlaskConical, Flower2, Gift, Hand, LayoutGrid, Leaf, Package, PawPrint, Pen, Pill, Shirt, SlidersHorizontal, Sprout } from 'lucide-react'
import { joinSlugId } from '../../shared/slug.js'
import { imageUrl, isPlaceholder } from '../lib/format.js'
import { sortLabel } from './catalogQuery.js'

// Icon by category name; the match is by keyword so "Pre-Rolls", "Vapes" or "Beverages" all find their icon.
const CATEGORY_ICONS = [
  [/flower/i, Flower2],
  [/pre.?roll|joint/i, Cigarette],
  [/vape|cartridge|pen/i, Pen],
  [/edible|gumm|chocolate|chew/i, Cookie],
  [/concentrate|extract|wax|rosin/i, Droplet],
  [/tincture/i, FlaskConical],
  [/topical|balm|salve/i, Hand],
  [/beverage|drink/i, CupSoda],
  [/accessor/i, Package],
  [/apparel|merch|shirt/i, Shirt],
  [/gift/i, Gift],
  [/\bpet/i, PawPrint],
  [/oral|capsule|tablet/i, Pill],
  [/hemp|cbd/i, Sprout],
]

export function categoryIcon(name = '') {
  return CATEGORY_ICONS.find(([pattern]) => pattern.test(name))?.[1] || Leaf
}

// The category's own image from the store (categories[].images), set in the Sweed portal; the icon stands in when
// there is none or it fails to load.
function CategoryMark({ item }) {
  const [failed, setFailed] = useState(false)
  const src = imageUrl(item.images?.[0])
  if (src && !failed) {
    return <img className="cat-pill-image" src={src} alt="" width="30" height="30" loading="lazy" decoding="async" onError={() => setFailed(true)} />
  }
  const Icon = categoryIcon(item.name)
  return <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
}

// Quick selects, shown only when that facet is in the latest products response. Labels come from the facet name;
// these overrides only exist where the facet name reads badly on a control.
const QUICK_SELECTS = [
  { key: 'strainPrevalence', all: 'All Strains' },
  { key: 'brand', all: 'All Brands' },
  { key: 'effect', all: 'All Effects' },
]
const RANGE_BUTTONS = [
  { key: 'thcRange', label: 'THC %' },
  { key: 'price', label: 'Price' },
]

export function MenuToolbar({ categoryList, categoryById = {}, category, facets, selected, panelKeys, panelCount, quickFilters, sort, sortOptions = [], onFacet, onToggle, onOpenFilters, onSort }) {
  const { search } = useLocation()
  const hasFacet = (key) => facets.some((facet) => facet.key === key)
  // On phones the pills scroll sideways; the current category is brought into view.
  const pillsRef = useRef(null)
  useEffect(() => {
    const pills = pillsRef.current
    const current = pills?.querySelector('[aria-current="page"]')
    if (pills && current && pills.scrollWidth > pills.clientWidth) pills.scrollLeft = Math.max(0, current.offsetLeft - pills.clientWidth / 2 + current.offsetWidth / 2)
  }, [category, categoryList.length])
  return (
    <div className="menu-toolbar">
      <nav className="cat-pills" ref={pillsRef} aria-label="Product categories">
        <Link to={{ pathname: '/', search }} className="cat-pill" aria-current={!category ? 'page' : undefined}>
          <LayoutGrid size={18} strokeWidth={1.75} aria-hidden="true" />All
        </Link>
        {categoryList.map((item) => {
          const active = category === item.value
          return (
            <Link key={item.value} to={{ pathname: `/c/${joinSlugId(item.name, item.value)}`, search }} className={`cat-pill ${imageUrl(item.images?.[0]) ? 'has-image' : ''}`} aria-current={active ? 'page' : undefined}>
              <CategoryMark item={item} />{item.name}
            </Link>
          )
        })}
      </nav>

      <Subcategories categoryById={categoryById} category={category} search={search} />

      <div className="filter-bar">
        {QUICK_SELECTS.map((item) => {
          const filter = facets.find((entry) => entry.key === item.key)
          const options = (filter?.options || []).filter((option) => !isPlaceholder(option.name))
          if (!options.length) return null
          // Several chosen in the filter panel: the select says so, and choosing one here replaces them.
          const chosen = selected[item.key] || []
          const current = chosen.length === 1 ? chosen[0] : ''
          return (
            <label className="filter-select is-quick" key={item.key}>
              <span className="sr-only">{filter.name}</span>
              <select value={current} onChange={(event) => onFacet(item.key, event.target.value)}>
                <option value="">{chosen.length > 1 ? `${chosen.length} selected` : item.all}</option>
                {options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.name}</option>)}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </label>
          )
        })}
        {RANGE_BUTTONS.filter((item) => hasFacet(item.key)).map((item) => (
          <button type="button" key={item.key} className={`filter-chip is-range ${selected[item.key]?.length ? 'is-set' : ''}`} onClick={onOpenFilters}>{item.label}<ChevronDown size={16} aria-hidden="true" /></button>
        ))}
        {quickFilters.flatMap((filter) => filter.options.map((option) => {
          const pressed = (selected[filter.key] || []).includes(String(option.value))
          return <button type="button" className="toggle-button" key={`${filter.key}:${option.value}`} aria-pressed={pressed} onClick={() => onToggle(filter.key, option.value)}>{pressed && <Check size={15} aria-hidden="true" />}{option.name}</button>
        }))}
        {panelKeys.size > 0 && (
          <button type="button" className="filter-chip filter-open" onClick={onOpenFilters} aria-haspopup="dialog">
            <SlidersHorizontal size={16} aria-hidden="true" />Filters{panelCount > 0 && <span className="count-badge">{panelCount}</span>}
          </button>
        )}
        {onSort && <SortControl sort={sort} sortOptions={sortOptions} onSort={onSort} />}
      </div>
    </div>
  )
}

// Sort ends the filter row, pushed to its right edge: every control that shapes the list sits in one place, ahead of
// the home page's rails as well as the grid.
function SortControl({ sort, sortOptions, onSort }) {
  if (!sortOptions.length) return null
  return (
    <label className="filter-select sort-control">
      <span>Sort by</span>
      <select value={sort} onChange={(event) => onSort(event.target.value)} aria-label="Sort by">
        {sortOptions.map((option) => <option key={option.value} value={option.value}>{sortLabel(option)}</option>)}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </label>
  )
}

// Subcategory chips under the pills, on a category that has children in Sweed (and on each child, to move between
// siblings). Nothing shows for a category without children.
function Subcategories({ categoryById, category, search }) {
  const current = categoryById[category]
  const parent = current?.parent ? categoryById[current.parent] : current
  const children = (Array.isArray(parent?.children) ? parent.children : [])
    .map((child) => categoryById[String(child?.value ?? child?.id ?? '')])
    .filter(Boolean)
  if (!parent || !children.length) return null
  return (
    <nav className="subcat-chips" aria-label={`${parent.name} subcategories`}>
      <Link to={{ pathname: `/c/${joinSlugId(parent.name, parent.value)}`, search }} className="subcat-chip" aria-current={category === parent.value ? 'page' : undefined}>All {parent.name}</Link>
      {children.map((child) => (
        <Link key={child.value} to={{ pathname: `/c/${joinSlugId(child.name, child.value)}`, search }} className="subcat-chip" aria-current={category === child.value ? 'page' : undefined}>{child.name}</Link>
      ))}
    </nav>
  )
}
