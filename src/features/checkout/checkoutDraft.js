import { CART_KEY, EMPTY_GUEST, GUEST_KEY, STORE_TIME_ZONE } from '../../config.js'
import { latestBirthDateFor21, readable } from '../../lib/format.js'
import { sessionGet, sessionSet } from '../../lib/storage.js'
import { dayLabel as storeDayLabel, windowOver } from '../../lib/storeTime.js'

// Sign-in is not built yet, so every checkout here is for an anonymous cart. Guest contact data goes with every
// PATCH, loyalty points never do, and the loyalty section stays hidden.
// Whether the shopper is signed in, set by CheckoutPage from the session. Signed in, Sweed uses the account's contact
// data (no guest step) and loyalty points can be redeemed; as a guest, every update carries the guest contact.
let signedIn = false
export function setSignedIn(value) { signedIn = Boolean(value) }
export const isGuestCheckout = () => !signedIn

export const DRAFT_KEY = `${CART_KEY}:checkout`

// Steps in order. Every step but the review is saved with PATCH before the next one opens.
export const STEPS = ['contact', 'fulfillment', 'time', 'payment', 'review']
export const STEP_TITLES = { contact: 'Contact', fulfillment: 'Pickup or delivery', time: 'Time', payment: 'Payment', review: 'Review and place order' }

const PICKUP_ORDER = ['inStorePickup', 'curbside', 'driveThrough']
export const FULFILLMENT = {
  inStorePickup: { label: 'In-store pickup', hint: 'Walk in and collect at the counter' },
  curbside: { label: 'Curbside pickup', hint: 'Park in a pickup spot and we bring it out' },
  driveThrough: { label: 'Drive-through', hint: 'Collect from your car in the drive-through' },
  delivery: { label: 'Delivery', hint: 'We bring it to your door' },
}

const PAYMENT_LABELS = { aeropay: 'Aeropay', stronghold: 'Stronghold', kindTap: 'KindTap' }

export const AVAILABILITY_TEXT = {
  limits: 'Over the purchase limit — remove some items',
  outOfStock: 'Something sold out since you added it — remove it',
  saleTypeMismatch: "Some items aren't available for this sale type",
  exclusiveAccessRequired: 'Members only — sign in',
  unknown: "Checkout isn't available right now",
}
export const availabilityText = (reason) => AVAILABILITY_TEXT[reason] || AVAILABILITY_TEXT.unknown

export const fulfillmentLabel = (value) => FULFILLMENT[value]?.label || readable(value)

export function paymentLabel(type, delivering) {
  if (type === 'payOnSite') return delivering ? 'Pay on delivery' : 'Pay at pickup'
  return PAYMENT_LABELS[type] || readable(type || '')
}

// Options come as `type` = the method itself (inStorePickup, curbside, driveThrough, delivery). Older responses wrap
// pickups as { type: 'pickup', pickupType }, so both shapes are accepted. Pickups first, delivery last.
export function fulfillmentChoices(items = []) {
  const rank = (value) => (value === 'delivery' ? 100 : PICKUP_ORDER.includes(value) ? PICKUP_ORDER.indexOf(value) : 50)
  const values = items.map((item) => (item.type === 'pickup' ? item.pickupType || 'inStorePickup' : item.type)).filter(Boolean)
  return [...new Set(values)].sort((a, b) => rank(a) - rank(b))
}

// ---- Time windows ------------------------------------------------------------------------------------------------

const pad = (number) => String(number).padStart(2, '0')

export function clockText(time) {
  const [hours, minutes = '0'] = String(time).split(':')
  const hour = Number(hours)
  return `${hour % 12 || 12}:${pad(Number(minutes))} ${hour < 12 ? 'AM' : 'PM'}`
}

export function windowRange(interval) {
  const to = String(interval.to).startsWith('00:00') ? 'midnight' : clockText(interval.to)
  return `${clockText(interval.from)} – ${to}`
}

// "Today" and "Tomorrow" by the store's calendar (see storeTime.js), otherwise the weekday and date.
export const dayLabel = (ymd, now) => storeDayLabel(ymd, STORE_TIME_ZONE, now)

// Windows grouped by date; inside a date the ASAP window comes first, then by start time.
export function groupTimeWindows(items = []) {
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date) || Number(b.isAsap) - Number(a.isAsap) || a.interval.from.localeCompare(b.interval.from))
  const groups = []
  for (const window of sorted) {
    const last = groups.at(-1)
    if (last && last.date === window.date) last.windows.push(window)
    else groups.push({ date: window.date, windows: [window] })
  }
  return groups
}

