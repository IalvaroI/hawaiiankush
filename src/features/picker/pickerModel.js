import { potencyOf } from '../../lib/compounds.js'
import { bySize } from '../../lib/sizes.js'

// The product finder ("AI Picker"). Sweed's AI-Picker API asks up to four questions (category, effect, flavor,
// strength) and ranks products for the answers. When its questions endpoint is unavailable, the same questions are
// built from the store's own catalog data, and the products are ranked here. Nothing names a store item: every
// option comes from the API.

export const QUESTION_ORDER = ['category', 'effect', 'flavor', 'strength']
export const MAX_CHOICES = { category: 1, effect: 2, flavor: 2, strength: 1 }

const PROMPTS = {
  category: { title: 'What are you shopping for?', hint: 'Pick one.' },
  effect: { title: 'How do you want to feel?', hint: 'Pick up to two, or skip.' },
  flavor: { title: 'Any flavours you love?', hint: 'Pick up to two, or skip.' },
  strength: { title: 'How strong?', hint: 'Based on Total THC. Skip if you’re not sure.' },
}

// Categories that are not cannabis to choose by feel (apparel, accessories, gift cards, pet products) are left out
// of the first question. They match by name keyword, like the category icons, so a new category needs no code.
export const NOT_FOR_PICKING = /accessor|apparel|merch|shirt|hat|gift|card|pet|device|batter|lighter|grinder|rolling|storage|clean/i

// Strength buckets on Total THC. Percent for flower, pre-rolls and concentrates; milligrams per package for edibles,
// drinks and the like.
export const STRENGTHS = [
  { value: 'mild', name: 'Mild', note: 'Under 16% or under 10 mg' },
  { value: 'balanced', name: 'Balanced', note: '16–24% or 10–50 mg' },
  { value: 'strong', name: 'Strong', note: 'Over 24% or 50 mg' },
]

export function strengthOf(variant) {
  const thc = potencyOf(variant).thc
  if (!thc || !(thc.peak > 0)) return null
  if (thc.uom === 'percent') return thc.peak < 16 ? 'mild' : thc.peak <= 24 ? 'balanced' : 'strong'
  if (thc.uom === 'milligram') return thc.peak < 10 ? 'mild' : thc.peak <= 50 ? 'balanced' : 'strong'
  return null
}

const optionOf = (option) => ({ name: String(option?.name ?? '').trim(), value: String(option?.value ?? ''), image: option?.icon?.image?.source || option?.image || '' })
const usableOptions = (options) => (options || []).map(optionOf).filter((option) => option.name && option.value)

// Sweed's questions (GetAiPickerResponse.aiPicker.questions) in the shape the page uses. Questions without options
// are dropped; an unknown type keeps its own filter name as the title.
export function questionsFromApi(aiPicker) {
  return (aiPicker?.questions || [])
    .map((question) => {
      const type = String(question?.type || question?.filter?.key || '')
      return {
        type,
        key: String(question?.filter?.key || type),
        ...(PROMPTS[type] || { title: question?.filter?.name || type, hint: '' }),
        max: MAX_CHOICES[type] || 1,
        optional: type !== 'category',
        options: usableOptions(question?.filter?.options),
      }
    })
    .filter((question) => question.type && question.options.length)
}

// The same four questions from the catalog: categories (with their images), and the effect and flavour facets of the
// products list. Strength uses the fixed buckets above.
export function questionsFromCatalog({ categories = [], filters = [] }) {
  const facet = (key) => filters.find((filter) => filter?.key === key)
  const categoryOptions = categories
    .filter((category) => category?.name && !NOT_FOR_PICKING.test(category.name))
    .map((category) => ({ name: category.name, value: String(category.value ?? category.id), image: category.images?.[0]?.source || '' }))
  const questions = [
    { type: 'category', key: 'category', ...PROMPTS.category, max: 1, optional: false, options: categoryOptions },
    { type: 'effect', key: 'effect', ...PROMPTS.effect, max: 2, optional: true, options: usableOptions(facet('effect')?.options) },
    { type: 'flavor', key: 'flavoring', ...PROMPTS.flavor, max: 2, optional: true, options: usableOptions(facet('flavoring')?.options) },
    { type: 'strength', key: 'strength', ...PROMPTS.strength, max: 1, optional: true, options: STRENGTHS },
  ]
  return questions.filter((question) => question.options.length)
}

