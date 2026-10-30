// A promotion's schedule as the store writes it ("Daily, 07:00 AM - 10:00 AM", "Sun/Thu-Sat"), said the short way
// ("Daily 7–10 am", "Thu–Sun"). Anything it cannot read is returned as it came.
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_PATTERN = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/i

function shortDays(text) {
  if (/^daily$/i.test(text)) return 'Daily'
  const days = new Set()
  for (const part of text.split(/[/,]\s*/)) {
    const [from, to] = part.split('-').map((day) => day.trim())
    if (!DAY_PATTERN.test(from) || (to && !DAY_PATTERN.test(to))) return null
    const start = WEEK.findIndex((day) => from.toLowerCase().startsWith(day.toLowerCase()))
    const end = to ? WEEK.findIndex((day) => to.toLowerCase().startsWith(day.toLowerCase())) : start
    for (let index = start; ; index = (index + 1) % 7) { days.add(index); if (index === end) break }
  }
  if (days.size === 7) return 'Daily'
  // Runs of days in week order, wrapping past Sunday, starting after a day off: Thu, Fri, Sat, Sun is "Thu–Sun".
  const first = [...Array(7).keys()].find((index) => days.has(index) && !days.has((index + 6) % 7))
  const runs = []
  for (let step = 0; step < 7; step += 1) {
    const index = (first + step) % 7
    if (!days.has(index)) continue
    const last = runs[runs.length - 1]
    if (last && (last.end + 1) % 7 === index) last.end = index
    else runs.push({ start: index, end: index })
  }
  return runs.map(({ start, end }) => {
    const length = ((end - start + 7) % 7) + 1
    return length === 1 ? WEEK[start] : length === 2 ? `${WEEK[start]}, ${WEEK[end]}` : `${WEEK[start]}–${WEEK[end]}`
  }).join(', ')
}

function shortTimes(text) {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i.exec(text.trim())
  if (!match) return null
  const time = (hour, minutes) => `${Number(hour)}${minutes && minutes !== '00' ? `:${minutes}` : ''}`
  const [, h1, m1, p1, h2, m2, p2] = match
  const from = time(h1, m1)
  const to = time(h2, m2)
  return p1.toLowerCase() === p2.toLowerCase() ? `${from}–${to} ${p2.toLowerCase()}m` : `${from} ${p1.toLowerCase()}m–${to} ${p2.toLowerCase()}m`
}

export function formatSchedule(schedule) {
  const text = String(schedule || '').trim()
  if (!text) return ''
  const [daysPart, ...rest] = text.split(',')
  const days = shortDays(daysPart.trim())
  if (days === null) return shortTimes(text) || text
  if (!rest.length) return days
  const times = shortTimes(rest.join(',').trim())
  return times ? `${days} ${times}` : text
}
