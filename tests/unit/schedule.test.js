import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatSchedule } from '../../src/lib/schedule.js'

describe('formatSchedule', () => {
  it('says days and hours the short way', () => {
    assert.equal(formatSchedule('Daily, 07:00 AM - 10:00 AM'), 'Daily 7–10 am')
    assert.equal(formatSchedule('Mon-Fri, 4:00 PM - 7:30 PM'), 'Mon–Fri 4–7:30 pm')
    assert.equal(formatSchedule('Fri-Mon, 11:00 AM - 2:00 PM'), 'Fri–Mon 11 am–2 pm')
  })

  it('joins days into runs in week order, wrapping past Sunday', () => {
    assert.equal(formatSchedule('Sun/Thu-Sat'), 'Thu–Sun')
    assert.equal(formatSchedule('Sat/Sun'), 'Sat, Sun')
    assert.equal(formatSchedule('Mon/Wed/Fri'), 'Mon, Wed, Fri')
    assert.equal(formatSchedule('Mon-Sun'), 'Daily')
  })

  it('returns anything it cannot read unchanged', () => {
    assert.equal(formatSchedule('Every other Tuesday'), 'Every other Tuesday')
    assert.equal(formatSchedule(''), '')
    assert.equal(formatSchedule(null), '')
  })
})
