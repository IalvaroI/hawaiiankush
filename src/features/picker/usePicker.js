import { useEffect, useState } from 'react'
import { api } from '../../api/client.js'
import { DEMO_MODE, SALE_TYPE } from '../../config.js'
import { questionsFromApi, questionsFromCatalog, rankCandidates, rankedFromApi } from './pickerModel.js'

const scope = `Scope.SaleType=${encodeURIComponent(SALE_TYPE)}`
const CATALOG_PAGES = 3
const PAGE_SIZE = 20
const ENRICH_CHUNK = 24

// One load per page visit: the store's questions when its AI-Picker answers, the catalog's otherwise.
let questionsCache = null

// Resolves to { source: 'store' | 'catalog', questions }. `categories` is the store's category list (with images).
async function loadQuestions(categories) {
  if (questionsCache) return questionsCache
  try {
    const body = await api(`/upsells/ai-picker?${scope}`)
    const questions = questionsFromApi(body?.aiPicker)
    if (questions.some((question) => question.type === 'category')) {
      questionsCache = { source: 'store', questions }
      return questionsCache
    }
  } catch {
    // Not configured (404) or failing (the demo store answers 500): build the questions from the catalog instead.
  }
  const sample = await api(`/products?${scope}&Pagination.Page=1&Pagination.PageSize=1`)
  questionsCache = { source: 'catalog', questions: questionsFromCatalog({ categories, filters: sample?.filters || [] }) }
  return questionsCache
}

export function usePickerQuestions(categories) {
  const [state, setState] = useState({ status: 'loading' })
  const ready = DEMO_MODE || categories.length > 0
  useEffect(() => {
    if (!ready) return undefined
    let active = true
    loadQuestions(categories)
      .then((loaded) => { if (active) setState({ status: 'ready', ...loaded }) })
      .catch(() => { if (active) setState({ status: 'failed' }) })
    return () => { active = false }
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

const filterQuery = (question, values) => `filters.${encodeURIComponent(question.key)}=${values.map(encodeURIComponent).join(',')}`

function mergeRelations(list) {
  const merged = { brands: [], strains: [] }
  for (const relations of list) {
    merged.brands.push(...(relations?.brands || []))
    merged.strains.push(...(relations?.strains || []))
  }
  return merged
}

// Effects, flavours and lab figures for the candidates, from the server's enrichment lookup (server/enrich.js).
async function loadExtras(ids) {
  const extras = {}
  for (let start = 0; start < ids.length; start += ENRICH_CHUNK) {
    const chunk = ids.slice(start, start + ENRICH_CHUNK)
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/enrich?ids=${chunk.join(',')}&saleType=${encodeURIComponent(SALE_TYPE)}`, { headers: { accept: 'application/json' } })
      if (response.ok) Object.assign(extras, (await response.json())?.items || {})
    } catch {
      // A chunk that fails only loses its products' effect, flavour and strength matches.
    }
  }
  return extras
}

// With the store's questions, its own ranking is used as it is. With catalog questions, Sweed ranks the category
// (when its AI-Picker products endpoint answers) and the catalog adds the rest of that category; both are then
// ranked here against the effect, flavour and strength answers.
async function loadResults({ source, questions, answers }) {
  const byType = Object.fromEntries(questions.map((question) => [question.type, question]))
  if (source === 'store') {
    const query = questions.filter((question) => answers[question.type]?.length).map((question) => filterQuery(question, answers[question.type])).join('&')
    const body = await api(`/upsells/ai-picker/products?${query}&${scope}`)
    // The store's ranking speaks for itself: `full` is null, so no "closest picks" note.
    return { items: rankedFromApi(body?.items, questions).slice(0, 12), full: null, relations: body?.relations }
  }
  const category = answers.category?.[0]
  const categoryFilter = filterQuery(byType.category, [category])
  const [picked, ...pages] = await Promise.all([
    api(`/upsells/ai-picker/products?${categoryFilter}&${scope}`).catch(() => null),
    ...Array.from({ length: CATALOG_PAGES }, (_, index) => api(`/products?${categoryFilter}&${scope}&Pagination.Page=${index + 1}&Pagination.PageSize=${PAGE_SIZE}`).catch(() => null)),
  ])
  const candidates = [
    ...(picked?.items || []).map((item) => ({ product: item.product, percent: item.match?.percent })),
    ...pages.flatMap((page) => page?.items || []).map((product) => ({ product })),
  ]
  if (!candidates.length && pages.every((page) => page === null)) throw new Error('The menu could not be loaded.')
  const ids = [...new Set(candidates.map((candidate) => String(candidate.product?.id || '')).filter(Boolean))]
  const extras = await loadExtras(ids)
  const ranked = rankCandidates({ candidates, answers, questions, extras })
  return { ...ranked, relations: mergeRelations([picked?.relations, ...pages.map((page) => page?.relations)]) }
}

export function usePickerResults(loaded, answers, enabled) {
  const [state, setState] = useState({ status: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const key = JSON.stringify(answers)
  useEffect(() => {
    if (!enabled || loaded.status !== 'ready') return undefined
    let active = true
    setState({ status: 'loading' })
    loadResults({ source: loaded.source, questions: loaded.questions, answers })
      .then((result) => { if (active) setState({ status: 'ready', ...result }) })
      .catch(() => { if (active) setState({ status: 'failed' }) })
    return () => { active = false }
  }, [enabled, loaded.status, key, attempt]) // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, retry: () => setAttempt((value) => value + 1) }
}
