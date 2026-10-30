import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { money } from '../../lib/format.js'
import { StepShell } from './StepShell.jsx'

// Loyalty redemption follows the store's rule. Hidden for guests (checked by the caller).
function LoyaltyRedeem({ loyalty, draft, busy, error, onSave }) {
  const [amount, setAmount] = useState('')
  const type = loyalty.pointsRedemptionType
  const available = loyalty.points == null ? null : Number(loyalty.points)
  const applied = draft.loyaltyPoints != null && draft.loyaltyPoints !== ''

  let control = null
  if (type === 'maximumAvailable') {
    control = (
      <button type="button" className="secondary-button" disabled={busy || available == null} onClick={() => onSave(applied ? null : String(loyalty.points))}>
        {applied ? 'Stop using my points' : available != null ? `Use all ${available} points` : 'Use all my points'}
      </button>
    )
  } else if (type === 'presetOptions') {
    control = (
      <div className="co-chips">
        {(loyalty.presets || []).map((preset) => (
          <button key={preset} type="button" className={`co-chip-button${String(draft.loyaltyPoints) === String(preset) ? ' is-selected' : ''}`} disabled={busy} onClick={() => onSave(String(preset))}>
            {preset} points
          </button>
        ))}
      </div>
    )
  } else if (type === 'anyNumberOfPoints') {
    const cap = loyalty.pointsCap == null ? available : Number(loyalty.pointsCap)
    control = (
      <form className="co-promo-row" onSubmit={(event) => { event.preventDefault(); if (Number(amount) > 0) onSave(String(Number(amount))) }}>
        <input type="number" min="1" max={cap ?? undefined} inputMode="numeric" aria-label="Points to redeem" value={amount} onChange={(event) => setAmount(event.target.value)} />
        <button type="submit" className="secondary-button" disabled={busy || !(Number(amount) > 0)}>Apply points</button>
      </form>
    )
  }
  if (!control) return null
  return (
    <div className="co-loyalty">
      <p className="co-hint">{available != null ? `You have ${available} points.` : 'Use your points on this order.'}{applied ? ` ${draft.loyaltyPoints} points applied.` : ''}</p>
      {control}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  )
}

export function ReviewStep({
  number, open, allDone, draft, updateDraft, total, blocked, busy, errors, onOpen, onPlace, onApplyPromo, onRemovePromo, showLoyalty, loyalty, onLoyalty,
}) {
  const [code, setCode] = useState('')

  if (!open) {
    return (
      <StepShell
        id="review"
        number={number}
        title="Review and place order"
        summary={allDone ? 'Promo codes, order notes and placing your order' : 'Finish the steps above first'}
        open={false}
        done={false}
        action={allDone ? <button type="button" className="secondary-button" onClick={onOpen}>Review order</button> : null}
      />
    )
  }

  async function applyCode(event) {
    event.preventDefault()
    if (await onApplyPromo(code)) setCode('')
  }

  return (
    <StepShell id="review" number={number} title="Review and place order" open>
      <div className="co-review">
        <form className="field" onSubmit={applyCode} noValidate>
          <label htmlFor="co-promo">Promo code</label>
          <div className="co-promo-row">
            <input id="co-promo" autoComplete="off" value={code} aria-describedby={errors.promo ? 'co-promo-error' : undefined} onChange={(event) => setCode(event.target.value)} />
            <button type="submit" className="secondary-button" disabled={busy !== '' || !code.trim()}>
              {busy === 'promo' && <Loader2 className="spin" size={16} aria-hidden="true" />} Apply
            </button>
          </div>
          {errors.promo && <p className="field-error" id="co-promo-error" role="alert">{errors.promo}</p>}
        </form>

        {draft.promoCodes.length > 0 && (
          <ul className="co-chips" aria-label="Applied promo codes">
            {draft.promoCodes.map((item) => (
              <li className="co-chip" key={item}>
                <span>{item}</span>
                <button type="button" aria-label={`Remove promo code ${item}`} disabled={busy !== ''} onClick={() => onRemovePromo(item)}><X size={14} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}

        {showLoyalty && loyalty?.pointsRedemptionType && loyalty.pointsRedemptionType !== 'none' && (
          <LoyaltyRedeem loyalty={loyalty} draft={draft} busy={busy !== ''} error={errors.loyalty} onSave={onLoyalty} />
        )}

        <div className="field">
          <label htmlFor="co-notes">Order notes <small>Optional</small></label>
          <textarea id="co-notes" rows={3} value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} />
        </div>

        {errors.place && <p className="co-alert" role="alert">{errors.place}</p>}
        {!allDone && <p className="co-hint">Finish the steps above to place your order.</p>}
        {allDone && blocked && <p className="co-hint">Review the notice above before placing your order.</p>}

        <button type="button" className="co-place" disabled={blocked || !allDone || busy !== ''} aria-busy={busy === 'place' || undefined} onClick={onPlace}>
          {busy === 'place' && <Loader2 className="spin" size={18} aria-hidden="true" />}
          Place order · {money(total)}
        </button>
        <p className="co-hint">You’ll need a valid government-issued ID at pickup.</p>
      </div>
    </StepShell>
  )
}
