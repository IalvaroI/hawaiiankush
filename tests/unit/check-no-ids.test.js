import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { findIdsInText } from '../../scripts/check-no-ids.mjs'

describe('check:ids detector', () => {
  it('flags an 18 to 21 character alphanumeric token with letters and digits inside a string', () => {
    const hits = findIdsInText('const id = "k4itylpt08lsofnlvc"', 'a.js')
    assert.deepEqual(hits, [{ file: 'a.js', line: 1, token: 'k4itylpt08lsofnlvc' }])
  })

  it('finds the id inside a path or a template literal', () => {
    const hits = findIdsInText('fetch(`/products/nerkwalazk1of1c9er?x=1`)', 'b.js')
    assert.equal(hits.length, 1)
    assert.equal(hits[0].token, 'nerkwalazk1of1c9er')
  })

  it('ignores words, plain numbers and tokens outside the length range', () => {
    const text = 'const a = "Flower"; const b = "123456789012345678"; const c = "abcdefghijklmnop1"; const d = "short1"; const e = "abcdefghijklmnopqrstuvwxyz1"'
    assert.deepEqual(findIdsInText(text, 'c.js'), [])
  })

  it('reports the right line number', () => {
    const hits = findIdsInText('one\ntwo\n"k4itylpt08lsofnlvc"', 'd.js')
    assert.equal(hits[0].line, 3)
  })
})
