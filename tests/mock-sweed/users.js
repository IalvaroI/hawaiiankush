// Accounts for the Sweed mock: one-time codes, sign-in, sign-up with a registration token, profile and settings.
//
// Test accounts (the only ones that exist; the mock never sends email or text):
// - known@example.com: signs in with the code 123456 or the password Known-Pass1. Has two seeded orders.
// - lapse@example.com and resume@example.com: accounts with nothing seeded, for tests that need a bag of their own
//   (tests run in parallel, and an account has one bag).
// - new@example.com, or any other unknown address: the code 123456 gives a registration token, so sign-up runs.
// Any other code is a 400. A wrong password is a 401.
import { randomBytes } from 'node:crypto'
import { fail, NO_CONTENT } from './http.js'

export const TEST_CODE = '123456'
const TOKEN_TTL_MS = 60 * 60 * 1000
const RESEND_GAP_MS = 60 * 1000
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,100}$/

const hex = (bytes) => randomBytes(bytes).toString('hex')

export function createUsers() {
  const users = new Map()
  const tokens = new Map()

  function addUser(seed) {
    const user = { currentCartId: null, phone: null, password: null, birthDate: null, ...seed }
    users.set(user.id, user)
    return user
  }
  addUser({ id: 'user-known', email: 'known@example.com', password: 'Known-Pass1', firstName: 'Kai', lastName: 'Akana', birthDate: '1990-04-12', phone: '8085550142' })
  addUser({ id: 'user-lapse', email: 'lapse@example.com', firstName: 'Lani', lastName: 'Kahale', birthDate: '1988-07-02', phone: '8085550177' })
  addUser({ id: 'user-resume', email: 'resume@example.com', firstName: 'Noa', lastName: 'Makoa', birthDate: '1992-11-20', phone: '8085550188' })

  const byEmail = (email) => [...users.values()].find((user) => user.email === email.toLowerCase()) || null

  function issue(type, userId, email) {
    const token = { value: hex(24), type, userId, email, expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString() }
    tokens.set(token.value, token)
    return { value: token.value, tokenType: type, expiresAt: token.expiresAt }
  }

  // The bearer token behind an Authorization header: null when there is none, an error when it does not match a live token.
  function authOf(header) {
    if (!header) return null
    const match = /^Bearer\s+(.+)$/i.exec(header)
    const token = match && tokens.get(match[1].trim())
    if (!token || Date.parse(token.expiresAt) <= Date.now()) throw fail(401, 'The token is not valid.')
    return token
  }

  // Same, but a bad token counts as no token (for the routes that work without one).
  function authOrNull(header) {
    try { return authOf(header) } catch { return null }
  }

  // Codes the mock accepts are the test code; the storefront only needs the response, so nothing is sent.
  function sendOtp(body) {
    const contact = body.contact || {}
    const purpose = body.purpose
    const validEmail = contact.type === 'email' && EMAIL.test(String(contact.value || ''))
    const validPhone = contact.type === 'phone' && /^\d{10,15}$/.test(String(contact.value || ''))
    if (purpose === 'phoneNumberVerification' ? !validPhone : !validEmail) throw fail(400, 'That contact does not fit this code.')
    return { expiresAt: new Date(Date.now() + RESEND_GAP_MS).toISOString() }
  }

  function signIn(body) {
    const login = body.login || {}
    const password = body.password || {}
    if (login.type !== 'email' || !EMAIL.test(String(login.value || ''))) throw fail(400, 'Enter an email address.')
    const email = login.value.toLowerCase()
    const user = byEmail(email)
    if (password.type === 'otp') {
      if (password.value !== TEST_CODE) throw fail(400, 'The code is not valid.')
      if (user) return { token: issue('auth', user.id, email), userId: user.id }
      return { token: issue('registration', null, email), userId: 'current' }
    }
    if (password.type === 'password') {
      if (!user || user.password !== password.value) throw fail(401, 'Email or password is incorrect.')
      return { token: issue('auth', user.id, email), userId: user.id }
    }
    throw fail(400, 'Unknown sign-in method.')
  }

  function setPassword(body) {
    if (body.otp !== TEST_CODE) throw fail(400, 'The code is not valid.')
    const user = byEmail(String(body.email || ''))
    if (!user) throw fail(400, 'No account for that email.')
    if (!PASSWORD.test(String(body.password || ''))) throw fail(400, 'The password does not meet the rules.')
    user.password = body.password
    return NO_CONTENT
  }

  // Sign-up with a registration token. The token is spent on success and the account gets an auth token.
  function create(body, auth) {
    if (auth?.type !== 'registration') throw fail(401, 'Sign-up expired. Start again.')
    const firstName = String(body.firstName || '').trim()
    const lastName = String(body.lastName || '').trim()
    if (!firstName || !lastName) throw fail(400, 'First and last name are required.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.birthDate || ''))) throw fail(400, 'Date of birth is required.')
    const cutoff = new Date()
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 21)
    if (new Date(`${body.birthDate}T00:00:00Z`) > cutoff) throw fail(400, 'The account holder must be 21 or older.')
    const phone = body.phone?.value ? String(body.phone.value).replace(/\D/g, '') : null
    if (phone && phone.length < 10) throw fail(400, 'Enter a phone number with area code.')
    if (body.password && !PASSWORD.test(body.password)) throw fail(400, 'The password does not meet the rules.')
    if (byEmail(auth.email)) throw fail(400, 'An account already exists for that email.')
    const user = addUser({
      id: `user-${hex(6)}`,
      email: auth.email,
      firstName,
      lastName,
      birthDate: body.birthDate,
      phone,
      password: body.password || null,
    })
    tokens.delete(auth.value)
    return { userId: user.id, token: issue('auth', user.id, user.email) }
  }

  function ownAccount(id, auth) {
    if (auth?.type !== 'auth' || auth.userId !== id) throw fail(404, 'User not found.')
    const user = users.get(id)
    if (!user) throw fail(404, 'User not found.')
    return user
  }

  function view(user) {
    const contacts = [{ type: 'email', value: user.email, verificationStatus: 'verified' }]
    if (user.phone) contacts.push({ type: 'phone', value: user.phone, verificationStatus: 'verified' })
    return {
      id: user.id,
      login: { type: 'email', value: user.email },
      hasPassword: Boolean(user.password),
      name: { firstName: user.firstName || null, lastName: user.lastName || null },
      birthDate: user.birthDate || null,
      contacts,
    }
  }

  function get(id, auth) {
    return { user: view(ownAccount(id, auth)) }
  }

  function settings(id, auth) {
    ownAccount(id, auth)
    const notify = (method) => [{ method, enabled: true }]
    return { settings: { notifications: { promotions: notify('email'), transactions: notify('email') } } }
  }

  function remove(id, auth, body) {
    const user = ownAccount(id, auth)
    if (body?.otp?.value !== TEST_CODE) throw fail(400, 'The code is not valid.')
    users.delete(user.id)
    return NO_CONTENT
  }

  return {
    sendOtp, signIn, setPassword, create, get, settings, remove, authOf, authOrNull,
    userById: (id) => users.get(id) || null,
    byEmail,
  }
}
