import { test } from 'node:test'
import assert from 'node:assert/strict'
import { joinSlugId, slugify, splitSlugId } from './slug.js'

test('slugify lowercases, strips accents and collapses punctuation', () => {
  assert.equal(slugify('Crème Brûlée Gummies!'), 'creme-brulee-gummies')
  assert.equal(slugify('  --Sour  Patch__Kids--  '), 'sour-patch-kids')
})

test('slugify spells out ampersands', () => {
  assert.equal(slugify('Gummies & Chews'), 'gummies-and-chews')
  assert.equal(slugify('Q&A'), 'q-and-a')
})

test('slugify falls back to item when nothing usable is left', () => {
  assert.equal(slugify(''), 'item')
  assert.equal(slugify(null), 'item')
  assert.equal(slugify('!!! ???'), 'item')
})

test('slugify caps length and never ends on a hyphen', () => {
  assert.equal(slugify(`${'a'.repeat(59)} b`), 'a'.repeat(59))
  const long = slugify('word '.repeat(40))
  assert.ok(long.length <= 60)
  assert.ok(!long.endsWith('-'))
})

test('joinSlugId builds the slug-id segment', () => {
  assert.equal(joinSlugId('Edibles', 'ch2y'), 'edibles-ch2y')
  assert.equal(joinSlugId('Gummies & Chews', 'abc123'), 'gummies-and-chews-abc123')
})

test('splitSlugId takes the id after the last hyphen', () => {
  assert.deepEqual(splitSlugId('gummies-coconut-sour-ch2y'), { slug: 'gummies-coconut-sour', id: 'ch2y' })
  assert.deepEqual(splitSlugId('ch2y'), { slug: '', id: 'ch2y' })
  assert.deepEqual(splitSlugId('a-b-c'), { slug: 'a-b', id: 'c' })
})

test('splitSlugId reverses joinSlugId', () => {
  const segment = joinSlugId('Mountain Co.', 'b7x9')
  assert.deepEqual(splitSlugId(segment), { slug: 'mountain-co', id: 'b7x9' })
})
