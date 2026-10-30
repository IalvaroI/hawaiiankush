// The product finder's questions and ranking (src/features/picker/pickerModel.js).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { questionsFromApi, questionsFromCatalog, rankCandidates, rankedFromApi, readAnswers, strengthOf } from '../../src/features/picker/pickerModel.js'

const pct = (label, value) => ({ label, values: [value], uom: 'percent' })
const mg = (label, value) => ({ label, values: [value], uom: 'milligram' })
const product = (id, extra = {}) => ({ id, name: `P ${id}`, variants: [{ id: `${id}-v`, stock: { quantity: 5 }, ...extra }] })

const catalog = {
  categories: [{ id: 'c-flower', name: 'Flower', images: [{ source: 'https://img/flower.png' }] }, { id: 'c-acc', name: 'Accessories' }, { id: 'c-gift', name: 'Gift Card' }, { id: 'c-ed', name: 'Edibles' }],
  filters: [
    { key: 'effect', options: [{ name: 'Calming', value: 'e1' }, { name: 'Focused', value: 'e2' }] },
    { key: 'flavoring', options: [{ name: 'Coconut', value: 'f1' }, { name: 'Guava', value: 'f2' }] },
  ],
}

describe('questions', () => {
  it('builds the four questions from the catalog, without non-cannabis categories', () => {
    const questions = questionsFromCatalog(catalog)
    assert.deepEqual(questions.map((question) => question.type), ['category', 'effect', 'flavor', 'strength'])
    assert.deepEqual(questions[0].options.map((option) => option.name), ['Flower', 'Edibles'])
    assert.equal(questions[0].options[0].image, 'https://img/flower.png')
    assert.equal(questions[0].optional, false)
    assert.equal(questions[1].max, 2)
  })

  it('reads the store’s own questions, dropping empty ones', () => {
    const questions = questionsFromApi({ questions: [
      { type: 'category', filter: { key: 'category', name: 'Category', options: [{ name: 'Flower', value: 'a1', icon: { image: { source: 'https://i/a1.png' } } }] } },
      { type: 'flavor', filter: { key: 'flavor', name: 'Flavor', options: [] } },
    ] })
    assert.equal(questions.length, 1)
    assert.deepEqual(questions[0].options[0], { name: 'Flower', value: 'a1', image: 'https://i/a1.png' })
  })

  it('keeps only known answers from the URL, up to each question’s limit', () => {
    const questions = questionsFromCatalog(catalog)
    const answers = readAnswers(new URLSearchParams('category=c-flower,c-ed&effect=e1,e2,zz&strength=strong'), questions)
    assert.deepEqual(answers, { category: ['c-flower'], effect: ['e1', 'e2'], strength: ['strong'] })
  })
})

describe('strengthOf', () => {
  it('buckets Total THC by percent or milligrams', () => {
    assert.equal(strengthOf({ compounds: { thc: [pct('THC', 1), pct('THCA', 30)] } }), 'strong')
    assert.equal(strengthOf({ compounds: { thc: [pct('Total THC', 18)] } }), 'balanced')
    assert.equal(strengthOf({ compounds: { thc: [pct('THC', 12)] } }), 'mild')
    assert.equal(strengthOf({ compounds: { thc: [mg('THC', 100)] } }), 'strong')
    assert.equal(strengthOf({ compounds: { thc: [mg('THC', 5)] } }), 'mild')
    // The boundaries as the notes put them: 10 mg is Balanced, 50 mg still is.
    assert.equal(strengthOf({ compounds: { thc: [mg('THC', 10)] } }), 'balanced')
    assert.equal(strengthOf({ compounds: { thc: [mg('THC', 50)] } }), 'balanced')
    assert.equal(strengthOf({ compounds: { thc: [] } }), null)
  })
})

