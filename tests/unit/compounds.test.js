// Potency and terpene figures (src/lib/compounds.js): totals, ranges, units and ordering.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { cannabinoidRows, hasLabProfile, measureText, noFiguresNote, potencyOf, terpeneProfile, totalTerpenesOf, totalThcOf } from '../../src/lib/compounds.js'

const pct = (label, ...values) => ({ label, values, uom: 'percent' })
const mg = (label, ...values) => ({ label, values, uom: 'milligram' })
const variant = (compounds) => ({ compounds: { thc: [], cbd: [], terpenes: [], ...compounds } })

describe('measureText', () => {
  it('formats single figures, batch ranges, milligrams and trace amounts', () => {
    assert.equal(measureText(pct('THC', 24)), '24%')
    assert.equal(measureText(pct('THC', 18, 22)), '18–22%')
    assert.equal(measureText(mg('THC', 100)), '100\u00a0mg')
    assert.equal(measureText(pct('CBD', 0.4)), '<1%')
    assert.equal(measureText(pct('THC', '21.456')), '21.5%')
    assert.equal(measureText(pct('Myrcene', 0.456), { exact: true }), '0.46%')
    assert.equal(measureText({ label: 'THC', values: [] }), '')
  })
})

describe('totalThcOf', () => {
  it('uses the lab total when it reports one', () => {
    const total = totalThcOf(variant({ thc: [pct('THCA', 25), pct('Total THC', 22.1)] }))
    assert.deepEqual([total.label, total.text, Boolean(total.calculated)], ['Total THC', '22.1%', false])
  })

  it('accepts the TotalTHC spelling', () => {
    assert.equal(totalThcOf(variant({ thc: [pct('TotalTHC', 19)] })).text, '19%')
  })

  it('calculates THC + 0.877 × THCA when only the parts are reported', () => {
    const total = totalThcOf(variant({ thc: [pct('THC', 1), pct('THCA', 25)] }))
    assert.equal(total.label, 'Total THC')
    assert.equal(total.text, '22.9%')
    assert.equal(total.calculated, true)
  })

  it('calculates from THCA alone and keeps batch ranges as ranges', () => {
    const total = totalThcOf(variant({ thc: [pct('THCa', 20, 24)] }))
    assert.equal(total.text, '17.5–21%')
    assert.equal(total.batches, true)
  })

  it('falls back to plain THC, including milligram edibles', () => {
    assert.equal(totalThcOf(variant({ thc: [mg('THC', 100)] })).text, '100\u00a0mg')
    assert.equal(totalThcOf(variant({ thc: [mg('THC', 10), pct('THCA', 1)] })).text, '10\u00a0mg')
  })

  it('is null without THC figures, and reads the demo cannabinoids list', () => {
    assert.equal(totalThcOf(variant({})), null)
    assert.equal(totalThcOf({}), null)
    assert.equal(totalThcOf({ compounds: { cannabinoids: [pct('THC', 24)] } }).text, '24%')
  })
})

describe('terpenes', () => {
  const terps = [pct('Limonene', 0.6), pct('Myrcene', 1.2), pct('Caryophyllene', 0.45), pct('Total Terpenes', 2.6)]

  it('orders terpenes strongest first, without the lab total, scaled to the strongest', () => {
    const profile = terpeneProfile(variant({ terpenes: terps }))
    assert.deepEqual(profile.map((item) => item.label), ['Myrcene', 'Limonene', 'Caryophyllene'])
    assert.equal(profile[0].share, 1)
    assert.equal(profile[1].share, 0.5)
  })

  it('uses the lab total when listed', () => {
    const total = totalTerpenesOf(variant({ terpenes: terps }))
    assert.deepEqual([total.label, total.text, Boolean(total.calculated)], ['Total terpenes', '2.6%', false])
  })

  it('adds the terpenes up when no total is listed, ranges low to low and high to high', () => {
    assert.equal(totalTerpenesOf(variant({ terpenes: terps.slice(0, 3) })).text, '2.25%')
    const ranged = totalTerpenesOf(variant({ terpenes: [pct('Myrcene', 1, 1.4), pct('Pinene', 0.3)] }))
    assert.equal(ranged.text, '1.3–1.7%')
    assert.equal(ranged.calculated, true)
  })

  it('does not add up mixed units, and is null without terpenes', () => {
    assert.equal(totalTerpenesOf(variant({ terpenes: [pct('Myrcene', 1), mg('Pinene', 3)] })), null)
    assert.equal(totalTerpenesOf(variant({})), null)
  })
})

describe('potencyOf and cannabinoidRows', () => {
  it('never shows a minor cannabinoid as CBD', () => {
    assert.equal(potencyOf(variant({ cbd: [pct('CBG', 0.9)] })).cbd, null)
  })

  it('gives the headline trio and every lab figure', () => {
    const v = variant({ thc: [pct('THC', 0.8), pct('THCA', 26)], cbd: [pct('CBD', 0.1), pct('CBG', 0.9)], terpenes: [pct('Myrcene', 1)] })
    const { thc, cbd, terpenes } = potencyOf(v)
    assert.deepEqual([thc.text, cbd.text, terpenes.text], ['23.6%', '<1%', '1%'])
    assert.deepEqual(cannabinoidRows(v).map((item) => item.label), ['THC', 'THCA', 'CBD', 'CBG'])
  })
})

describe('hasLabProfile and noFiguresNote', () => {
  it('counts a size with any headline figure or terpene, not an empty one', () => {
    assert.equal(hasLabProfile(variant({ terpenes: [pct('Myrcene', 1)] })), true)
    assert.equal(hasLabProfile(variant({ thc: [pct('THCA', 20)] })), true)
    assert.equal(hasLabProfile(variant({})), false)
    assert.equal(hasLabProfile(undefined), false)
  })

  it('says "for this size" only when another size has figures', () => {
    const empty = variant({})
    const tested = variant({ thc: [pct('THC', 20)] })
    assert.equal(noFiguresNote(empty, [empty, tested]), 'Lab figures not listed for this size')
    assert.equal(noFiguresNote(empty, [empty, variant({})]), 'Lab figures not listed')
    assert.equal(noFiguresNote(empty, [empty]), 'Lab figures not listed')
    // Only figures the lab box or panel would show count: a CBDA-only size shows nothing, so it is not pointed to.
    assert.equal(noFiguresNote(empty, [empty, variant({ cbd: [pct('CBDA', 0.4)] })]), 'Lab figures not listed')
    // Judged by the figures the caller has for each size (the card's lookup), when given.
    assert.equal(noFiguresNote(empty, [empty, variant({})], (option) => (option === empty ? option : tested)), 'Lab figures not listed for this size')
  })
})
