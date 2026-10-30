// In-memory sliding-log limiter. Keeps only hit times inside each window and drops empty keys, so memory tracks recent clients.
// State is per process: a restart or a second instance starts counting again.
const SWEEP_EVERY_MS = 60 * 1000

export function createRateLimiter() {
  const log = new Map()
  let lastSweep = Date.now()

  function sweep(now) {
    for (const [key, entry] of log) {
      entry.hits = entry.hits.filter((at) => now - at < entry.windowMs)
      if (!entry.hits.length) log.delete(key)
    }
    lastSweep = now
  }

  // Returns { ok: true }, or { ok: false, retryAfter } with the seconds until the oldest hit leaves the window.
  // With `record` false the hit is not counted (a check before the outcome is known; count it with a later call).
  return function check(key, limit, windowMs, { record = true } = {}) {
    const now = Date.now()
    if (now - lastSweep >= SWEEP_EVERY_MS) sweep(now)
    const entry = log.get(key) || { hits: [], windowMs }
    entry.hits = entry.hits.filter((at) => now - at < windowMs)
    if (entry.hits.length >= limit) {
      log.set(key, entry)
      return { ok: false, retryAfter: Math.max(1, Math.ceil((entry.hits[0] + windowMs - now) / 1000)) }
    }
    if (record) entry.hits.push(now)
    log.set(key, entry)
    return { ok: true }
  }
}
