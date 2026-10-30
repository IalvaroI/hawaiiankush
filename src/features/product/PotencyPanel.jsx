import { useState } from 'react'
import { cannabinoidRows, potencyOf, terpeneName, terpeneProfile } from '../../lib/compounds.js'

const SHOWN_TERPENES = 5

// Potency and terpene profile of the selected size, near the top of the product page: Total THC, CBD and Total
// terpenes as big figures, every lab cannabinoid figure under them, then the terpenes as bars (each against the
// strongest one). Hidden when the variant has no figures.
export function PotencyPanel({ variant }) {
  const [expanded, setExpanded] = useState(false)
  const potency = potencyOf(variant)
  const headline = [potency.thc, potency.cbd, potency.terpenes].filter(Boolean)
  const terpenes = terpeneProfile(variant)
  const lab = cannabinoidRows(variant)
  if (!headline.length && !terpenes.length) return null

  // The lab list only adds something when it has figures beyond the headline ones (THCA, CBG and so on).
  const headlineTexts = new Set(headline.map((item) => `${item.label}|${item.text}`))
  const extraLab = lab.filter((item) => !headlineTexts.has(`${item.label}|${item.text}`))
  const shown = expanded ? terpenes : terpenes.slice(0, SHOWN_TERPENES)
  const calculated = headline.some((item) => item.calculated)
  const varies = [...headline, ...lab, ...terpenes].some((item) => item.batches)

  return (
    <section className="pd-profile" aria-labelledby="pd-profile-title">
      <h2 id="pd-profile-title" className="eyebrow pd-label">Potency{terpenes.length > 0 ? ' & terpenes' : ''}</h2>

      <dl className="pd-headline-stats">
        {headline.map((item) => (
          <div className={`pd-stat is-${item.kind}`} key={item.kind}>
            <dt>{item.label}{item.calculated && <><span className="pd-calc" aria-hidden="true">*</span><span className="sr-only"> (calculated)</span></>}</dt>
            <dd>{item.text}</dd>
          </div>
        ))}
      </dl>

      {extraLab.length > 0 && (
        <ul className="pd-lab" aria-label="Lab cannabinoid results">
          {extraLab.map((item, position) => (
            <li key={`${item.label}-${position}`}><span>{item.label}</span><strong>{item.text}</strong></li>
          ))}
        </ul>
      )}

      {terpenes.length > 0 && (
        <div className="pd-terpene-profile">
          <h3 className="eyebrow pd-label">Terpene profile</h3>
          <ul className="pd-terpene-bars">
            {shown.map((item) => (
              <li key={item.label}>
                <span className="pd-terpene-name">{terpeneName(item.label)}</span>
                <span className="pd-terpene-track" aria-hidden="true">
                  <span className="pd-terpene-fill" style={{ width: `${Math.max(6, Math.round(item.share * 100))}%` }} />
                </span>
                <strong className="pd-terpene-value">{item.text}</strong>
              </li>
            ))}
          </ul>
          {terpenes.length > SHOWN_TERPENES && (
            <button type="button" className="text-button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
              {expanded ? 'Show fewer' : `Show all ${terpenes.length} terpenes`}
            </button>
          )}
        </div>
      )}

      {(calculated || varies) && (
        <p className="pd-profile-note">
          {calculated && <>* Calculated from the lab figures: {[
            potency.thc?.calculated && 'Total THC = THC + 0.877 × THCA',
            potency.terpenes?.calculated && 'Total terpenes = the sum of the terpenes listed',
          ].filter(Boolean).join('; ')}. </>}
          {varies && <>Ranges cover the batches in stock; yours falls inside them.</>}
        </p>
      )}
    </section>
  )
}
