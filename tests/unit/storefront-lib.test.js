// Pure storefront helpers: no React, no browser, no import.meta.env (modules that read those are covered by e2e).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { moodOf } from '../../src/lib/effects.js'
import { BUSY_MESSAGE, errorText, ShopperError, SIGNED_OUT_MESSAGE } from '../../src/lib/errors.js'
import { mergeEntries } from '../../src/lib/catalog.js'
import { clearFacets, DEFAULT_SORT, facetValues, normalizeSort, readCatalogQuery, setFacetValues, sortLabel } from '../../src/routes/catalogQuery.js'

describe('moodOf', () => {
  it('groups known effects by mood, case-insensitively', () => {
    assert.equal(moodOf('Relaxed'), 'calm')
    assert.equal(moodOf('ENERGETIC'), 'energy')
    assert.equal(moodOf('Sleepy'), 'sleep')
    assert.equal(moodOf('Euphoric'), 'euphoric')
    assert.equal(moodOf('Focused'), 'focus')
  })

  it('leaves unknown effects untinted', () => {
    assert.equal(moodOf('Hungry'), undefined)
    assert.equal(moodOf(undefined), undefined)
  })
})

describe('mergeEntries', () => {
  it('keeps one card per product and every distinct variant', () => {
    const merged = mergeEntries([
      { id: 'p1', name: 'A', variants: [{ id: 'v1' }] },
      { id: 'p2', name: 'B', variants: [{ id: 'v2' }] },
      { id: 'p1', name: 'A', variants: [{ id: 'v1' }, { id: 'v3' }] },
    ])
    assert.deepEqual(merged.map((item) => item.id), ['p1', 'p2'])
    assert.deepEqual(merged[0].variants.map((variant) => variant.id), ['v1', 'v3'])
  })

  it('skips entries without an id and tolerates an empty list', () => {
    assert.deepEqual(mergeEntries([{ name: 'no id' }, null]), [])
    assert.deepEqual(mergeEntries(undefined), [])
  })

  it('does not change the entries it was given', () => {
    const first = { id: 'p1', variants: [{ id: 'v1' }] }
    mergeEntries([first, { id: 'p1', variants: [{ id: 'v2' }] }])
    assert.deepEqual(first.variants, [{ id: 'v1' }])
  })
})

describe('catalog query', () => {
  it('maps old sort names onto the API values and falls back to the default', () => {
    assert.equal(normalizeSort('mostPopular'), 'popularityDesc')
    assert.equal(normalizeSort('priceAscending'), 'priceAsc')
    assert.equal(normalizeSort('newest'), 'createdDesc')
    assert.equal(normalizeSort('thcPercentAsc'), 'thcPercentAsc')
    assert.equal(normalizeSort(''), DEFAULT_SORT)
    assert.equal(normalizeSort(undefined), DEFAULT_SORT)
  })

  it('labels the THC sorts the way the shop wants and shows the API name for the rest', () => {
    assert.equal(sortLabel({ value: 'thcPercentDesc', name: 'Sweed label' }), 'THC: high to low')
    assert.equal(sortLabel({ value: 'priceAsc', name: 'Price low to high' }), 'Price low to high')
  })

  it('reads the search, the sort and every filter from the query string', () => {
    const query = readCatalogQuery(new URLSearchParams('q=%20kush%20&sort=priceAscending&f.brand=a,b&f.effect=c&f.empty=&other=1'))
    assert.equal(query.search, 'kush')
    assert.equal(query.sort, 'priceAsc')
    assert.deepEqual(query.selected, { brand: ['a', 'b'], effect: ['c'] })
  })

  it('reads, sets and clears one facet without touching the others', () => {
    const params = new URLSearchParams('f.brand=a&f.effect=c&q=x')
    assert.deepEqual(facetValues(params, 'brand'), ['a'])
    assert.deepEqual(facetValues(params, 'missing'), [])
    setFacetValues(params, 'brand', ['a', 'b'])
    assert.equal(params.get('f.brand'), 'a,b')
    setFacetValues(params, 'brand', [])
    assert.equal(params.has('f.brand'), false)
    clearFacets(params)
    assert.equal(params.has('f.effect'), false)
    assert.equal(params.get('q'), 'x')
  })
})

describe('errorText', () => {
  const failed = (status, message) => Object.assign(new Error(message), { status })
  it('keeps a 4xx message that explains itself', () => {
    assert.equal(errorText(failed(400, 'Promo code WELCOME5 is not valid'), 'Try again.'), 'Promo code WELCOME5 is not valid')
  })
  it('uses plain words for server faults, network failures and generic messages', () => {
    assert.equal(errorText(failed(500, 'Internal error at Sweed.Api'), 'Try again.'), 'Try again.')
    assert.equal(errorText(new TypeError('Failed to fetch'), 'Try again.'), 'Try again.')
    // A 401 is a sign-in that has ended, whatever the caller was doing.
    assert.equal(errorText(failed(401, 'Unauthorized'), 'Try again.'), SIGNED_OUT_MESSAGE)
    assert.equal(errorText(failed(400, 'Store request failed (400)'), 'Try again.'), 'Try again.')
    assert.equal(errorText(failed(404, 'Not Found'), 'Try again.'), 'Try again.')
  })
  it('says the store is busy on a 429', () => {
    assert.equal(errorText(failed(429, 'Too many requests'), 'Try again.'), BUSY_MESSAGE)
  })
  it('shows a message the shop wrote for the shopper exactly as written', () => {
    assert.equal(errorText(new ShopperError('Choose a time.'), 'Try again.'), 'Choose a time.')
    // A plain error without a status is still treated as a fault.
    assert.equal(errorText(new Error('The store did not return a cart ID.'), 'Try again.'), 'Try again.')
  })
})
