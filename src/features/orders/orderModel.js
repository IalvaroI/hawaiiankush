// Order labels, tones, timeline steps and formatting. Unknown enum values get a neutral tone and Sweed's own text.
import { readable } from '../../lib/format.js'

export const ORDERS_PAGE_SIZE = 10
const TERMINAL = new Set(['delivered', 'pickedUp', 'cancelled'])

const STATUS = {
  placed: { label: 'Placed', tone: 'active' },
  packing: { label: 'Packing', tone: 'active' },
  packed: { label: 'Packed', tone: 'active' },
  actionRequired: { label: 'Action needed', tone: 'action' },
  readyForPickup: { label: 'Ready for pickup', tone: 'ready' },
  outForDelivery: { label: 'Out for delivery', tone: 'ready' },
  onTheWay: { label: 'On the way', tone: 'ready' },
  pickedUp: { label: 'Picked up', tone: 'done' },
  delivered: { label: 'Delivered', tone: 'done' },
  cancelled: { label: 'Cancelled', tone: 'cancelled' },
}

// Where each status sits on the timeline: 0 placed, 1 packing, 2 ready or out, 3 collected or delivered.
const STEP_INDEX = { placed: 0, packing: 1, packed: 2, actionRequired: 0, readyForPickup: 2, outForDelivery: 2, onTheWay: 2, pickedUp: 3, delivered: 3 }

const PICKUP_TYPE = {
  inStorePickup: 'In-store pickup',
  curbside: 'Curbside',
  driveThrough: 'Drive-through',
  kioskOrder: 'Kiosk order',
  pharmacyOrder: 'Pharmacy order',
}

const PAYMENT_STATUS = {
  notPaid: { label: 'Not paid', tone: 'warn' },
  authorized: { label: 'Authorized', tone: 'active' },
  paid: { label: 'Paid', tone: 'done' },
}

export function statusInfo(status) {
  const type = status?.type || ''
  const known = STATUS[type]
  return { type, label: known?.label || readable(type) || 'Status unknown', tone: known?.tone || 'neutral' }
}

export function isActive(order) {
  return !TERMINAL.has(order?.status?.type)
}

export function isPaid(order) {
  return ['authorized', 'paid'].includes(order?.payment?.status)
}

export function isDelivery(order) {
  return order?.deliveryMethod?.type === 'delivery'
}

// Four steps for the order's fulfillment. Cancelled orders have no timeline (the page shows a banner instead).
export function timelineFor(order) {
  const type = order?.status?.type
  const delivery = isDelivery(order)
  const steps = [
    { key: 'placed', label: 'Placed' },
    { key: 'packing', label: 'Packing' },
    { key: 'ready', label: delivery ? (type === 'onTheWay' ? 'On the way' : 'Out for delivery') : 'Ready for pickup' },
    { key: 'done', label: delivery ? 'Delivered' : 'Picked up' },
  ]
  const finished = type === 'pickedUp' || type === 'delivered'
  const current = finished ? steps.length - 1 : (STEP_INDEX[type] ?? -1)
  return {
    attention: type === 'actionRequired',
    steps: steps.map((step, index) => ({
      ...step,
      state: finished || index < current ? 'done' : index === current ? 'current' : 'upcoming',
    })),
  }
}

export function fulfillmentLabel(method) {
  if (method?.type === 'pickup') return PICKUP_TYPE[method.pickupType] || readable(method.pickupType || '') || 'Pickup'
  if (method?.type === 'delivery') return 'Delivery'
  if (method?.type === 'collectionPoint') return 'Collection point'
  return readable(method?.type || '') || 'Not specified'
}

export function paymentMethodLabel(payment, order) {
  const method = payment?.methodType
  if (method === 'payOnSite') return isDelivery(order) ? 'Pay on delivery' : 'Pay at pickup'
  return readable(method || '') || 'Not specified'
}

export function paymentStatusInfo(status) {
  return PAYMENT_STATUS[status] || { label: readable(status || '') || 'Unknown', tone: 'neutral' }
}

export function sameStore(method, store) {
  return Boolean(store?.id) && String(method?.store?.id ?? '') === String(store.id)
}

const DATE_TIME = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const CLOCK = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
const DAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const QUANTITY = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

// Browsers may use a narrow no-break space before AM/PM; plain spaces keep the text the same everywhere.
const plain = (text) => text.replace(/[  ]/g, ' ')

function dateOf(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// "Oct 17, 2026, 3:04 PM"
export function dateTimeText(value) {
  const date = dateOf(value)
  return date ? plain(DATE_TIME.format(date)) : ''
}

// Same day as today: "4:30 PM"; another day: "Oct 18, 2026, 9:00 AM".
export function whenText(value) {
  const date = dateOf(value)
  if (!date) return ''
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  return plain(sameDay ? CLOCK.format(date) : DATE_TIME.format(date))
}

// "16:30" -> "4:30 PM"; the window end "00:00" means the end of the day.
function clockOfDay(hhmm) {
  const [hours, minutes] = String(hhmm || '').split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return ''
  return plain(CLOCK.format(new Date(2000, 0, 1, hours, minutes)))
}

export function windowText(slot) {
  if (!slot) return ''
  const start = slot.date ? new Date(`${slot.date}T12:00:00`) : null
  const day = start && !Number.isNaN(start.getTime()) ? plain(DAY.format(start)) : ''
  const from = clockOfDay(slot.interval?.from)
  const to = slot.interval?.to === '00:00' ? 'midnight' : clockOfDay(slot.interval?.to)
  const hours = [from, to].filter(Boolean).join(' – ')
  return [slot.isAsap ? 'As soon as possible' : '', day, hours].filter(Boolean).join(' · ')
}

export function itemsText(quantity) {
  const count = Number(quantity) || 0
  return `${QUANTITY.format(count)} ${count === 1 ? 'item' : 'items'}`
}

// Cart quantity of a line, as the cart helpers read it.
export function quantityOf(value) {
  return Number(value) || 0
}
