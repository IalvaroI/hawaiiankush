import { formatSchedule, imageUrl, sizeText, variantLabel } from '../../lib/format.js'
import { potencyOf } from '../../lib/compounds.js'

// Pure helpers for the product page. They read the API's product shape (GetProductResponse in ecom-api-v2.yaml)
// and never name a catalog item: labels, badges, filters, prices and promotions all come from the response.

export const LOW_STOCK = 5
const MAX_CATEGORY_DEPTH = 5
const KNOWN_STRAINS = ['hybrid', 'sativa', 'indica']
// Cosmetic only: the badge colour follows the tag name, the tag's own text is what shows.
const BADGE_RULES = [
  { style: 'badge-staff', pattern: /staff\s*pick/i },
  { style: 'badge-new', pattern: /^new$/i },
  { style: 'badge-popular', pattern: /popular/i },
]

export const sameId = (a, b) => a != null && b != null && String(a) === String(b)
export const inStock = (variant) => Number(variant?.stock?.quantity ?? 1) > 0
export const stockCount = (variant) => Math.floor(Number(variant?.stock?.quantity ?? 0))

// The price for one unit. `was` is set only when the discounted price is lower than the base price.
export function priceOf(variant) {
  const base = variant?.prices?.base
  const discounted = variant?.prices?.discounted
  const onSale = discounted != null && discounted !== '' && base != null && Number(discounted) < Number(base)
  return onSale ? { now: discounted, was: base } : { now: base, was: null }
}

// Size and THC, e.g. "5 pack · 25 mg". Two variants never share a label: colliding ones get " · Option N".
export function variantLabels(product) {
  const variants = product?.variants || []
  const base = variants.map((variant) => [sizeText(variant) || variantLabel(product, variant) || 'Standard', potencyOf(variant).thc?.text].filter(Boolean).join(' · '))
  return base.map((label, index) => (base.indexOf(label) !== base.lastIndexOf(label) ? `${label} · Option ${index + 1}` : label))
}

// One badge at most, from the product's tags. Staff picks win over new, new over popular.
export function productBadge(attributes) {
  const tags = attributes?.tags || []
  for (const rule of BADGE_RULES) {
    const tag = tags.find((item) => rule.pattern.test(String(item?.name || '').trim()))
    if (tag) return { text: tag.name, style: rule.style }
  }
  return null
}

export function prevalenceName(prevalence) {
  return typeof prevalence === 'string' ? prevalence : prevalence?.name || ''
}

export function strainTone(name) {
  const key = String(name || '').toLowerCase()
  return KNOWN_STRAINS.includes(key) ? key : 'unknown'
}

// Gallery: the product's photos, then the selected variant's, without repeats.
export function galleryImages(product, variant) {
  return [...new Set([...(product?.images || []), ...(variant?.images || [])].map(imageUrl).filter(Boolean))]
}


// Attribute chips in display order. Each entity carries its own catalog filters; a chip opens the catalog with them.
export function attributeGroups(attributes = {}) {
  const named = (list) => (list || []).filter((entity) => entity?.name)
  const chip = (entity, extra = {}) => ({ key: String(entity.id ?? entity.name), name: entity.name, filters: entity.filters || [], ...extra })
  const strain = attributes.strain?.name ? attributes.strain : null
  const prevalence = attributes.strain?.prevalence?.name ? attributes.strain.prevalence : null
  const groups = [
    { title: 'Effects', items: named(attributes.effects).map((entity) => chip(entity)) },
    { title: 'Flavors', items: named(attributes.flavorings).map((entity) => chip(entity)) },
    { title: 'Scents', items: named(attributes.scents).map((entity) => chip(entity)) },
    { title: 'Strain', items: [...(strain ? [chip(strain)] : []), ...(prevalence ? [chip(prevalence, { tone: strainTone(prevalence.name) })] : [])] },
    { title: 'Type', items: named([attributes.productType]).map((entity) => chip(entity)) },
    { title: 'Tags', items: named(attributes.tags).map((entity) => chip(entity)) },
  ]
  return groups.filter((group) => group.items.length)
}

const usableFilters = (filters) => (filters || []).filter((filter) => filter?.key && filter.values?.length)
const encodeValues = (values) => values.map((value) => encodeURIComponent(String(value))).join(',')

// The catalog page's own URL form: /shop?f.<key>=v1,v2 (see src/routes/catalogQuery.js). Empty when there are no filters.
export function shopHref(filters) {
  const parts = usableFilters(filters).map((filter) => `f.${encodeURIComponent(filter.key)}=${encodeValues(filter.values)}`)
  return parts.length ? `/shop?${parts.join('&')}` : ''
}

// The products endpoint's form: filters.<key>=v1,v2.
export function apiFilters(filters) {
  return usableFilters(filters).map((filter) => `filters.${encodeURIComponent(filter.key)}=${encodeValues(filter.values)}`).join('&')
}

export function variantPromotions(variant, promotions) {
  const ids = (variant?.promotionIds || []).map(String)
  return (promotions || []).filter((promotion) => ids.includes(String(promotion?.id)))
}

export const promotionText = (promotion) => [promotion.name, formatSchedule(promotion.schedule)].filter(Boolean).join(' · ')

const safeUrl = (value) => /^https?:\/\//i.test(String(value || ''))
export function documentLinks(documents) {
  return (documents || [])
    .filter((doc) => safeUrl(doc?.source))
    .map((doc, index) => ({ key: `${index}-${doc.source}`, href: doc.source, label: doc.type === 'coa' ? 'View lab report' : 'Attachment' }))
}

// Top-level category first, the product's own category last.
export function categoryTrail(category) {
  const trail = []
  for (let node = category, depth = 0; node && depth < MAX_CATEGORY_DEPTH; node = node.parent, depth += 1) trail.unshift(node)
  return trail
}

export const paragraphs = (text) => String(text || '').split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)

export function mergeRelations(first = {}, second = {}) {
  return {
    brands: [...(first.brands || []), ...(second?.brands || [])],
    strains: [...(first.strains || []), ...(second?.strains || [])],
  }
}
