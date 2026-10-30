// Cart writes and reads go through the shared api(), which queues requests for one cart (the store answers 500 to
// overlapping requests on one cart). A 429 is retried once, after the store's Retry-After (seconds, on the error from
// api()) or a short fallback; a 429 means the write was not processed, so resending it is safe.
const FALLBACK_WAIT_MS = 1500

export async function withRetry(send) {
  try {
    return await send()
  } catch (err) {
    if (err.status !== 429) throw err
    await new Promise((resolve) => setTimeout(resolve, err.retryAfter ? err.retryAfter * 1000 : FALLBACK_WAIT_MS))
    return send()
  }
}