export const windowLabel = (window) => (window.isAsap ? `ASAP · ${windowRange(window.interval)}` : windowRange(window.interval))
export const windowSummary = (window, now) => `${dayLabel(window.date, now)} · ${windowLabel(window)}`

// Whether a time window is over by the store's clock (a draft kept in a tab left open past it).
export const windowEnded = (window, now) => windowOver(window, STORE_TIME_ZONE, now)

// The delivery address as one line, the second line (unit, suite) after a comma.
export const addressText = (draft) => [String(draft?.address || '').trim(), String(draft?.secondaryAddress || '').trim()].filter(Boolean).join(', ')

// ---- Contact -----------------------------------------------------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function contactErrors(guest) {
  const errors = {}
  const first = String(guest.firstName || '').trim()
  const last = String(guest.lastName || '').trim()
  const email = String(guest.email || '').trim()
  const phone = String(guest.phone || '').trim()
  if (!first) errors.firstName = 'Enter your first name.'
  if (!last) errors.lastName = 'Enter your last name.'
  if (!email) errors.email = 'Enter your email address.'
  else if (!EMAIL.test(email)) errors.email = 'Check the email address. It should look like name@example.com.'
  if (!phone) errors.phone = 'Enter your phone number.'
  else if (phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter a phone number with at least 10 digits.'
  if (!guest.birthDate) errors.birthDate = 'Enter your date of birth.'
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(guest.birthDate) || guest.birthDate > latestBirthDateFor21()) errors.birthDate = 'Check your date of birth. You must be 21 or older.'
  return errors
}

export function trimGuest(guest) {
  return Object.fromEntries(Object.keys(EMPTY_GUEST).map((key) => [key, String(guest[key] ?? '').trim()]))
}

// Blanks in the typed contact are filled from what the store already holds; anything typed wins.
export function fillBlankGuest(current, stored) {
  return Object.fromEntries(Object.keys(EMPTY_GUEST).map((key) => [key, current[key] || stored[key] || '']))
}

export function readGuest() {
  try { return { ...EMPTY_GUEST, ...JSON.parse(sessionGet(GUEST_KEY) || '{}') } }
  catch { return { ...EMPTY_GUEST } }
}

export const writeGuest = (guest) => sessionSet(GUEST_KEY, JSON.stringify(guest))

// ---- Draft (everything except the contact, which has its own key) ----------------------------------------------

const BLANK_DONE = { contact: false, fulfillment: false, time: false, payment: false }

export function blankDraft(cartId) {
  return {
    cartId,
    step: 'contact',
    done: { ...BLANK_DONE },
    choice: '',
    address: '',
    secondaryAddress: '',
    coordinates: null,
    timeWindow: null,
    paymentType: '',
    promoCodes: [],
    notes: '',
    loyaltyPoints: null,
  }
}

export function readDraft(cartId) {
  try {
    const stored = JSON.parse(sessionGet(DRAFT_KEY) || 'null')
    if (!stored || stored.cartId !== cartId) return null
    return { ...blankDraft(cartId), ...stored, done: { ...BLANK_DONE, ...stored.done } }
  } catch { return null }
}

export const writeDraft = (draft) => sessionSet(DRAFT_KEY, JSON.stringify(draft))

// Keys the stored draft to another bag: after sign-in the guest bag becomes the account's, and the steps done so far
// go with it (a choice the account's bag can't take is dropped by reconcileDraft on the next read).
export function moveDraft(cartId) {
  try {
    const stored = JSON.parse(sessionGet(DRAFT_KEY) || 'null')
    if (stored && stored.cartId !== cartId) writeDraft({ ...stored, cartId })
  } catch { /* nothing kept: nothing to move */ }
}

export function clearCheckoutDrafts() {
  sessionSet(DRAFT_KEY, null)
  sessionSet(GUEST_KEY, null)
}

