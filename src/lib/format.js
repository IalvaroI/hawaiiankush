import { RANGE_UNITS, UNITS } from '../config.js'

export { formatSchedule } from './schedule.js'

// Text from the API that may be missing, blank or the literal string "null": trimmed, or '' when there is nothing to show.
export function cleanText(value) {
  return typeof value === 'string' && value.trim() && value.trim().toLowerCase() !== 'null' ? value.trim() : ''
}

export function money(value, currency = 'USD') {
  if (value == null || value === '') return 'Price unavailable'
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  // Whole amounts read "$45" like the menu design; anything with cents keeps both digits ("$21.60").
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: Number.isInteger(number) ? 0 : 2, maximumFractionDigits: 2 }).format(number) }
  catch { return `$${number.toFixed(2)}` }
}

// A receipt value as the store sends it ("$30.00", "-$3.00" or a number) in the same format as every other price, so
// "$30" in the bag never reads "$30.00" at checkout. Text that is not an amount ("Free") is kept as it is.
export function receiptValue(value) {
  if (typeof value === 'number') return money(value)
  const text = String(value ?? '').trim()
  const match = /^([-−])?\s*\$\s*([-−])?([\d,]+(?:\.\d+)?)$/.exec(text)
  if (!match) return text
  const amount = money(Number(match[3].replace(/,/g, '')))
  return match[1] || match[2] ? `−${amount}` : amount
}

export function readable(value = '') {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())
}

export function imageUrl(image) {
  if (!image) return ''
  return typeof image === 'string' ? image : image.source || image.url || image.src || ''
}

export function firstImage(item) {
  return imageUrl(item?.images?.[0]) || imageUrl(item?.variants?.[0]?.images?.[0])
}

export function pickVariant(product) {
  return (product?.variants || []).find((variant) => Number(variant?.stock?.quantity ?? 1) > 0) || product?.variants?.[0]
}

export function categoryIdOf(product) {
  return product?.attributeIds?.categoryId || product?.attributes?.category?.id || product?.category?.id || ''
}

// The demo catalog fills unset names with placeholders such as "COMMON PRODUCT TYPE"; never show those.
export const isPlaceholder = (name = '') => /^COMMON\b/i.test(name.trim())

export function variantLabel(product, variant) {
  const name = (variant?.name || '').replace(/\s*COMMON PRODUCT TYPE\s*/gi, ' ').trim()
  if (!name || name === product?.name) return ''
  return product?.name && name.startsWith(product.name) ? name.slice(product.name.length).trim() : name
}

export function sizeText(variant) {
  const size = variant?.package?.itemSize
  if (!size?.value) return ''
  if (size.uom === 'each') return Number(size.value) > 1 ? `${Number(size.value)} pack` : ''
  // One spelling everywhere (cards, product page, bag): no space before the unit ("3.5g", "100mg", "30ml"), except
  // the two-word "fl oz"; a pack is "10×10mg".
  const unit = UNITS[size.uom] || ''
  const text = `${Number(size.value)}${unit.includes(' ') ? ` ${unit}` : unit}`
  const count = Number(variant.package.itemsCount || 1)
  return count > 1 ? `${count}×${text}` : text
}

export function potencyText(variant) {
  const entry = variant?.compounds?.thc?.[0] || variant?.compounds?.cannabinoids?.find((item) => /THC/i.test(item.label))
  if (!entry?.values?.length) return ''
  const unit = entry.uom === 'percent' ? '%' : UNITS[entry.uom] ? ` ${UNITS[entry.uom]}` : ''
  return `THC ${entry.values.map(Number).join('–')}${unit}`
}

export function rangeBounds(filter) {
  const min = Number(filter.options?.find((option) => /min/i.test(option.name))?.value)
  const max = Number(filter.options?.find((option) => /max/i.test(option.name))?.value)
  return Number.isFinite(min) && Number.isFinite(max) && max > min ? { min, max } : null
}

export function rangeLabel(key, [min, max]) {
  const unit = RANGE_UNITS[key] || { prefix: '', suffix: '' }
  return `${unit.prefix}${min}–${unit.prefix}${max}${unit.suffix}`
}

// The latest birth date that still meets the 21+ rule today, in local time, as yyyy-MM-dd.
export function latestBirthDateFor21() {
  const today = new Date()
  const date = new Date(today.getFullYear() - 21, today.getMonth(), today.getDate())
  // On Feb 29 there is no match 21 years back; use Feb 28 rather than rolling into March.
  if (date.getDate() !== today.getDate()) date.setDate(0)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}
