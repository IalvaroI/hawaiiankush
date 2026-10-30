// Cannabinoid and terpene data for one variant (Shared_Compounds in ecom-api-v2.yaml: thc, cbd and terpenes, each a
// list of { label, values, uom }). One value is a single batch; two are the range across batches in stock. Nothing
// here names a compound the store must have: labels and units come from the data, and an empty list shows nothing.

// THCA turns into THC when heated, losing its acid group (87.7% of its weight remains): the standard total THC formula.
export const THCA_FACTOR = 0.877

const numbers = (entry) => (entry?.values || []).map(Number).filter(Number.isFinite)
const lowOf = (entry) => Math.min(...numbers(entry))
const highOf = (entry) => Math.max(...numbers(entry))
const round = (value) => Math.round(value * 100) / 100

// The largest value of a measurement, used for ordering and bar lengths.
export const peakOf = (entry) => (numbers(entry).length ? highOf(entry) : 0)

export const isRange = (entry) => numbers(entry).length > 1 && lowOf(entry) !== highOf(entry)

// Percentages of 10 and over get one decimal (21.9), smaller ones up to two (2.7, 0.45): enough to compare products
// without the false precision of a lab sheet.
const shown = (value, uom) => (uom === 'percent' && Math.abs(value) >= 10 ? Math.round(value * 10) / 10 : round(value))

// "25 mg" (no-break space), "28%", "18–22%" (batches differ). A cannabinoid under 1% reads "<1%"; terpenes, which are almost always
// under 1%, keep their figure (`exact`).
export function measureText(entry, { exact = false } = {}) {
  if (!numbers(entry).length) return ''
  const low = shown(lowOf(entry), entry.uom)
  const high = shown(highOf(entry), entry.uom)
  const range = low === high ? String(low) : `${low}–${high}`
  // A no-break space keeps "525 mg" on one line in a narrow phone card's value column.
  if (entry.uom === 'milligram') return `${range}\u00a0mg`
  if (entry.uom !== 'percent') return range
  return high < 1 && !exact ? '<1%' : `${range}%`
}

// The demo catalog (src/demo-data.js) keeps every cannabinoid in one `cannabinoids` list; the API splits THC and CBD.
function listOf(compounds, key, label) {
  if (Array.isArray(compounds?.[key]) && compounds[key].length) return compounds[key]
  return (compounds?.cannabinoids || []).filter((entry) => String(entry?.label || '').toUpperCase().includes(label))
}

const usable = (entry) => Boolean(entry?.label) && numbers(entry).length > 0
const named = (entry, pattern) => pattern.test(String(entry?.label || '').trim())
const TOTAL = (word) => new RegExp(`^total[\\s_-]*${word}s?$`, 'i')
const PLAIN_THC = /^(thc|Δ?\s*-?\s*9[\s-]*thc|d9[\s-]*thc|thc[\s-]*d9|delta[\s-]*9[\s-]*thc)$/i
const THCA = /^thc[\s-]*a$/i

const row = (entry, kind, extra = {}) => ({ kind, label: entry.label, text: measureText(entry, { exact: kind === 'terpene' || kind === 'terpenes' }), peak: peakOf(entry), batches: isRange(entry), uom: entry.uom, ...extra })

// Total THC: the lab's own figure when it reports one; else THC + 0.877 × THCA when both are percentages (marked
// `calculated`); else plain THC on its own. Null when the variant has no THC figure at all.
export function totalThcOf(variant) {
  const list = listOf(variant?.compounds, 'thc', 'THC').filter(usable)
  const reported = list.find((entry) => named(entry, TOTAL('thc')))
  if (reported) return row(reported, 'thc', { label: 'Total THC' })
  const thc = list.find((entry) => named(entry, PLAIN_THC))
  const thca = list.find((entry) => named(entry, THCA))
  if (thca && thca.uom === 'percent' && (!thc || thc.uom === 'percent')) {
    const values = [
      (thc ? lowOf(thc) : 0) + THCA_FACTOR * lowOf(thca),
      (thc ? highOf(thc) : 0) + THCA_FACTOR * highOf(thca),
    ]
    return row({ label: 'Total THC', uom: 'percent', values }, 'thc', { calculated: true })
  }
  const only = thc || list[0]
  return only ? row(only, 'thc') : null
}

