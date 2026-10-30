// What a shopper reads when a store request fails. The store's own message is kept only for a 4xx that explains
// itself (a bad promo code, an invalid field). Server faults, sign-in and not-found answers, rate limits and network
// failures get the caller's plain words instead of "Store request failed (500)" or a stack of API jargon.
export const BUSY_MESSAGE = 'The store is busy right now. Try again in a moment.'
export const SIGNED_OUT_MESSAGE = 'Your sign-in has ended. Sign in again to continue.'

// A message the shop itself wrote for the shopper ("Choose a time.", "Check your email before you try again."): shown
// exactly as written. Plain errors without a status are treated as faults and get the caller's fallback instead.
export class ShopperError extends Error {}

export function errorText(error, fallback) {
  if (error instanceof ShopperError) return error.message
  const status = Number(error?.status) || 0
  if (status === 429) return BUSY_MESSAGE
  // The proxy drops the session cookie on a 401, so the shopper is signed out, whatever they were doing.
  if (status === 401) return SIGNED_OUT_MESSAGE
  if (!status || status >= 500 || status === 403 || status === 404) return fallback
  const message = String(error?.message || '').trim()
  return message && !/^Store request failed/.test(message) ? message : fallback
}
