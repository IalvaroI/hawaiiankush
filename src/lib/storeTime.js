// The store's own calendar and clock. Pickup windows are in the store's time, and a shopper's device may be in another
// zone (a visitor's phone still on mainland time), so "today" and "over" are judged by the store's clock.

// The store's date and time now, as "2026-10-24" and "14:05".
export function storeNow(timeZone, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((part) => [part.type, part.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

// Whole days from one "YYYY-MM-DD" to another.
export function daysBetween(from, to) {
  const utc = (ymd) => {
    const [year, month, day] = ymd.split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  return Math.round((utc(to) - utc(from)) / 86400000)
}

// "Today" and "Tomorrow" by the store's calendar, otherwise the weekday and date ("Monday, Oct 26").
export function dayLabel(ymd, timeZone, now = new Date()) {
  const days = daysBetween(storeNow(timeZone, now).date, ymd)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  const [year, month, day] = ymd.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// Whether a time window is over by the store's clock. An end of "00:00" is midnight, the end of the window's day.
export function windowOver(window, timeZone, now = new Date()) {
  const { date, time } = storeNow(timeZone, now)
  if (window.date !== date) return window.date < date
  const [hours = '0', minutes = '0'] = String(window.interval?.to || '').split(':')
  const end = `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
  return end !== '00:00' && end <= time
}