// Answers live in the URL (?category=…&effect=a,b), so Back, refresh and sharing all work.
export function readAnswers(params, questions) {
  const answers = {}
  for (const question of questions) {
    const allowed = new Set(question.options.map((option) => option.value))
    const values = (params.get(question.type) || '').split(',').filter((value) => allowed.has(value)).slice(0, question.max)
    if (values.length) answers[question.type] = values
  }
  return answers
}

const inStock = (product) => (product?.variants || []).some((variant) => Number(variant?.stock?.quantity ?? 1) > 0)
const names = (question, values) => (values || []).map((value) => question?.options.find((option) => option.value === value)?.name).filter(Boolean)
const lower = (list) => new Set((list || []).map((name) => String(name).toLowerCase()))

// Ranks candidates for the answers when the store's own ranking cannot use them (catalog questions).
// `candidates` are { product, percent? } in the store's order (`percent` is Sweed's score for the category, when it
// gave one); `extras` maps product id → { effects, flavorings, compounds } from the enrichment lookup.
// Each answered question (effect, flavour, strength) counts once; a product's match is the share it meets, blended
// with Sweed's score when there is one. Products that meet none are left out unless too few meet any.
export function rankCandidates({ candidates, answers, questions, extras = {}, limit = 12, minimum = 4 }) {
  const byType = Object.fromEntries(questions.map((question) => [question.type, question]))
  const wanted = {
    effect: names(byType.effect, answers.effect),
    flavor: names(byType.flavor, answers.flavor),
    strength: answers.strength?.[0] || '',
  }
  const asked = ['effect', 'flavor', 'strength'].filter((type) => (type === 'strength' ? wanted.strength : wanted[type].length))
  const seen = new Set()
  const scored = []
  candidates.forEach(({ product, percent }, order) => {
    if (!product?.id || seen.has(product.id) || !inStock(product)) return
    seen.add(product.id)
    const extra = extras[product.id] || {}
    const reasons = []
    let met = 0
    if (wanted.effect.length) {
      const have = lower(extra.effects)
      const hits = wanted.effect.filter((name) => have.has(name.toLowerCase()))
      if (hits.length) { met += 1; reasons.push(...hits) }
    }
    if (wanted.flavor.length) {
      const have = lower(extra.flavorings)
      const hits = wanted.flavor.filter((name) => have.has(name.toLowerCase()))
      if (hits.length) { met += 1; reasons.push(...hits) }
    }
    if (wanted.strength) {
      // Judged on the size the card shows (its first size in stock, smallest first), with that size's own figures: the
      // reason "Strong" and the Total THC on the card then always agree.
      const sizes = bySize(product.variants)
      const shown = sizes.find((variant) => Number(variant?.stock?.quantity ?? 1) > 0) || sizes[0]
      const figures = { compounds: shown?.compounds?.thc?.length ? shown.compounds : extra.compounds?.[String(shown?.id)] }
      if (strengthOf(figures) === wanted.strength) {
        met += 1
        reasons.push(STRENGTHS.find((item) => item.value === wanted.strength).name)
      }
    }
    const share = asked.length ? met / asked.length : 1
    // One scale for every card: the store's own percent (a middling one when it gave none) weighs 40, the answers met
    // weigh 60. A product that meets none of the answers gets no score: it is only shown as a closest pick.
    const store = Number.isFinite(Number(percent)) ? Number(percent) : null
    const score = asked.length && !met ? null
      : asked.length ? Math.round(0.4 * (store ?? 50) + 60 * share)
        : store == null ? null : Math.round(store)
    scored.push({ product, met, share, percent: score, reasons, order })
  })
  scored.sort((a, b) => b.share - a.share || (b.percent ?? 0) - (a.percent ?? 0) || a.order - b.order)
  const matching = scored.filter((item) => !asked.length || item.met > 0)
  const items = (matching.length >= minimum ? matching : scored).slice(0, limit)
  // `full` counts the shown products that meet every answer; they come first.
  return { items, full: items.filter((item) => item.share === 1).length }
}

// Sweed's ranked results (GetAiPickerProductsResponse.items) in the same shape, with the answers that produced each
// match as reasons.
export function rankedFromApi(items, questions) {
  const byKey = Object.fromEntries(questions.map((question) => [question.key, question]))
  return (items || [])
    .filter((item) => item?.product?.id && inStock(item.product))
    .map((item, order) => ({
      product: item.product,
      percent: Number.isFinite(Number(item.match?.percent)) ? Number(item.match.percent) : null,
      reasons: (item.match?.appliedFilters || []).filter((filter) => filter?.key !== 'category').flatMap((filter) => names(byKey[filter.key], filter.values)),
      order,
    }))
}