describe('rankCandidates', () => {
  const questions = questionsFromCatalog(catalog)
  const extras = {
    a: { effects: ['Calming'], flavorings: ['Coconut'], compounds: { 'a-v': { thc: [pct('THCA', 30)], cbd: [], terpenes: [] } } },
    b: { effects: ['Calming'], flavorings: [], compounds: {} },
    c: { effects: ['Focused'], flavorings: ['Guava'], compounds: {} },
    d: { effects: [], flavorings: [], compounds: {} },
  }
  const candidates = ['d', 'c', 'b', 'a'].map((id, index) => ({ product: product(id), percent: 96 - index }))

  it('puts the products that meet the most answers first, with the reasons', () => {
    const { items, full } = rankCandidates({ candidates, answers: { effect: ['e1'], flavor: ['f1'], strength: ['strong'] }, questions, extras, minimum: 1 })
    assert.equal(full, 1)
    assert.deepEqual(items.map((item) => item.product.id), ['a', 'b'])
    assert.deepEqual(items[0].reasons, ['Calming', 'Coconut', 'Strong'])
    assert.equal(items[0].percent, Math.round(0.4 * 93 + 60))
  })

  it('falls back to the best partial matches when too few meet any answer, and skips sold-out products', () => {
    const soldOut = { product: { ...product('z'), variants: [{ id: 'z-v', stock: { quantity: 0 } }] }, percent: 99 }
    const { items, full } = rankCandidates({ candidates: [soldOut, ...candidates], answers: { flavor: ['f2'] }, questions, extras, minimum: 4 })
    assert.equal(full, 1)
    assert.equal(items[0].product.id, 'c')
    assert.ok(!items.some((item) => item.product.id === 'z'))
    assert.equal(items.find((item) => item.product.id === 'd').percent, null)
  })

  it('judges strength on the size the card shows, never on another size', () => {
    // Two sizes: the smaller (shown first) is mild, the larger strong.
    const pack = (count) => ({ itemSize: { value: 5, uom: 'milligram' }, itemsCount: count })
    const twoSizes = { id: 'e', name: 'P e', variants: [
      { id: 'e-big', package: pack(20), stock: { quantity: 5 }, compounds: { thc: [mg('THC', 100)] } },
      { id: 'e-small', package: pack(1), stock: { quantity: 5 }, compounds: { thc: [mg('THC', 5)] } },
    ] }
    const asked = { answers: { strength: ['strong'] }, questions, extras: {}, minimum: 1 }
    const { items, full } = rankCandidates({ candidates: [{ product: twoSizes, percent: 90 }], ...asked })
    assert.equal(full, 0)
    assert.deepEqual(items[0].reasons, [])
    const { full: strong } = rankCandidates({ candidates: [{ product: product('a'), percent: 90 }], ...asked, extras })
    assert.equal(strong, 1)
  })

  it('scores a product the store gave no percent for on the same scale as the others', () => {
    const { items } = rankCandidates({ candidates: [{ product: product('a') }, { product: product('b'), percent: 100 }], answers: { effect: ['e1'] }, questions, extras, minimum: 1 })
    assert.deepEqual(items.map((item) => [item.product.id, item.percent]), [['b', 100], ['a', 80]])
  })

  it('keeps the store’s order and score when only the category was answered', () => {
    const { items } = rankCandidates({ candidates, answers: { category: ['c-flower'] }, questions, extras })
    assert.deepEqual(items.map((item) => [item.product.id, item.percent]), [['d', 96], ['c', 95], ['b', 94], ['a', 93]])
  })
})

describe('rankedFromApi', () => {
  it('maps Sweed’s ranked items and names the answers that matched', () => {
    const questions = questionsFromApi({ questions: [{ type: 'effect', filter: { key: 'effect', name: 'Effect', options: [{ name: 'Calming', value: 'x1', icon: {} }] } }] })
    const ranked = rankedFromApi([{ product: product('a'), match: { percent: '92', appliedFilters: [{ key: 'category', values: ['c'] }, { key: 'effect', values: ['x1'] }] } }], questions)
    assert.deepEqual([ranked[0].percent, ranked[0].reasons], [92, ['Calming']])
  })
})
