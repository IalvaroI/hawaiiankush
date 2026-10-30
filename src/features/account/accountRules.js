// Rules the account screens share: the password policy from the API spec, email and phone shapes, the 21+ birth
// date, countdown text, the sentences for failed requests, and the only `next` paths sign-in may return to.
import { latestBirthDateFor21 } from '../../lib/format.js'
export { isValidOtp } from './otp.js'

export const PASSWORD_RULES = [
  { id: 'length', label: '8 to 100 characters', test: (value) => value.length >= 8 && value.length <= 100 },
  { id: 'upper', label: 'One uppercase letter', test: (value) => /[A-Z]/.test(value) },
  { id: 'lower', label: 'One lowercase letter', test: (value) => /[a-z]/.test(value) },
  { id: 'digit', label: 'One number', test: (value) => /[0-9]/.test(value) },
  { id: 'chars', label: 'Letters, numbers and punctuation only (no spaces or accents)', test: (value) => /^[\x21-\x7E]+$/.test(value) },
]

export const passwordValid = (value) => PASSWORD_RULES.every((rule) => rule.test(value))
export const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
export const phoneDigits = (value) => value.replace(/\D/g, '')
export const isValidPhone = (digits) => digits.length >= 10 && digits.length <= 15

export function birthDateError(value) {
  if (!value) return 'Enter your date of birth.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !(Date.parse(value) > 0) || value < '1900-01-01') return 'Enter a valid date of birth.'
  if (value > latestBirthDateFor21()) return 'You must be 21 or older to create an account.'
  return ''
}

export function formatBirthDate(value) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

export function formatClock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// Only in-app paths return from sign-in: no protocol-relative or absolute URLs, and never back to sign-in itself.
// Browsers drop tabs and newlines and read a backslash as a slash, so "/\t/evil.example" would leave the site; any
// backslash or control character is refused outright.
export function safeNext(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(raw) || raw.startsWith('/sign-in')) return '/account'
  return raw
}

export function tooManyText(seconds) {
  if (!seconds) return 'Too many attempts. Try again in a few minutes.'
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
}

// Rate limits and connection problems get their own sentence; everything else gets the screen's fallback.
export function failureText(error, fallback) {
  if (error?.status === 429) return tooManyText(error.retryAfter)
  if (error?.status === 0) return 'We could not reach the store. Check your connection and try again.'
  return fallback
}
