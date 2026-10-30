import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { bySize } from '../../src/lib/sizes.js'

const size = (id, value, uom, itemsCount = 1) => ({ id, package: { itemSize: { value, uom }, itemsCount } })
const ids = (variants) => bySize(variants).map((variant) => variant.id)

describe('bySize', () => {
  it('orders sizes from smallest to largest', () => {
    assert.deepEqual(ids([size('a', 3.5, 'gram'), size('b', 1, 'gram'), size('c', 14, 'gram'), size('d', 7, 'gram')]), ['b', 'a', 'd', 'c'])
  })

  it('compares packs by their total and units within a kind', () => {
    assert.deepEqual(ids([size('pack', 10, 'milligram', 10), size('single', 5, 'milligram'), size('gram', 1, 'gram')]), ['single', 'pack', 'gram'])
    assert.deepEqual(ids([size('oz', 1, 'fluidOunce'), size('ml', 20, 'milliliter')]), ['ml', 'oz'])
  })

  it('keeps unmeasured sizes in their order, after the measured ones', () => {
    assert.deepEqual(ids([{ id: 'x' }, size('b', 2, 'gram'), { id: 'y' }, size('a', 1, 'gram')]), ['a', 'b', 'x', 'y'])
    assert.deepEqual(ids([{ id: 'x' }, { id: 'y' }]), ['x', 'y'])
  })
})