// Builds the first draft from what the cart already holds (new tab, or a draft from another session).
export function draftFromCheckout(result, cartId) {
  const settings = result.settings || {}
  const method = settings.deliveryMethod
  const draft = blankDraft(cartId)
  if (method?.type === 'pickup') draft.choice = method.pickupType || 'inStorePickup'
  if (method?.type === 'delivery') {
    draft.choice = 'delivery'
    draft.address = method.location?.address || ''
    draft.secondaryAddress = method.location?.secondaryAddress || ''
    draft.coordinates = method.location?.coordinates || null
  }
  draft.timeWindow = settings.timeWindow || null
  draft.paymentType = settings.paymentMethod?.type || ''
  draft.promoCodes = [...(settings.promoCodes || [])]
  draft.notes = settings.notes || ''
  draft.loyaltyPoints = settings.loyaltyPoints ?? null
  draft.done = {
    contact: Boolean(result.guest && !Object.keys(contactErrors(result.guest)).length),
    // Sweed preselects in-store pickup on every new cart. That default stays highlighted, but with more than one way to
    // get the order the shopper confirms it; it only counts as answered once they have been through checkout (guest saved).
    fulfillment: Boolean(method) && (Boolean(result.guest) || (result.options?.deliveryMethods?.items?.length || 0) <= 1),
    time: Boolean(draft.timeWindow),
    payment: Boolean(draft.paymentType),
  }
  draft.step = nextIncomplete(draft, result.options, -1)
  return draft
}

// A select that the store no longer offers is dropped; a single payment method is preselected. A dropped choice also
// reopens its step, so the order cannot go through on a time or payment method the store no longer offers.
export function reconcileDraft(draft, options = {}) {
  if (!draft) return draft
  const payments = options.paymentMethods?.items || []
  const windows = options.timeWindows?.items || []
  let paymentType = payments.some((item) => item.type === draft.paymentType) ? draft.paymentType : ''
  if (!paymentType && payments.length === 1) paymentType = payments[0].type
  const timeWindow = windows.some((item) => item.id === draft.timeWindow?.id) ? draft.timeWindow : null
  const done = { ...draft.done }
  if (draft.timeWindow && !timeWindow) done.time = false
  // Also when the store's one remaining method replaced the chosen one: the shopper confirms the new method.
  if (draft.paymentType && paymentType !== draft.paymentType) done.payment = false
  return { ...draft, paymentType, timeWindow, done }
}

export function deliveryMethodFor(draft) {
  if (!draft.choice) return null
  if (draft.choice !== 'delivery') return { type: 'pickup', pickupType: draft.choice }
  const address = String(draft.address || '').trim()
  if (!address || !draft.coordinates) return null
  return {
    type: 'delivery',
    location: {
      address,
      coordinates: draft.coordinates,
      secondaryAddress: String(draft.secondaryAddress || '').trim() || null,
    },
  }
}

// The complete settings object. A null member leaves the stored value unchanged, so every member is always sent.
export function settingsPayload(draft) {
  return {
    deliveryMethod: deliveryMethodFor(draft),
    timeWindow: draft.timeWindow,
    paymentMethod: draft.paymentType ? { type: draft.paymentType } : null,
    promoCodes: draft.promoCodes,
    notes: String(draft.notes || '').trim() || null,
    ...(!isGuestCheckout() && draft.loyaltyPoints ? { loyaltyPoints: draft.loyaltyPoints } : {}),
  }
}

// ---- Steps -------------------------------------------------------------------------------------------------------

// Time and payment are left out when the store offers nothing and does not require a choice.
export function skippedSteps(options = {}) {
  const windows = options.timeWindows
  const payments = options.paymentMethods
  return {
    contact: signedIn,
    time: !windows?.required && !windows?.items?.length,
    payment: !payments?.required && !payments?.items?.length,
  }
}

export function stepDone(draft, skipped, key) {
  if (key === 'review') return false
  return Boolean(draft.done[key] || skipped[key])
}

export function nextIncomplete(draft, options, after = -1) {
  const skipped = skippedSteps(options)
  for (let index = after + 1; index < STEPS.length - 1; index += 1) {
    if (!stepDone(draft, skipped, STEPS[index])) return STEPS[index]
  }
  return 'review'
}

export function visibleSteps(options) {
  const skipped = skippedSteps(options)
  return STEPS.filter((key) => !skipped[key])
}

// The step that is open: the saved one when every step before it is done, otherwise the first incomplete one.
export function openStepFor(draft, options) {
  const wanted = STEPS.includes(draft.step) ? draft.step : 'contact'
  const skipped = skippedSteps(options)
  const first = nextIncomplete(draft, options, -1)
  const index = STEPS.indexOf(wanted)
  const unreachable = skipped[wanted] || STEPS.slice(0, index).some((key) => !stepDone(draft, skipped, key))
  return unreachable ? first : wanted
}

export const allRequiredDone = (draft, options) => {
  const skipped = skippedSteps(options)
  return STEPS.slice(0, -1).every((key) => stepDone(draft, skipped, key))
}

// ---- Display helpers ---------------------------------------------------------------------------------------------

export const positiveAmount = (value) => value != null && value !== '' && Number(value) > 0
export const sameCode = (a) => (b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
