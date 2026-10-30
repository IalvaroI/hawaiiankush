import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { withRetry } from '../../src/features/cart/cartRequest.js'

describe('withRetry', () => {
  it('returns the answer when the first try works', async () => {
    assert.equal(await withRetry(async () => 'ok'), 'ok')
  })

  it('does not retry other failures', async () => {
    let calls = 0
    await assert.rejects(withRetry(async () => { calls += 1; throw Object.assign(new Error('gone'), { status: 404 }) }), { status: 404 })
    assert.equal(calls, 1)
  })

  it('retries a 429 once, after the Retry-After the store gave', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    try {
      let calls = 0
      const pending = withRetry(async () => {
        calls += 1
        if (calls === 1) throw Object.assign(new Error('busy'), { status: 429, retryAfter: 2 })
        return 'sent'
      })
      // Let the first attempt fail and the retry wait start, then move the fake clock past Retry-After.
      await new Promise((resolve) => setImmediate(resolve))
      mock.timers.tick(2000)
      assert.equal(await pending, 'sent')
      assert.equal(calls, 2)
    } finally {
      mock.timers.reset()
    }
  })
})
