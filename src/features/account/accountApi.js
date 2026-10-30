import { CART_KEY, STORE_ID } from '../../config.js'
import { storageGet } from '../../lib/storage.js'

// Account calls to the store, through the proxy. Every failure becomes an ApiError with its HTTP status (0 when the
// request never arrived), so each screen words its own message and never echoes server text.
export class ApiError extends Error {
  constructor(status, retryAfter = 0) {
    super(`Request failed (${status})`)
    this.name = 'ApiError'
    this.status = status
    this.retryAfter = retryAfter
  }
}

async function call(method, path, body) {
  let response
  try {
    response = await fetch(`${import.meta.env.BASE_URL}api/v2/stores/${encodeURIComponent(STORE_ID)}${path}`, {
      method,
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0)
  }
  if (response.status === 204) return null
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, Number(response.headers.get('Retry-After')) || 0)
  return payload
}

const id = (value) => encodeURIComponent(value)

export const emailContact = (value) => ({ type: 'email', value })

export const sendOtp = (contact, purpose) => call('POST', '/users/send-otp', { contact, purpose })
export const requestPasswordCode = (email) => sendOtp(emailContact(email), 'setPassword')
export const signIn = (login, password) => call('POST', '/users/sign-in', { login, password })
export const createUser = (body) => call('POST', '/users', body)
export const savePassword = ({ email, otp, password }) => call('POST', '/users/password', { email, otp, password })
export const getUser = (userId) => call('GET', `/users/${id(userId)}`)
export const getSettings = (userId) => call('GET', `/users/${id(userId)}/settings`)
export const deleteUser = (userId, otp) => call('DELETE', `/users/${id(userId)}`, { otp: { value: otp } })
// `current` is the literal the API wants for the signed-in caller's own cart.
export const transferCart = (sourceCartId) => call('PUT', '/carts/current', { sourceCartId, mode: 'merge' })

// Moves the anonymous bag into the account's cart. True when there was nothing to move or the move worked.
// The anonymous cart id is left in place either way; the caller decides what the bag shows next.
export async function bringBagOver() {
  const sourceCartId = storageGet(CART_KEY)
  if (!sourceCartId) return true
  try {
    await transferCart(sourceCartId)
    return true
  } catch {
    return false
  }
}
