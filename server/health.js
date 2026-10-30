// The deep health check has its own short cache so multiple monitors don't hammer Sweed.
export function createDeepHealthCheck(fetchStore, { ttlMs = 15_000, now = Date.now } = {}) {
  let cached = null

  return async function checkDeepHealth() {
    if (cached && cached.expiresAt > now()) return cached.ok

    let ok = false
    try {
      await fetchStore()
      ok = true
    } catch {
      // A failed read is cached briefly too, so an outage doesn't create a request storm.
    }
    cached = { ok, expiresAt: now() + ttlMs }
    return ok
  }
}
