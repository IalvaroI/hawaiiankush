// The store's calendar and clock: pickup windows are judged in the store's zone, whatever zone the device is in.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dayLabel, daysBetween, storeNow, windowOver } from '../../src/lib/storeTime.js'

const HAWAII = 'Pacific/Honolulu'
const window = (date, from, to) => ({ date, interval: { from, to } })

describe('storeNow and daysBetween', () => {
  it('gives the store\'s date even when UTC is already on the next day', () => {
    // 01:00 UTC on the 25th is 15:00 on the 24th in Hawaii.
    assert.deepEqual(storeNow(HAWAII, new Date('2026-10-25T01:00:00Z')), { date: '2026-10-24', time: '15:00' })
  })

  it('counts whole days across a month end', () => {
    assert.equal(daysBetween('2026-10-31', '2026-11-01'), 1)
    assert.equal(daysBetween('2026-10-24', '2026-10-24'), 0)
    assert.equal(daysBetween('2026-10-24', '2026-10-23'), -1)
  })
})

describe('dayLabel', () => {
  it('names days by the store\'s calendar, not UTC\'s or the device\'s', () => {
    // 15:00 on 2026-10-24 in Hawaii, already the 25th in UTC.
    const now = new Date('2026-10-25T01:00:00Z')
    assert.equal(dayLabel('2026-10-24', HAWAII, now), 'Today')
    assert.equal(dayLabel('2026-10-25', HAWAII, now), 'Tomorrow')
    assert.equal(dayLabel('2026-10-26', HAWAII, now), 'Monday, Oct 26')
  })
})

describe('windowOver', () => {
  // 15:00 on 2026-10-24 in Hawaii (already the 25th in UTC and on the US mainland's evening clock).
  const now = new Date('2026-10-25T01:00:00Z')

  it('is over for an earlier day and for a window that ended earlier today', () => {
    assert.equal(windowOver(window('2026-10-23', '10:00', '12:00'), HAWAII, now), true)
    assert.equal(windowOver(window('2026-10-24', '10:00', '12:00'), HAWAII, now), true)
    assert.equal(windowOver(window('2026-10-24', '13:00', '15:00:00'), HAWAII, now), true)
  })

  it('is not over for a window later today, one ending at midnight, or tomorrow', () => {
    assert.equal(windowOver(window('2026-10-24', '14:00', '16:00'), HAWAII, now), false)
    assert.equal(windowOver(window('2026-10-24', '20:00', '00:00'), HAWAII, now), false)
    assert.equal(windowOver(window('2026-10-25', '10:00', '12:00'), HAWAII, now), false)
  })
})