// CBD headline: the lab's total CBD, else plain CBD. Minor cannabinoids in the same list (CBG, CBN...) are never
// shown as CBD; they appear in the lab figures instead.
export function cbdOf(variant) {
  const list = listOf(variant?.compounds, 'cbd', 'CBD').filter(usable)
  const entry = list.find((item) => named(item, TOTAL('cbd'))) ?? list.find((item) => named(item, /^cbd$/i))
  return entry ? row(entry, 'cbd') : null
}

// Terpenes, strongest first, without any "Total terpenes" line the lab includes. Each has `share`: its size against
// the strongest (1 for the top one), for bar lengths. Percent and milligram figures are each scaled on their own.
export function terpeneProfile(variant) {
  const rows = (variant?.compounds?.terpenes || [])
    .filter((entry) => usable(entry) && !named(entry, TOTAL('terpene')))
    .map((entry) => row(entry, 'terpene'))
  rows.sort((a, b) => b.peak - a.peak || a.label.localeCompare(b.label))
  const top = {}
  for (const item of rows) top[item.uom] = Math.max(top[item.uom] || 0, item.peak)
  return rows.map((item) => ({ ...item, share: top[item.uom] > 0 ? item.peak / top[item.uom] : 0 }))
}

// Total terpenes: the lab's own figure when listed; else the sum of the terpenes when they share one unit (marked
// `calculated`; batch ranges add up low to low and high to high). Null when there is nothing to add up.
export function totalTerpenesOf(variant) {
  const terpenes = (variant?.compounds?.terpenes || []).filter(usable)
  const reported = terpenes.find((entry) => named(entry, TOTAL('terpene')))
  if (reported) return row(reported, 'terpenes', { label: 'Total terpenes' })
  const parts = terpenes.filter((entry) => !named(entry, TOTAL('terpene')))
  const uom = parts[0]?.uom
  if (!parts.length || parts.some((entry) => entry.uom !== uom)) return null
  const values = [parts.reduce((sum, entry) => sum + lowOf(entry), 0), parts.reduce((sum, entry) => sum + highOf(entry), 0)]
  return row({ label: 'Total terpenes', uom, values }, 'terpenes', { calculated: true })
}

// The headline figures a shopper compares, for cards and the top of the product page.
export function potencyOf(variant) {
  return { thc: totalThcOf(variant), cbd: cbdOf(variant), terpenes: totalTerpenesOf(variant) }
}

// Every lab cannabinoid figure for the detail list: the THC forms, then CBD and the minor cannabinoids.
export function cannabinoidRows(variant) {
  const compounds = variant?.compounds
  const thc = listOf(compounds, 'thc', 'THC').filter(usable).map((entry) => row(entry, 'thc'))
  const cbd = listOf(compounds, 'cbd', 'CBD').filter(usable).map((entry) => row(entry, 'cbd'))
  return [...thc, ...cbd]
}

// "B-Caryophyllene" → "β-Caryophyllene", "A-Pinene" → "α-Pinene", as labs mean them.
export function terpeneName(label) {
  return String(label || '').replace(/^b[\s-]+/i, 'β-').replace(/^a[\s-]+/i, 'α-').replace(/^g[\s-]+/i, 'γ-')
}

// The terpene without its isomer prefix ("Caryophyllene", "Pinene"), for tight spaces; α- and β-pinene read as one.
export const terpeneShortName = (label) => terpeneName(label).replace(/^[αβγδ]-/, '')

export function hasFigures(compounds) {
  return ['thc', 'cbd', 'terpenes', 'cannabinoids'].some((key) => Array.isArray(compounds?.[key]) && compounds[key].some(usable))
}

// Whether a size has anything for the lab box or the potency panel: Total THC, CBD, Total terpenes or terpenes.
export function hasLabProfile(variant) {
  const potency = potencyOf(variant)
  return Boolean(potency.thc || potency.cbd || potency.terpenes) || terpeneProfile(variant).length > 0
}

// What a size without lab figures says. A lab result belongs to one size and batch, so another size's figures are never
// shown in its place; when another size has figures it would show (in the lab box or panel), the note says this size
// has none, so the shopper knows to pick that size to see them. `figuresOf` gives the figures a size is judged by (the
// card's lookup); by default its own.
export function noFiguresNote(variant, variants = [], figuresOf = (option) => option) {
  return variants.some((option) => option !== variant && hasLabProfile(figuresOf(option))) ? 'Lab figures not listed for this size' : 'Lab figures not listed'
}
