import test from 'node:test'
import assert from 'node:assert/strict'
import { createDeepHealthCheck } from './health.js'

test('deep health caches a successful store read', async () => {
  let now = 100
  let calls = 0
  const check = createDeepHealthCheck(async () => { calls += 1 }, { ttlMs: 20, now: () => now })

  assert.equal(await check(), true)
  now += 10
  assert.equal(await check(), true)
  assert.equal(calls, 1)

  now += 11
  assert.equal(await check(), true)
  assert.equal(calls, 2)
})

test('deep health caches a failed store read briefly, then retries', async () => {
  let now = 100
  let calls = 0
  let reachable = false
  const check = createDeepHealthCheck(async () => {
    calls += 1
    if (!reachable) throw new Error('upstream unavailable')
  }, { ttlMs: 20, now: () => now })

  assert.equal(await check(), false)
  reachable = true
  now += 10
  assert.equal(await check(), false)
  assert.equal(calls, 1)

  now += 11
  assert.equal(await check(), true)
  assert.equal(calls, 2)
})
